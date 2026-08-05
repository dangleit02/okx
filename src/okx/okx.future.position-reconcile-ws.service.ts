import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as WebSocket from 'ws';
import { AppLogger } from '../logger/logger.service';
import { OkxFutureHedgeService } from './okx.future.hedge.service';
import { OkxFutureOneWayService } from './okx.future.oneway.service';
import { FutureDirection } from './okx.future.base.service';

@Injectable()
export class OkxFuturePositionReconcileWsService implements OnModuleInit, OnModuleDestroy {
  private ws: WebSocket | null = null;
  private reconnectTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private destroyed = false;
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly lastOneWayDirections = new Map<string, FutureDirection>();
  private readonly wsUrl = 'wss://ws.okx.com:8443/ws/v5/private';

  constructor(
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
    private readonly hedgeService: OkxFutureHedgeService,
    private readonly oneWayService: OkxFutureOneWayService,
  ) {}

  onModuleInit() {
    if (this.hasEnabledFutureTask()) this.connect();
  }

  onModuleDestroy() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    this.ws?.close();
    this.ws = null;
  }

  private hasEnabledFutureTask() {
    return [
      'runSwapTaskForLongHedge',
      'runSwapTaskForShortHedge',
      'runSwapTaskForLongOneWay',
      'runSwapTaskForShortOneWay',
    ].some((key) => this.config.get<boolean>(key));
  }

  private isEnabled(mode: 'hedge' | 'oneway', direction: FutureDirection) {
    const key = mode === 'hedge'
      ? `runSwapTaskFor${direction === 'long' ? 'Long' : 'Short'}Hedge`
      : `runSwapTaskFor${direction === 'long' ? 'Long' : 'Short'}OneWay`;
    return Boolean(this.config.get<boolean>(key));
  }

  private connect() {
    if (this.destroyed || this.ws) return;
    const apiKey = this.config.get<string>('okx.apiKeyHEDGE');
    const passphrase = this.config.get<string>('okx.passphraseHEDGE');
    const secretKey = this.config.get<string>('okx.secretKeyHEDGE');
    if (!apiKey || !passphrase || !secretKey) {
      this.logger.warn('Future position reconcile WebSocket disabled: missing Hedge API credentials');
      return;
    }
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    ws.on('open', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const sign = crypto
        .createHmac('sha256', secretKey)
        .update(`${timestamp}GET/users/self/verify`)
        .digest('base64');
      ws.send(JSON.stringify({
        op: 'login',
        args: [{ apiKey, passphrase, timestamp, sign }],
      }));
      this.heartbeatTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('ping');
      }, 20_000);
    });
    ws.on('message', (raw) => this.handleMessage(raw.toString()));
    ws.on('error', (error) => {
      this.logger.error('Future position reconcile WebSocket error', error.message);
      ws.close();
    });
    ws.on('close', () => {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
      this.ws = null;
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      }
    });
  }

  private handleMessage(raw: string) {
    if (raw === 'pong') return;
    let message: any;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.event === 'login' && String(message.code) === '0') {
      this.ws?.send(JSON.stringify({
        op: 'subscribe',
        args: [{
          channel: 'positions',
          instType: 'SWAP',
          extraParams: JSON.stringify({ updateInterval: '0' }),
        }],
      }));
      this.logger.log('Future position reconcile WebSocket subscribed to SWAP positions');
      return;
    }
    if (message.event === 'error') {
      this.logger.error('Future position reconcile WebSocket rejected request', JSON.stringify(message));
      return;
    }
    if (message.arg?.channel !== 'positions' || !Array.isArray(message.data)) return;
    for (const position of message.data) this.handlePosition(position);
  }

  private handlePosition(position: any) {
    const instId = String(position?.instId ?? '');
    if (!instId.endsWith('-USDT-SWAP')) return;
    const coin = instId.split('-')[0].toUpperCase();
    const positionSize = Number(position?.pos ?? 0);
    const posSide = String(position?.posSide ?? '');
    if (posSide === 'long' || posSide === 'short') {
      if (this.isEnabled('hedge', posSide)) this.scheduleReconcile('hedge', coin, posSide);
      return;
    }
    if (positionSize > 0) this.lastOneWayDirections.set(instId, 'long');
    if (positionSize < 0) this.lastOneWayDirections.set(instId, 'short');
    const direction = positionSize === 0 ? this.lastOneWayDirections.get(instId) : (positionSize > 0 ? 'long' : 'short');
    if (direction && this.isEnabled('oneway', direction)) {
      this.scheduleReconcile('oneway', coin, direction);
    } else if (positionSize === 0) {
      for (const candidate of ['long', 'short'] as FutureDirection[]) {
        if (this.isEnabled('oneway', candidate)) this.scheduleReconcile('oneway', coin, candidate);
      }
    }
  }

  private scheduleReconcile(mode: 'hedge' | 'oneway', coin: string, direction: FutureDirection) {
    const key = `${mode}:${coin}:${direction}`;
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(key);
      const service = mode === 'hedge' ? this.hedgeService : this.oneWayService;
      try {
        await service.reconcilePositionStopLoss(coin, direction, false);
      } catch (error) {
        this.logger.error(
          `Failed WebSocket stop-loss reconcile for ${coin} ${direction} ${mode}`,
          error?.message ?? String(error),
          null,
          `${coin}_${direction}_${mode}`,
        );
      }
    }, 300);
    this.debounceTimers.set(key, timer);
  }
}

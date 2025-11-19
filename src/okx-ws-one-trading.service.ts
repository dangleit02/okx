import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as WebSocket from 'ws';
import axios from 'axios';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from './common/logger.service';

interface Strategy {
    instId: string;
    sz: string;
    low: number;
    high: number;
    priceToFixed: number;
    waitingForRebound: boolean;
    active: boolean;
    testing: boolean
}

@Injectable()
export class OkxWsOneTradingService implements OnModuleInit, OnModuleDestroy {
    private ws: WebSocket | null = null;
    private reconnectDelay = 5000; // 5 giây
    private wsUrl = 'wss://ws.okx.com:8443/ws/v5/public';
    private strategies: Record<string, Strategy> = {}; // key = instId

    constructor(
        private config: ConfigService,
        private readonly logger: AppLogger
    ) {
        this.initWs();
    }

    private signRequest(secret: string, message: string) {
        return crypto.createHmac('sha256', secret).update(message).digest('base64');
    }

    async placeLimitBuy(instId: string, size: string, price: string, testing: boolean = true) {
        const timestamp = new Date().toISOString();
        const requestPath = '/api/v5/trade/order';

        const body = {
            instId,
            tdMode: 'cash',
            side: 'buy',
            ordType: 'limit',
            sz: size,
            px: price,
        };
        this.logger.log(`Placing limit buy order: ${JSON.stringify(body)}`);

        const prehash = timestamp + 'POST' + requestPath + JSON.stringify(body);
        const sign = this.signRequest(this.config.get<string>('okx.secretKey')!, prehash);

        const headers = {
            'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
            'OK-ACCESS-SIGN': sign,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
            'Content-Type': 'application/json',
        };

        const url = this.config.get<string>('okx.baseUrl') + requestPath;

        try {
            let res;
            if (!testing) {
                res = await axios.post(url, body, { headers });
            }
            return { data: res?.data, body };
        } catch (error) {
            this.logger.log('Error placing trigger order:', error.response?.data || error.message);
            throw error;
        }
    }

    onModuleInit() {
        this.logger.log('OkxWsMultiTradingService ready.');
    }

    onModuleDestroy() {
        this.stopAll();
    }

    start(instId: string, sz: string, low: number, high: number, testing: boolean = true) {
        if (!this.ws) {
            this.initWs();
        }
        this.strategies[instId] = {
            instId,
            sz,
            low,
            high,
            priceToFixed: 3,
            waitingForRebound: false,
            active: true,
            testing,
        };

        // Subscribe only if not already subscribed
        const msg = {
            op: 'subscribe',
            args: [{ channel: 'tickers', instId }],
        };
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws?.send(JSON.stringify(msg));
        } else {
            console.warn('⚠️ WebSocket not open. Cannot send message.');
        }

        this.logger.log(`Started strategy for ${instId}, low=${low}, high=${high}`);
    }

    stop(instId: string) {
        if (this.strategies[instId]) {
            this.logger.log(`Stopped strategy for ${instId}`);
            delete this.strategies[instId];
        }
    }

    stopAll() {
        this.strategies = {};
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    private initWs() {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
            this.logger.log('Connected to OKX WebSocket');
        });

        this.ws.on('message', async (raw) => {
            const msg = JSON.parse(raw.toString());

            if (msg.arg?.channel === 'tickers' && msg.data?.length > 0) {
                const instId = msg.arg.instId;
                const strategy = this.strategies[instId];
                if (!strategy || !strategy.active) return;

                const price = Number(msg.data[0].last);
                this.logger.log(`Price ${instId}: ${price}`);

                if (!strategy.waitingForRebound && price <= strategy.low) {
                    this.logger.log(`[${instId}] Price <= ${strategy.low}, waiting for rebound...`);
                    strategy.waitingForRebound = true;
                }

                if (strategy.waitingForRebound && price >= (strategy.low + strategy.high) / 2) {
                    this.logger.log(`[${instId}] Price >= ${strategy.high}, placing buy order...`);
                    const res = await this.placeLimitBuy(instId, strategy.sz, strategy.high.toFixed(strategy.priceToFixed), strategy.testing);
                    this.logger.log(`Buy order response: ${JSON.stringify(res)}`);
                    strategy.active = false; // disable after buy
                }
            }
        });

        this.ws.on('close', () => {
            console.log('⚠️ WebSocket closed. Reconnecting...');
            setTimeout(() => this.initWs(), this.reconnectDelay);
        });

        this.ws.on('error', (err) => {
            console.error('❌ WebSocket error:', err.message);
            this.ws?.close();
        });
    }
}

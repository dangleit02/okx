import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios, { AxiosResponse } from 'axios';
import { AppLogger } from 'src/logger/logger.service';
import { TradeOneCoinParams } from 'src/interfaces/interface';
import { EmailService } from 'src/email/email.service';
import Decimal from 'decimal.js';
import {
  OkxAlgoOrder,
  OkxApiResponse,
  OkxCancelResponse,
  OkxInstrument,
  OkxPosition,
} from './okx.types';

export type FutureDirection = 'long' | 'short';
export type FutureOrderIntent = 'open' | 'close' | 'all';
export type FutureAlgoOrderType = 'trigger' | 'conditional' | 'all';

export interface FutureRangeOptions {
  numberOfOrders?: number;
  stopLossPrice?: number;
  testing?: boolean;
}

export interface FutureNearCurrentOptions {
  amountUsdt?: number;
  stopLossPrice?: number;
  testing?: boolean;
}

interface FutureCoinConfig {
  minClosePriceRatio?: number;
  maxClosePriceRatio?: number;
}

interface FutureCleanupLogResult {
  status: string;
  coin: string;
  direction: FutureDirection;
  positionSize: string;
  currentPrice: number | null;
  keptOrderCount: number;
  cancelOrderCount: number;
  cancelledOrderCount?: number;
  failedOrderCount?: number;
}

/**
 * Base service: contains shared logic. Child classes must implement:
 *  - includePosSide(): boolean
 *  - getPosSide(direction): 'long' | 'short' | undefined
 */
@Injectable()
export abstract class OkxFutureBaseService {
  constructor(
    protected config: ConfigService,
    protected readonly logger: AppLogger,
    protected readonly emailService: EmailService,
  ) {}

  // ---------- abstract methods child must implement ----------
  protected abstract includePosSide(): boolean;
  protected abstract getPosSide(
    direction: 'long' | 'short',
  ): 'long' | 'short' | undefined;

  protected getPositionMode() {
    return this.includePosSide() ? 'hedge' : 'oneway';
  }

  protected getFutureLogFileKey(
    direction?: FutureDirection,
    coin: string = 'ALL',
  ) {
    return `${coin.toUpperCase()}_${direction ?? 'all'}_${this.getPositionMode()}`;
  }

  private logFutureCleanupSummary(
    result: FutureCleanupLogResult,
    logFileKey: string,
    cancelledOrderIds: string[] = [],
    failedOrderIds: string[] = [],
  ) {
    this.logger.log(
      JSON.stringify({
        status: result.status,
        coin: result.coin,
        direction: result.direction,
        positionSize: result.positionSize,
        currentPrice: result.currentPrice,
        keptOrderCount: result.keptOrderCount,
        cancelOrderCount: result.cancelOrderCount,
        cancelledOrderCount: result.cancelledOrderCount ?? 0,
        failedOrderCount: result.failedOrderCount ?? 0,
        cancelledOrderIds,
        failedOrderIds,
      }),
      'Future protective close cleanup summary',
      logFileKey,
    );
  }

  private async sendFutureEmail(subject: string, data: any) {
    await this.emailService.sendEmail(
      process.env.EMAIL_TO,
      `[FUTURE ${this.getPositionMode().toUpperCase()}] ${subject}`,
      data,
    );
  }

  // ---------- signing / headers ----------
  protected signRequest(secret: string, message: string) {
    return crypto.createHmac('sha256', secret).update(message).digest('base64');
  }

  protected sign(
    timestamp: string,
    method: string,
    requestPath: string,
    body: string = '',
  ) {
    const prehash = timestamp + method.toUpperCase() + requestPath + body;
    return crypto
      .createHmac('sha256', this.config.get<string>('okx.secretKeyHEDGE'))
      .update(prehash)
      .digest('base64');
  }

  protected buildHeaders(
    timestamp: string,
    method: string,
    path: string,
    body: string = '',
  ) {
    const prehash = timestamp + method + path + body;
    const sign = this.signRequest(
      this.config.get<string>('okx.secretKeyHEDGE'),
      prehash,
    );

    return {
      'OK-ACCESS-KEY': this.config.get<string>('okx.apiKeyHEDGE'),
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphraseHEDGE'),
      'Content-Type': 'application/json',
    };
  }

  // helper chunk
  protected chunk<T>(arr: T[], n: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  protected sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected assertOkxTradeAccepted(responseData: any, operation: string) {
    const rejectedItem = responseData?.data?.find(
      (item: any) => item?.sCode !== undefined && String(item.sCode) !== '0',
    );
    if (String(responseData?.code) !== '0' || rejectedItem) {
      throw new Error(
        `OKX rejected ${operation}: ${JSON.stringify(responseData)}`,
      );
    }
  }

  // ---------- instrument cache & helpers ----------
  // cache instId => instrument data
  private instrumentCache = new Map<string, OkxInstrument>();
  private stopLossReconcileInFlight: Map<string, Promise<any>> = new Map();

  protected async fetchInstrument(
    instId: string,
  ): Promise<OkxInstrument | null> {
    // use cached if available
    const key = instId;
    if (this.instrumentCache.has(key)) return this.instrumentCache.get(key);

    try {
      const url = `${this.config.get<string>('okx.baseUrl')}/api/v5/public/instruments?instId=${encodeURIComponent(instId)}&instType=SWAP`;
      const res = await axios.get<OkxApiResponse<OkxInstrument>>(url);
      const inst = res.data?.data?.[0] || null;
      if (inst) {
        // normalize numeric fields
        inst.lotSz = Number(inst.lotSz);
        inst.minSz = Number(inst.minSz || inst.lotSz || 0);
        inst.tickSz = Number(inst.tickSz || 0.0001);
        inst.ctVal = Number(inst.ctVal || 1);
        // store
        this.instrumentCache.set(key, inst);
        this.logger.log(
          `Fetched instrument for ${instId}: ${JSON.stringify(inst)}`,
        );
        this.logger.log(
          `lotSz=${inst.lotSz}, minSz=${inst.minSz}, tickSz=${inst.tickSz}`,
        );
        return inst;
      }
      return null;
    } catch (err: any) {
      this.logger.error(
        `Error fetching instrument for ${instId}`,
        err.response?.data || err.message,
      );
      return null;
    }
  }

  // compute decimal places of a number like 0.0001 -> 4; 1 -> 0
  protected decimalPlaces(x: number) {
    if (!isFinite(x)) return 0;
    let e = 1,
      p = 0;
    while (Math.round(x * e) / e !== x) {
      e *= 10;
      p++;
      if (p > 18) break;
    }
    // fallback: convert to string
    const s = String(x);
    if (s.indexOf('.') >= 0) return s.split('.')[1].length;
    return 0;
  }

  private parseDecimal(value: unknown): Decimal | null {
    try {
      const decimal = new Decimal(String(value));
      return decimal.isFinite() ? decimal : null;
    } catch {
      return null;
    }
  }

  /** Total open contracts, including contracts reserved by other close orders. */
  private getTotalPositionSize(position?: OkxPosition): Decimal {
    return this.parseDecimal(position?.pos ?? '0')?.abs() ?? new Decimal(0);
  }

  // format size: floor to lot size multiple, ensure >= minSz
  protected formatSize(rawSz: number, inst: any) {
    const lot = Number(inst.lotSz || inst.minSz || 1);
    if (!lot || lot <= 0)
      throw new Error(`Invalid lot size for ${inst.instId}`);
    // floor to multiple of lot
    const multiplier = Math.floor(rawSz / lot);
    const sz = multiplier * lot;
    const minSz = Number(inst.minSz || lot);
    if (sz < minSz) {
      this.logger.warn(
        `Computed size ${sz} is less than minSz ${minSz} for ${inst.instId}, multiplier: ${multiplier}, returning 0`,
      );
      return 0;
    }
    // avoid floating rounding issues: fix decimals according to lot
    const decimals = this.decimalPlaces(lot);
    return Number(sz.toFixed(decimals));
  }

  // format price: round to nearest tick
  protected formatPrice(rawPx: number, inst: any) {
    const tick = Number(inst.tickSz || 0.0001);
    if (!tick || tick <= 0)
      throw new Error(`Invalid tick size for ${inst.instId}`);
    const rounded = Math.round(rawPx / tick) * tick;
    const decimals = this.decimalPlaces(tick);
    return Number(rounded.toFixed(decimals));
  }

  protected contractsForNotional(
    notionalUsdt: number,
    price: number,
    inst: any,
  ) {
    const contractValue = Number(inst.ctVal || 1);
    if (!Number.isFinite(contractValue) || contractValue <= 0) {
      throw new Error(`Invalid ctVal for ${inst.instId}: ${inst.ctVal}`);
    }
    return notionalUsdt / (price * contractValue);
  }

  // ---------- market data ----------
  protected async getTicker(instId: string) {
    try {
      const url = `${this.config.get<string>('okx.baseUrl')}/api/v5/market/ticker?instId=${instId}`;
      const res = await axios.get(url);
      const ticker = res.data.data?.[0];
      if (!ticker) return null;
      return Number(ticker.last);
    } catch (err: any) {
      this.logger.error(
        `Error fetching ticker for ${instId}`,
        err.response?.data || err.message,
      );
      return null;
    }
  }

  // ---------- pending orders (per coin or all) ----------
  async getPendingTriggerOrdersForCoin(
    coin: string,
    instType: 'SWAP' | 'SPOT' = 'SWAP',
  ): Promise<OkxAlgoOrder[]> {
    return this.getPendingAlgoOrdersForCoin(coin, 'trigger', instType);
  }

  async getPendingConditionalOrdersForCoin(
    coin: string,
    instType: 'SWAP' | 'SPOT' = 'SWAP',
  ): Promise<OkxAlgoOrder[]> {
    return this.getPendingAlgoOrdersForCoin(coin, 'conditional', instType);
  }

  private async getPendingAlgoOrdersForCoin(
    coin: string,
    ordType: 'trigger' | 'conditional',
    instType: 'SWAP' | 'SPOT' = 'SWAP',
  ): Promise<OkxAlgoOrder[]> {
    const timestamp = new Date().toISOString();
    const instId = `${coin.toUpperCase()}-USDT-${instType}`;
    const getPath = `/api/v5/trade/orders-algo-pending?instType=${instType}&ordType=${ordType}&instId=${instId}`;
    const getSign = this.sign(timestamp, 'GET', getPath);

    const res = await axios.get<OkxApiResponse<OkxAlgoOrder>>(
      this.config.get<string>('okx.baseUrl') + getPath,
      {
        headers: {
          'OK-ACCESS-KEY': this.config.get<string>('okx.apiKeyHEDGE'),
          'OK-ACCESS-SIGN': getSign,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': this.config.get<string>(
            'okx.passphraseHEDGE',
          ),
        },
      },
    );

    if (res.data?.code !== undefined && String(res.data.code) !== '0') {
      throw new Error(
        `OKX rejected pending ${ordType} orders request: ${JSON.stringify(res.data)}`,
      );
    }

    return res.data?.data || [];
  }

  async getAllPendingTriggerOrders(
    instType: 'SWAP' | 'SPOT' = 'SWAP',
  ): Promise<OkxAlgoOrder[]> {
    return this.getAllPendingAlgoOrders('trigger', instType);
  }

  async getAllPendingConditionalOrders(
    instType: 'SWAP' | 'SPOT' = 'SWAP',
  ): Promise<OkxAlgoOrder[]> {
    return this.getAllPendingAlgoOrders('conditional', instType);
  }

  private async getPendingOrdersForCoinByType(
    coin: string,
    ordType: FutureAlgoOrderType,
    instType: 'SWAP' | 'SPOT' = 'SWAP',
  ): Promise<OkxAlgoOrder[]> {
    if (ordType === 'trigger')
      return this.getPendingTriggerOrdersForCoin(coin, instType);
    if (ordType === 'conditional')
      return this.getPendingConditionalOrdersForCoin(coin, instType);
    const [triggerOrders, conditionalOrders] = await Promise.all([
      this.getPendingTriggerOrdersForCoin(coin, instType),
      this.getPendingConditionalOrdersForCoin(coin, instType),
    ]);
    return [...triggerOrders, ...conditionalOrders];
  }

  private async getAllPendingOrdersByType(
    ordType: FutureAlgoOrderType,
    instType: 'SWAP' | 'SPOT' = 'SWAP',
  ): Promise<OkxAlgoOrder[]> {
    if (ordType === 'trigger') return this.getAllPendingTriggerOrders(instType);
    if (ordType === 'conditional')
      return this.getAllPendingConditionalOrders(instType);
    const [triggerOrders, conditionalOrders] = await Promise.all([
      this.getAllPendingTriggerOrders(instType),
      this.getAllPendingConditionalOrders(instType),
    ]);
    return [...triggerOrders, ...conditionalOrders];
  }

  private async getAllPendingAlgoOrders(
    ordType: 'trigger' | 'conditional',
    instType: 'SWAP' | 'SPOT' = 'SWAP',
  ): Promise<OkxAlgoOrder[]> {
    const orders: OkxAlgoOrder[] = [];
    let after: string | undefined;

    while (true) {
      const query = [
        `instType=${instType}`,
        `ordType=${ordType}`,
        'limit=100',
        after ? `after=${encodeURIComponent(after)}` : null,
      ]
        .filter(Boolean)
        .join('&');
      const getPath = `/api/v5/trade/orders-algo-pending?${query}`;
      const maxAttempts = 3;
      let getRes!: AxiosResponse<OkxApiResponse<OkxAlgoOrder>>;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const timestamp = new Date().toISOString();
        const getSign = this.sign(timestamp, 'GET', getPath);

        getRes = await axios.get<OkxApiResponse<OkxAlgoOrder>>(
          this.config.get<string>('okx.baseUrl') + getPath,
          {
            headers: {
              'OK-ACCESS-KEY': this.config.get<string>('okx.apiKeyHEDGE'),
              'OK-ACCESS-SIGN': getSign,
              'OK-ACCESS-TIMESTAMP': timestamp,
              'OK-ACCESS-PASSPHRASE': this.config.get<string>(
                'okx.passphraseHEDGE',
              ),
            },
          },
        );

        const responseCode = String(getRes.data?.code ?? '0');
        if (
          !['50011', '51290'].includes(responseCode) ||
          attempt === maxAttempts
        ) {
          break;
        }

        const retryDelayMs = attempt * 1000;
        this.logger.warn(
          `Retry pending future ${ordType} orders after OKX ${responseCode} ` +
            `(attempt ${attempt}/${maxAttempts}, delay ${retryDelayMs}ms)`,
        );
        await this.sleep(retryDelayMs);
      }

      if (getRes.data?.code !== undefined && String(getRes.data.code) !== '0') {
        throw new Error(
          `OKX rejected pending ${ordType} orders request: ${JSON.stringify(getRes.data)}`,
        );
      }

      const page = getRes.data?.data ?? [];
      orders.push(...page);

      const nextAfter = page[page.length - 1]?.algoId;
      if (page.length < 100 || !nextAfter || nextAfter === after) {
        break;
      }
      after = nextAfter;
    }

    return orders;
  }

  private getFuturePendingOrderType(
    order: OkxAlgoOrder,
  ): 'trigger' | 'conditional' | 'stop_loss' {
    if (order.ordType === 'conditional' && order.slTriggerPx) {
      return 'stop_loss';
    }
    return order.ordType === 'conditional' ? 'conditional' : 'trigger';
  }

  private getFuturePendingPrice(
    order: OkxAlgoOrder,
    fields: Array<keyof OkxAlgoOrder>,
  ): number | undefined {
    const value = fields
      .map((field) => order?.[field])
      .find(
        (candidate) =>
          candidate !== undefined && candidate !== null && candidate !== '',
      );
    const price = Number(value);
    return Number.isFinite(price) ? price : undefined;
  }

  private summarizeFuturePendingOrderTypes(orders: OkxAlgoOrder[]) {
    return orders.reduce(
      (counts, order) => {
        const orderType = this.getFuturePendingOrderType(order);
        if (order.ordType === 'conditional') {
          counts.conditional++;
        } else {
          counts.trigger++;
        }
        if (orderType === 'stop_loss') {
          counts.stopLoss++;
        }
        return counts;
      },
      { trigger: 0, conditional: 0, stopLoss: 0 },
    );
  }

  private getOrderIntent(
    order: OkxAlgoOrder,
    direction: FutureDirection,
  ): 'open' | 'close' {
    const openSide = direction === 'long' ? 'buy' : 'sell';
    return order.side === openSide ? 'open' : 'close';
  }

  private filterOrdersByDirectionAndIntent(
    orders: OkxAlgoOrder[],
    direction: FutureDirection,
    intent: FutureOrderIntent = 'all',
  ): OkxAlgoOrder[] {
    const posSideOrders = this.includePosSide()
      ? orders.filter((order) => !order.posSide || order.posSide === direction)
      : orders;
    return posSideOrders.filter(
      (order) =>
        intent === 'all' || this.getOrderIntent(order, direction) === intent,
    );
  }

  async getFutureOrdersForOneCoin(
    coin: string,
    direction: FutureDirection,
    intent: FutureOrderIntent = 'all',
  ) {
    const orders = this.filterOrdersByDirectionAndIntent(
      await this.getPendingTriggerOrdersForCoin(coin, 'SWAP'),
      direction,
      intent,
    );
    const result = {
      coin: coin.toUpperCase(),
      instId: `${coin.toUpperCase()}-USDT-SWAP`,
      direction,
      intent,
      orderCount: orders.length,
      orders,
    };
    this.logger.log(
      `FUTURE ${this.getPositionMode()} orders one coin: coin=${result.coin}, direction=${direction}, intent=${intent}, count=${orders.length}`,
      null,
      this.getFutureLogFileKey(direction, result.coin),
    );
    return result;
  }

  async getFutureOrdersForAllCoins(
    direction: FutureDirection,
    intent: FutureOrderIntent = 'all',
  ) {
    const [triggerOrders, conditionalOrders] = await Promise.all([
      this.getAllPendingTriggerOrders('SWAP'),
      this.getAllPendingConditionalOrders('SWAP'),
    ]);
    const allOrders = [
      ...triggerOrders.map((order) => ({
        ...order,
        ordType: order.ordType ?? 'trigger',
      })),
      ...conditionalOrders.map((order) => ({
        ...order,
        ordType: order.ordType ?? 'conditional',
      })),
    ];
    const orders = this.filterOrdersByDirectionAndIntent(
      allOrders,
      direction,
      intent,
    )
      .map((order) => ({
        ...order,
        orderType: this.getFuturePendingOrderType(order),
        triggerPrice: this.getFuturePendingPrice(order, [
          'triggerPx',
          'tpTriggerPx',
          'slTriggerPx',
        ]),
        orderPrice: this.getFuturePendingPrice(order, [
          'ordPx',
          'tpOrdPx',
          'slOrdPx',
        ]),
      }))
      .sort(
        (left: any, right: any) =>
          String(left.instId).localeCompare(String(right.instId)) ||
          (left.triggerPrice ?? Number.POSITIVE_INFINITY) -
            (right.triggerPrice ?? Number.POSITIVE_INFINITY) ||
          String(left.orderType).localeCompare(String(right.orderType)),
      );
    const byCoin = new Map<string, any[]>();
    for (const order of orders) {
      const coin = String(order.instId ?? '')
        .split('-')[0]
        .toUpperCase();
      if (!byCoin.has(coin)) byCoin.set(coin, []);
      byCoin.get(coin)!.push(order);
    }
    const coinEntries = Array.from(byCoin.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const currentPrices = await Promise.all(
      coinEntries.map(async ([coin]) => {
        try {
          return await this.getTicker(`${coin}-USDT-SWAP`);
        } catch {
          return undefined;
        }
      }),
    );
    const result = {
      direction,
      intent,
      orderCount: orders.length,
      orderTypeCounts: this.summarizeFuturePendingOrderTypes(orders),
      coins: coinEntries.map(([coin, coinOrders], index) => ({
        coin,
        instId: `${coin}-USDT-SWAP`,
        currentPrice: currentPrices[index],
        orderCount: coinOrders.length,
        orderTypeCounts: this.summarizeFuturePendingOrderTypes(coinOrders),
        orders: coinOrders,
      })),
    };
    this.logger.log(
      `FUTURE ${this.getPositionMode()} orders all coins: direction=${direction}, intent=${intent}, count=${orders.length}, coins=${result.coins.length}`,
      null,
      this.getFutureLogFileKey(direction),
    );
    return result;
  }

  async cancelFutureOrdersForOneCoin(
    coin: string,
    direction: FutureDirection,
    intent: FutureOrderIntent = 'all',
    ordType: FutureAlgoOrderType = 'trigger',
    testing: boolean = true,
  ) {
    const normalizedCoin = coin.toUpperCase();
    this.logger.log(
      `FUTURE ${this.getPositionMode()} cancel one coin start: coin=${normalizedCoin}, direction=${direction}, intent=${intent}, ordType=${ordType}, testing=${testing}`,
      null,
      this.getFutureLogFileKey(direction, normalizedCoin),
    );
    const orders = this.filterOrdersByDirectionAndIntent(
      await this.getPendingOrdersForCoinByType(coin, ordType, 'SWAP'),
      direction,
      intent,
    );
    const result = testing
      ? {
          status: 'preview',
          coin: normalizedCoin,
          direction,
          intent,
          ordType,
          testing,
          matchedOrderCount: orders.length,
          orders: orders.map((order) => ({
            algoId: order.algoId,
            instId: order.instId,
            ordType: order.ordType,
            side: order.side,
            posSide: order.posSide,
            triggerPx:
              order.triggerPx ?? order.slTriggerPx ?? order.tpTriggerPx,
            orderPx:
              order.ordPx ?? order.orderPx ?? order.slOrdPx ?? order.tpOrdPx,
            size: order.sz,
          })),
          cancelled: [],
        }
      : await this.cancelOrdersFromList({ orders });
    this.logger.log(
      `FUTURE ${this.getPositionMode()} cancel one coin result: coin=${normalizedCoin}, direction=${direction}, intent=${intent}, ordType=${ordType}, testing=${testing}, matched=${orders.length}, result=${JSON.stringify(result)}`,
      null,
      this.getFutureLogFileKey(direction, normalizedCoin),
    );
    if (!testing && orders.length > 0) {
      await this.sendFutureEmail(
        `Cancel ${direction} ${intent} orders ${normalizedCoin}`,
        {
          mode: this.getPositionMode(),
          coin: normalizedCoin,
          direction,
          intent,
          ordType,
          matchedOrderCount: orders.length,
          orders: orders.map((order) => ({
            algoId: order.algoId,
            instId: order.instId,
            side: order.side,
            triggerPx: order.triggerPx,
            orderPx: order.ordPx ?? order.orderPx,
            size: order.sz,
          })),
          result,
        },
      );
    }
    return result;
  }

  async cancelFutureOrdersForAllCoins(
    direction: FutureDirection,
    intent: FutureOrderIntent = 'all',
    ordType: FutureAlgoOrderType = 'trigger',
    testing: boolean = true,
  ) {
    this.logger.log(
      `FUTURE ${this.getPositionMode()} cancel all start: direction=${direction}, intent=${intent}, ordType=${ordType}, testing=${testing}`,
      null,
      this.getFutureLogFileKey(direction),
    );
    const orders = this.filterOrdersByDirectionAndIntent(
      await this.getAllPendingOrdersByType(ordType, 'SWAP'),
      direction,
      intent,
    );
    const result = testing
      ? {
          status: 'preview',
          direction,
          intent,
          ordType,
          testing,
          matchedOrderCount: orders.length,
          orders: orders.map((order) => ({
            algoId: order.algoId,
            instId: order.instId,
            ordType: order.ordType,
            side: order.side,
            posSide: order.posSide,
            triggerPx:
              order.triggerPx ?? order.slTriggerPx ?? order.tpTriggerPx,
            orderPx:
              order.ordPx ?? order.orderPx ?? order.slOrdPx ?? order.tpOrdPx,
            size: order.sz,
          })),
          cancelled: [],
        }
      : await this.cancelOrdersFromList({ orders });
    this.logger.log(
      `FUTURE ${this.getPositionMode()} cancel all result: direction=${direction}, intent=${intent}, ordType=${ordType}, testing=${testing}, matched=${orders.length}, result=${JSON.stringify(result)}`,
      null,
      this.getFutureLogFileKey(direction),
    );
    if (!testing && orders.length > 0) {
      await this.sendFutureEmail(`Cancel all ${direction} ${intent} orders`, {
        mode: this.getPositionMode(),
        direction,
        intent,
        ordType,
        matchedOrderCount: orders.length,
        orders: orders.map((order) => ({
          algoId: order.algoId,
          instId: order.instId,
          side: order.side,
          triggerPx: order.triggerPx,
          orderPx: order.ordPx ?? order.orderPx,
          size: order.sz,
        })),
        result,
      });
    }
    return result;
  }

  async getProtectiveCloseCleanupCoins(
    direction: FutureDirection,
    configuredCoins: string[] = [],
  ) {
    const [pendingOrders, positionResponse] = await Promise.all([
      this.getAllPendingOrdersByType('all', 'SWAP'),
      this.getOpenPosition(''),
    ]);
    if (
      positionResponse?.code !== undefined &&
      String(positionResponse.code) !== '0'
    ) {
      throw new Error(
        `OKX rejected positions request: ${JSON.stringify(positionResponse)}`,
      );
    }

    const closeOrderCoins = this.filterOrdersByDirectionAndIntent(
      pendingOrders,
      direction,
      'close',
    ).map((order) => String(order.instId ?? '').split('-')[0]);
    const positionCoins = (positionResponse?.data ?? []).flatMap((position) => {
      if (!this.selectPositionForDirection([position], direction)) return [];
      const size = this.getTotalPositionSize(position);
      if (!size.greaterThan(0)) return [];
      return [String(position.instId ?? '').split('-')[0]];
    });

    return Array.from(
      new Set(
        [...configuredCoins, ...closeOrderCoins, ...positionCoins]
          .map((coin) => String(coin).trim().toUpperCase())
          .filter((coin) => /^[A-Z0-9]+$/.test(coin)),
      ),
    ).sort();
  }

  async cleanProtectiveCloseByPriceStepsOrdersForOneCoin(
    coin: string,
    direction: FutureDirection,
    testing: boolean = true,
  ) {
    const normalizedCoin = coin.trim().toUpperCase();
    if (!normalizedCoin || !/^[A-Z0-9]+$/.test(normalizedCoin)) {
      throw new Error(`Invalid coin: ${coin}`);
    }
    const instId = `${normalizedCoin}-USDT-SWAP`;
    const logFileKey = this.getFutureLogFileKey(direction, normalizedCoin);
    const [positionResponse, pendingTriggerOrders, pendingConditionalOrders] =
      await Promise.all([
        this.getOpenPosition(instId),
        this.getPendingTriggerOrdersForCoin(normalizedCoin, 'SWAP'),
        this.getPendingConditionalOrdersForCoin(normalizedCoin, 'SWAP'),
      ]);
    if (
      positionResponse?.code !== undefined &&
      String(positionResponse.code) !== '0'
    ) {
      throw new Error(
        `OKX rejected position request for ${instId}: ${JSON.stringify(positionResponse)}`,
      );
    }

    const position = this.selectPositionForDirection(
      positionResponse?.data ?? [],
      direction,
    );
    const normalizedPositionSize = this.getTotalPositionSize(position);
    const pendingCloseOrders: OkxAlgoOrder[] = [
      ...pendingTriggerOrders.map((order) => ({
        ...order,
        ordType: order.ordType ?? 'trigger',
      })),
      ...pendingConditionalOrders.map((order) => ({
        ...order,
        ordType: order.ordType ?? 'conditional',
      })),
    ];
    const orphanedCloseOrders = this.filterOrdersByDirectionAndIntent(
      pendingCloseOrders,
      direction,
      'close',
    )
      .filter((order) => {
        const size = this.parseDecimal(order.sz);
        return (
          order.instId === instId &&
          Boolean(order.algoId) &&
          (normalizedPositionSize.isZero() || Boolean(size?.greaterThan(0)))
        );
      })
      .map((order) => ({
        algoId: String(order.algoId),
        instId,
        ordType: order.ordType,
        triggerPrice: Number(
          order.triggerPx ?? order.slTriggerPx ?? order.tpTriggerPx,
        ),
        orderPrice: Number(
          order.ordPx ?? order.orderPx ?? order.slOrdPx ?? order.tpOrdPx,
        ),
        size: this.parseDecimal(order.sz)?.toFixed() ?? '0',
        sizeDecimal: this.parseDecimal(order.sz) ?? new Decimal(0),
        raw: order,
      }));

    // With no position, every close order is orphaned. Do not require ticker or
    // instrument metadata here: delisted instruments are exactly the case that
    // still needs cleanup.
    let currentPrice: number | null = null;
    let inst: OkxInstrument | null = null;
    let protectiveCloseOrders = orphanedCloseOrders;
    if (normalizedPositionSize.greaterThan(0)) {
      [currentPrice, inst] = await Promise.all([
        this.getTicker(instId),
        this.fetchInstrument(instId),
      ]);
      if (!Number.isFinite(currentPrice) || Number(currentPrice) <= 0) {
        throw new Error(`Invalid current price for ${instId}: ${currentPrice}`);
      }
      if (!inst) throw new Error(`Instrument info not available for ${instId}`);

      protectiveCloseOrders = orphanedCloseOrders.filter((order) => {
        if (order.ordType !== 'trigger') return false;
        if (!Number.isFinite(order.triggerPrice)) return false;
        return direction === 'long'
          ? order.triggerPrice < Number(currentPrice)
          : order.triggerPrice > Number(currentPrice);
      });
    }
    protectiveCloseOrders = protectiveCloseOrders.sort((left, right) =>
      direction === 'long'
        ? right.triggerPrice - left.triggerPrice
        : left.triggerPrice - right.triggerPrice,
    );

    const totalProtectiveCloseSize = protectiveCloseOrders.reduce(
      (total, order) => total.plus(order.sizeDecimal),
      new Decimal(0),
    );
    const sizeTolerance = normalizedPositionSize.greaterThan(0)
      ? new Decimal(String(inst.lotSz || inst.minSz || 1)).div(2)
      : new Decimal(0);
    const ordersToCancel: typeof protectiveCloseOrders = [];
    let remainingProtectiveCloseSize = totalProtectiveCloseSize;
    for (const order of [...protectiveCloseOrders].reverse()) {
      if (
        remainingProtectiveCloseSize.lessThanOrEqualTo(
          normalizedPositionSize.plus(sizeTolerance),
        )
      )
        break;
      ordersToCancel.push(order);
      remainingProtectiveCloseSize = remainingProtectiveCloseSize.minus(
        order.sizeDecimal,
      );
    }
    const cancelledIds = new Set(ordersToCancel.map(({ algoId }) => algoId));
    const keptOrders = protectiveCloseOrders.filter(
      ({ algoId }) => !cancelledIds.has(algoId),
    );
    const baseResult = {
      coin: normalizedCoin,
      instId,
      direction,
      testing,
      currentPrice,
      positionSize: normalizedPositionSize.toFixed(),
      orphanedCloseOrderCleanup: normalizedPositionSize.isZero(),
      protectiveCloseByPriceStepsOrderCount: protectiveCloseOrders.length,
      totalProtectiveCloseByPriceStepsSize: totalProtectiveCloseSize.toFixed(),
      keptOrderCount: keptOrders.length,
      keptSize: keptOrders
        .reduce((total, order) => total.plus(order.sizeDecimal), new Decimal(0))
        .toFixed(),
      cancelOrderCount: ordersToCancel.length,
      cancelSize: ordersToCancel
        .reduce((total, order) => total.plus(order.sizeDecimal), new Decimal(0))
        .toFixed(),
      keptOrders: keptOrders.map(({ raw, sizeDecimal, ...order }) => order),
      ordersToCancel: ordersToCancel.map(
        ({ raw, sizeDecimal, ...order }) => order,
      ),
    };

    if (testing) return { status: 'preview', ...baseResult };
    if (ordersToCancel.length === 0) {
      const result = {
        status: 'nothing_to_cancel',
        ...baseResult,
        cancelledOrderCount: 0,
        failedOrderCount: 0,
        responses: [],
      };
      this.logFutureCleanupSummary(result, logFileKey);
      return result;
    }

    const responses = await this.cancelOrdersFromList({
      orders: ordersToCancel.map(({ raw }) => raw),
    });
    const responseList: OkxCancelResponse[] = Array.isArray(responses)
      ? responses
      : [];
    const responseItems = responseList.flatMap(
      (response) => response?.data ?? [],
    );
    const cancelledOrderCount = responseItems.filter(
      (item) => String(item.sCode) === '0',
    ).length;
    const failedOrderCount = ordersToCancel.length - cancelledOrderCount;
    const result = {
      status: failedOrderCount === 0 ? 'cleaned' : 'partially_cleaned',
      ...baseResult,
      cancelledOrderCount,
      failedOrderCount,
      responses,
    };
    const successfullyCancelledIds = new Set(
      responseItems
        .filter((item) => String(item.sCode) === '0')
        .map((item) => String(item.algoId)),
    );
    const cancelledOrderIds = Array.from(successfullyCancelledIds);
    const failedOrderIds = ordersToCancel
      .map(({ algoId }) => algoId)
      .filter((algoId) => !successfullyCancelledIds.has(algoId));
    this.logFutureCleanupSummary(
      result,
      logFileKey,
      cancelledOrderIds,
      failedOrderIds,
    );
    await this.sendFutureEmail(
      `Clean ${direction} protective close by price steps orders ${normalizedCoin}`,
      {
        mode: this.getPositionMode(),
        ...result,
      },
    );
    return result;
  }

  // Backward-compatible service alias.
  async cleanProtectiveCloseOrdersForOneCoin(
    coin: string,
    direction: FutureDirection,
    testing: boolean = true,
  ) {
    return this.cleanProtectiveCloseByPriceStepsOrdersForOneCoin(
      coin,
      direction,
      testing,
    );
  }

  // Backward-compatible service alias.
  async cleanCloseOrdersForOneCoin(
    coin: string,
    direction: FutureDirection,
    testing: boolean = true,
  ) {
    return this.cleanProtectiveCloseByPriceStepsOrdersForOneCoin(
      coin,
      direction,
      testing,
    );
  }

  // ---------- cancel helper that takes a list of orders and cancels them (supports filtering) ----------
  async cancelOrdersFromList({
    orders,
    direction,
    enableTakeProfit = false,
    partialCloseOnRetrace = false,
    autoTrade = false,
  }: {
    orders: OkxAlgoOrder[];
    direction?: 'long' | 'short';
    enableTakeProfit?: boolean;
    partialCloseOnRetrace?: boolean;
    autoTrade?: boolean;
  }) {
    if (!orders || orders.length === 0) return { cancelled: [] };

    let filtered = orders.slice();

    // filter by side according to direction
    if (direction) {
      let sideToKeep: string;
      // remove open postion triggers
      if (autoTrade) {
        sideToKeep = direction === 'long' ? 'buy' : 'sell';
      }
      if (enableTakeProfit) {
        sideToKeep = direction === 'long' ? 'sell' : 'buy';
      }
      filtered = filtered.filter((o) => o.side === sideToKeep);
    }

    // if retrace-only filter: we need to keep only orders that are retrace for their own coin
    if (partialCloseOnRetrace && filtered.length > 0) {
      const byCoin = new Map<string, any[]>();
      filtered.forEach((o) => {
        const coin = String(o.instId).split('-')[0];
        if (!byCoin.has(coin)) byCoin.set(coin, []);
        byCoin.get(coin)!.push(o);
      });

      const finalFiltered: any[] = [];
      for (const [coin, ordersForCoin] of byCoin.entries()) {
        const instId = `${coin}-USDT-SWAP`;
        const currentPrice = await this.getTicker(instId);
        if (!currentPrice) continue;
        for (const o of ordersForCoin) {
          // retrace means: for long position, orderPrice < currentPrice (price must drop to hit order)
          // for short position, orderPrice > currentPrice (price must rise to hit order)
          if (!direction) {
            finalFiltered.push(o); // if direction not provided, keep all
            continue;
          }
          const isRetrace =
            direction === 'long'
              ? Number(o.ordPx) < currentPrice
              : Number(o.ordPx) > currentPrice;
          if (isRetrace) finalFiltered.push(o);
        }
      }
      filtered = finalFiltered;
    }

    if (!filtered.length) return { cancelled: [] };

    // chunk cancel (OKX safe chunk size 20)
    const payloadItems = filtered.map((o) => ({
      algoId: o.algoId,
      instId: o.instId,
    }));
    const chunks = this.chunk(payloadItems, 20);
    const results: OkxCancelResponse[] = [];

    for (const chunk of chunks) {
      const bodyString = JSON.stringify(chunk);
      const cancelPath = '/api/v5/trade/cancel-algos';
      const tsCancel = new Date().toISOString();
      const headersCancel = this.buildHeaders(
        tsCancel,
        'POST',
        cancelPath,
        bodyString,
      );

      const cancelRes = await axios.post<OkxCancelResponse>(
        this.config.get<string>('okx.baseUrl') + cancelPath,
        bodyString,
        { headers: headersCancel },
      );
      results.push(cancelRes.data);
    }

    return results;
  }

  // ---------- open/close position helpers - with auto-format by instrument ----------
  async openPosition(
    coin: string,
    direction: 'long' | 'short',
    sz: string,
    triggerPx?: string,
    orderPx: string = '-1',
    testing: boolean = true,
    stopLossPx?: string,
  ) {
    const instId = `${coin.toUpperCase()}-USDT-SWAP`;
    const inst = await this.fetchInstrument(instId);
    if (!inst) {
      this.logger.warn(
        `Instrument info not available for ${instId}, aborting openPosition`,
        null,
        this.getFutureLogFileKey(direction, coin),
      );
      throw new Error(`Instrument info not available for ${instId}`);
    }

    // parse and format sizes/prices
    let rawSz = Number(sz);
    if (!isFinite(rawSz) || rawSz <= 0) throw new Error(`Invalid size: ${sz}`);
    // const formattedSz = parseFloat(rawSz.toFixed(8));
    // if (!formattedSz || formattedSz <= 0) {
    //     throw new Error(`Computed size after applying lot size is zero. rawSz=${rawSz}, lotSz=${inst.lotSz}, minSz=${inst.minSz}`);
    // }
    // let formattedSz = rawSz;
    // if (rawSz > 1) {
    //     formattedSz = this.formatSize(rawSz, inst);
    // } else {
    //     formattedSz = parseFloat(rawSz.toFixed(8));
    // }
    const formattedSz = this.formatSize(rawSz, inst);
    if (!formattedSz || formattedSz <= 0) {
      throw new Error(
        `Computed size after applying lot size is zero. rawSz=${rawSz}, lotSz=${inst.lotSz}, minSz=${inst.minSz}`,
      );
    }

    // order/trigger price formatting
    let formattedTriggerPx: number | undefined = undefined;
    let formattedOrderPx: number | undefined = undefined;
    if (triggerPx) {
      const rawTrigger = Number(triggerPx);
      if (!isFinite(rawTrigger))
        throw new Error(`Invalid triggerPx: ${triggerPx}`);
      formattedTriggerPx = this.formatPrice(rawTrigger, inst);
    }
    if (orderPx && orderPx !== '-1') {
      const rawOrder = Number(orderPx);
      if (!isFinite(rawOrder)) throw new Error(`Invalid orderPx: ${orderPx}`);
      formattedOrderPx = this.formatPrice(rawOrder, inst);
    }

    const rawStopLoss = Number(stopLossPx);
    if (!stopLossPx || !isFinite(rawStopLoss) || rawStopLoss <= 0) {
      throw new Error(
        `A valid stopLossPx is required for every ${direction} entry order`,
      );
    }
    const formattedStopLossPx = this.formatPrice(rawStopLoss, inst);
    const referenceEntryPrice = formattedOrderPx ?? formattedTriggerPx;
    if (referenceEntryPrice !== undefined) {
      const invalidStopLoss =
        direction === 'long'
          ? formattedStopLossPx >= referenceEntryPrice
          : formattedStopLossPx <= referenceEntryPrice;
      if (invalidStopLoss) {
        throw new Error(
          `Invalid ${direction} stopLossPx ${formattedStopLossPx} for entry price ${referenceEntryPrice}`,
        );
      }
    }

    // prepare body with formatted values (string)
    const tdMode = 'isolated';
    const side = direction === 'long' ? 'buy' : 'sell';
    const posSide = this.includePosSide()
      ? this.getPosSide(direction)
      : undefined;

    let requestPath = '';
    let body: any = {};
    if (formattedTriggerPx !== undefined) {
      requestPath = '/api/v5/trade/order-algo';
      body = {
        instId,
        tdMode,
        ordType: 'trigger',
        side,
        sz: formattedSz.toString(),
        triggerPx: formattedTriggerPx.toString(),
        orderPx:
          formattedOrderPx !== undefined
            ? formattedOrderPx.toString()
            : orderPx, // keep '-1' if market
      };
      if (posSide) body.posSide = posSide;
    } else {
      requestPath = '/api/v5/trade/order';
      body = {
        instId,
        tdMode,
        side,
        ordType: 'market',
        sz: formattedSz.toString(),
      };
      if (posSide) body.posSide = posSide;
    }
    body.attachAlgoOrds = [
      {
        slTriggerPx: formattedStopLossPx.toString(),
        slTriggerPxType: 'last',
        slOrdPx: '-1',
      },
    ];

    const timestamp = new Date().toISOString();
    const futureLeverage = this.config.get<number>('futureLeverage') || 1;
    this.logger.log(`FutureLeverage: ${futureLeverage} (long and short)`);

    // set leverage if desired (example sets to 1 for both posSides only when not testing)
    if (!testing) {
      try {
        // some coins require posSide param for setLeverage when in hedge mode
        if (this.includePosSide()) {
          this.logger.log(
            `Setting leverage for ${instId} to ${futureLeverage} (long and short)`,
          );
          await this.setLeverage(instId, futureLeverage, 'long');
          await this.setLeverage(instId, futureLeverage, 'short');
        } else {
          // for one-way mode OKX may not accept posSide param; call without posSide if needed
          await this.setLeverage(instId, 1).catch(() => {
            /* ignore */
          });
        }
      } catch (err) {
        this.logger.warn(
          `setLeverage failed for ${instId}: ${err?.response?.data || err?.message}`,
        );
        // not fatal — continue
      }
    }

    const prehash = timestamp + 'POST' + requestPath + JSON.stringify(body);
    const sign = this.signRequest(
      this.config.get<string>('okx.secretKeyHEDGE')!,
      prehash,
    );

    const headers = {
      'OK-ACCESS-KEY': this.config.get<string>('okx.apiKeyHEDGE'),
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphraseHEDGE'),
      'Content-Type': 'application/json',
    };

    const url = this.config.get<string>('okx.baseUrl') + requestPath;

    try {
      this.logger.log(
        `FUTURE ${this.getPositionMode()} open order: coin=${coin.toUpperCase()}, direction=${direction}, testing=${testing}, triggerPx=${body.triggerPx ?? 'market'}, orderPx=${body.orderPx ?? 'market'}, size=${body.sz}, stopLossPx=${formattedStopLossPx}`,
        null,
        this.getFutureLogFileKey(direction, coin),
      );
      let res;
      if (!testing) {
        res = await axios.post(url, body, { headers });
        this.assertOkxTradeAccepted(res.data, 'future open order');
      }
      this.logger.log(
        `FUTURE ${this.getPositionMode()} open order result: coin=${coin.toUpperCase()}, direction=${direction}, testing=${testing}, result=${JSON.stringify(res?.data ?? { preview: true })}`,
        null,
        this.getFutureLogFileKey(direction, coin),
      );
      return { data: res?.data, body };
    } catch (error: any) {
      this.logger.error(
        'Error opening position:',
        JSON.stringify(error.response?.data || error.message),
        null,
        this.getFutureLogFileKey(direction, coin),
      );
      throw error;
    }
  }

  async closePartialPosition(
    coin: string,
    direction: 'long' | 'short',
    sz: string,
    triggerPx: string,
    orderPx?: string,
    testing: boolean = true,
  ) {
    const instId = `${coin.toUpperCase()}-USDT-SWAP`;
    const inst = await this.fetchInstrument(instId);
    if (!inst) {
      this.logger.warn(
        `Instrument info not available for ${instId}, aborting closePartialPosition`,
        null,
        this.getFutureLogFileKey(direction, coin),
      );
      throw new Error(`Instrument info not available for ${instId}`);
    }

    // parse inputs
    let rawSz = Number(sz);
    if (!isFinite(rawSz) || rawSz <= 0) throw new Error(`Invalid size: ${sz}`);

    const formattedSz = this.formatSize(rawSz, inst);
    if (!formattedSz || formattedSz <= 0) {
      throw new Error(
        `Computed size after applying lot size is zero. rawSz=${rawSz}, lotSz=${inst.lotSz}, minSz=${inst.minSz}`,
      );
    }

    const rawTrigger = Number(triggerPx);
    if (!isFinite(rawTrigger))
      throw new Error(`Invalid triggerPx: ${triggerPx}`);
    const formattedTrigger = this.formatPrice(rawTrigger, inst);

    let formattedOrderPx: number | undefined = undefined;
    if (orderPx && orderPx !== '-1') {
      const rawOrder = Number(orderPx);
      if (!isFinite(rawOrder)) throw new Error(`Invalid orderPx: ${orderPx}`);
      formattedOrderPx = this.formatPrice(rawOrder, inst);
    }

    // build body
    const timestamp = new Date().toISOString();
    const requestPath = '/api/v5/trade/order-algo';
    const tdMode = 'isolated';
    const side = direction === 'long' ? 'sell' : 'buy'; // close: long->sell, short->buy
    const posSide = this.includePosSide()
      ? this.getPosSide(direction)
      : undefined;

    const body: any = {
      instId,
      tdMode,
      side,
      ordType: 'trigger',
      sz: formattedSz.toString(),
      triggerPx: formattedTrigger.toString(),
      orderPx:
        formattedOrderPx !== undefined
          ? formattedOrderPx.toString()
          : (orderPx ?? '-1'),
      reduceOnly: true,
    };
    if (posSide) body.posSide = posSide;

    const prehash = timestamp + 'POST' + requestPath + JSON.stringify(body);
    const sign = this.signRequest(
      this.config.get<string>('okx.secretKeyHEDGE')!,
      prehash,
    );

    const headers = {
      'OK-ACCESS-KEY': this.config.get<string>('okx.apiKeyHEDGE'),
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphraseHEDGE'),
      'Content-Type': 'application/json',
    };

    const url = this.config.get<string>('okx.baseUrl') + requestPath;

    try {
      this.logger.log(
        `FUTURE ${this.getPositionMode()} close order: coin=${coin.toUpperCase()}, direction=${direction}, testing=${testing}, triggerPx=${body.triggerPx}, orderPx=${body.orderPx}, size=${body.sz}, reduceOnly=true`,
        null,
        this.getFutureLogFileKey(direction, coin),
      );
      let res;
      if (!testing) {
        res = await axios.post(url, body, { headers });
        this.assertOkxTradeAccepted(res.data, 'future close order');
      }
      this.logger.log(
        `FUTURE ${this.getPositionMode()} close order result: coin=${coin.toUpperCase()}, direction=${direction}, testing=${testing}, result=${JSON.stringify(res?.data ?? { preview: true })}`,
        null,
        this.getFutureLogFileKey(direction, coin),
      );
      return { data: res?.data, body };
    } catch (error: any) {
      this.logger.error(
        'Error placing close partial position trigger:',
        JSON.stringify(error.response?.data || error.message),
        null,
        this.getFutureLogFileKey(direction, coin),
      );
      throw error;
    }
  }

  // ---------- open position abstraction used by autoOpenPosition ----------
  protected async getOpenPosition(
    instId: string,
  ): Promise<OkxApiResponse<OkxPosition>> {
    const method = 'GET';
    const requestPath = instId
      ? `/api/v5/account/positions?instId=${instId}`
      : '/api/v5/account/positions?instType=SWAP';
    const body = '';
    const timestamp = new Date().toISOString();

    const prehash = timestamp + method + requestPath + body;
    const sign = this.signRequest(
      this.config.get<string>('okx.secretKeyHEDGE'),
      prehash,
    );

    const headers = {
      'OK-ACCESS-KEY': this.config.get<string>('okx.apiKeyHEDGE'),
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphraseHEDGE'),
      'Content-Type': 'application/json',
    };

    const url = this.config.get<string>('okx.baseUrl') + requestPath;
    const response = await axios.get<OkxApiResponse<OkxPosition>>(url, {
      headers,
    });

    return response.data;
  }

  protected selectPositionForDirection(
    positions: OkxPosition[],
    direction: FutureDirection,
  ): OkxPosition | undefined {
    if (this.includePosSide()) {
      return positions.find((position) => position.posSide === direction);
    }
    return positions.find((position) => {
      const size = Number(position.pos ?? 0);
      return direction === 'long' ? size > 0 : size < 0;
    });
  }

  async placePositionStopLoss(
    coin: string,
    direction: FutureDirection,
    size: number,
    stopLossPrice: number,
    testing: boolean = true,
  ) {
    const normalizedCoin = coin.toUpperCase();
    const instId = `${normalizedCoin}-USDT-SWAP`;
    const logFileKey = this.getFutureLogFileKey(direction, normalizedCoin);
    const inst = await this.fetchInstrument(instId);
    if (!inst) throw new Error(`Instrument info not available for ${instId}`);

    if (!Number.isFinite(size) || size <= 0)
      throw new Error(`Invalid stop-loss size: ${size}`);
    if (!Number.isFinite(stopLossPrice) || stopLossPrice <= 0) {
      throw new Error(`Invalid stop-loss price: ${stopLossPrice}`);
    }

    const formattedSize = this.formatSize(size, inst);
    if (!formattedSize) {
      throw new Error(
        `Stop-loss size is below minimum size for ${instId}: size=${size}, minSz=${inst.minSz}`,
      );
    }
    const formattedStopLossPrice = this.formatPrice(stopLossPrice, inst);
    const body: any = {
      instId,
      tdMode: 'isolated',
      side: direction === 'long' ? 'sell' : 'buy',
      ordType: 'conditional',
      sz: formattedSize.toString(),
      slTriggerPx: formattedStopLossPrice.toString(),
      slTriggerPxType: 'last',
      slOrdPx: '-1',
    };
    if (this.includePosSide()) {
      body.posSide = this.getPosSide(direction);
    } else {
      body.reduceOnly = true;
    }

    const requestPath = '/api/v5/trade/order-algo';
    const bodyString = JSON.stringify(body);
    const timestamp = new Date().toISOString();
    const headers = this.buildHeaders(
      timestamp,
      'POST',
      requestPath,
      bodyString,
    );
    this.logger.log(
      `FUTURE ${this.getPositionMode()} ensure stop-loss order: coin=${normalizedCoin}, direction=${direction}, testing=${testing}, triggerPx=${body.slTriggerPx}, orderPx=-1, size=${body.sz}`,
      null,
      logFileKey,
    );

    try {
      let responseData: any;
      if (!testing) {
        const response = await axios.post(
          this.config.get<string>('okx.baseUrl') + requestPath,
          bodyString,
          { headers },
        );
        responseData = response.data;
        const rejectedItem = responseData?.data?.find(
          (item: any) => item.sCode && item.sCode !== '0',
        );
        if (responseData?.code !== '0' || rejectedItem) {
          throw new Error(
            `OKX rejected stop-loss order: ${JSON.stringify(responseData)}`,
          );
        }
      }
      this.logger.log(
        `FUTURE ${this.getPositionMode()} ensure stop-loss order result: coin=${normalizedCoin}, direction=${direction}, testing=${testing}, result=${JSON.stringify(responseData ?? { preview: true })}`,
        null,
        logFileKey,
      );
      return { data: responseData, body };
    } catch (error: any) {
      this.logger.error(
        'Error placing position stop-loss:',
        JSON.stringify(error.response?.data || error.message),
        null,
        logFileKey,
      );
      throw error;
    }
  }

  async placeWholePositionStopLoss(
    coin: string,
    direction: FutureDirection,
    stopLossPrice: number,
    testing: boolean = true,
  ) {
    const normalizedCoin = coin.toUpperCase();
    const instId = `${normalizedCoin}-USDT-SWAP`;
    const logFileKey = this.getFutureLogFileKey(direction, normalizedCoin);
    if (this.includePosSide()) {
      throw new Error(
        'Whole-position stop-loss with closeFraction=1 is only supported in one-way mode',
      );
    }
    if (!Number.isFinite(stopLossPrice) || stopLossPrice <= 0) {
      throw new Error(
        `Invalid whole-position stop-loss price: ${stopLossPrice}`,
      );
    }
    const inst = await this.fetchInstrument(instId);
    if (!inst) throw new Error(`Instrument info not available for ${instId}`);
    const body = {
      instId,
      tdMode: 'isolated',
      side: direction === 'long' ? 'sell' : 'buy',
      ordType: 'conditional',
      closeFraction: '1',
      reduceOnly: true,
      slTriggerPx: this.formatPrice(stopLossPrice, inst).toString(),
      slTriggerPxType: 'last',
      slOrdPx: '-1',
    };
    const requestPath = '/api/v5/trade/order-algo';
    const bodyString = JSON.stringify(body);
    const timestamp = new Date().toISOString();
    const headers = this.buildHeaders(
      timestamp,
      'POST',
      requestPath,
      bodyString,
    );
    this.logger.log(
      `FUTURE oneway whole-position stop-loss order: coin=${normalizedCoin}, direction=${direction}, testing=${testing}, triggerPx=${body.slTriggerPx}, closeFraction=1`,
      null,
      logFileKey,
    );
    let responseData: any;
    if (!testing) {
      const response = await axios.post(
        this.config.get<string>('okx.baseUrl') + requestPath,
        bodyString,
        { headers },
      );
      responseData = response.data;
      const rejectedItem = responseData?.data?.find(
        (item: any) => item.sCode && String(item.sCode) !== '0',
      );
      if (String(responseData?.code) !== '0' || rejectedItem) {
        throw new Error(
          `OKX rejected whole-position stop-loss: ${JSON.stringify(responseData)}`,
        );
      }
    }
    return { data: responseData, body };
  }

  private getPositionStopLossOrders(
    conditionalOrders: OkxAlgoOrder[],
    direction: FutureDirection,
    instId: string,
  ) {
    const closeSide = direction === 'long' ? 'sell' : 'buy';
    return conditionalOrders.filter((order) => {
      const matchesDirection =
        !this.includePosSide() || order.posSide === direction;
      const hasMarketStopLoss =
        Number(order.slTriggerPx) > 0 && String(order.slOrdPx ?? '') === '-1';
      return (
        order.instId === instId &&
        matchesDirection &&
        order.side === closeSide &&
        hasMarketStopLoss &&
        Boolean(order.algoId)
      );
    });
  }

  private getReconciledStopLossPrice(
    direction: FutureDirection,
    currentPrice: number,
    stopLossOrders: OkxAlgoOrder[],
  ) {
    const stopLossRatio = Number(
      this.config.get<number>('stopLossBuyPriceRatio'),
    );
    if (
      !Number.isFinite(stopLossRatio) ||
      stopLossRatio <= 0 ||
      stopLossRatio >= 1
    ) {
      throw new Error(`Invalid stopLossBuyPriceRatio: ${stopLossRatio}`);
    }
    const fallbackPrice =
      direction === 'long'
        ? currentPrice * (1 - stopLossRatio)
        : currentPrice * (1 + stopLossRatio);
    const validExistingPrices = stopLossOrders
      .map((order) => Number(order.slTriggerPx))
      .filter(
        (price: number) =>
          Number.isFinite(price) &&
          price > 0 &&
          (direction === 'long' ? price < currentPrice : price > currentPrice),
      );
    if (validExistingPrices.length === 0) return fallbackPrice;
    return direction === 'long'
      ? Math.max(fallbackPrice, ...validExistingPrices)
      : Math.min(fallbackPrice, ...validExistingPrices);
  }

  private async cancelStopLossOrders(orders: OkxAlgoOrder[], testing: boolean) {
    if (orders.length === 0) return [];
    if (testing) {
      return orders.map((order) => ({
        preview: true,
        algoId: order.algoId,
        instId: order.instId,
      }));
    }
    const responses = await this.cancelOrdersFromList({ orders });
    if (!Array.isArray(responses)) {
      throw new Error('Unexpected empty cancellation response');
    }
    const responseList = responses;
    const rejectedResponse = responseList.find(
      (response) =>
        response?.code !== undefined && String(response.code) !== '0',
    );
    const rejectedItem = responseList
      .flatMap((response) => response?.data ?? [])
      .find((item) => item.sCode !== undefined && String(item.sCode) !== '0');
    if (rejectedResponse || rejectedItem) {
      throw new Error(
        `OKX rejected stop-loss cancellation: ${JSON.stringify(responses)}`,
      );
    }
    return responses;
  }

  private async reconcileOneWayPositionStopLoss(
    normalizedCoin: string,
    direction: FutureDirection,
    positionSize: number,
    stopLossOrders: OkxAlgoOrder[],
    testing: boolean,
  ) {
    const instId = `${normalizedCoin}-USDT-SWAP`;
    const wholePositionOrders = stopLossOrders
      .filter((order) => String(order.closeFraction ?? '') === '1')
      .sort((left, right) =>
        direction === 'long'
          ? Number(right.slTriggerPx) - Number(left.slTriggerPx)
          : Number(left.slTriggerPx) - Number(right.slTriggerPx),
      );

    if (positionSize <= 0) {
      const cancellations = await this.cancelStopLossOrders(
        stopLossOrders,
        testing,
      );
      return {
        status:
          stopLossOrders.length > 0
            ? testing
              ? 'preview'
              : 'reconciled'
            : 'no_open_position',
        coin: normalizedCoin,
        direction,
        positionSize: 0,
        protectedSize: 0,
        missingSize: 0,
        protectedOrderCount: stopLossOrders.length,
        cancelOrderCount: stopLossOrders.length,
        cancellations,
      };
    }

    if (wholePositionOrders.length > 0) {
      const keptOrder = wholePositionOrders[0];
      const ordersToCancel = stopLossOrders.filter(
        (order) => order.algoId !== keptOrder.algoId,
      );
      const cancellations = await this.cancelStopLossOrders(
        ordersToCancel,
        testing,
      );
      return {
        status:
          ordersToCancel.length > 0
            ? testing
              ? 'preview'
              : 'reconciled'
            : 'already_protected',
        coin: normalizedCoin,
        direction,
        positionSize,
        protectedSize: positionSize,
        missingSize: 0,
        protectedOrderCount: stopLossOrders.length,
        wholePositionStopLoss: true,
        keptOrderId: keptOrder.algoId,
        cancelOrderCount: ordersToCancel.length,
        cancellations,
      };
    }

    const currentPrice = await this.getTicker(instId);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(`Invalid current price for ${instId}: ${currentPrice}`);
    }
    const stopLossPrice = this.getReconciledStopLossPrice(
      direction,
      currentPrice,
      stopLossOrders,
    );
    const order = await this.placeWholePositionStopLoss(
      normalizedCoin,
      direction,
      stopLossPrice,
      testing,
    );
    const cancellations = await this.cancelStopLossOrders(
      stopLossOrders,
      testing,
    );
    return {
      status: testing ? 'preview' : 'reconciled',
      coin: normalizedCoin,
      direction,
      positionSize,
      protectedSize: positionSize,
      missingSize: 0,
      protectedOrderCount: stopLossOrders.length,
      wholePositionStopLoss: true,
      currentPrice,
      stopLossPrice: Number(order.body.slTriggerPx),
      order,
      cancelOrderCount: stopLossOrders.length,
      cancellations,
    };
  }

  private async reconcileHedgePositionStopLoss(
    normalizedCoin: string,
    direction: FutureDirection,
    positionSize: number,
    stopLossOrders: OkxAlgoOrder[],
    testing: boolean,
  ) {
    const instId = `${normalizedCoin}-USDT-SWAP`;
    if (positionSize <= 0) {
      const cancellations = await this.cancelStopLossOrders(
        stopLossOrders,
        testing,
      );
      return {
        status:
          stopLossOrders.length > 0
            ? testing
              ? 'preview'
              : 'reconciled'
            : 'no_open_position',
        coin: normalizedCoin,
        direction,
        positionSize: 0,
        protectedSize: 0,
        missingSize: 0,
        protectedOrderCount: stopLossOrders.length,
        cancelOrderCount: stopLossOrders.length,
        cancellations,
      };
    }

    const inst = await this.fetchInstrument(instId);
    if (!inst) throw new Error(`Instrument info not available for ${instId}`);
    const lotSize = Number(inst.lotSz || inst.minSz || 1);
    const sizeTolerance = lotSize * 0.5;
    const sizedOrders = stopLossOrders
      .map((order) => ({
        order,
        size: Number(order.sz),
        triggerPrice: Number(order.slTriggerPx),
      }))
      .filter(({ size }) => Number.isFinite(size) && size > 0)
      .sort((left, right) =>
        direction === 'long'
          ? right.triggerPrice - left.triggerPrice
          : left.triggerPrice - right.triggerPrice,
      );
    const keptOrders: typeof sizedOrders = [];
    const ordersToCancel: OkxAlgoOrder[] = [];
    let keptSize = 0;
    for (const item of sizedOrders) {
      if (keptSize + item.size <= positionSize + sizeTolerance) {
        keptOrders.push(item);
        keptSize += item.size;
      } else {
        ordersToCancel.push(item.order);
      }
    }
    const sizedOrderIds = new Set(sizedOrders.map(({ order }) => order.algoId));
    ordersToCancel.push(
      ...stopLossOrders.filter((order) => !sizedOrderIds.has(order.algoId)),
    );
    const missingSize = Math.max(0, positionSize - keptSize);
    const formattedMissingSize =
      missingSize <= sizeTolerance
        ? 0
        : this.formatSize(missingSize + lotSize * 1e-8, inst);
    if (missingSize > sizeTolerance && !formattedMissingSize) {
      throw new Error(
        `Cannot protect missing position size for ${instId}: missingSize=${missingSize}, minSz=${inst.minSz}`,
      );
    }

    const cancellations = await this.cancelStopLossOrders(
      ordersToCancel,
      testing,
    );
    let order: any;
    let currentPrice: number | undefined;
    let stopLossPrice: number | undefined;
    if (formattedMissingSize > 0) {
      currentPrice = await this.getTicker(instId);
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        throw new Error(`Invalid current price for ${instId}: ${currentPrice}`);
      }
      stopLossPrice = this.getReconciledStopLossPrice(
        direction,
        currentPrice,
        keptOrders.map(({ order }) => order),
      );
      order = await this.placePositionStopLoss(
        normalizedCoin,
        direction,
        formattedMissingSize,
        stopLossPrice,
        testing,
      );
    }
    const changed = ordersToCancel.length > 0 || formattedMissingSize > 0;
    return {
      status: changed
        ? testing
          ? 'preview'
          : 'reconciled'
        : 'already_protected',
      coin: normalizedCoin,
      direction,
      positionSize,
      protectedSize: keptSize,
      missingSize: formattedMissingSize,
      protectedOrderCount: stopLossOrders.length,
      keptOrderCount: keptOrders.length,
      cancelOrderCount: ordersToCancel.length,
      currentPrice,
      stopLossPrice: order ? Number(order.body.slTriggerPx) : undefined,
      order,
      cancellations,
    };
  }

  private async reconcilePositionStopLossInternal(
    coin: string,
    direction: FutureDirection,
    testing: boolean,
  ) {
    const normalizedCoin = coin.trim().toUpperCase();
    const instId = `${normalizedCoin}-USDT-SWAP`;
    const logFileKey = this.getFutureLogFileKey(direction, normalizedCoin);
    const [positionResponse, conditionalOrders] = await Promise.all([
      this.getOpenPosition(instId),
      this.getPendingConditionalOrdersForCoin(normalizedCoin, 'SWAP'),
    ]);
    if (
      positionResponse?.code !== undefined &&
      String(positionResponse.code) !== '0'
    ) {
      throw new Error(
        `OKX rejected position request for ${instId}: ${JSON.stringify(positionResponse)}`,
      );
    }
    const position = this.selectPositionForDirection(
      positionResponse?.data ?? [],
      direction,
    );
    const positionSize = this.getTotalPositionSize(position).toNumber();
    const stopLossOrders = this.getPositionStopLossOrders(
      conditionalOrders,
      direction,
      instId,
    );
    const result = this.includePosSide()
      ? await this.reconcileHedgePositionStopLoss(
          normalizedCoin,
          direction,
          positionSize,
          stopLossOrders,
          testing,
        )
      : await this.reconcileOneWayPositionStopLoss(
          normalizedCoin,
          direction,
          positionSize,
          stopLossOrders,
          testing,
        );
    this.logger.log(
      `FUTURE ${this.getPositionMode()} reconcile stop-loss: ${JSON.stringify(result)}`,
      null,
      logFileKey,
    );
    if (!testing && result.status === 'reconciled') {
      await this.sendFutureEmail(
        `Reconcile ${direction} stop-loss ${normalizedCoin}`,
        {
          mode: this.getPositionMode(),
          ...result,
          order: result.order?.body,
          response: result.order?.data,
        },
      );
    }
    return result;
  }

  async reconcilePositionStopLoss(
    coin: string,
    direction: FutureDirection,
    testing: boolean = true,
  ) {
    const key = `${coin.trim().toUpperCase()}:${direction}:${testing}`;
    const existing = this.stopLossReconcileInFlight.get(key);
    if (existing) return existing;
    const operation = this.reconcilePositionStopLossInternal(
      coin,
      direction,
      testing,
    ).finally(() => this.stopLossReconcileInFlight.delete(key));
    this.stopLossReconcileInFlight.set(key, operation);
    return operation;
  }

  // Backward-compatible alias.
  async ensurePositionStopLoss(
    coin: string,
    direction: FutureDirection,
    testing: boolean = true,
  ) {
    return this.reconcilePositionStopLoss(coin, direction, testing);
  }

  private normalizePosition(position: any, direction: FutureDirection) {
    const signedSize = Number(position?.pos ?? 0);
    return {
      ...position,
      coin: String(position?.instId ?? '')
        .split('-')[0]
        .toUpperCase(),
      direction,
      size: Math.abs(signedSize),
      averagePrice: Number(position?.avgPx ?? 0),
      currentPrice: Number(position?.markPx ?? position?.last ?? 0),
      unrealizedPnl: Number(position?.upl ?? 0),
      unrealizedPnlRatio: Number(position?.uplRatio ?? 0),
    };
  }

  async getOpenFuturePositions(direction?: FutureDirection) {
    const response = await this.getOpenPosition('');
    const positions = (response?.data ?? []).filter(
      (position: any) => Number(position.pos ?? 0) !== 0,
    );
    const normalized = positions.flatMap((position: any) => {
      if (this.includePosSide()) {
        const positionDirection = position.posSide as FutureDirection;
        if (positionDirection !== 'long' && positionDirection !== 'short')
          return [];
        if (direction && positionDirection !== direction) return [];
        return [this.normalizePosition(position, positionDirection)];
      }
      const positionDirection: FutureDirection =
        Number(position.pos) > 0 ? 'long' : 'short';
      if (direction && positionDirection !== direction) return [];
      return [this.normalizePosition(position, positionDirection)];
    });
    normalized.sort(
      (left: any, right: any) =>
        left.coin.localeCompare(right.coin) ||
        left.direction.localeCompare(right.direction),
    );
    const result = {
      direction: direction ?? 'all',
      positionCount: normalized.length,
      positions: normalized,
    };
    this.logger.log(
      `FUTURE ${this.getPositionMode()} open positions: direction=${result.direction}, count=${result.positionCount}`,
      null,
      this.getFutureLogFileKey(direction),
    );
    return result;
  }

  async openTriggerRangeWithStopLoss(
    coin: string,
    direction: FutureDirection,
    minPrice: number,
    maxPrice: number,
    options: FutureRangeOptions = {},
  ) {
    const normalizedCoin = coin.toUpperCase();
    const testing = options.testing ?? true;
    this.logger.log(
      `FUTURE ${this.getPositionMode()} open range start: coin=${normalizedCoin}, direction=${direction}, testing=${testing}, minPrice=${minPrice}, maxPrice=${maxPrice}, requestedOrders=${options.numberOfOrders ?? 10}, requestedStopLoss=${options.stopLossPrice ?? 'auto'}`,
      null,
      this.getFutureLogFileKey(direction, normalizedCoin),
    );
    if (
      !Number.isFinite(minPrice) ||
      minPrice <= 0 ||
      !Number.isFinite(maxPrice) ||
      maxPrice <= minPrice
    ) {
      throw new Error(
        `Invalid entry range: minPrice=${minPrice}, maxPrice=${maxPrice}`,
      );
    }
    const numberOfOrders = Math.ceil(options.numberOfOrders ?? 10);
    if (!Number.isFinite(numberOfOrders) || numberOfOrders <= 0) {
      throw new Error(`Invalid numberOfOrders: ${options.numberOfOrders}`);
    }

    const stopLossRatio = this.config.get<number>('stopLossBuyPriceRatio');
    const stopLossPrice =
      options.stopLossPrice ??
      (direction === 'long'
        ? minPrice * (1 - stopLossRatio)
        : maxPrice * (1 + stopLossRatio));
    if (!Number.isFinite(stopLossPrice) || stopLossPrice <= 0) {
      throw new Error(`Invalid stopLossPrice: ${stopLossPrice}`);
    }
    if (direction === 'long' && stopLossPrice >= minPrice) {
      throw new Error(
        `Long stopLossPrice (${stopLossPrice}) must be below minPrice (${minPrice})`,
      );
    }
    if (direction === 'short' && stopLossPrice <= maxPrice) {
      throw new Error(
        `Short stopLossPrice (${stopLossPrice}) must be above maxPrice (${maxPrice})`,
      );
    }

    const amountPerOrder = this.config.get<number>('amountOfUsdtPerStep');
    if (!Number.isFinite(amountPerOrder) || amountPerOrder <= 0) {
      throw new Error(`Invalid amountOfUsdtPerStep: ${amountPerOrder}`);
    }
    const inst = await this.fetchInstrument(`${normalizedCoin}-USDT-SWAP`);
    if (!inst)
      throw new Error(
        `Instrument info not available for ${normalizedCoin}-USDT-SWAP`,
      );
    const distance =
      numberOfOrders === 1 ? 0 : (maxPrice - minPrice) / (numberOfOrders - 1);
    const results: any[] = [];
    for (let step = 0; step < numberOfOrders; step++) {
      const orderPrice =
        direction === 'long'
          ? maxPrice - step * distance
          : minPrice + step * distance;
      const triggerPrice =
        direction === 'long'
          ? orderPrice * (1 - 0.002)
          : orderPrice * (1 + 0.002);
      const size = this.contractsForNotional(amountPerOrder, orderPrice, inst);
      const result = await this.openPosition(
        coin,
        direction,
        size.toString(),
        triggerPrice.toString(),
        orderPrice.toString(),
        testing,
        stopLossPrice.toString(),
      );
      results.push({ step, direction, stopLossPrice, ...result });
      this.logger.log(
        `FUTURE ${this.getPositionMode()} open range step: coin=${normalizedCoin}, direction=${direction}, step=${step}, triggerPx=${result.body.triggerPx}, orderPx=${result.body.orderPx}, size=${result.body.sz}, stopLossPx=${result.body.attachAlgoOrds?.[0]?.slTriggerPx}`,
        null,
        this.getFutureLogFileKey(direction, normalizedCoin),
      );
    }
    this.logger.log(
      `FUTURE ${this.getPositionMode()} open range complete: coin=${normalizedCoin}, direction=${direction}, testing=${testing}, placed=${results.length}, stopLossPrice=${stopLossPrice}`,
      null,
      this.getFutureLogFileKey(direction, normalizedCoin),
    );
    if (!testing && results.length > 0) {
      await this.sendFutureEmail(`Open ${direction} range ${normalizedCoin}`, {
        mode: this.getPositionMode(),
        coin: normalizedCoin,
        direction,
        minPrice,
        maxPrice,
        stopLossPrice,
        orderCount: results.length,
        orders: results.map((item) => ({
          step: item.step,
          triggerPx: item.body.triggerPx,
          orderPx: item.body.orderPx,
          size: item.body.sz,
          stopLossPx: item.body.attachAlgoOrds?.[0]?.slTriggerPx,
          response: item.data,
        })),
      });
    }
    return results;
  }

  async openNearCurrentPrice(
    coin: string,
    direction: FutureDirection,
    options: FutureNearCurrentOptions = {},
  ) {
    const normalizedCoin = coin?.trim().toUpperCase();
    if (!normalizedCoin || !/^[A-Z0-9]+$/.test(normalizedCoin)) {
      throw new Error(`Invalid coin: ${coin}`);
    }
    if (direction !== 'long' && direction !== 'short') {
      throw new Error(`Invalid direction: ${direction}`);
    }

    const testing = options.testing ?? true;
    const amountUsdt =
      options.amountUsdt ?? this.config.get<number>('amountOfUsdtPerStep');
    if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
      throw new Error(`Invalid amountUsdt: ${amountUsdt}`);
    }

    const instId = `${normalizedCoin}-USDT-SWAP`;
    const currentPrice = await this.getTicker(instId);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(
        `Invalid current price fetched for ${instId}: ${currentPrice}`,
      );
    }

    const triggerPrice =
      direction === 'long'
        ? currentPrice * (1 + 0.002)
        : currentPrice * (1 - 0.002);
    let stopLossPrice = options.stopLossPrice;
    if (stopLossPrice === undefined) {
      const stopLossRatio = Number(
        this.config.get<number>('stopLossBuyPriceRatio'),
      );
      if (!Number.isFinite(stopLossRatio) || stopLossRatio <= 0) {
        throw new Error(`Invalid stopLossBuyPriceRatio: ${stopLossRatio}`);
      }
      stopLossPrice =
        direction === 'long'
          ? currentPrice * (1 - stopLossRatio)
          : currentPrice * (1 + stopLossRatio);
    }
    if (!Number.isFinite(stopLossPrice) || stopLossPrice <= 0) {
      throw new Error(`Invalid stopLossPrice: ${stopLossPrice}`);
    }

    const inst = await this.fetchInstrument(instId);
    if (!inst) throw new Error(`Instrument info not available for ${instId}`);
    const size = this.contractsForNotional(amountUsdt, triggerPrice, inst);
    const order = await this.openPosition(
      normalizedCoin,
      direction,
      size.toString(),
      triggerPrice.toString(),
      '-1',
      testing,
      stopLossPrice.toString(),
    );
    const result = {
      status: testing ? 'preview' : 'submitted',
      mode: this.getPositionMode(),
      coin: normalizedCoin,
      instId,
      direction,
      testing,
      amountUsdt,
      currentPrice,
      triggerPrice: Number(order.body.triggerPx),
      orderPrice: -1,
      stopLossPrice: Number(order.body.attachAlgoOrds[0].slTriggerPx),
      size: order.body.sz,
      ordType: 'trigger',
      executionType: 'market_on_trigger',
      order,
    };
    this.logger.log(
      `FUTURE ${this.getPositionMode()} near-current open: ${JSON.stringify(result)}`,
      null,
      this.getFutureLogFileKey(direction, normalizedCoin),
    );
    if (!testing) {
      await this.sendFutureEmail(
        `Open ${direction} near current ${normalizedCoin}`,
        result,
      );
    }
    return result;
  }

  private async getPositionSnapshot(coin: string, direction: FutureDirection) {
    const instId = `${coin.toUpperCase()}-USDT-SWAP`;
    const response = await this.getOpenPosition(instId);
    const position = this.selectPositionForDirection(
      response?.data ?? [],
      direction,
    );
    const size = this.getTotalPositionSize(position).toNumber();
    if (!position || size <= 0) {
      return { instId, position: undefined, size: 0 };
    }
    return { instId, position, size };
  }

  private shouldExecuteCloseAtMarket(
    direction: FutureDirection,
    orderPrice: number,
    currentPrice: number,
  ) {
    return direction === 'long'
      ? orderPrice <= currentPrice
      : orderPrice >= currentPrice;
  }

  private getTriggeredCloseType(executeAtMarket: boolean) {
    return executeAtMarket ? 'market_on_trigger' : 'limit_on_trigger';
  }

  private getClosePriceRatios(coin: string) {
    const coinConfig = this.config.get<FutureCoinConfig>(
      `coin.${coin.toUpperCase()}`,
    );
    const minClosePriceRatio = Number(
      coinConfig?.minClosePriceRatio ??
        this.config.get<number>('minClosePriceRatio'),
    );
    const maxClosePriceRatio = Number(
      coinConfig?.maxClosePriceRatio ??
        this.config.get<number>('maxClosePriceRatio'),
    );
    if (
      !Number.isFinite(minClosePriceRatio) ||
      !Number.isFinite(maxClosePriceRatio) ||
      minClosePriceRatio <= 0 ||
      maxClosePriceRatio <= minClosePriceRatio ||
      maxClosePriceRatio >= 1
    ) {
      throw new Error(
        `Invalid close price ratios for ${coin.toUpperCase()}: min=${minClosePriceRatio}, max=${maxClosePriceRatio}`,
      );
    }
    return { minClosePriceRatio, maxClosePriceRatio };
  }

  async closePositionAtTriggerPrice(
    coin: string,
    direction: FutureDirection,
    triggerPrice: number,
    percentage: number = 100,
    testing: boolean = true,
    currentPriceOverride?: number,
  ) {
    const normalizedCoin = coin.toUpperCase();
    this.logger.log(
      `FUTURE ${this.getPositionMode()} close trigger start: coin=${normalizedCoin}, direction=${direction}, testing=${testing}, triggerPrice=${triggerPrice}, percentage=${percentage}`,
      null,
      this.getFutureLogFileKey(direction, normalizedCoin),
    );
    if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) {
      throw new Error(`Invalid trigger price: ${triggerPrice}`);
    }
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      throw new Error(`Invalid percentage: ${percentage}`);
    }
    const snapshot = await this.getPositionSnapshot(coin, direction);
    if (!snapshot.position) {
      const noPositionResult = {
        status: 'no_open_position',
        coin: normalizedCoin,
        direction,
        testing,
      };
      this.logger.log(
        `FUTURE ${this.getPositionMode()} close trigger skipped: coin=${normalizedCoin}, direction=${direction}, reason=no_open_position`,
        null,
        this.getFutureLogFileKey(direction, normalizedCoin),
      );
      return noPositionResult;
    }
    const currentPrice =
      currentPriceOverride ??
      (await this.getTicker(`${coin.toUpperCase()}-USDT-SWAP`));
    if (!currentPrice || currentPrice <= 0) {
      throw new Error(`Invalid current price: ${currentPrice}`);
    }
    const size = (snapshot.size * percentage) / 100;
    const executeAtMarket = this.shouldExecuteCloseAtMarket(
      direction,
      triggerPrice,
      currentPrice,
    );
    const result = executeAtMarket
      ? await this.placePositionStopLoss(
          coin,
          direction,
          size,
          triggerPrice,
          testing,
        )
      : await this.closePartialPosition(
          coin,
          direction,
          size.toString(),
          triggerPrice.toString(),
          (direction === 'long'
            ? triggerPrice * (1 - 0.002)
            : triggerPrice * (1 + 0.002)
          ).toString(),
          testing,
        );
    const response = {
      status: testing ? 'preview' : 'submitted',
      coin: normalizedCoin,
      direction,
      percentage,
      closeType: this.getTriggeredCloseType(executeAtMarket),
      executionType: executeAtMarket ? 'market' : 'limit',
      ...result,
    };
    this.logger.log(
      `FUTURE ${this.getPositionMode()} close trigger complete: coin=${normalizedCoin}, direction=${direction}, testing=${testing}, closeType=${response.closeType}, executionType=${response.executionType}, ordType=${result.body.ordType}, triggerPx=${result.body.triggerPx ?? result.body.slTriggerPx}, orderPx=${result.body.orderPx ?? result.body.slOrdPx}, size=${result.body.sz}`,
      null,
      this.getFutureLogFileKey(direction, normalizedCoin),
    );
    if (!testing) {
      await this.sendFutureEmail(
        `Close ${direction} ${response.closeType} ${normalizedCoin}`,
        {
          mode: this.getPositionMode(),
          coin: normalizedCoin,
          direction,
          percentage,
          currentPrice,
          closeType: response.closeType,
          executionType: response.executionType,
          ordType: result.body.ordType,
          triggerPx: result.body.triggerPx ?? result.body.slTriggerPx,
          orderPx: result.body.orderPx ?? result.body.slOrdPx,
          size: result.body.sz,
          reduceOnly: result.body.reduceOnly,
          response: result.data,
        },
      );
    }
    return response;
  }

  async placePositionStopLossAtTriggerPrice(
    coin: string,
    direction: FutureDirection,
    triggerPrice: number,
    percentage: number = 100,
    testing: boolean = true,
  ) {
    if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) {
      throw new Error(`Invalid stop-loss trigger price: ${triggerPrice}`);
    }
    const currentPrice = await this.getTicker(
      `${coin.toUpperCase()}-USDT-SWAP`,
    );
    if (!currentPrice || currentPrice <= 0) {
      throw new Error(`Invalid current price: ${currentPrice}`);
    }
    const isValidStopLoss =
      direction === 'long'
        ? triggerPrice < currentPrice
        : triggerPrice > currentPrice;
    if (!isValidStopLoss) {
      throw new Error(
        `${direction} stop-loss trigger price ${triggerPrice} must be ${direction === 'long' ? 'below' : 'above'} current price ${currentPrice}`,
      );
    }
    return this.closePositionAtTriggerPrice(
      coin,
      direction,
      triggerPrice,
      percentage,
      testing,
      currentPrice,
    );
  }

  async closePositionAtCurrentPrice(
    coin: string,
    direction: FutureDirection,
    percentage: number = 100,
    testing: boolean = true,
  ) {
    const currentPrice = await this.getTicker(
      `${coin.toUpperCase()}-USDT-SWAP`,
    );
    if (!currentPrice || currentPrice <= 0)
      throw new Error(`Invalid current price: ${currentPrice}`);
    const triggerPrice =
      direction === 'long'
        ? currentPrice * (1 - 0.002)
        : currentPrice * (1 + 0.002);
    return this.closePositionAtTriggerPrice(
      coin,
      direction,
      triggerPrice,
      percentage,
      testing,
      currentPrice,
    );
  }

  // ---------- auto open ladder position ----------
  protected async autoOpenPosition({
    coin,
    direction, // 'long' | 'short'
    isTesting,
  }: {
    coin: string;
    direction: 'long' | 'short';
    isTesting: boolean;
  }) {
    const data: any[] = [];
    const log = (...args: any[]) =>
      this.logger.log(
        `[${direction.toUpperCase()}] ${args.map((arg) => String(arg)).join(' ')}`,
        null,
        this.getFutureLogFileKey(direction, coin),
      );

    const maxUsdt = this.config.get<number>('maxUsdt');
    const riskPerTrade = this.config.get<number>('riskPerTrade');
    const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
    const priceRatioMin = this.config.get<number>('minBuyPriceRatio');
    const priceRatioMax = this.config.get<number>('maxBuyPriceRatio');
    const stopLossRatio = this.config.get<number>('stopLossBuyPriceRatio');

    log(`Start ${coin}, test=${isTesting}`);

    if (amountOfUsdtPerStep <= 10)
      throw new Error(`amountOfUsdtPerStep must > 10`);

    const instId = `${coin.toUpperCase()}-USDT-SWAP`;
    const currentPrice = await this.getTicker(instId);
    log(`Current price: ${currentPrice}`);

    // ====== TÍNH GIÁ ==== //
    const isLong = direction === 'long';

    const minPrice = isLong
      ? currentPrice * (1 + priceRatioMin)
      : currentPrice * (1 - priceRatioMin);
    const maxPrice = isLong
      ? currentPrice * (1 + priceRatioMax)
      : currentPrice * (1 - priceRatioMax);
    const stopLossPrice = isLong
      ? currentPrice * (1 - stopLossRatio)
      : currentPrice * (1 + stopLossRatio);

    log(
      `minPrice=${minPrice}, maxPrice=${maxPrice}, stopLoss=${stopLossPrice}`,
    );

    // ====== RISK ===== //
    const inst = await this.fetchInstrument(instId);
    if (!inst) throw new Error(`Instrument info not available for ${instId}`);
    const contractValue = Number(inst.ctVal || 1);
    const amountRisk = maxUsdt * riskPerTrade;
    const totalSafeSize =
      amountRisk / (Math.abs(maxPrice - stopLossPrice) * contractValue);
    if (totalSafeSize <= 0) return data;

    const posData = await this.getOpenPosition(instId);
    const pos = this.selectPositionForDirection(posData?.data ?? [], direction);
    const currentSize = this.getTotalPositionSize(pos).toNumber();
    const avgPrice = Number(pos?.avgPx ?? 0);

    log(`Open pos size ${currentSize}, avgPrice=${avgPrice}`);

    const sizeToOpen = totalSafeSize - currentSize;
    if (sizeToOpen <= 0) return data;

    const costUsdt =
      (sizeToOpen * contractValue * (stopLossPrice + maxPrice)) / 2;
    const steps = Math.ceil(costUsdt / amountOfUsdtPerStep);

    log(
      `Total safe size: ${totalSafeSize}, sizeToOpen: ${sizeToOpen}, costUsdt: ${costUsdt}, steps: ${steps}`,
    );

    const stepDistance = Math.abs(stopLossPrice - maxPrice) / steps;
    const arr = Array.from({ length: steps + 1 }, (_, i) => i);

    let newTotalCost = avgPrice * currentSize;
    let newSize = currentSize;

    for await (let step of arr) {
      const orderPx = isLong
        ? maxPrice - step * stepDistance
        : maxPrice + step * stepDistance;

      const triggerPx = isLong
        ? orderPx - orderPx * 0.002
        : orderPx + orderPx * 0.002;

      // check điều kiện để tránh vượt min/max
      if (isLong && triggerPx < minPrice) break;
      if (!isLong && triggerPx > minPrice) break;

      const sz = this.contractsForNotional(amountOfUsdtPerStep, orderPx, inst);

      log(`Step ${step}: order ${orderPx}, trigger ${triggerPx}, sz ${sz}`);

      // openPosition now formats size/price internally
      const res = await this.openPosition(
        coin,
        direction,
        sz.toString(),
        triggerPx.toString(),
        orderPx.toString(),
        isTesting,
        stopLossPrice.toString(),
      );

      data.push({ step, data: res.data, body: res.body });

      // update average cost
      newTotalCost += orderPx * sz;
      newSize += sz;
      const newAvg = newTotalCost / newSize;
      log(`New avg cost = ${newAvg}`);
    }

    log(
      `Complete ${coin}: testing=${isTesting}, placed=${data.length}, stopLoss=${stopLossPrice}`,
    );
    if (!isTesting && data.length > 0) {
      await this.sendFutureEmail(
        `Auto open ${direction} ${coin.toUpperCase()}`,
        {
          mode: this.getPositionMode(),
          coin: coin.toUpperCase(),
          direction,
          currentPrice,
          minPrice,
          maxPrice,
          stopLossPrice,
          orderCount: data.length,
          orders: data.map((item) => ({
            step: item.step,
            triggerPx: item.body.triggerPx,
            orderPx: item.body.orderPx,
            size: item.body.sz,
            stopLossPx: item.body.attachAlgoOrds?.[0]?.slTriggerPx,
            response: item.data,
          })),
        },
      );
    }
    return data;
  }

  // ---------- protective close by price steps ----------
  async placeProtectiveCloseByPriceSteps(
    coin: string,
    direction: 'long' | 'short',
    protectiveCloseOnly: boolean = true,
    justOneOrder: boolean = false,
    testing: boolean = true,
  ) {
    const data: any[] = [];
    const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');

    const normalizedCoin = coin.toUpperCase();
    const logFileKey = this.getFutureLogFileKey(direction, normalizedCoin);
    this.logger.log(
      `FUTURE ${this.getPositionMode()} protective close by price steps start: coin=${normalizedCoin}, direction=${direction}, testing=${testing}, protectiveCloseOnly=${protectiveCloseOnly}, justOneOrder=${justOneOrder}`,
      null,
      logFileKey,
    );

    const { minClosePriceRatio, maxClosePriceRatio } =
      this.getClosePriceRatios(normalizedCoin);
    const numberOfCloseOrders = 10;
    const percentageOfPositionToClosePerStep = 0.05; // 5% position per step

    const instId = `${coin.toUpperCase()}-USDT-SWAP`;
    const currentPrice = await this.getTicker(instId);
    if (!currentPrice || currentPrice <= 0)
      throw new Error(`Invalid current price: ${currentPrice}`);
    const inst = await this.fetchInstrument(instId);
    if (!inst) throw new Error(`Instrument info not available for ${instId}`);

    const posData = await this.getOpenPosition(instId);
    const pos = this.selectPositionForDirection(posData?.data ?? [], direction);
    const currentSize = this.getTotalPositionSize(pos).toNumber();
    const avgPrice = Number(pos?.avgPx ?? 0);

    if (!currentSize || currentSize <= 0) {
      this.logger.log(
        `FUTURE ${this.getPositionMode()} protective close by price steps skipped: coin=${normalizedCoin}, direction=${direction}, reason=no_open_position`,
        null,
        logFileKey,
      );
      return data;
    }

    const minClosePrice =
      direction === 'long'
        ? currentPrice * (1 - maxClosePriceRatio)
        : currentPrice * (1 + minClosePriceRatio);
    const maxClosePrice =
      direction === 'long'
        ? currentPrice * (1 - minClosePriceRatio)
        : currentPrice * (1 + maxClosePriceRatio);
    const closePriceDistance =
      (maxClosePrice - minClosePrice) / (numberOfCloseOrders - 1);

    this.logger.log(
      `Current position: size=${currentSize}, avgPrice=${avgPrice}, minClosePrice=${minClosePrice}, maxClosePrice=${maxClosePrice}, minClosePriceRatio=${minClosePriceRatio}, maxClosePriceRatio=${maxClosePriceRatio}`,
      null,
      logFileKey,
    );

    let totalSizeClosed = 0;

    for (let stepIndex = 0; stepIndex < numberOfCloseOrders; stepIndex++) {
      if (totalSizeClosed >= currentSize) {
        this.logger.log(
          `totaSizeWillBeClosed: ${totalSizeClosed} >= currentSize: ${currentSize}, break the loop`,
          null,
          logFileKey,
        );
        break;
      }

      const orderPrice = minClosePrice + stepIndex * closePriceDistance;
      const closePriceRatio =
        direction === 'long'
          ? 1 - orderPrice / currentPrice
          : orderPrice / currentPrice - 1;

      // trigger pricing rule (we use relation to currentPrice so trigger is placed to 'catch' price movement)
      const triggerPx =
        orderPrice > currentPrice
          ? orderPrice - orderPrice * 0.002
          : orderPrice + orderPrice * 0.002;

      const executeAtMarket = this.shouldExecuteCloseAtMarket(
        direction,
        orderPrice,
        currentPrice,
      );

      if (protectiveCloseOnly && !executeAtMarket) {
        this.logger.log(
          `Skipping closePriceRatio=${(closePriceRatio * 100).toFixed(2)}% because protectiveCloseOnly=true and order is not on the protective side`,
          null,
          logFileKey,
        );
        continue;
      }

      // compute size to close
      let sz = currentSize * percentageOfPositionToClosePerStep;
      if (sz * orderPrice * Number(inst.ctVal || 1) < amountOfUsdtPerStep) {
        sz = this.contractsForNotional(amountOfUsdtPerStep, orderPrice, inst);
      }

      // cap to remaining position
      if (totalSizeClosed + sz > currentSize) {
        sz = currentSize - totalSizeClosed;
      }

      totalSizeClosed += sz;

      const closeType = this.getTriggeredCloseType(executeAtMarket);
      const executionOrderPrice = executeAtMarket
        ? '-1'
        : orderPrice.toString();
      this.logger.log(
        `Step closePriceRatio=${(closePriceRatio * 100).toFixed(2)}%, type=${closeType}, raw sz=${sz}, orderPrice=${executionOrderPrice}, triggerPx=${triggerPx.toString()}, testing=${testing}`,
        null,
        logFileKey,
      );

      // closePartialPosition will format the size & prices
      const res = await this.closePartialPosition(
        coin,
        direction,
        sz.toString(),
        triggerPx.toString(),
        executionOrderPrice,
        testing,
      );

      data.push({
        data: res.data,
        step: `${closeType}_${(closePriceRatio * 100).toFixed(2)}%`,
        closeType,
        executionType: executeAtMarket ? 'market' : 'limit',
        body: res.body,
      });

      if (justOneOrder) break;
    }

    this.logger.log(
      `FUTURE ${this.getPositionMode()} protective close by price steps complete: coin=${normalizedCoin}, direction=${direction}, testing=${testing}, placed=${data.length}`,
      null,
      logFileKey,
    );
    if (!testing && data.length > 0) {
      await this.sendFutureEmail(
        `Protective close ${direction} by price steps ${normalizedCoin}`,
        {
          mode: this.getPositionMode(),
          coin: normalizedCoin,
          direction,
          currentPrice,
          averagePrice: avgPrice,
          positionSize: currentSize,
          orderCount: data.length,
          orders: data.map((item) => ({
            step: item.step,
            closeType: item.closeType,
            executionType: item.executionType,
            triggerPx: item.body.triggerPx,
            orderPx: item.body.orderPx,
            size: item.body.sz,
            reduceOnly: item.body.reduceOnly,
            response: item.data,
          })),
        },
      );
    }
    return data;
  }

  // Backward-compatible service alias.
  async placeProtectiveCloseLadder(
    coin: string,
    direction: 'long' | 'short',
    protectiveCloseOnly: boolean = true,
    justOneOrder: boolean = false,
    testing: boolean = true,
  ) {
    return this.placeProtectiveCloseByPriceSteps(
      coin,
      direction,
      protectiveCloseOnly,
      justOneOrder,
      testing,
    );
  }

  // Backward-compatible service alias.
  async placeCloseLadder(
    coin: string,
    direction: 'long' | 'short',
    protectiveCloseOnly: boolean = true,
    justOneOrder: boolean = false,
    testing: boolean = true,
  ) {
    return this.placeProtectiveCloseByPriceSteps(
      coin,
      direction,
      protectiveCloseOnly,
      justOneOrder,
      testing,
    );
  }

  // Backward-compatible service alias.
  async placeTakeProfitByClosePartialPosition(
    coin: string,
    direction: 'long' | 'short',
    protectiveCloseOnly: boolean = true,
    justOneOrder: boolean = false,
    testing: boolean = true,
  ) {
    return this.placeProtectiveCloseByPriceSteps(
      coin,
      direction,
      protectiveCloseOnly,
      justOneOrder,
      testing,
    );
  }

  // ---------- cancel helpers that call cancelOrdersFromList using pending orders for a coin ----------
  async cancelAllTypeOfOpenOrdersForOneCoin({
    coin,
    direction,
    enableTakeProfit,
    partialCloseOnRetrace,
    autoTrade,
  }: {
    coin: string;
    direction: 'long' | 'short';
    enableTakeProfit: boolean;
    partialCloseOnRetrace: boolean;
    autoTrade: boolean;
  }) {
    const allOrders = await this.getPendingTriggerOrdersForCoin(coin, 'SWAP');
    const cancelOneCoinRes = await this.cancelOrdersFromList({
      orders: allOrders,
      direction,
      enableTakeProfit,
      partialCloseOnRetrace,
      autoTrade,
    });
    return cancelOneCoinRes;
  }

  async cancelAllTypeOfOpenSwapOrders(direction: 'long' | 'short') {
    const allOrders = await this.getAllPendingTriggerOrders('SWAP');
    const cancelAllRes = await this.cancelOrdersFromList({
      orders: allOrders,
      direction,
    });
    return cancelAllRes;
  }

  // ---------- top-level action used by controllers ----------
  async tradeOneCoin({
    coin,
    direction, // 'long' | 'short'
    isTesting = true,
    removeExistingOrders = false,
    enableProtectiveClose,
    enableTakeProfit = false,
    protectiveCloseOnly,
    partialCloseOnRetrace = false,
    justOnePartialOrder = false,
    autoTrade = false,
  }: TradeOneCoinParams) {
    const results: any[] = [];
    const shouldPlaceProtectiveClose =
      enableProtectiveClose ?? enableTakeProfit;
    const useProtectiveCloseOnly = protectiveCloseOnly ?? partialCloseOnRetrace;

    // 1️⃣ cancel existing take profit orders if requested
    if (!isTesting && removeExistingOrders) {
      const cancelRes = await this.cancelAllTypeOfOpenOrdersForOneCoin({
        coin,
        direction,
        enableTakeProfit: shouldPlaceProtectiveClose,
        partialCloseOnRetrace: useProtectiveCloseOnly,
        autoTrade,
      });
      this.logger.log(
        `Cancel existing ${direction} orders: ${JSON.stringify(cancelRes, null, 2)}`,
        null,
        this.getFutureLogFileKey(direction, coin),
      );
      results.push({
        coin,
        action: 'cancel_existing_orders',
        direction,
        result: cancelRes,
      });
    }

    // 2️⃣ place take profit partial close
    if (shouldPlaceProtectiveClose) {
      const partialRes = await this.placeProtectiveCloseByPriceSteps(
        coin,
        direction,
        useProtectiveCloseOnly,
        justOnePartialOrder,
        isTesting,
      );
      this.logger.log(
        `Place protective close by price steps orders for ${direction}: ${JSON.stringify(partialRes, null, 2)}`,
        null,
        this.getFutureLogFileKey(direction, coin),
      );
      results.push({
        coin,
        action: 'place_protective_close_by_price_steps_orders',
        direction,
        result: partialRes,
      });
    }

    // 3️⃣ auto open
    if (autoTrade) {
      const autoRes = await this.autoOpenPosition({
        coin,
        direction,
        isTesting,
      });
      this.logger.log(
        `Place auto ${direction} orders: ${JSON.stringify(autoRes, null, 2)}`,
        null,
        this.getFutureLogFileKey(direction, coin),
      );
      results.push({
        coin,
        action: 'place_auto_order',
        direction,
        result: autoRes,
      });
    }

    return results;
  }

  async setLeverage(
    instId: string,
    leverage: number,
    posSide: 'long' | 'short' = null,
  ) {
    const timestamp = new Date().toISOString();
    const requestPath = '/api/v5/account/set-leverage';

    const body = {
      instId,
      lever: String(leverage),
      mgnMode: 'isolated',
      posSide: posSide,
    };
    if (posSide === null) {
      delete body.posSide;
    }
    const prehash = timestamp + 'POST' + requestPath + JSON.stringify(body);
    const sign = this.signRequest(
      this.config.get<string>('okx.secretKeyHEDGE'),
      prehash,
    );

    const headers = {
      'OK-ACCESS-KEY': this.config.get<string>('okx.apiKeyHEDGE'),
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphraseHEDGE'),
      'Content-Type': 'application/json',
    };

    const url = this.config.get<string>('okx.baseUrl') + requestPath;

    try {
      const res = await axios.post(url, body, { headers });
      return res.data;
    } catch (error: any) {
      this.logger.error(
        'Error setting leverage:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }
}

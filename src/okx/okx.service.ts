import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';
import { AppLogger } from '../logger/logger.service';
import * as _ from 'lodash';
import { EmailService } from '../email/email.service';
import * as moment from 'moment';

interface BuyTriggerRangeOptions {
  numberOfOrders?: number;
  buyWithoutCheckAvarageCost?: boolean;
  direction?: 'up' | 'down';
  currentPrice?: number;
}

export type PendingOrdersSide = 'buy' | 'sell';
export type PendingAlgoOrderType = 'trigger' | 'conditional' | 'all';
export type PendingSpotOrderType = 'trigger' | 'conditional';
export type SpotConditionType = 'stop_loss' | 'take_profit' | 'unknown';

export interface PendingOrdersTotalOptions {
  minPrice?: number;
  maxPrice?: number;
  step?: number;
}

export type PendingBuyOrdersTotalOptions = PendingOrdersTotalOptions;

export interface PendingBuyOrdersRangeTotal {
  fromPrice: number;
  toPrice: number;
  amount: number;
}

export interface PendingBuyOrdersTotalResponse {
  coin: string;
  instId: string;
  quoteCurrency: string;
  side: PendingOrdersSide;
  filter: PendingOrdersTotalOptions;
  summary: {
    orderCount: number;
    pricedOrderCount: number;
    unpricedOrderCount: number;
    totalAmount: number;
  };
  ranges?: PendingBuyOrdersRangeTotal[];
}

export type PendingOrdersTotalResponse = PendingBuyOrdersTotalResponse;

export interface PendingBuyOrdersTotal {
  coin: string;
  instId: string;
  quoteCurrency: string;
  orderType: PendingSpotOrderType;
  currentPrice?: number;
  minPrice?: number;
  maxPrice?: number;
  orderCount: number;
  pricedOrderCount: number;
  unpricedOrderCount: number;
  totalAmount: number;
  error?: string;
  ranges?: PendingBuyOrdersRangeTotal[];
}

export interface AllPendingOrdersTotal {
  side: PendingOrdersSide;
  filter: PendingOrdersTotalOptions;
  quoteCurrency: string;
  coinCount: number;
  orderCount: number;
  pricedOrderCount: number;
  unpricedOrderCount: number;
  totalAmount: number;
  coins: PendingBuyOrdersTotal[];
}

export interface SpotBoughtCoin {
  coin: string;
  numberOfCoins: number;
  amountUsdt: number;
  averageCost: number;
  currentPrice: number;
  profitPercentage: number;
  profitUsdt: number;
}

export interface AllSpotBoughtCoins {
  quoteCurrency: string;
  coinCount: number;
  totalProfitUsdt: number;
  coins: SpotBoughtCoin[];
}

export interface SellAtPriceAllCoinsOptions {
  isTesting: boolean;
  removeExistingSellOrders: string;
  addSellStopLoss: string;
  addSellTakeProfit: string;
  onlyForDown: string;
  justOneOrder: string;
}

@Injectable()
export class OkxService {
  private spotInstrumentCache: Map<string, any> = new Map();

  constructor(
    private config: ConfigService,
    private readonly logger: AppLogger,
    private readonly emailService: EmailService,
  ) {}

  private signRequest(secret: string, message: string) {
    return crypto.createHmac('sha256', secret).update(message).digest('base64');
  }

  private sign(
    timestamp: string,
    method: string,
    requestPath: string,
    body: string = '',
  ) {
    const prehash = timestamp + method.toUpperCase() + requestPath + body;
    return crypto
      .createHmac('sha256', this.config.get<string>('okx.secretKey'))
      .update(prehash)
      .digest('base64');
  }

  private buildHeaders(
    timestamp: string,
    method: string,
    path: string,
    body: string = '',
  ) {
    const prehash = timestamp + method + path + body;
    const sign = this.signRequest(
      this.config.get<string>('okx.secretKey'),
      prehash,
    );

    return {
      'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
      'Content-Type': 'application/json',
    };
  }

  // Helper to chunk arrays
  private chunk<T>(arr: T[], n: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private decimalPlaces(value: number) {
    const normalized = value.toString().toLowerCase();
    if (normalized.includes('e-')) {
      const [coefficient, exponent] = normalized.split('e-');
      const coefficientDecimals = coefficient.split('.')[1]?.length ?? 0;
      return Number(exponent) + coefficientDecimals;
    }
    return normalized.split('.')[1]?.length ?? 0;
  }

  protected async fetchSpotInstrument(instId: string) {
    if (this.spotInstrumentCache.has(instId)) {
      return this.spotInstrumentCache.get(instId);
    }
    const url = `${this.config.get<string>('okx.baseUrl')}/api/v5/public/instruments?instId=${encodeURIComponent(instId)}&instType=SPOT`;
    const response = await axios.get(url);
    const rawInstrument = response.data?.data?.[0];
    if (!rawInstrument) return null;
    const instrument = {
      ...rawInstrument,
      lotSz: Number(rawInstrument.lotSz),
      minSz: Number(rawInstrument.minSz || rawInstrument.lotSz),
    };
    if (
      !Number.isFinite(instrument.lotSz) ||
      instrument.lotSz <= 0 ||
      !Number.isFinite(instrument.minSz) ||
      instrument.minSz <= 0
    ) {
      throw new Error(
        `Invalid SPOT instrument size metadata for ${instId}: ${JSON.stringify(rawInstrument)}`,
      );
    }
    this.spotInstrumentCache.set(instId, instrument);
    return instrument;
  }

  private async cancelAlgoOrders(
    orders: Array<{ algoId: string; instId: string }>,
    maxAttempts: number = 3,
  ) {
    const cancelPath = '/api/v5/trade/cancel-algos';
    const responses: any[] = [];
    const succeededAlgoIds = new Set<string>();
    const failedAlgoIds = new Set<string>();
    let requestCount = 0;

    for (const initialChunk of this.chunk(orders, 10)) {
      let ordersToRetry = initialChunk;

      for (
        let attempt = 1;
        attempt <= maxAttempts && ordersToRetry.length > 0;
        attempt++
      ) {
        if (requestCount > 0) {
          // OKX allows 20 algo cancellations per 2 seconds for one instrument.
          // A 10-item request every 1.1 seconds remains inside that limit.
          await this.sleep(1100);
        }
        requestCount++;

        const bodyString = JSON.stringify(ordersToRetry);
        const timestamp = new Date().toISOString();
        const headers = this.buildHeaders(
          timestamp,
          'POST',
          cancelPath,
          bodyString,
        );
        const response = await axios.post(
          this.config.get<string>('okx.baseUrl') + cancelPath,
          bodyString,
          { headers },
        );
        responses.push(response.data);

        const responseItems = response.data?.data ?? [];
        const responseItemsByAlgoId = new Map(
          responseItems.map((item: any) => [String(item.algoId), item]),
        );
        const topLevelRateLimited = String(response.data?.code) === '50011';
        const nextRetry: Array<{ algoId: string; instId: string }> = [];

        for (const order of ordersToRetry) {
          const item: any = responseItemsByAlgoId.get(String(order.algoId));
          const itemCode = String(item?.sCode ?? '');

          if (itemCode === '0') {
            succeededAlgoIds.add(String(order.algoId));
            failedAlgoIds.delete(String(order.algoId));
          } else if (topLevelRateLimited || itemCode === '50011') {
            if (attempt < maxAttempts) {
              nextRetry.push(order);
            } else {
              failedAlgoIds.add(String(order.algoId));
            }
          } else {
            failedAlgoIds.add(String(order.algoId));
          }
        }

        ordersToRetry = nextRetry;
      }
    }

    return {
      responses,
      cancelledOrderCount: succeededAlgoIds.size,
      failedOrderCount: failedAlgoIds.size,
    };
  }

  private async getTicker(instId: string) {
    const url = `${this.config.get<string>('okx.baseUrl')}/api/v5/market/ticker?instId=${instId}`;
    const res = await axios.get(url);
    return Number(res.data.data[0]?.last);
  }

  private async getSpotTickers(): Promise<Map<string, number>> {
    const url = `${this.config.get<string>('okx.baseUrl')}/api/v5/market/tickers?instType=SPOT`;
    const response = await axios.get(url);
    return new Map(
      (response.data?.data ?? [])
        .map(
          (ticker: any) =>
            [String(ticker.instId), Number(ticker.last)] as const,
        )
        .filter(([, price]) => Number.isFinite(price) && price > 0),
    );
  }

  private async getPendingTriggerSpotOrders(coin?: string) {
    return this.getPendingSpotAlgoOrders('trigger', coin);
  }

  private async getPendingConditionalSpotOrders(coin?: string) {
    return this.getPendingSpotAlgoOrders('conditional', coin);
  }

  private async getPendingSpotOrdersByType(
    ordType: PendingAlgoOrderType,
    coin?: string,
  ) {
    if (ordType === 'trigger') return this.getPendingTriggerSpotOrders(coin);
    if (ordType === 'conditional')
      return this.getPendingConditionalSpotOrders(coin);
    const [triggerOrders, conditionalOrders] = await Promise.all([
      this.getPendingTriggerSpotOrders(coin),
      this.getPendingConditionalSpotOrders(coin),
    ]);
    return [...triggerOrders, ...conditionalOrders];
  }

  private async getPendingSpotAlgoOrders(
    ordType: 'trigger' | 'conditional',
    coin?: string,
  ) {
    const orders: any[] = [];
    const normalizedCoin = coin?.toUpperCase();
    const instId = normalizedCoin ? `${normalizedCoin}-USDT` : undefined;
    let after: string | undefined;

    while (true) {
      const query = [
        'instType=SPOT',
        `ordType=${ordType}`,
        `limit=100`,
        instId ? `instId=${encodeURIComponent(instId)}` : null,
        after ? `after=${encodeURIComponent(after)}` : null,
      ]
        .filter(Boolean)
        .join('&');
      const getPath = `/api/v5/trade/orders-algo-pending?${query}`;
      const maxAttempts = 3;
      let response: any;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const timestamp = new Date().toISOString();
        const getSign = this.sign(timestamp, 'GET', getPath);
        response = await axios.get(
          this.config.get<string>('okx.baseUrl') + getPath,
          {
            headers: {
              'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
              'OK-ACCESS-SIGN': getSign,
              'OK-ACCESS-TIMESTAMP': timestamp,
              'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
            },
          },
        );

        const responseCode = String(response.data?.code ?? '0');
        if (
          !['50011', '51290'].includes(responseCode) ||
          attempt === maxAttempts
        ) {
          break;
        }

        const retryDelayMs = attempt * 1000;
        this.logger.warn(
          `Retry pending spot ${ordType} orders after OKX ${responseCode} ` +
            `(attempt ${attempt}/${maxAttempts}, delay ${retryDelayMs}ms)`,
        );
        await this.sleep(retryDelayMs);
      }

      if (
        response.data?.code !== undefined &&
        String(response.data.code) !== '0'
      ) {
        throw new Error(
          `OKX rejected pending spot ${ordType} orders request: ${JSON.stringify(response.data)}`,
        );
      }

      const page = response.data?.data || [];
      orders.push(...page);

      const nextAfter = page[page.length - 1]?.algoId;
      if (page.length < 100 || !nextAfter || nextAfter === after) {
        break;
      }
      after = nextAfter;
    }

    return orders;
  }

  private getPendingOrderTriggerPrice(order: any): number {
    const candidates =
      order.ordType === 'conditional'
        ? [order.slTriggerPx, order.tpTriggerPx, order.triggerPx]
        : [order.triggerPx, order.slTriggerPx, order.tpTriggerPx];
    const triggerPrice = candidates.find(
      (value) =>
        value !== undefined && value !== null && String(value).trim() !== '',
    );
    return Number(triggerPrice);
  }

  private getPendingOrderPrice(order: any): number {
    const candidates =
      order.ordType === 'conditional'
        ? [order.slOrdPx, order.tpOrdPx, order.ordPx]
        : [order.ordPx, order.slOrdPx, order.tpOrdPx];
    const orderPrice = candidates.find(
      (value) =>
        value !== undefined && value !== null && String(value).trim() !== '',
    );
    const numericOrderPrice = Number(orderPrice);

    // OKX uses -1 for a market order after an SL is triggered. Use its
    // trigger price as the best available notional estimate.
    return Number.isFinite(numericOrderPrice) && numericOrderPrice > 0
      ? numericOrderPrice
      : this.getPendingOrderTriggerPrice(order);
  }

  private getSpotConditionType(order: any): SpotConditionType | undefined {
    if (order.ordType !== 'conditional') return undefined;
    if (order.slTriggerPx !== undefined && order.slTriggerPx !== '')
      return 'stop_loss';
    if (order.tpTriggerPx !== undefined && order.tpTriggerPx !== '')
      return 'take_profit';
    return 'unknown';
  }

  private summarizePendingOrders(
    orders: any[],
    instId: string,
    side: PendingOrdersSide,
    options: PendingOrdersTotalOptions = {},
    orderType: PendingSpotOrderType = 'trigger',
  ): PendingBuyOrdersTotal {
    const matchingOrders = orders.filter(
      (order: any) =>
        order.side === side &&
        order.instId === instId &&
        this.isOrderWithinPriceRange(order, options),
    );
    let pricedOrderCount = 0;
    let totalAmount = 0;
    let minPrice: number | undefined;
    let maxPrice: number | undefined;

    for (const order of matchingOrders) {
      const triggerPrice = this.getPendingOrderTriggerPrice(order);
      const orderPrice = this.getPendingOrderPrice(order);
      const size = Number(order.sz);
      if (Number.isFinite(triggerPrice) && triggerPrice > 0) {
        minPrice =
          minPrice === undefined
            ? triggerPrice
            : Math.min(minPrice, triggerPrice);
        maxPrice =
          maxPrice === undefined
            ? triggerPrice
            : Math.max(maxPrice, triggerPrice);
      }

      if (
        !Number.isFinite(orderPrice) ||
        orderPrice <= 0 ||
        !Number.isFinite(size) ||
        size <= 0
      ) {
        continue;
      }

      pricedOrderCount++;
      totalAmount += orderPrice * size;
    }

    const result: PendingBuyOrdersTotal = {
      coin: instId.split('-')[0],
      instId,
      quoteCurrency: 'USDT',
      orderType,
      orderCount: matchingOrders.length,
      pricedOrderCount,
      unpricedOrderCount: matchingOrders.length - pricedOrderCount,
      totalAmount: Number(totalAmount.toFixed(8)),
    };

    if (minPrice !== undefined) {
      result.minPrice = minPrice;
    }
    if (maxPrice !== undefined) {
      result.maxPrice = maxPrice;
    }

    return result;
  }

  private isOrderWithinPriceRange(
    order: any,
    options: PendingOrdersTotalOptions,
  ): boolean {
    if (options.minPrice === undefined && options.maxPrice === undefined) {
      return true;
    }

    const triggerPrice = this.getPendingOrderTriggerPrice(order);
    if (!Number.isFinite(triggerPrice)) {
      return false;
    }

    if (options.minPrice !== undefined && triggerPrice < options.minPrice) {
      return false;
    }

    if (options.maxPrice !== undefined && triggerPrice > options.maxPrice) {
      return false;
    }

    return true;
  }

  private validatePendingOrdersTotalOptions(
    options: PendingOrdersTotalOptions,
  ) {
    if (
      options.minPrice !== undefined &&
      (!Number.isFinite(options.minPrice) || options.minPrice <= 0)
    ) {
      throw new Error(`Invalid minPrice: ${options.minPrice}`);
    }
    if (
      options.maxPrice !== undefined &&
      (!Number.isFinite(options.maxPrice) || options.maxPrice <= 0)
    ) {
      throw new Error(`Invalid maxPrice: ${options.maxPrice}`);
    }
    if (
      options.minPrice !== undefined &&
      options.maxPrice !== undefined &&
      options.minPrice > options.maxPrice
    ) {
      throw new Error(
        `Invalid price range: minPrice (${options.minPrice}) must be less than or equal to maxPrice (${options.maxPrice})`,
      );
    }
    if (
      options.step !== undefined &&
      (!Number.isInteger(options.step) || options.step <= 0)
    ) {
      throw new Error(
        `Invalid step: ${options.step}. step must be a positive integer`,
      );
    }
    if (options.step !== undefined && options.step > 10000) {
      throw new Error('step must not exceed 10000');
    }
  }

  private getTriggerPriceRange(
    orders: any[],
    instId: string,
    side: PendingOrdersSide,
  ) {
    const prices = orders
      .filter((order: any) => order.side === side && order.instId === instId)
      .map((order: any) => this.getPendingOrderTriggerPrice(order))
      .filter((price: number) => Number.isFinite(price) && price > 0);

    if (prices.length === 0) {
      return {};
    }

    return {
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
    };
  }

  private summarizePendingOrdersByStep(
    orders: any[],
    instId: string,
    side: PendingOrdersSide,
    minPrice: number,
    maxPrice: number,
    step: number,
  ): PendingBuyOrdersRangeTotal[] {
    const rangeCount = minPrice === maxPrice ? 1 : step;
    const interval = (maxPrice - minPrice) / rangeCount;

    return Array.from({ length: rangeCount }, (_, index) => {
      const rangeMinPrice =
        index === 0
          ? minPrice
          : Number((minPrice + index * interval).toPrecision(15));
      const rangeMaxPrice =
        index === rangeCount - 1
          ? maxPrice
          : Number((minPrice + (index + 1) * interval).toPrecision(15));
      const maxPriceInclusive = index === rangeCount - 1;
      const rangeOrders = orders.filter((order: any) => {
        if (order.side !== side || order.instId !== instId) {
          return false;
        }

        const triggerPrice = this.getPendingOrderTriggerPrice(order);
        return (
          Number.isFinite(triggerPrice) &&
          triggerPrice >= rangeMinPrice &&
          (maxPriceInclusive
            ? triggerPrice <= rangeMaxPrice
            : triggerPrice < rangeMaxPrice)
        );
      });
      let totalAmount = 0;

      for (const order of rangeOrders) {
        const orderPrice = this.getPendingOrderPrice(order);
        const size = Number(order.sz);
        if (orderPrice <= 0 || !Number.isFinite(size) || size <= 0) {
          continue;
        }

        totalAmount += orderPrice * size;
      }

      return {
        fromPrice: rangeMinPrice,
        toPrice: rangeMaxPrice,
        amount: Number(totalAmount.toFixed(8)),
      };
    });
  }

  private summarizePendingOrdersByOrderCount(
    orders: any[],
    instId: string,
    side: PendingOrdersSide,
    options: PendingOrdersTotalOptions,
    ordersPerStep: number,
  ): PendingBuyOrdersRangeTotal[] {
    const matchingOrders = orders
      .filter(
        (order: any) =>
          order.side === side &&
          order.instId === instId &&
          this.isOrderWithinPriceRange(order, options) &&
          Number.isFinite(this.getPendingOrderTriggerPrice(order)) &&
          this.getPendingOrderTriggerPrice(order) > 0,
      )
      .sort(
        (left: any, right: any) =>
          this.getPendingOrderTriggerPrice(left) -
          this.getPendingOrderTriggerPrice(right),
      );
    const ranges: PendingBuyOrdersRangeTotal[] = [];

    for (let index = 0; index < matchingOrders.length; index += ordersPerStep) {
      const rangeOrders = matchingOrders.slice(index, index + ordersPerStep);
      const triggerPrices = rangeOrders.map((order: any) =>
        this.getPendingOrderTriggerPrice(order),
      );
      const totalAmount = rangeOrders.reduce((total: number, order: any) => {
        const orderPrice = this.getPendingOrderPrice(order);
        const size = Number(order.sz);

        if (
          !Number.isFinite(orderPrice) ||
          orderPrice <= 0 ||
          !Number.isFinite(size) ||
          size <= 0
        ) {
          return total;
        }

        return total + orderPrice * size;
      }, 0);

      ranges.push({
        fromPrice: Math.min(...triggerPrices),
        toPrice: Math.max(...triggerPrices),
        amount: Number(totalAmount.toFixed(8)),
      });
    }

    return ranges;
  }

  async getPendingOrdersTotalForCoin(
    coin: string,
    side: PendingOrdersSide,
    options: PendingOrdersTotalOptions = {},
  ): Promise<PendingOrdersTotalResponse> {
    if (side !== 'buy' && side !== 'sell') {
      throw new Error(`Invalid side: ${side}. side must be buy or sell`);
    }
    this.validatePendingOrdersTotalOptions(options);

    const normalizedCoin = coin.trim().toUpperCase();
    const instId = `${normalizedCoin}-USDT`;
    const orders = await this.getPendingTriggerSpotOrders(normalizedCoin);
    const inferredRange = this.getTriggerPriceRange(orders, instId, side);
    const resolvedOptions =
      options.minPrice === undefined && options.maxPrice === undefined
        ? { ...options, ...inferredRange }
        : { ...options };

    const total = this.summarizePendingOrders(
      orders,
      instId,
      side,
      resolvedOptions,
    );
    const result: PendingOrdersTotalResponse = {
      coin: total.coin,
      instId: total.instId,
      quoteCurrency: total.quoteCurrency,
      side,
      filter: resolvedOptions,
      summary: {
        orderCount: total.orderCount,
        pricedOrderCount: total.pricedOrderCount,
        unpricedOrderCount: total.unpricedOrderCount,
        totalAmount: total.totalAmount,
      },
    };

    if (
      resolvedOptions.step !== undefined &&
      resolvedOptions.minPrice !== undefined &&
      resolvedOptions.maxPrice !== undefined
    ) {
      result.ranges = this.summarizePendingOrdersByStep(
        orders,
        instId,
        side,
        resolvedOptions.minPrice,
        resolvedOptions.maxPrice,
        resolvedOptions.step,
      );
    } else if (resolvedOptions.step !== undefined) {
      result.ranges = [];
    }

    return result;
  }

  async getPendingOrdersTotalForAllCoins(
    side: PendingOrdersSide,
    options: PendingOrdersTotalOptions = {},
  ): Promise<AllPendingOrdersTotal> {
    if (side !== 'buy' && side !== 'sell') {
      throw new Error(`Invalid side: ${side}. side must be buy or sell`);
    }
    this.validatePendingOrdersTotalOptions(options);

    const [triggerResult, conditionalResult, tickers] = await Promise.all([
      Promise.resolve(this.getPendingTriggerSpotOrders())
        .then((value) => ({ status: 'fulfilled' as const, value }))
        .catch((reason) => ({ status: 'rejected' as const, reason })),
      Promise.resolve(this.getPendingConditionalSpotOrders())
        .then((value) => ({ status: 'fulfilled' as const, value }))
        .catch((reason) => ({ status: 'rejected' as const, reason })),
      this.getSpotTickers(),
    ]);
    const sourceResults = [
      { orderType: 'trigger' as const, result: triggerResult },
      { orderType: 'conditional' as const, result: conditionalResult },
    ];
    const orders: any[] = [];
    const orderErrors: Array<{
      coin: string;
      orderType: PendingSpotOrderType;
      error: string;
    }> = [];

    for (const source of sourceResults) {
      if (source.result.status === 'fulfilled') {
        orders.push(
          ...source.result.value.map((order: any) => ({
            ...order,
            ordType: order.ordType ?? source.orderType,
          })),
        );
      }
    }

    const failedSources = sourceResults.filter(
      (item) => item.result.status === 'rejected',
    );
    const configuredCoins =
      failedSources.length === 0
        ? []
        : Array.from(
            new Set(
              [
                ...(this.config.get<string[]>('coinsForBuy') ?? []),
                ...(this.config.get<string[]>('coinsSpotForTakeProfit') ?? []),
                ...orders
                  .map((order: any) => String(order.instId ?? '').split('-')[0])
                  .filter(Boolean),
              ]
                .map((coin) => String(coin).trim().toUpperCase())
                .filter(Boolean),
            ),
          ).sort();

    for (const source of failedSources) {
      if (configuredCoins.length === 0) {
        orderErrors.push({
          coin: 'ALL',
          orderType: source.orderType,
          error:
            source.result.status === 'rejected'
              ? String(source.result.reason?.message ?? source.result.reason)
              : 'Unknown OKX error',
        });
        continue;
      }

      const perCoinResults = await Promise.all(
        configuredCoins.map(async (coin) => {
          try {
            const coinOrders =
              source.orderType === 'trigger'
                ? await this.getPendingTriggerSpotOrders(coin)
                : await this.getPendingConditionalSpotOrders(coin);
            return { coin, orders: coinOrders };
          } catch (error: any) {
            return { coin, error: String(error?.message ?? error) };
          }
        }),
      );

      for (const coinResult of perCoinResults) {
        if (coinResult.error) {
          orderErrors.push({
            coin: coinResult.coin,
            orderType: source.orderType,
            error: coinResult.error,
          });
        } else {
          orders.push(
            ...(coinResult.orders ?? []).map((order: any) => ({
              ...order,
              ordType: order.ordType ?? source.orderType,
            })),
          );
        }
      }
    }
    const groups = Array.from(
      new Set(
        orders
          .filter(
            (order: any) =>
              order.side === side && String(order.instId).endsWith('-USDT'),
          )
          .map(
            (order: any) => `${String(order.instId)}|${String(order.ordType)}`,
          ),
      ),
    ).sort();
    const coins = groups
      .map((group) => {
        const [instId, orderType] = group.split('|') as [
          string,
          PendingSpotOrderType,
        ];
        const groupOrders = orders.filter(
          (order: any) =>
            order.instId === instId && order.ordType === orderType,
        );
        const inferredRange = this.getTriggerPriceRange(
          groupOrders,
          instId,
          side,
        );
        const resolvedOptions =
          options.minPrice === undefined && options.maxPrice === undefined
            ? { ...options, ...inferredRange }
            : { ...options };
        const total = this.summarizePendingOrders(
          groupOrders,
          instId,
          side,
          resolvedOptions,
          orderType,
        );
        total.currentPrice = tickers.get(instId);

        if (resolvedOptions.step !== undefined) {
          total.ranges = this.summarizePendingOrdersByOrderCount(
            groupOrders,
            instId,
            side,
            resolvedOptions,
            resolvedOptions.step,
          );
        }

        return total;
      })
      .filter((item) => item.orderCount > 0);

    coins.push(
      ...orderErrors.map(({ coin, orderType, error }) => ({
        coin,
        instId: coin === 'ALL' ? '' : `${coin}-USDT`,
        quoteCurrency: 'USDT',
        orderType,
        currentPrice: coin === 'ALL' ? undefined : tickers.get(`${coin}-USDT`),
        orderCount: 0,
        pricedOrderCount: 0,
        unpricedOrderCount: 0,
        totalAmount: 0,
        error,
      })),
    );

    return {
      side,
      filter: { ...options },
      quoteCurrency: 'USDT',
      coinCount: new Set(coins.map((item) => item.coin)).size,
      orderCount: coins.reduce((total, item) => total + item.orderCount, 0),
      pricedOrderCount: coins.reduce(
        (total, item) => total + item.pricedOrderCount,
        0,
      ),
      unpricedOrderCount: coins.reduce(
        (total, item) => total + item.unpricedOrderCount,
        0,
      ),
      totalAmount: Number(
        coins.reduce((total, item) => total + item.totalAmount, 0).toFixed(8),
      ),
      coins,
    };
  }

  async cancelPendingOrdersByPriceRange(
    coin: string,
    side: PendingOrdersSide,
    minPrice: number,
    maxPrice: number,
    testing: boolean = true,
    ordType: PendingAlgoOrderType = 'trigger',
  ) {
    if (side !== 'buy' && side !== 'sell') {
      throw new Error(`Invalid side: ${side}. side must be buy or sell`);
    }
    if (!Number.isFinite(minPrice) || minPrice <= 0) {
      throw new Error(`Invalid minPrice: ${minPrice}`);
    }
    if (!Number.isFinite(maxPrice) || maxPrice <= 0) {
      throw new Error(`Invalid maxPrice: ${maxPrice}`);
    }
    if (minPrice > maxPrice) {
      throw new Error(
        `Invalid price range: minPrice (${minPrice}) must be less than or equal to maxPrice (${maxPrice})`,
      );
    }

    const normalizedCoin = coin.trim().toUpperCase();
    const instId = `${normalizedCoin}-USDT`;
    const pendingOrders = await this.getPendingSpotOrdersByType(
      ordType,
      normalizedCoin,
    );
    const matchedOrders = pendingOrders
      .filter((order: any) => {
        const triggerPrice = this.getPendingOrderTriggerPrice(order);
        return (
          order.side === side &&
          order.instId === instId &&
          Boolean(order.algoId) &&
          Number.isFinite(triggerPrice) &&
          triggerPrice >= minPrice &&
          triggerPrice <= maxPrice
        );
      })
      .map((order: any) => {
        const triggerPrice = this.getPendingOrderTriggerPrice(order);
        const orderPrice = this.getPendingOrderPrice(order);
        const size = Number(order.sz);
        return {
          algoId: String(order.algoId),
          ordType: order.ordType,
          conditionType: this.getSpotConditionType(order),
          triggerPrice,
          orderPrice,
          size: Number.isFinite(size) ? size : 0,
          amount: Number.isFinite(size)
            ? Number((orderPrice * size).toFixed(8))
            : 0,
        };
      });
    const totalAmount = Number(
      matchedOrders
        .reduce((total, order) => total + order.amount, 0)
        .toFixed(8),
    );
    const baseResult = {
      coin: normalizedCoin,
      instId,
      side,
      minPrice,
      maxPrice,
      testing,
      ordType,
      matchedOrderCount: matchedOrders.length,
      totalAmount,
      orders: matchedOrders,
    };

    if (testing) {
      return {
        status: 'preview',
        ...baseResult,
      };
    }

    if (matchedOrders.length === 0) {
      return {
        status: 'no_matching_orders',
        ...baseResult,
        cancelledOrderCount: 0,
        failedOrderCount: 0,
        responses: [],
      };
    }

    const { responses, cancelledOrderCount, failedOrderCount } =
      await this.cancelAlgoOrders(
        matchedOrders.map((order) => ({ algoId: order.algoId, instId })),
      );

    const result = {
      status: failedOrderCount === 0 ? 'cancelled' : 'partially_cancelled',
      ...baseResult,
      cancelledOrderCount,
      failedOrderCount,
      responses,
    };
    this.logger.log(
      JSON.stringify(result, null, 2),
      `Cancel pending ${side} orders by price range`,
      normalizedCoin,
    );
    return result;
  }

  async cancelPendingSpotOrdersForOneCoin(
    coin: string,
    side: 'buy' | 'sell' | null = null,
    ordType: PendingAlgoOrderType = 'trigger',
    testing: boolean = true,
  ) {
    const normalizedCoin = coin.trim().toUpperCase();
    if (!normalizedCoin || !/^[A-Z0-9]+$/.test(normalizedCoin)) {
      throw new Error(`Invalid coin: ${coin}`);
    }
    if (side !== null && side !== 'buy' && side !== 'sell') {
      throw new Error(`Invalid side: ${side}. side must be buy or sell`);
    }

    const instId = `${normalizedCoin}-USDT`;
    const pendingOrders = await this.getPendingSpotOrdersByType(
      ordType,
      normalizedCoin,
    );
    const ordersBySide = pendingOrders.filter(
      (order: any) =>
        order.instId === instId &&
        (!side || order.side === side) &&
        Boolean(order.algoId),
    );
    const ordersToCancel = ordersBySide.map((o: any) => ({
      algoId: o.algoId,
      instId: o.instId,
    }));

    const baseResult = {
      coin: normalizedCoin,
      instId,
      side,
      ordType,
      testing,
      matchedOrderCount: ordersToCancel.length,
      orders: ordersBySide.map((order: any) => ({
        algoId: String(order.algoId),
        instId: order.instId,
        ordType: order.ordType,
        conditionType: this.getSpotConditionType(order),
        side: order.side,
        triggerPrice: this.getPendingOrderTriggerPrice(order),
        orderPrice: this.getPendingOrderPrice(order),
        size: Number(order.sz),
      })),
    };

    if (testing) {
      return { status: 'preview', ...baseResult };
    }

    if (ordersToCancel.length === 0) {
      return {
        status: 'no_matching_orders',
        ...baseResult,
        cancelledOrderCount: 0,
        failedOrderCount: 0,
        responses: [],
      };
    }

    const { responses, cancelledOrderCount, failedOrderCount } =
      await this.cancelAlgoOrders(ordersToCancel);

    const result = {
      status: failedOrderCount === 0 ? 'cancelled' : 'partially_cancelled',
      ...baseResult,
      cancelledOrderCount,
      failedOrderCount,
      responses,
    };
    this.logger.log(
      JSON.stringify(result, null, 2),
      `Cancel pending spot ${ordType} orders`,
      normalizedCoin,
    );
    return result;
  }

  private formatSellOrderCleanupTable(
    keptOrders: Array<{
      algoId: string;
      createdAt: string;
      triggerPrice: number;
      orderPrice: number;
    }>,
    ordersToCancel: Array<{
      algoId: string;
      createdAt: string;
      triggerPrice: number;
      orderPrice: number;
    }>,
    successfullyCleanedOrderIds: Set<string>,
    cleanedAt: string,
    currentPrice: number,
    averageCost: number,
  ): string {
    const formatProfitPercentage = (price: number) =>
      Number.isFinite(averageCost) && averageCost > 0
        ? String(
            Number((((price - averageCost) / averageCost) * 100).toFixed(2)),
          )
        : '';
    const headers = [
      'STATUS',
      'ALGO ID',
      'CURRENT PRICE',
      'CURRENT PROFIT (%)',
      'CREATED AT',
      'CLEANED AT',
      'TRIGGER PRICE',
      'ORDER PRICE',
      'ORDER PROFIT (%)',
    ];
    const cleanedRows = ordersToCancel.map((order) => {
      const cleaned = successfullyCleanedOrderIds.has(order.algoId);
      return [
        cleaned ? 'CLEANED' : 'CLEAN_FAILED',
        order.algoId,
        String(currentPrice),
        formatProfitPercentage(currentPrice),
        order.createdAt,
        cleaned ? cleanedAt : '',
        String(order.triggerPrice),
        String(order.orderPrice),
        formatProfitPercentage(order.orderPrice),
      ];
    });
    const keptRows = keptOrders.map((order) => [
      'KEPT',
      order.algoId,
      String(currentPrice),
      formatProfitPercentage(currentPrice),
      order.createdAt,
      '',
      String(order.triggerPrice),
      String(order.orderPrice),
      formatProfitPercentage(order.orderPrice),
    ]);
    const rows = [...cleanedRows, ...keptRows];
    const widths = headers.map((header, index) =>
      Math.max(header.length, ...rows.map((row) => row[index].length)),
    );
    const formatRow = (row: string[]) =>
      row.map((value, index) => value.padEnd(widths[index])).join(' | ');
    const separator = widths.map((width) => '-'.repeat(width)).join('-+-');

    return ['', formatRow(headers), separator, ...rows.map(formatRow)].join(
      '\n',
    );
  }

  private isRateLimitError(error: any) {
    return Number(error?.response?.status) === 429;
  }

  private getRateLimitRetryDelayMs(error: any, attempt: number) {
    const retryAfter = Number(error?.response?.headers?.['retry-after']);
    return Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : attempt * 1000;
  }

  async cleanSellOrdersForOneCoin(coin: string, testing: boolean = true) {
    const normalizedCoin = coin.trim().toUpperCase();
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.cleanSellOrdersForOneCoinAttempt(
          normalizedCoin,
          testing,
        );
      } catch (error: any) {
        const status = Number(error?.response?.status);
        const responseData = error?.response?.data;
        const requestUrl = error?.config?.url;
        this.logger.log(
          JSON.stringify({
            coin: normalizedCoin,
            attempt,
            maxAttempts,
            status: Number.isFinite(status) ? status : undefined,
            requestUrl,
            message: error?.message ?? String(error),
            responseData,
          }),
          'Clean sell orders request failed',
          `${normalizedCoin}_clean`,
        );

        if (!this.isRateLimitError(error) || attempt === maxAttempts) {
          throw error;
        }
        const retryDelayMs = this.getRateLimitRetryDelayMs(error, attempt);
        this.logger.log(
          `OKX rate limit for ${normalizedCoin}; retry ${attempt + 1}/${maxAttempts} after ${retryDelayMs}ms`,
          'Clean sell orders retry',
          `${normalizedCoin}_clean`,
        );
        await this.sleep(retryDelayMs);
      }
    }
  }

  private async cleanSellOrdersForOneCoinAttempt(
    coin: string,
    testing: boolean,
  ) {
    const normalizedCoin = coin.trim().toUpperCase();
    if (!normalizedCoin || !/^[A-Z0-9]+$/.test(normalizedCoin)) {
      throw new Error(`Invalid coin: ${coin}`);
    }

    const instId = `${normalizedCoin}-USDT`;
    // Keep these calls sequential to avoid a burst against OKX account/algo APIs.
    const currentPrice = await this.getTicker(instId);
    const pendingOrders =
      await this.getPendingTriggerSpotOrders(normalizedCoin);
    const balanceData = await this.getAccountBalance(normalizedCoin);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(
        `Invalid current price fetched for ${instId}: ${currentPrice}`,
      );
    }

    const balance = (balanceData?.data?.[0]?.details ?? []).find(
      (detail: any) => String(detail.ccy).toUpperCase() === normalizedCoin,
    );
    const boughtCoinAmount = Number(
      balance?.cashBal ?? balance?.eq ?? balance?.availBal ?? 0,
    );
    if (!Number.isFinite(boughtCoinAmount) || boughtCoinAmount < 0) {
      throw new Error(
        `Invalid bought coin amount for ${normalizedCoin}: ${boughtCoinAmount}`,
      );
    }
    const averageCost = Number(balance?.openAvgPx ?? 0);
    const configuredSizeDecimals = Number(
      this.config.get<any>(`coin.${normalizedCoin}`)?.szToFixed,
    );
    const sizeDecimals =
      Number.isInteger(configuredSizeDecimals) && configuredSizeDecimals >= 0
        ? configuredSizeDecimals
        : 8;
    const sizeTolerance = 0.5 * 10 ** -sizeDecimals;

    const eligibleOrders = pendingOrders
      .filter((order: any) => {
        const triggerPrice = Number(order.triggerPx);
        const size = Number(order.sz);
        return (
          order.instId === instId &&
          order.side === 'sell' &&
          Boolean(order.algoId) &&
          Number.isFinite(triggerPrice) &&
          triggerPrice < currentPrice &&
          Number.isFinite(size) &&
          size > 0
        );
      })
      .map((order: any) => ({
        algoId: String(order.algoId),
        instId,
        createdAt: Number.isFinite(Number(order.cTime))
          ? moment(Number(order.cTime)).format('YYYY-MM-DD HH:mm:ss')
          : '',
        triggerPrice: Number(order.triggerPx),
        orderPrice: Number(order.ordPx),
        size: Number(order.sz),
      }))
      .sort((left, right) => right.triggerPrice - left.triggerPrice);

    const ordersToCancel: typeof eligibleOrders = [];
    let remainingSize = eligibleOrders.reduce(
      (total, order) => total + order.size,
      0,
    );

    for (const order of [...eligibleOrders].reverse()) {
      if (remainingSize <= boughtCoinAmount + sizeTolerance) {
        break;
      }

      ordersToCancel.push(order);
      remainingSize -= order.size;
    }
    const cancelledOrderIds = new Set(
      ordersToCancel.map(({ algoId }) => algoId),
    );
    const keptOrders = eligibleOrders.filter(
      ({ algoId }) => !cancelledOrderIds.has(algoId),
    );
    const keptSize = keptOrders.reduce((total, order) => total + order.size, 0);

    const baseResult = {
      coin: normalizedCoin,
      instId,
      testing,
      currentPrice,
      boughtCoinAmount,
      eligibleOrderCount: eligibleOrders.length,
      keptOrderCount: keptOrders.length,
      keptSize: Number(keptSize.toFixed(8)),
      cancelOrderCount: ordersToCancel.length,
      cancelSize: Number(
        ordersToCancel
          .reduce((total, order) => total + order.size, 0)
          .toFixed(8),
      ),
      keptOrders,
      ordersToCancel,
    };

    if (testing) {
      return { status: 'preview', ...baseResult };
    }
    if (ordersToCancel.length === 0) {
      const table = this.formatSellOrderCleanupTable(
        keptOrders,
        ordersToCancel,
        new Set(),
        moment().format('YYYY-MM-DD HH:mm:ss'),
        currentPrice,
        averageCost,
      );
      this.logger.log(
        table,
        'Sell order cleanup table',
        `${normalizedCoin}_clean`,
      );
      return {
        status: 'clean',
        ...baseResult,
        cancelledOrderCount: 0,
        failedOrderCount: 0,
        responses: [],
      };
    }

    const { responses, cancelledOrderCount, failedOrderCount } =
      await this.cancelAlgoOrders(
        ordersToCancel.map(({ algoId, instId: orderInstId }) => ({
          algoId,
          instId: orderInstId,
        })),
      );
    const result = {
      status: failedOrderCount === 0 ? 'cleaned' : 'partially_cleaned',
      ...baseResult,
      cancelledOrderCount,
      failedOrderCount,
      responses,
    };
    const successfullyCleanedOrderIds = new Set<string>(
      responses.flatMap((response: any) =>
        (response?.data ?? [])
          .filter((item: any) => String(item.sCode) === '0')
          .map((item: any) => String(item.algoId)),
      ),
    );
    const table = this.formatSellOrderCleanupTable(
      keptOrders,
      ordersToCancel,
      successfullyCleanedOrderIds,
      moment().format('YYYY-MM-DD HH:mm:ss'),
      currentPrice,
      averageCost,
    );
    this.logger.log(
      table,
      'Sell order cleanup table',
      `${normalizedCoin}_clean`,
    );
    this.logger.log(
      JSON.stringify(result, null, 2),
      'Clean excess sell orders',
      normalizedCoin,
    );
    return result;
  }

  async cancelAllPendingSpotOrders(
    side: 'buy' | 'sell' | null = null,
    ordType: PendingAlgoOrderType = 'trigger',
    testing: boolean = true,
  ) {
    if (side !== null && side !== 'buy' && side !== 'sell') {
      throw new Error(`Invalid side: ${side}. side must be buy or sell`);
    }
    const pendingOrders = await this.getPendingSpotOrdersByType(ordType);
    const matchedOrders = pendingOrders.filter(
      (order: any) =>
        (!side || order.side === side) &&
        Boolean(order.algoId) &&
        Boolean(order.instId),
    );
    const baseResult = {
      side,
      ordType,
      testing,
      matchedOrderCount: matchedOrders.length,
      orders: matchedOrders.map((order: any) => ({
        algoId: String(order.algoId),
        instId: order.instId,
        ordType: order.ordType,
        conditionType: this.getSpotConditionType(order),
        side: order.side,
        triggerPrice: this.getPendingOrderTriggerPrice(order),
        orderPrice: this.getPendingOrderPrice(order),
        size: Number(order.sz),
      })),
    };

    if (testing) return { status: 'preview', ...baseResult };
    if (matchedOrders.length === 0) {
      return {
        status: 'no_matching_orders',
        ...baseResult,
        cancelledOrderCount: 0,
        failedOrderCount: 0,
        responses: [],
      };
    }

    const { responses, cancelledOrderCount, failedOrderCount } =
      await this.cancelAlgoOrders(
        matchedOrders.map((order: any) => ({
          algoId: order.algoId,
          instId: order.instId,
        })),
      );
    const result = {
      status: failedOrderCount === 0 ? 'cancelled' : 'partially_cancelled',
      ...baseResult,
      cancelledOrderCount,
      failedOrderCount,
      responses,
    };
    this.logger.log(
      JSON.stringify(result, null, 2),
      `Cancel all pending spot ${ordType} orders`,
    );
    return result;
  }

  async getAccountBalance(ccy?: string) {
    const method = 'GET';
    const requestPath = ccy
      ? `/api/v5/account/balance?ccy=${encodeURIComponent(ccy)}`
      : '/api/v5/account/balance';
    const body = '';
    const timestamp = new Date().toISOString();

    const prehash = timestamp + method + requestPath + body;
    const sign = this.signRequest(
      this.config.get<string>('okx.secretKey'),
      prehash,
    );

    const headers = {
      'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
      'Content-Type': 'application/json',
    };
    const response = await axios.get(
      this.config.get<string>('okx.baseUrl') + requestPath,
      { headers },
    );
    return response.data;
  }

  async getAllSpotBoughtCoins(): Promise<AllSpotBoughtCoins> {
    const [balanceData, tickers] = await Promise.all([
      this.getAccountBalance(),
      this.getSpotTickers(),
    ]);
    const details = balanceData?.data?.[0]?.details ?? [];
    const coins = details
      .map((balance: any): SpotBoughtCoin | null => {
        const coin = String(balance.ccy ?? '').toUpperCase();
        const amount = Number(balance.cashBal ?? balance.eq ?? 0);
        const averageCost = Number(balance.openAvgPx ?? 0);
        const currentPrice = tickers.get(`${coin}-USDT`);

        if (
          !coin ||
          coin === 'USDT' ||
          !Number.isFinite(amount) ||
          amount <= 0 ||
          currentPrice === undefined
        ) {
          return null;
        }

        const hasAverageCost = Number.isFinite(averageCost) && averageCost > 0;
        const profitPercentage = hasAverageCost
          ? ((currentPrice - averageCost) / averageCost) * 100
          : 0;
        const profitUsdt = hasAverageCost
          ? (currentPrice - averageCost) * amount
          : 0;

        return {
          coin,
          numberOfCoins: Number(amount.toFixed(8)),
          amountUsdt: Number((amount * currentPrice).toFixed(8)),
          averageCost: hasAverageCost ? Number(averageCost.toFixed(8)) : 0,
          currentPrice: Number(currentPrice.toFixed(8)),
          profitPercentage: Number(profitPercentage.toFixed(2)),
          profitUsdt: Number(profitUsdt.toFixed(8)),
        };
      })
      .filter(
        (coin: SpotBoughtCoin | null): coin is SpotBoughtCoin => coin !== null,
      )
      .sort((left: SpotBoughtCoin, right: SpotBoughtCoin) =>
        left.coin.localeCompare(right.coin),
      );

    return {
      quoteCurrency: 'USDT',
      coinCount: coins.length,
      totalProfitUsdt: Number(
        coins.reduce((total, coin) => total + coin.profitUsdt, 0).toFixed(8),
      ),
      coins,
    };
  }

  async placeSpotStopLossNearCurrentPrice(
    coin: string,
    percentage: number = 100,
    testing: boolean = true,
  ) {
    const normalizedCoin = coin?.trim().toUpperCase();
    if (!normalizedCoin || !/^[A-Z0-9]+$/.test(normalizedCoin)) {
      throw new Error(`Invalid coin: ${coin}`);
    }
    this.validateSellPercentage(percentage);

    const instId = `${normalizedCoin}-USDT`;
    const coinConfig = this.config.get<any>(`coin.${normalizedCoin}`);
    if (!coinConfig) {
      throw new Error(`No configuration found for coin: ${normalizedCoin}`);
    }

    const balanceData = await this.getAccountBalance(normalizedCoin);
    const balance = (balanceData?.data?.[0]?.details ?? []).find(
      (detail: any) => String(detail.ccy).toUpperCase() === normalizedCoin,
    );
    const availableBalance = String(balance?.availBal ?? '0');
    const size = Number(availableBalance);

    if (!Number.isFinite(size) || size <= 0) {
      return {
        status: 'no_available_balance',
        coin: normalizedCoin,
        instId,
        testing,
        percentage,
        availableBalance,
      };
    }

    const currentPrice = await this.getTicker(instId);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(
        `Invalid current price fetched for ${instId}: ${currentPrice}`,
      );
    }

    const { priceToFixed, szToFixed } = coinConfig;
    const sizeToSell = (size * percentage) / 100;
    const sizeFactor = 10 ** szToFixed;
    const formattedSize = (
      Math.floor(sizeToSell * sizeFactor) / sizeFactor
    ).toFixed(szToFixed);
    const triggerPrice = currentPrice * (1 - 0.002);
    const formattedTriggerPrice = triggerPrice.toFixed(priceToFixed);
    if (Number(formattedSize) <= 0) {
      throw new Error(
        `Available balance ${availableBalance} is below the order size precision for ${normalizedCoin}`,
      );
    }

    const order = await this.placeSpotConditionalStopLoss(
      normalizedCoin,
      formattedSize,
      formattedTriggerPrice,
      testing,
    );
    const result = {
      status: testing ? 'preview' : 'submitted',
      coin: normalizedCoin,
      instId,
      testing,
      percentage,
      availableBalance,
      sizeToSell: formattedSize,
      currentPrice,
      triggerPrice: Number(formattedTriggerPrice),
      orderPrice: -1,
      ordType: 'conditional',
      estimatedValueUsdt: Number(
        (Number(formattedSize) * currentPrice).toFixed(8),
      ),
      order,
    };

    this.logger.log(
      JSON.stringify(result, null, 2),
      'Place near-current conditional stop-loss for available balance',
      normalizedCoin,
    );
    return result;
  }

  async placeSpotBuyNearCurrentPrice(
    coin: string,
    requestedAmountUsdt?: number,
    testing: boolean = true,
  ) {
    const normalizedCoin = coin?.trim().toUpperCase();
    if (!normalizedCoin || !/^[A-Z0-9]+$/.test(normalizedCoin)) {
      throw new Error(`Invalid coin: ${coin}`);
    }

    const coinConfig = this.config.get<any>(`coin.${normalizedCoin}`);
    if (!coinConfig) {
      throw new Error(`No configuration found for coin: ${normalizedCoin}`);
    }
    const amountUsdt =
      requestedAmountUsdt ??
      coinConfig.amountOfUsdtPerStep ??
      this.config.get<number>('amountOfUsdtPerStep');
    if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
      throw new Error(`Invalid amountUsdt: ${amountUsdt}`);
    }

    const instId = `${normalizedCoin}-USDT`;
    const currentPrice = await this.getTicker(instId);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(
        `Invalid current price fetched for ${instId}: ${currentPrice}`,
      );
    }

    const { priceToFixed, szToFixed } = coinConfig;
    const formattedTriggerPrice = (currentPrice * (1 + 0.002)).toFixed(
      priceToFixed,
    );
    const sizeFactor = 10 ** szToFixed;
    const rawSize = amountUsdt / Number(formattedTriggerPrice);
    const formattedSize = (
      Math.floor(rawSize * sizeFactor) / sizeFactor
    ).toFixed(szToFixed);
    if (Number(formattedSize) <= 0) {
      throw new Error(
        `amountUsdt ${amountUsdt} is below the order size precision for ${normalizedCoin}`,
      );
    }

    const order = await this.placeOneOrder(
      normalizedCoin,
      'buy',
      formattedSize,
      formattedTriggerPrice,
      undefined,
      testing,
    );
    const result = {
      status: testing ? 'preview' : 'submitted',
      coin: normalizedCoin,
      instId,
      testing,
      amountUsdt,
      sizeToBuy: formattedSize,
      currentPrice,
      triggerPrice: Number(formattedTriggerPrice),
      orderPrice: -1,
      ordType: 'trigger',
      executionType: 'market_on_trigger',
      order,
    };
    this.logger.log(
      JSON.stringify(result, null, 2),
      'Place near-current trigger market buy',
      normalizedCoin,
    );
    return result;
  }

  private async placeSpotConditionalExitAtTriggerPrice(
    coin: string,
    triggerPrice: number,
    percentage: number,
    conditionType: Exclude<SpotConditionType, 'unknown'>,
    testing: boolean = true,
  ) {
    const normalizedCoin = coin?.trim().toUpperCase();
    if (!normalizedCoin || !/^[A-Z0-9]+$/.test(normalizedCoin)) {
      throw new Error(`Invalid coin: ${coin}`);
    }
    if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) {
      throw new Error(`Invalid price: ${triggerPrice}`);
    }
    this.validateSellPercentage(percentage);

    const instId = `${normalizedCoin}-USDT`;
    const coinConfig = this.config.get<any>(`coin.${normalizedCoin}`);
    if (!coinConfig) {
      throw new Error(`No configuration found for coin: ${normalizedCoin}`);
    }

    const balanceData = await this.getAccountBalance(normalizedCoin);
    const balance = (balanceData?.data?.[0]?.details ?? []).find(
      (detail: any) => String(detail.ccy).toUpperCase() === normalizedCoin,
    );
    const availableBalance = String(balance?.availBal ?? '0');
    const size = Number(availableBalance);
    if (!Number.isFinite(size) || size <= 0) {
      return {
        status: 'no_available_balance',
        coin: normalizedCoin,
        instId,
        testing,
        percentage,
        availableBalance,
      };
    }

    const currentPrice = await this.getTicker(instId);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(
        `Invalid current price fetched for ${instId}: ${currentPrice}`,
      );
    }

    const { priceToFixed, szToFixed } = coinConfig;
    const sizeToSell = (size * percentage) / 100;
    const sizeFactor = 10 ** szToFixed;
    const formattedSize = (
      Math.floor(sizeToSell * sizeFactor) / sizeFactor
    ).toFixed(szToFixed);
    if (Number(formattedSize) <= 0) {
      throw new Error(
        `Available balance ${availableBalance} is below the order size precision for ${normalizedCoin}`,
      );
    }

    const formattedTriggerPrice = triggerPrice.toFixed(priceToFixed);
    const priceDirection =
      triggerPrice < currentPrice
        ? 'below_current_price'
        : triggerPrice > currentPrice
          ? 'above_current_price'
          : 'at_current_price';

    const isStopLoss = conditionType === 'stop_loss';
    const order = isStopLoss
      ? await this.placeSpotConditionalStopLoss(
          normalizedCoin,
          formattedSize,
          formattedTriggerPrice,
          testing,
        )
      : await this.placeSpotConditionalTakeProfit(
          normalizedCoin,
          formattedSize,
          formattedTriggerPrice,
          testing,
        );
    const result = {
      status: testing ? 'preview' : 'submitted',
      coin: normalizedCoin,
      instId,
      testing,
      percentage,
      availableBalance,
      sizeToSell: formattedSize,
      currentPrice,
      triggerPrice: Number(formattedTriggerPrice),
      orderPrice: -1,
      ordType: 'conditional',
      conditionType,
      executionType: 'market',
      priceDirection,
      estimatedValueUsdt: Number(
        (Number(formattedSize) * triggerPrice).toFixed(8),
      ),
      order,
    };

    this.logger.log(
      JSON.stringify(result, null, 2),
      'Sell percentage of available balance at trigger price',
      normalizedCoin,
    );
    return result;
  }

  async placeSpotStopLossAtTriggerPrice(
    coin: string,
    triggerPrice: number,
    percentage: number = 100,
    testing: boolean = true,
  ) {
    const normalizedCoin = coin?.trim().toUpperCase();
    if (!normalizedCoin || !/^[A-Z0-9]+$/.test(normalizedCoin)) {
      throw new Error(`Invalid coin: ${coin}`);
    }
    if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) {
      throw new Error(`Invalid stop-loss trigger price: ${triggerPrice}`);
    }
    const currentPrice = await this.getTicker(`${normalizedCoin}-USDT`);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(
        `Invalid current price fetched for ${normalizedCoin}-USDT: ${currentPrice}`,
      );
    }
    if (triggerPrice >= currentPrice) {
      throw new Error(
        `Spot stop-loss trigger price ${triggerPrice} must be below current price ${currentPrice}`,
      );
    }
    return this.placeSpotConditionalExitAtTriggerPrice(
      normalizedCoin,
      triggerPrice,
      percentage,
      'stop_loss',
      testing,
    );
  }

  async placeSpotTakeProfitAtTriggerPrice(
    coin: string,
    triggerPrice: number,
    percentage: number = 100,
    testing: boolean = true,
  ) {
    const normalizedCoin = coin?.trim().toUpperCase();
    if (!normalizedCoin || !/^[A-Z0-9]+$/.test(normalizedCoin)) {
      throw new Error(`Invalid coin: ${coin}`);
    }
    if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) {
      throw new Error(`Invalid take-profit trigger price: ${triggerPrice}`);
    }
    const currentPrice = await this.getTicker(`${normalizedCoin}-USDT`);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(
        `Invalid current price fetched for ${normalizedCoin}-USDT: ${currentPrice}`,
      );
    }
    if (triggerPrice <= currentPrice) {
      throw new Error(
        `Spot take-profit trigger price ${triggerPrice} must be above current price ${currentPrice}`,
      );
    }
    return this.placeSpotConditionalExitAtTriggerPrice(
      normalizedCoin,
      triggerPrice,
      percentage,
      'take_profit',
      testing,
    );
  }

  private validateSellPercentage(percentage: number) {
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      throw new Error(
        `Invalid percentage: ${percentage}. It must be greater than 0 and less than or equal to 100`,
      );
    }
  }

  async autobuyFromMaxPriceToStopLostPriceForUp(
    coin: string,
    testing: boolean = true,
  ) {
    const data = [];
    this.logger.log(
      `Starting to place auto orders for ${coin.toUpperCase()}, testing mode: ${testing}`,
      null,
      coin,
    );
    const maxUsdt = this.config.get<number>('maxUsdt');
    const riskPerTrade = this.config.get<number>('riskPerTrade');
    const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
    let minBuyPriceRatio = this.config.get<number>('minBuyPriceRatio');
    let maxBuyPriceRatio = this.config.get<number>('maxBuyPriceRatio');
    const stopLossBuyPriceRatio = this.config.get<number>(
      'stopLossBuyPriceRatio',
    );
    const buyWithoutCheckAvarageCost = this.config.get<boolean>(
      'buyWithoutCheckAvarageCost',
    );

    this.logger.log(
      `maxUsdt ${maxUsdt}, riskPerTrade ${riskPerTrade}`,
      null,
      coin,
    );

    this.logger.log(
      `amountOfUsdtPerStep ${amountOfUsdtPerStep}, minBuyPriceRatio ${minBuyPriceRatio}, maxBuyPriceRatio ${maxBuyPriceRatio}, stopLossBuyPriceRatio ${stopLossBuyPriceRatio}`,
      null,
      coin,
    );
    const coinConfig = this.config.get<any>(`coin.${coin.toUpperCase()}`);
    minBuyPriceRatio = coinConfig?.minBuyPriceRatio ?? minBuyPriceRatio;
    maxBuyPriceRatio = coinConfig?.maxBuyPriceRatio ?? maxBuyPriceRatio;
    this.logger.log(
      `Placing auto buy orders for ${coin.toUpperCase()} with config: ${JSON.stringify(coinConfig)}`,
      null,
      coin,
    );
    if (!coinConfig) {
      throw new Error(
        `No configuration found for coin: ${JSON.stringify(coin)}`,
      );
    }
    const { szToFixed, priceToFixed } = coinConfig;
    if (amountOfUsdtPerStep <= 10) {
      throw new Error(
        `Invalid configuration: amountOfUsdtPerStep (${amountOfUsdtPerStep}) must be greater than 10 USDT`,
      );
    }

    const instId = `${coin.toUpperCase()}-USDT`;
    let currentPrice = await this.getTicker(instId);
    let count = 0;
    while (true) {
      this.logger.log(`BUY ${coin} Current price: ${currentPrice}`, null, coin);
      const minBuyPrice = currentPrice * (1 + minBuyPriceRatio);
      const maxBuyPrice = currentPrice * (1 + maxBuyPriceRatio);
      const stopLossPrice = currentPrice * (1 - stopLossBuyPriceRatio);

      if (minBuyPrice >= maxBuyPrice || stopLossPrice >= minBuyPrice) {
        this.logger.log(
          `BUY ${coin} Invalid calculated prices: minBuyPrice (${minBuyPrice}) must be less than maxBuyPrice (${maxBuyPrice}) and stopLossPrice (${stopLossPrice}) must be less than minBuyPrice (${minBuyPrice})`,
          null,
          coin,
        );
        throw new Error(`Invalid calculated prices`);
      }

      const amountOfUsdtRisk = maxUsdt * riskPerTrade; // 30 USDT
      this.logger.log(
        `BUY ${coin} minBuyPrice: ${minBuyPrice}, maxBuyPrice: ${maxBuyPrice}, stopLossPrice: ${stopLossPrice}, amountOfUsdtRisk ${amountOfUsdtRisk}`,
        null,
        coin,
      );

      const totalNnumberOfCoinWillBeBought =
        amountOfUsdtRisk / (maxBuyPrice - stopLossPrice);
      if (totalNnumberOfCoinWillBeBought <= 0) {
        this.logger.log(
          `BUY ${coin} totalNnumberOfCoinWillBeBought <= 0: ${totalNnumberOfCoinWillBeBought <= 0}`,
          null,
          coin,
        );
        return data;
      }

      const coinBalanceData = await this.getAccountBalance(coin);
      const numberOfBoughtCoin = Number(
        coinBalanceData?.data[0]?.details[0]?.availBal ?? 0,
      );
      const numberOfCoinWillBeBought =
        totalNnumberOfCoinWillBeBought - numberOfBoughtCoin;
      const totalCostByUsdt = totalNnumberOfCoinWillBeBought * maxBuyPrice;
      const costByUsdt =
        (numberOfCoinWillBeBought * (stopLossPrice + maxBuyPrice)) / 2;
      const numberOfSteps = Math.ceil(costByUsdt / amountOfUsdtPerStep);
      this.logger.log(
        `BUY ${coin} totalNnumberOfCoinWillBeBought: ${totalNnumberOfCoinWillBeBought}, numberOfBoughtCoin: ${numberOfBoughtCoin}, numberOfCoinWillBeBought: ${numberOfCoinWillBeBought}, totalCostByUsdt ${totalCostByUsdt}, costByUsdt: ${costByUsdt}, numberOfSteps: ${numberOfSteps}`,
        null,
        coin,
      );
      if (numberOfCoinWillBeBought <= 0) {
        this.logger.log(
          `BUY ${coin} numberOfCoinWillBeBought <= 0: ${numberOfCoinWillBeBought <= 0}`,
          null,
          coin,
        );
        return data;
      }
      const priceDistanceBetweenEachStep =
        (maxBuyPrice - stopLossPrice) / numberOfSteps;
      this.logger.log(
        `BUY ${coin} priceDistanceBetweenEachStep: ${priceDistanceBetweenEachStep}`,
        null,
        coin,
      );

      if (!priceDistanceBetweenEachStep || priceDistanceBetweenEachStep <= 0) {
        this.logger.log(
          `BUY ${coin} priceDistanceBetweenEachStep : ${priceDistanceBetweenEachStep}`,
          null,
          coin,
        );
      }

      const steps = Array.from({ length: numberOfSteps + 1 }, (_, i) => i);
      this.logger.log('BUY ${coin} steps:', JSON.stringify(steps), coin);
      const avarageCost = Number(
        coinBalanceData?.data[0]?.details[0]?.openAvgPx ?? 0,
      );
      this.logger.log(`BUY ${coin} avarageCost ${avarageCost}`, null, coin);
      if (!testing) {
        this.emailService.sendEmail(
          process.env.EMAIL_TO,
          `Buy ${coin} status`,
          {
            info: `currentPrice ${currentPrice.toFixed(priceToFixed)}, avarageCost ${avarageCost.toFixed(priceToFixed)}, profit: ${(Number(coinBalanceData?.data[0]?.details[0]?.spotUplRatio ?? 0) * 100).toFixed(2)}% ${Number(coinBalanceData?.data[0]?.details[0]?.spotUpl ?? 0).toFixed(2)}USD${Number(coinBalanceData?.data[0]?.details[0]?.totalPnl ?? 0).toFixed(2)}USD`,
          },
        );
        this.logger.log(
          `Buy ${coin} currentPrice ${currentPrice}, avarageCost ${avarageCost}, profit: ${(Number(coinBalanceData?.data[0]?.details[0]?.spotUplRatio ?? 0) * 100).toFixed(2)}% ${Number(coinBalanceData?.data[0]?.details[0]?.spotUpl ?? 0).toFixed(2)}USD${Number(coinBalanceData?.data[0]?.details[0]?.totalPnl ?? 0).toFixed(2)}USD`,
          null,
          coin,
        );
      }
      let newTotalCost = avarageCost * numberOfBoughtCoin;
      let newBoughtCoin = numberOfBoughtCoin;
      let newAvarageCost = avarageCost;
      try {
        for await (let step of steps) {
          const orderPx = maxBuyPrice - step * priceDistanceBetweenEachStep;
          const triggerPx = orderPx - orderPx * 0.002; // giá kích hoạt thấp hơn giá đặt lệnh giới hạn một chút
          const sz = amountOfUsdtPerStep / orderPx;

          if (sz <= 0) {
            this.logger.log(
              `BUY ${coin} sz ${sz} <= 0, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`,
              null,
              coin,
            );
            break;
          }
          if (triggerPx < minBuyPrice) {
            this.logger.log(
              `BUY ${coin} triggerPx ${triggerPx} < minBuyPrice ${minBuyPrice}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`,
              null,
              coin,
            );
            break;
          }

          if (
            !buyWithoutCheckAvarageCost &&
            !!newAvarageCost &&
            triggerPx >= newAvarageCost
          ) {
            this.logger.log(
              `BUY ${coin} triggerPx ${triggerPx} >= newWvarageCost ${newAvarageCost}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`,
              null,
              coin,
            );
            continue;
          }

          this.logger.log(
            `BUY ${coin} Placing order: Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`,
            null,
            coin,
          );
          let res = await this.placeOneOrder(
            coin,
            'buy',
            sz.toFixed(szToFixed),
            triggerPx.toFixed(priceToFixed),
            orderPx.toFixed(priceToFixed),
            testing,
          );

          data.push({ type: 'BUY', data: step, body: res.body });

          const stopLossOrderPx = orderPx * (1 - stopLossBuyPriceRatio);
          const stopLossTriggerPx = stopLossOrderPx + stopLossOrderPx * 0.002; // trigger cao hơn order
          res = await this.placeSpotConditionalStopLoss(
            coin,
            sz.toFixed(szToFixed),
            stopLossTriggerPx.toFixed(priceToFixed),
            testing,
          );

          data.push({ type: 'STOPLOSS', step, body: res.body });

          newTotalCost += orderPx * sz;
          newBoughtCoin += sz;
          newAvarageCost = newTotalCost / newBoughtCoin;
          this.logger.log(
            `BUY ${coin} newTotalCost ${newTotalCost}, newBoughtCoin ${newBoughtCoin}, newWvarageCost ${newAvarageCost}`,
            null,
            coin,
          );
          await this.sleep(1000 * Math.random());
        }
      } catch (error) {
        this.logger.log(
          'BUY ${coin} Error placing trigger order:',
          error.response?.data || error.message,
          coin,
        );
        throw error;
      }
      if (!testing && data.length > 0) {
        this.emailService.sendEmail(
          process.env.EMAIL_TO,
          `buy ${coin}`,
          data.map((item) => {
            const triggerPx = Number(
              item.body?.triggerPx ?? item.body?.slTriggerPx,
            );
            return `${triggerPx.toFixed(priceToFixed)}:${(((triggerPx - avarageCost) / avarageCost) * 100).toFixed(2)}%`;
          }),
        );
      }
      await this.sleep(5000 * 60);
      const price = await this.getTicker(instId);
      this.logger.log(
        `BUY ${coin} Current price: ${price}, Previous price: ${currentPrice}`,
        null,
        coin,
      );
      count++;
      // break if price increase, otherwise continue order buy to get lower price
      if (currentPrice * 0.99 <= price || count > 10) {
        this.logger.log(`BUY ${coin} stop`, null, coin);
        break;
      }
      currentPrice = price;
    }
    return data;
  }

  async buyTriggerFromMinPriceToMaxPrice(
    coin: string,
    minBuyPrice: number,
    maxBuyPrice: number,
    testing: boolean = true,
    options: BuyTriggerRangeOptions = {},
  ) {
    const data = [];
    const normalizedCoin = coin.toUpperCase();
    const direction = options.direction ?? 'down';
    this.logger.log(
      `Starting trigger BUY range for ${normalizedCoin}, minPrice: ${minBuyPrice}, maxPrice: ${maxBuyPrice}, testing: ${testing}`,
      null,
      coin,
    );

    this.validateBuyTriggerRange(minBuyPrice, maxBuyPrice, direction);
    if (direction === 'down') {
      const currentPrice =
        options.currentPrice ??
        (await this.validateBuyTriggerPriceDirection(
          coin,
          minBuyPrice,
          maxBuyPrice,
          direction,
        ));
      this.ensureDownBuyRangeIsNotAboveCurrentPrice(
        minBuyPrice,
        maxBuyPrice,
        currentPrice,
      );
    }

    const coinConfig = this.config.get<any>(`coin.${normalizedCoin}`);
    this.logger.log(
      `Placing trigger BUY range for ${normalizedCoin} with config: ${JSON.stringify(coinConfig)}`,
      null,
      coin,
    );
    if (!coinConfig) {
      throw new Error(
        `No configuration found for coin: ${JSON.stringify(coin)}`,
      );
    }

    const amountOfUsdtPerStep =
      coinConfig?.amountOfUsdtPerStep ??
      this.config.get<number>('amountOfUsdtPerStep');
    const maxUsdt = this.config.get<number>('maxUsdt');
    const riskPerTrade =
      coinConfig?.riskPerTrade ?? this.config.get<number>('riskPerTrade');
    const stopLossBuyPriceRatio = this.config.get<number>(
      'stopLossBuyPriceRatio',
    );
    const buyWithoutCheckAvarageCost =
      options.buyWithoutCheckAvarageCost ?? true;
    const { szToFixed, priceToFixed } = coinConfig;

    if (amountOfUsdtPerStep <= 10) {
      throw new Error(
        `Invalid configuration: amountOfUsdtPerStep (${amountOfUsdtPerStep}) must be greater than 10 USDT`,
      );
    }
    if (!stopLossBuyPriceRatio || stopLossBuyPriceRatio <= 0) {
      throw new Error(
        `Invalid configuration: stopLossBuyPriceRatio (${stopLossBuyPriceRatio}) must be greater than 0`,
      );
    }

    const stopLossPrice = minBuyPrice * (1 - stopLossBuyPriceRatio);
    if (stopLossPrice <= 0 || stopLossPrice >= minBuyPrice) {
      throw new Error(
        `Invalid stopLossPrice calculated from minPrice: ${stopLossPrice}`,
      );
    }

    const coinBalanceData = await this.getAccountBalance(coin);
    const numberOfBoughtCoin = Number(
      coinBalanceData?.data[0]?.details[0]?.availBal ?? 0,
    );
    const avarageCost = Number(
      coinBalanceData?.data[0]?.details[0]?.openAvgPx ?? 0,
    );
    const amountOfUsdtRisk = maxUsdt * riskPerTrade;
    const totalNnumberOfCoinWillBeBought =
      amountOfUsdtRisk / (maxBuyPrice - stopLossPrice);
    const numberOfCoinWillBeBought =
      totalNnumberOfCoinWillBeBought - numberOfBoughtCoin;
    const avarageBuyPrice = (minBuyPrice + maxBuyPrice) / 2;
    const costByUsdt = numberOfCoinWillBeBought * avarageBuyPrice;

    let numberOfOrders = options.numberOfOrders;
    if (numberOfOrders === undefined || numberOfOrders === null) {
      if (numberOfCoinWillBeBought <= 0) {
        this.logger.log(
          `BUY ${coin} numberOfCoinWillBeBought <= 0: ${numberOfCoinWillBeBought}`,
          null,
          coin,
        );
        return data;
      }
      numberOfOrders = Math.ceil(costByUsdt / amountOfUsdtPerStep);
    }

    if (!Number.isFinite(numberOfOrders) || numberOfOrders <= 0) {
      throw new Error(`Invalid numberOfOrders: ${numberOfOrders}`);
    }
    numberOfOrders = Math.ceil(numberOfOrders);

    const priceDistanceBetweenEachStep =
      numberOfOrders === 1
        ? 0
        : (maxBuyPrice - minBuyPrice) / (numberOfOrders - 1);
    this.logger.log(
      `BUY ${coin} minBuyPrice: ${minBuyPrice}, maxBuyPrice: ${maxBuyPrice}, stopLossPrice: ${stopLossPrice}, amountOfUsdtRisk: ${amountOfUsdtRisk}, numberOfBoughtCoin: ${numberOfBoughtCoin}, numberOfCoinWillBeBought: ${numberOfCoinWillBeBought}, costByUsdt: ${costByUsdt}, numberOfOrders: ${numberOfOrders}, priceDistanceBetweenEachStep: ${priceDistanceBetweenEachStep}`,
      null,
      coin,
    );

    let newTotalCost = avarageCost * numberOfBoughtCoin;
    let newBoughtCoin = numberOfBoughtCoin;
    let newAvarageCost = avarageCost;

    try {
      for await (const step of Array.from(
        { length: numberOfOrders },
        (_, i) => i,
      )) {
        const orderPx = maxBuyPrice - step * priceDistanceBetweenEachStep;
        const triggerPx = orderPx - orderPx * 0.002;
        const sz = amountOfUsdtPerStep / orderPx;

        if (sz <= 0) {
          this.logger.log(
            `BUY ${coin} sz ${sz} <= 0, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`,
            null,
            coin,
          );
          break;
        }

        if (
          !buyWithoutCheckAvarageCost &&
          !!newAvarageCost &&
          triggerPx >= newAvarageCost
        ) {
          this.logger.log(
            `BUY ${coin} triggerPx ${triggerPx} >= newAvarageCost ${newAvarageCost}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`,
            null,
            coin,
          );
          continue;
        }

        this.logger.log(
          `BUY ${coin} Placing range trigger order: Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`,
          null,
          coin,
        );
        const res = await this.placeOneOrder(
          coin,
          'buy',
          sz.toFixed(szToFixed),
          triggerPx.toFixed(priceToFixed),
          orderPx.toFixed(priceToFixed),
          testing,
        );
        data.push({ type: 'BUY', step, body: res.body });

        newTotalCost += orderPx * sz;
        newBoughtCoin += sz;
        newAvarageCost = newTotalCost / newBoughtCoin;
        this.logger.log(
          `BUY ${coin} newTotalCost ${newTotalCost}, newBoughtCoin ${newBoughtCoin}, newAvarageCost ${newAvarageCost}`,
          null,
          coin,
        );
        await this.sleep(1000 * Math.random());
      }
    } catch (error) {
      this.logger.log(
        `BUY ${coin} Error placing range trigger order:`,
        error.response?.data || error.message,
        coin,
      );
      throw error;
    }

    if (!testing && data.length > 0) {
      this.emailService.sendEmail(
        process.env.EMAIL_TO,
        `buy range ${coin}`,
        data.map((item) => {
          const triggerPx = Number(
            item.body?.triggerPx ?? item.body?.slTriggerPx,
          );
          const orderPx = Number(item.body?.orderPx ?? item.body?.slOrdPx);
          return `${triggerPx.toFixed(priceToFixed)}:${orderPx.toFixed(priceToFixed)}`;
        }),
      );
    }

    return data;
  }

  private validateBuyTriggerRange(
    minBuyPrice: number,
    maxBuyPrice: number,
    direction: string,
  ) {
    if (direction !== 'up' && direction !== 'down') {
      throw new BadRequestException(
        `Invalid direction: ${direction}. direction must be up or down`,
      );
    }
    if (!Number.isFinite(minBuyPrice) || minBuyPrice <= 0) {
      throw new BadRequestException(`Invalid minPrice: ${minBuyPrice}`);
    }
    if (!Number.isFinite(maxBuyPrice) || maxBuyPrice <= 0) {
      throw new BadRequestException(`Invalid maxPrice: ${maxBuyPrice}`);
    }
    if (minBuyPrice >= maxBuyPrice) {
      throw new BadRequestException(
        `Invalid price range: minPrice (${minBuyPrice}) must be less than maxPrice (${maxBuyPrice})`,
      );
    }
  }

  private ensureDownBuyRangeIsNotAboveCurrentPrice(
    minBuyPrice: number,
    maxBuyPrice: number,
    currentPrice: number,
  ) {
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(`Invalid current price: ${currentPrice}`);
    }
    if (minBuyPrice > currentPrice || maxBuyPrice > currentPrice) {
      throw new BadRequestException(
        `Invalid down price range: minPrice (${minBuyPrice}) and maxPrice (${maxBuyPrice}) must not exceed currentPrice (${currentPrice})`,
      );
    }
  }

  async validateBuyTriggerPriceDirection(
    coin: string,
    minBuyPrice: number,
    maxBuyPrice: number,
    direction: 'up' | 'down' = 'down',
  ): Promise<number | undefined> {
    this.validateBuyTriggerRange(minBuyPrice, maxBuyPrice, direction);
    if (direction === 'up') {
      return undefined;
    }

    const currentPrice = await this.getTicker(
      `${coin.trim().toUpperCase()}-USDT`,
    );
    this.ensureDownBuyRangeIsNotAboveCurrentPrice(
      minBuyPrice,
      maxBuyPrice,
      currentPrice,
    );
    return currentPrice;
  }

  async autoSellFromMinPriceToStopLossPriceForDown(
    coin: string,
    testing: boolean = true,
  ) {
    const data = [];
    this.logger.log(
      `Starting auto SELL for ${coin.toUpperCase()}, testing: ${testing}`,
      null,
      coin,
    );

    const maxUsdt = this.config.get<number>('maxUsdt');
    const riskPerTrade = this.config.get<number>('riskPerTrade');
    const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');

    let minClosePriceRatio = this.config.get<number>('minClosePriceRatio');
    let maxClosePriceRatio = this.config.get<number>('maxClosePriceRatio');
    const stopLossSellPriceRatio = this.config.get<number>(
      'stopLossSellPriceRatio',
    );
    const coinConfig = this.config.get<any>(`coin.${coin.toUpperCase()}`);
    if (!coinConfig) throw new Error(`No config for ${coin}`);

    minClosePriceRatio = coinConfig?.minClosePriceRatio ?? minClosePriceRatio;
    maxClosePriceRatio = coinConfig?.maxClosePriceRatio ?? maxClosePriceRatio;

    const { priceToFixed } = coinConfig;

    const instId = `${coin.toUpperCase()}-USDT`;
    const instrument = await this.fetchSpotInstrument(instId);
    if (!instrument)
      throw new Error(`Instrument info not available for ${instId}`);
    const lotSize = Number(instrument.lotSz);
    const minimumSize = Number(instrument.minSz);
    const sizeDecimals = this.decimalPlaces(lotSize);
    let currentPrice = await this.getTicker(instId);
    let count = 0;
    while (true) {
      this.logger.log(
        `SELL ${coin}  Current price: ${currentPrice}`,
        null,
        coin,
      );

      // SELL prices (below current)
      const minSellPrice = currentPrice * (1 - maxClosePriceRatio);
      const maxSellPrice = currentPrice * (1 - minClosePriceRatio);
      const stopLossPrice = currentPrice * (1 + stopLossSellPriceRatio);
      this.logger.log(
        `SELL ${coin}  minSellPrice: ${minSellPrice}, maxSellPrice: ${maxSellPrice}, stopLossPrice: ${stopLossPrice}`,
        null,
        coin,
      );

      if (minSellPrice >= maxSellPrice || stopLossPrice <= maxSellPrice) {
        throw new Error(`SELL ${coin} Invalid SELL price configuration`);
      }

      const amountOfUsdtRisk = maxUsdt * riskPerTrade;
      const totalCoinWillBeSold =
        amountOfUsdtRisk / (stopLossPrice - minSellPrice);

      if (totalCoinWillBeSold <= 0) return data;

      const coinBalanceData = await this.getAccountBalance(coin);
      this.logger.log(
        `SELL ${coin} coinBalanceData: ${JSON.stringify(coinBalanceData)}`,
        null,
        coin,
      );
      const availableCoin = Number(
        coinBalanceData?.data[0]?.details[0]?.availBal ?? 0,
      );

      const coinToSell = Math.min(totalCoinWillBeSold, availableCoin);
      if (coinToSell <= 0) return data;
      const normalizedCoinToSell =
        Math.floor((coinToSell + lotSize * 1e-8) / lotSize) * lotSize;
      if (normalizedCoinToSell < minimumSize) {
        this.logger.log(
          `SELL ${coin} size ${normalizedCoinToSell.toFixed(sizeDecimals)} is below minimum size ${minimumSize} after applying lot size ${lotSize}; skipping dust balance`,
          null,
          coin,
        );
        return data;
      }

      const costByUsdt = (coinToSell * (minSellPrice + stopLossPrice)) / 2;
      const numberOfSteps = Math.ceil(costByUsdt / amountOfUsdtPerStep);

      const priceDistanceBetweenEachStep =
        (stopLossPrice - minSellPrice) / numberOfSteps;

      this.logger.log(
        `SELL ${coin} costByUsdt: ${costByUsdt}, steps: ${numberOfSteps}`,
        null,
        coin,
      );
      this.logger.log(
        `SELL ${coin} priceDistanceEachStep: ${priceDistanceBetweenEachStep}`,
        null,
        coin,
      );

      const steps = Array.from({ length: numberOfSteps + 1 }, (_, i) => i);

      let remainingCoin = coinToSell;
      const avarageCost = Number(
        coinBalanceData?.data[0]?.details[0]?.openAvgPx ?? 0,
      );
      if (!testing) {
        this.emailService.sendEmail(
          process.env.EMAIL_TO,
          `Sell ${coin} status`,
          {
            info: `currentPrice ${currentPrice.toFixed(priceToFixed)}, avarageCost ${avarageCost.toFixed(priceToFixed)}, profit: ${(Number(coinBalanceData?.data[0]?.details[0]?.spotUplRatio ?? 0) * 100).toFixed(2)}% ${Number(coinBalanceData?.data[0]?.details[0]?.spotUpl ?? 0).toFixed(2)}USD${Number(coinBalanceData?.data[0]?.details[0]?.totalPnl ?? 0).toFixed(2)}USD`,
          },
        );
        this.logger.log(
          `SELL ${coin} currentPrice ${currentPrice.toFixed(priceToFixed)}, avarageCost ${avarageCost.toFixed(priceToFixed)}, profit: ${(Number(coinBalanceData?.data[0]?.details[0]?.spotUplRatio ?? 0) * 100).toFixed(2)}% ${Number(coinBalanceData?.data[0]?.details[0]?.spotUpl ?? 0).toFixed(2)}USD${Number(coinBalanceData?.data[0]?.details[0]?.totalPnl ?? 0).toFixed(2)}USD, minSellPrice ${minSellPrice}, maxSellPrice ${maxSellPrice}, stopLossPrice ${stopLossPrice}`,
          null,
          coin,
        );
      }
      this.logger.log(
        `SELL ${coin} avarageCost for reporting only: ${avarageCost}`,
        null,
        coin,
      );
      try {
        for await (let step of steps) {
          const orderPx = minSellPrice + step * priceDistanceBetweenEachStep;
          const triggerPx = orderPx + orderPx * 0.002; // trigger cao hơn order
          const sz = Math.min(amountOfUsdtPerStep / orderPx, remainingCoin);
          const normalizedSize =
            Math.floor((sz + lotSize * 1e-8) / lotSize) * lotSize;
          const formattedSize = normalizedSize.toFixed(sizeDecimals);

          if (sz <= 0 || normalizedSize < minimumSize) {
            this.logger.log(
              `SELL ${coin} size ${formattedSize} is below minimum size ${minimumSize} after applying lot size ${lotSize}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}`,
              null,
              coin,
            );
            break;
          }
          if (triggerPx > maxSellPrice) {
            this.logger.log(
              `SELL ${coin} triggerPx ${triggerPx} > maxSellPrice ${maxSellPrice}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${formattedSize}`,
              null,
              coin,
            );
            break;
          }
          const profit =
            avarageCost > 0
              ? `${(((orderPx - avarageCost) / avarageCost) * 100).toFixed(2)}%`
              : 'N/A';
          this.logger.log(
            `SELL ${coin}  step ${step} | orderPx ${orderPx.toFixed(priceToFixed)} | triggerPx ${triggerPx.toFixed(priceToFixed)} | sz ${formattedSize} | profit: ${profit}`,
            null,
            coin,
          );

          const res = await this.placeOneOrder(
            coin,
            'sell',
            formattedSize,
            triggerPx.toFixed(priceToFixed),
            orderPx.toFixed(priceToFixed),
            testing,
          );

          data.push({ type: 'SELL', step, body: res.body });
          remainingCoin -= normalizedSize;
          await this.sleep(1000 * Math.random());
        }
      } catch (error) {
        this.logger.error(
          'Error placing SELL orders:',
          error.response?.data || error.message,
        );
        throw error;
      }
      if (!testing && data.length > 0) {
        this.emailService.sendEmail(
          process.env.EMAIL_TO,
          `SELL ${coin}`,
          data.map((item) => {
            const triggerPx = Number(item.body?.triggerPx);
            const profit =
              avarageCost > 0
                ? `${(((triggerPx - avarageCost) / avarageCost) * 100).toFixed(2)}%`
                : 'N/A';
            return `${triggerPx.toFixed(priceToFixed)}:${profit}`;
          }),
        );
      }
      await this.sleep(5000 * 60);
      const price = await this.getTicker(instId);
      this.logger.log(
        `SELL ${coin} Current price: ${price}, Previous price: ${currentPrice}`,
        null,
        coin,
      );
      count++;
      // break if price decreases, otherwise continue order sell to get higher price
      if (currentPrice * 1.01 >= price || count > 10) {
        this.logger.log(`SELL ${coin} stop`, null, coin);
        break;
      }
      currentPrice = price;
    }
    return data;
  }

  async ensureSpotStopLoss(coin: string, testing: boolean = true) {
    const normalizedCoin = coin.trim().toUpperCase();
    if (!normalizedCoin || !/^[A-Z0-9]+$/.test(normalizedCoin)) {
      throw new Error(`Invalid coin: ${coin}`);
    }
    this.logger.log(
      `Starting to ensure global spot stop-loss for ${normalizedCoin}, testing mode: ${testing}`,
      null,
      normalizedCoin,
    );
    const stopLossRatio = this.config.get<number>('stopLossRatio');
    if (
      !Number.isFinite(stopLossRatio) ||
      stopLossRatio <= 0 ||
      stopLossRatio >= 1
    ) {
      throw new Error(
        `Invalid configuration: stopLossRatio (${stopLossRatio}) must be between 0 and 1`,
      );
    }
    const coinConfig = this.config.get<any>(`coin.${normalizedCoin}`);
    if (!coinConfig) {
      throw new Error(`No configuration found for coin: ${normalizedCoin}`);
    }
    const { priceToFixed, szToFixed } = coinConfig;
    const instId = `${normalizedCoin}-USDT`;
    const balanceData = await this.getAccountBalance(normalizedCoin);
    const balance =
      (balanceData?.data?.[0]?.details ?? []).find(
        (detail: any) => String(detail.ccy).toUpperCase() === normalizedCoin,
      ) ?? balanceData?.data?.[0]?.details?.[0];
    const positionSize = Number(
      balance?.cashBal ?? balance?.eq ?? balance?.availBal ?? 0,
    );
    if (!Number.isFinite(positionSize) || positionSize <= 0) {
      return {
        status: 'no_spot_balance',
        coin: normalizedCoin,
        instId,
        positionSize: 0,
        protectedSize: 0,
        missingSize: 0,
        testing,
      };
    }

    const conditionalOrders =
      await this.getPendingConditionalSpotOrders(normalizedCoin);
    const stopLossOrders = conditionalOrders.filter(
      (order: any) =>
        order.instId === instId &&
        order.side === 'sell' &&
        Number(order.slTriggerPx) > 0 &&
        String(order.slOrdPx ?? '') === '-1',
    );
    const protectedSize = Math.min(
      positionSize,
      stopLossOrders.reduce((total: number, order: any) => {
        const size = Number(order.sz ?? 0);
        return total + (Number.isFinite(size) && size > 0 ? size : 0);
      }, 0),
    );
    const missingSize = Math.max(0, positionSize - protectedSize);
    const sizeTolerance = 0.5 * 10 ** -szToFixed;
    if (missingSize <= sizeTolerance) {
      return {
        status: 'already_protected',
        coin: normalizedCoin,
        instId,
        positionSize,
        protectedSize,
        missingSize: 0,
        protectedOrderCount: stopLossOrders.length,
        testing,
      };
    }

    const sizeFactor = 10 ** szToFixed;
    const formattedMissingSize = (
      Math.floor((missingSize + sizeTolerance * 1e-6) * sizeFactor) / sizeFactor
    ).toFixed(szToFixed);
    if (Number(formattedMissingSize) <= 0) {
      throw new Error(
        `Missing spot stop-loss size is below precision for ${normalizedCoin}: ${missingSize}`,
      );
    }
    const currentPrice = await this.getTicker(instId);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(
        `Invalid current price fetched for ${instId}: ${currentPrice}`,
      );
    }
    const triggerPx = (currentPrice * (1 - stopLossRatio)).toFixed(
      priceToFixed,
    );
    const order = await this.placeSpotConditionalStopLoss(
      normalizedCoin,
      formattedMissingSize,
      triggerPx,
      testing,
    );
    const result = {
      status: testing ? 'preview' : 'submitted',
      coin: normalizedCoin,
      instId,
      positionSize,
      protectedSize,
      missingSize: Number(formattedMissingSize),
      protectedOrderCount: stopLossOrders.length,
      currentPrice,
      stopLossPrice: Number(triggerPx),
      testing,
      order,
    };
    this.logger.log(
      JSON.stringify(result, null, 2),
      'Ensure global spot stop-loss',
      normalizedCoin,
    );
    return result;
  }

  async placeStopLossOrder(coin: string, testing: boolean = true) {
    const result: any = await this.ensureSpotStopLoss(coin, testing);
    if (!result.order) return [];
    return [
      {
        data: result.order.data,
        step: 'global_stop_loss',
        body: result.order.body,
      },
    ];
  }

  async placeSpotConditionalStopLoss(
    coin: string,
    sz: string,
    triggerPx: string,
    testing: boolean = true,
  ) {
    const normalizedCoin = coin.toUpperCase();
    if (!Number.isFinite(Number(sz)) || Number(sz) <= 0) {
      throw new Error(`Invalid spot stop-loss size: ${sz}`);
    }
    if (!Number.isFinite(Number(triggerPx)) || Number(triggerPx) <= 0) {
      throw new Error(`Invalid spot stop-loss trigger price: ${triggerPx}`);
    }

    const timestamp = new Date().toISOString();
    const requestPath = '/api/v5/trade/order-algo';
    const body = {
      instId: `${normalizedCoin}-USDT`,
      tdMode: 'cash',
      side: 'sell',
      ordType: 'conditional',
      sz,
      slTriggerPx: triggerPx,
      slTriggerPxType: 'last',
      slOrdPx: '-1',
    };
    const bodyString = JSON.stringify(body);
    const headers = this.buildHeaders(
      timestamp,
      'POST',
      requestPath,
      bodyString,
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
          `OKX rejected spot conditional stop-loss: ${JSON.stringify(responseData)}`,
        );
      }
    }
    this.logger.log(
      `SPOT conditional stop-loss: coin=${normalizedCoin}, testing=${testing}, size=${sz}, triggerPx=${triggerPx}, slOrdPx=-1, result=${JSON.stringify(responseData ?? { preview: true })}`,
      null,
      normalizedCoin,
    );
    if (!testing) {
      await this.emailService.sendEmail(
        process.env.EMAIL_TO,
        `[SPOT] Conditional stop-loss ${normalizedCoin}`,
        {
          coin: normalizedCoin,
          size: sz,
          triggerPx,
          order: body,
          response: responseData,
        },
      );
    }
    return { data: responseData, body };
  }

  async placeSpotConditionalTakeProfit(
    coin: string,
    sz: string,
    triggerPx: string,
    testing: boolean = true,
  ) {
    const normalizedCoin = coin.toUpperCase();
    if (!Number.isFinite(Number(sz)) || Number(sz) <= 0) {
      throw new Error(`Invalid spot take-profit size: ${sz}`);
    }
    if (!Number.isFinite(Number(triggerPx)) || Number(triggerPx) <= 0) {
      throw new Error(`Invalid spot take-profit trigger price: ${triggerPx}`);
    }

    const timestamp = new Date().toISOString();
    const requestPath = '/api/v5/trade/order-algo';
    const body = {
      instId: `${normalizedCoin}-USDT`,
      tdMode: 'cash',
      side: 'sell',
      ordType: 'conditional',
      sz,
      tpTriggerPx: triggerPx,
      tpTriggerPxType: 'last',
      tpOrdPx: '-1',
    };
    const bodyString = JSON.stringify(body);
    const headers = this.buildHeaders(
      timestamp,
      'POST',
      requestPath,
      bodyString,
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
          `OKX rejected spot conditional take-profit: ${JSON.stringify(responseData)}`,
        );
      }
    }
    this.logger.log(
      `SPOT conditional take-profit: coin=${normalizedCoin}, testing=${testing}, size=${sz}, triggerPx=${triggerPx}, tpOrdPx=-1, result=${JSON.stringify(responseData ?? { preview: true })}`,
      null,
      normalizedCoin,
    );
    if (!testing) {
      await this.emailService.sendEmail(
        process.env.EMAIL_TO,
        `[SPOT] Conditional take-profit ${normalizedCoin}`,
        {
          coin: normalizedCoin,
          size: sz,
          triggerPx,
          order: body,
          response: responseData,
        },
      );
    }
    return { data: responseData, body };
  }

  async placeOneOrder(
    coin: string,
    side: 'buy' | 'sell',
    sz: string,
    triggerPx: string,
    orderPx?: string,
    testing: boolean = true,
  ) {
    const timestamp = new Date().toISOString();
    const requestPath = '/api/v5/trade/order-algo';

    const instId = `${coin.toUpperCase()}-USDT`;
    const tdMode = 'cash'; // spot mode

    const body: any = {
      instId,
      tdMode,
      side, // 'buy' hoặc 'sell'
      ordType: 'trigger', // lệnh kích hoạt
      sz, // khối lượng
      triggerPx, // giá kích hoạt
      orderPx: orderPx ?? '-1', // '-1' = market price
    };

    const prehash = timestamp + 'POST' + requestPath + JSON.stringify(body);
    const sign = this.signRequest(
      this.config.get<string>('okx.secretKey')!,
      prehash,
    );

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
      this.logger.log(
        'Error placing trigger order:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async buyOneCoin(
    isTesting: boolean,
    removeExistingBuyOrders: string,
    coin: string,
    results: any[],
    autobuy: string,
  ) {
    if (!isTesting) {
      if (removeExistingBuyOrders === 'true') {
        const res1 = await this.cancelPendingSpotOrdersForOneCoin(
          coin,
          'buy',
          'trigger',
          false,
        );
        this.logger.log(
          'Cancel existing buy orders:',
          JSON.stringify(res1, null, 2),
        );
        results.push({
          coin,
          action: 'cancel_existing_buy_orders',
          result: res1,
        });
      }
    }

    if (autobuy === 'true') {
      const res4 = await this.autobuyFromMaxPriceToStopLostPriceForUp(
        coin,
        isTesting,
      );
      this.logger.log('Palce auto buy order:', JSON.stringify(res4, null, 2));
      results.push({ coin, action: 'place_auto_buy_order', result: res4 });
    }
  }

  private async getBoughtCoinsForTakeProfit(): Promise<string[]> {
    let coins = this.config.get<string[]>('coinsSpotForTakeProfit');
    if (!coins) {
      throw new Error(
        `No configuration found for coinsSpotForTakeProfit: ${JSON.stringify(coins)}`,
      );
    }
    coins = _.uniq(coins);

    const boughtCoins = await this.getAllSpotBoughtCoins();
    const boughtCoinNames = new Set(
      boughtCoins.coins.map(({ coin }) => coin.toUpperCase()),
    );
    coins = coins.filter((coin) => boughtCoinNames.has(coin.toUpperCase()));

    this.logger.log(`Bought coins to process: ${JSON.stringify(coins)}`);
    return coins;
  }

  async sellAtPriceAllCoins(options: SellAtPriceAllCoinsOptions) {
    const coins = await this.getBoughtCoinsForTakeProfit();
    const results = [];
    await Promise.all(
      coins.map(async (coin) => {
        this.logger.log(`Processing coin: ${coin.toUpperCase()}`, null, coin);
        await this.sellOneCoin({ coin, ...options, results });
      }),
    );

    return results;
  }

  async cleanSellOrdersForAllCoins(testing: boolean = true) {
    const coins = await this.getBoughtCoinsForTakeProfit();
    const results = [];

    for (const [index, coin] of coins.entries()) {
      this.logger.log(
        `Cleaning sell orders for coin: ${coin.toUpperCase()}`,
        null,
        coin,
      );
      try {
        const result = await this.cleanSellOrdersForOneCoin(coin, testing);
        results.push({ coin, result });
      } catch (error: any) {
        const result = {
          status: 'failed',
          coin: String(coin).toUpperCase(),
          responseStatus: error?.response?.status,
          requestUrl: error?.config?.url,
          error: error?.message ?? String(error),
          responseData: error?.response?.data,
        };
        this.logger.log(
          JSON.stringify(result),
          'Clean sell orders failed; continuing with next coin',
          `${String(coin).toUpperCase()}_clean`,
        );
        results.push({ coin, result });
      }

      if (index < coins.length - 1) {
        await this.sleep(1100);
      }
    }

    return results;
  }

  async sellOneCoin({
    coin,
    isTesting,
    removeExistingSellOrders,
    addSellStopLoss,
    addSellTakeProfit,
    onlyForDown,
    justOneOrder,
    results,
  }: {
    isTesting: boolean;
    removeExistingSellOrders: string;
    coin: string;
    addSellStopLoss: string;
    addSellTakeProfit: string;
    onlyForDown: string;
    justOneOrder: string;
    results: any[];
  }) {
    if (!isTesting) {
      if (removeExistingSellOrders === 'true') {
        const res1 = await this.cancelPendingSpotOrdersForOneCoin(
          coin,
          'sell',
          'trigger',
          false,
        );
        this.logger.log(
          'Cancel existing sell orders:',
          JSON.stringify(res1, null, 2),
          coin,
        );
        results.push({
          coin,
          action: 'cancel_existing_sell_orders',
          result: res1,
        });
      }
    }

    if (addSellStopLoss === 'true') {
      const res2 = await this.placeStopLossOrder(coin, isTesting);
      this.logger.log(
        'Place stop loss order:',
        JSON.stringify(res2, null, 2),
        coin,
      );
      results.push({ coin, action: 'place_stop_loss_order', result: res2 });
    }
    if (addSellTakeProfit === 'true') {
      const res4 = await this.autoSellFromMinPriceToStopLossPriceForDown(
        coin,
        isTesting,
      );
      this.logger.log(
        'Place auto sell order:',
        JSON.stringify(res4, null, 2),
        coin,
      );
      results.push({ coin, action: 'place_auto_sell_order', result: res4 });
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';
import { AppLogger } from '../logger/logger.service';
import * as _ from 'lodash';
import { EmailService } from '../email/email.service';

interface BuyTriggerRangeOptions {
    numberOfOrders?: number;
    addStopLoss?: boolean;
}

export interface PendingBuyOrdersTotalOptions {
    minPrice?: number;
    maxPrice?: number;
    priceStep?: number;
}

export type PendingSellOrdersTotalOptions = PendingBuyOrdersTotalOptions;

export interface PendingBuyOrdersRangeTotal {
    fromPrice: number;
    toPrice: number;
    amount: number;
}

export interface PendingBuyOrdersTotalResponse {
    coin: string;
    instId: string;
    quoteCurrency: string;
    filter: PendingBuyOrdersTotalOptions;
    summary: {
        orderCount: number;
        pricedOrderCount: number;
        unpricedOrderCount: number;
        totalAmount: number;
    };
    ranges?: PendingBuyOrdersRangeTotal[];
}

export type PendingSellOrdersTotalResponse = PendingBuyOrdersTotalResponse;

export interface PendingBuyOrdersTotal {
    coin: string;
    instId: string;
    quoteCurrency: string;
    minPrice?: number;
    maxPrice?: number;
    orderCount: number;
    pricedOrderCount: number;
    unpricedOrderCount: number;
    totalAmount: number;
}

export interface AllPendingBuyOrdersTotal {
    quoteCurrency: string;
    coinCount: number;
    orderCount: number;
    pricedOrderCount: number;
    unpricedOrderCount: number;
    totalAmount: number;
    coins: PendingBuyOrdersTotal[];
}

@Injectable()
export class OkxService {
    constructor(
        private config: ConfigService,
        private readonly logger: AppLogger,
        private readonly emailService: EmailService,
    ) { }

    private signRequest(secret: string, message: string) {
        return crypto.createHmac('sha256', secret).update(message).digest('base64');
    }

    private sign(timestamp: string, method: string, requestPath: string, body: string = '') {
        const prehash = timestamp + method.toUpperCase() + requestPath + body;
        return crypto.createHmac('sha256', this.config.get<string>('okx.secretKey')).update(prehash).digest('base64');
    }

    private buildHeaders(timestamp: string, method: string, path: string, body: string = '') {
        const prehash = timestamp + method + path + body;
        const sign = this.signRequest(this.config.get<string>('okx.secretKey'), prehash);

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
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async getTicker(instId: string) {
        const url = `${this.config.get<string>('okx.baseUrl')}/api/v5/market/ticker?instId=${instId}`;
        const res = await axios.get(url);
        return Number(res.data.data[0]?.last);
    }

    private async getPendingTriggerSpotOrders(coin?: string) {
        const orders: any[] = [];
        const normalizedCoin = coin?.toUpperCase();
        const instId = normalizedCoin ? `${normalizedCoin}-USDT` : undefined;
        let after: string | undefined;

        while (true) {
            const query = [
                'instType=SPOT',
                'ordType=trigger',
                `limit=100`,
                instId ? `instId=${encodeURIComponent(instId)}` : null,
                after ? `after=${encodeURIComponent(after)}` : null,
            ].filter(Boolean).join('&');
            const getPath = `/api/v5/trade/orders-algo-pending?${query}`;
            const timestamp = new Date().toISOString();
            const getSign = this.sign(timestamp, 'GET', getPath);
            const response = await axios.get(
                this.config.get<string>('okx.baseUrl') + getPath,
                {
                    headers: {
                        'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
                        'OK-ACCESS-SIGN': getSign,
                        'OK-ACCESS-TIMESTAMP': timestamp,
                        'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
                    },
                }
            );

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

    private summarizePendingOrders(orders: any[], instId: string, side: 'buy' | 'sell', options: PendingBuyOrdersTotalOptions = {}): PendingBuyOrdersTotal {
        const matchingOrders = orders.filter((order: any) => (
            order.side === side
            && order.instId === instId
            && this.isOrderWithinPriceRange(order, options)
        ));
        let pricedOrderCount = 0;
        let totalAmount = 0;
        let minPrice: number | undefined;
        let maxPrice: number | undefined;

        for (const order of matchingOrders) {
            const triggerPrice = Number(order.triggerPx);
            const orderPrice = Number(order.ordPx);
            const size = Number(order.sz);
            if (Number.isFinite(triggerPrice) && triggerPrice > 0) {
                minPrice = minPrice === undefined ? triggerPrice : Math.min(minPrice, triggerPrice);
                maxPrice = maxPrice === undefined ? triggerPrice : Math.max(maxPrice, triggerPrice);
            }

            if (!Number.isFinite(orderPrice) || orderPrice <= 0 || !Number.isFinite(size) || size <= 0) {
                continue;
            }

            pricedOrderCount++;
            totalAmount += orderPrice * size;
        }

        const result: PendingBuyOrdersTotal = {
            coin: instId.split('-')[0],
            instId,
            quoteCurrency: 'USDT',
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

    private isOrderWithinPriceRange(order: any, options: PendingBuyOrdersTotalOptions): boolean {
        if (options.minPrice === undefined && options.maxPrice === undefined) {
            return true;
        }

        const triggerPrice = Number(order.triggerPx);
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

    private validatePendingBuyOrdersTotalOptions(options: PendingBuyOrdersTotalOptions) {
        if (options.minPrice !== undefined && (!Number.isFinite(options.minPrice) || options.minPrice <= 0)) {
            throw new Error(`Invalid minPrice: ${options.minPrice}`);
        }
        if (options.maxPrice !== undefined && (!Number.isFinite(options.maxPrice) || options.maxPrice <= 0)) {
            throw new Error(`Invalid maxPrice: ${options.maxPrice}`);
        }
        if (options.minPrice !== undefined && options.maxPrice !== undefined && options.minPrice > options.maxPrice) {
            throw new Error(`Invalid price range: minPrice (${options.minPrice}) must be less than or equal to maxPrice (${options.maxPrice})`);
        }
        if (options.priceStep !== undefined && (!Number.isFinite(options.priceStep) || options.priceStep <= 0)) {
            throw new Error(`Invalid priceStep: ${options.priceStep}`);
        }
        if (options.priceStep !== undefined && (options.minPrice === undefined || options.maxPrice === undefined)) {
            throw new Error('minPrice and maxPrice are required when priceStep is provided');
        }
        if (
            options.priceStep !== undefined
            && options.minPrice !== undefined
            && options.maxPrice !== undefined
            && Math.ceil(Number(((options.maxPrice - options.minPrice) / options.priceStep).toPrecision(12))) > 10000
        ) {
            throw new Error('priceStep creates more than 10000 price ranges');
        }
    }

    private summarizePendingOrdersByPriceStep(
        orders: any[],
        instId: string,
        side: 'buy' | 'sell',
        minPrice: number,
        maxPrice: number,
        priceStep: number,
    ): PendingBuyOrdersRangeTotal[] {
        const rawRangeCount = (maxPrice - minPrice) / priceStep;
        const rangeCount = Math.max(1, Math.ceil(Number(rawRangeCount.toPrecision(12))));

        return Array.from({ length: rangeCount }, (_, index) => {
            const rangeMinPrice = Number((minPrice + index * priceStep).toPrecision(15));
            const rangeMaxPrice = Number(Math.min(minPrice + (index + 1) * priceStep, maxPrice).toPrecision(15));
            const maxPriceInclusive = index === rangeCount - 1;
            const rangeOrders = orders.filter((order: any) => {
                if (order.side !== side || order.instId !== instId) {
                    return false;
                }

                const triggerPrice = Number(order.triggerPx);
                return Number.isFinite(triggerPrice)
                    && triggerPrice >= rangeMinPrice
                    && (maxPriceInclusive ? triggerPrice <= rangeMaxPrice : triggerPrice < rangeMaxPrice);
            });
            let totalAmount = 0;

            for (const order of rangeOrders) {
                const orderPrice = Number(order.ordPx);
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

    async getPendingBuyOrdersTotalForCoin(coin: string, options: PendingBuyOrdersTotalOptions = {}): Promise<PendingBuyOrdersTotalResponse> {
        this.validatePendingBuyOrdersTotalOptions(options);

        const normalizedCoin = coin.trim().toUpperCase();
        const instId = `${normalizedCoin}-USDT`;
        const orders = await this.getPendingTriggerSpotOrders(normalizedCoin);
        const total = this.summarizePendingOrders(orders, instId, 'buy', options);
        const result: PendingBuyOrdersTotalResponse = {
            coin: total.coin,
            instId: total.instId,
            quoteCurrency: total.quoteCurrency,
            filter: { ...options },
            summary: {
                orderCount: total.orderCount,
                pricedOrderCount: total.pricedOrderCount,
                unpricedOrderCount: total.unpricedOrderCount,
                totalAmount: total.totalAmount,
            },
        };

        if (options.priceStep !== undefined && options.minPrice !== undefined && options.maxPrice !== undefined) {
            result.ranges = this.summarizePendingOrdersByPriceStep(
                orders,
                instId,
                'buy',
                options.minPrice,
                options.maxPrice,
                options.priceStep,
            );
        }

        return result;
    }

    async getPendingSellOrdersTotalForCoin(coin: string, options: PendingSellOrdersTotalOptions = {}): Promise<PendingSellOrdersTotalResponse> {
        this.validatePendingBuyOrdersTotalOptions(options);

        const normalizedCoin = coin.trim().toUpperCase();
        const instId = `${normalizedCoin}-USDT`;
        const orders = await this.getPendingTriggerSpotOrders(normalizedCoin);
        const total = this.summarizePendingOrders(orders, instId, 'sell', options);
        const result: PendingSellOrdersTotalResponse = {
            coin: total.coin,
            instId: total.instId,
            quoteCurrency: total.quoteCurrency,
            filter: { ...options },
            summary: {
                orderCount: total.orderCount,
                pricedOrderCount: total.pricedOrderCount,
                unpricedOrderCount: total.unpricedOrderCount,
                totalAmount: total.totalAmount,
            },
        };

        if (options.priceStep !== undefined && options.minPrice !== undefined && options.maxPrice !== undefined) {
            result.ranges = this.summarizePendingOrdersByPriceStep(
                orders,
                instId,
                'sell',
                options.minPrice,
                options.maxPrice,
                options.priceStep,
            );
        }

        return result;
    }

    async getPendingBuyOrdersTotalForAllCoins(options: PendingBuyOrdersTotalOptions = {}): Promise<AllPendingBuyOrdersTotal> {
        this.validatePendingBuyOrdersTotalOptions(options);

        const orders = await this.getPendingTriggerSpotOrders();
        const instIds = Array.from(new Set(
            orders
                .filter((order: any) => order.side === 'buy' && String(order.instId).endsWith('-USDT'))
                .map((order: any) => String(order.instId))
        )).sort();
        const coins = instIds
            .map((instId) => this.summarizePendingOrders(orders, instId, 'buy', options))
            .filter((item) => item.orderCount > 0);

        return {
            quoteCurrency: 'USDT',
            coinCount: coins.length,
            orderCount: coins.reduce((total, item) => total + item.orderCount, 0),
            pricedOrderCount: coins.reduce((total, item) => total + item.pricedOrderCount, 0),
            unpricedOrderCount: coins.reduce((total, item) => total + item.unpricedOrderCount, 0),
            totalAmount: Number(
                coins.reduce((total, item) => total + item.totalAmount, 0).toFixed(8)
            ),
            coins,
        };
    }

    async cancelPendingBuyOrdersByPriceRange(
        coin: string,
        minPrice: number,
        maxPrice: number,
        testing: boolean = true,
    ) {
        if (!Number.isFinite(minPrice) || minPrice <= 0) {
            throw new Error(`Invalid minPrice: ${minPrice}`);
        }
        if (!Number.isFinite(maxPrice) || maxPrice <= 0) {
            throw new Error(`Invalid maxPrice: ${maxPrice}`);
        }
        if (minPrice > maxPrice) {
            throw new Error(`Invalid price range: minPrice (${minPrice}) must be less than or equal to maxPrice (${maxPrice})`);
        }

        const normalizedCoin = coin.trim().toUpperCase();
        const instId = `${normalizedCoin}-USDT`;
        const pendingOrders = await this.getPendingTriggerSpotOrders(normalizedCoin);
        const matchedOrders = pendingOrders
            .filter((order: any) => {
                const triggerPrice = Number(order.triggerPx);
                return order.side === 'buy'
                    && order.instId === instId
                    && Boolean(order.algoId)
                    && Number.isFinite(triggerPrice)
                    && triggerPrice >= minPrice
                    && triggerPrice <= maxPrice;
            })
            .map((order: any) => {
                const triggerPrice = Number(order.triggerPx);
                const orderPrice = Number(order.ordPx);
                const size = Number(order.sz);
                return {
                    algoId: String(order.algoId),
                    triggerPrice,
                    orderPrice,
                    size: Number.isFinite(size) ? size : 0,
                    amount: Number.isFinite(size) ? Number((orderPrice * size).toFixed(8)) : 0,
                };
            });
        const totalAmount = Number(
            matchedOrders.reduce((total, order) => total + order.amount, 0).toFixed(8)
        );
        const baseResult = {
            coin: normalizedCoin,
            instId,
            minPrice,
            maxPrice,
            testing,
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

        const chunks = this.chunk(
            matchedOrders.map((order) => ({ algoId: order.algoId, instId })),
            20,
        );
        const responses: any[] = [];
        let cancelledOrderCount = 0;
        let failedOrderCount = 0;

        for (const ordersToCancel of chunks) {
            const cancelPath = '/api/v5/trade/cancel-algos';
            const bodyString = JSON.stringify(ordersToCancel);
            const timestamp = new Date().toISOString();
            const headers = this.buildHeaders(timestamp, 'POST', cancelPath, bodyString);
            const response = await axios.post(
                this.config.get<string>('okx.baseUrl') + cancelPath,
                bodyString,
                { headers },
            );
            const responseItems = response.data?.data ?? [];

            cancelledOrderCount += responseItems.filter((item: any) => String(item.sCode) === '0').length;
            failedOrderCount += responseItems.filter((item: any) => String(item.sCode) !== '0').length
                + Math.max(ordersToCancel.length - responseItems.length, 0);
            responses.push(response.data);
        }

        const result = {
            status: failedOrderCount === 0 ? 'cancelled' : 'partially_cancelled',
            ...baseResult,
            cancelledOrderCount,
            failedOrderCount,
            responses,
        };
        this.logger.log(JSON.stringify(result, null, 2), 'Cancel pending BUY orders by price range', normalizedCoin);
        return result;
    }

    async cancelOpenConditionSpotOrdersForOneCoin(coin: string, side: 'buy' | 'sell' | null = null, onlyForDown: boolean = false) {
        const timestamp = new Date().toISOString();

        // 1. Get open orders
        const instId = `${coin.toUpperCase()}-USDT`; // coin cụ thể
        const ordType = 'trigger';  // bắt buộc
        const instType = 'SPOT';

        const currentPrice = await this.getTicker(instId);
        this.logger.log(`currentPrice ${currentPrice}`);
        if (!currentPrice || currentPrice <= 0) {
            throw new Error(`Invalid current price fetched for ${instId}: ${currentPrice}`);
        }
        
        const getPath = `/api/v5/trade/orders-algo-pending?instType=${instType}&ordType=${ordType}&instId=${instId}`;
        const getSign = this.sign(timestamp, 'GET', getPath);
        const getRes = await axios.get(
            this.config.get<string>('okx.baseUrl') + getPath,
            {
                headers: {
                    'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
                    'OK-ACCESS-SIGN': getSign,
                    'OK-ACCESS-TIMESTAMP': timestamp,
                    'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
                },
            }
        );

        const pendingOrders = getRes.data?.data || [];
        if (pendingOrders.length === 0) {
            this.logger.log(`No pending algo orders to cancel for ${instId}.`);
            return { message: 'No pending algo orders' };
        }
        this.logger.log(`pendingOrders ${JSON.stringify(pendingOrders, null, 2)}`);
        // 2. Filter theo side
        let ordersBySide = side ? pendingOrders.filter((order: any) => order.side === side) : pendingOrders;
        this.emailService.sendEmail(process.env.EMAIL_TO, `Number of existed ${side} orders of ${coin}`, ordersBySide.length);    
        // 3. filter by price
        ordersBySide = ordersBySide.filter((order: any) => {
            if (order.side === 'buy') {
                // if price higher than last price, skip
                if (currentPrice > order.last) {
                    return false;
                }
            }
            if (order.side === 'sell') {
                // if price lower than last price, skip
                if (currentPrice < order.last) {
                    return false;
                }
            }
            return true;
        });
        this.logger.log(`ordersBySide ${JSON.stringify(ordersBySide, null, 2)}`);
        // if (side === 'sell') {
        //     if (onlyForDown) {
        //         ordersBySide = ordersBySide.filter((order: any) => order.ordPx < currentPrice);
        //     }
        //     //  else {
        //     //     ordersBySide = ordersBySide.filter((order: any) => order.ordPx > currentPrice);
        //     // }
        // }

        if (ordersBySide.length === 0) {
            this.logger.log(`No ${side.toUpperCase()} orders to cancel for ${instId}`);
            return { cancelled: [] };
        }

        // 2. Chuẩn hoá orders để huỷ
        const ordersToCancel = ordersBySide.map((o: any) => ({
            algoId: o.algoId,
            instId: o.instId,
        }));

        this.emailService.sendEmail(process.env.EMAIL_TO, `Number of ${side} orders of ${coin} to cancel`, ordersToCancel.length);

        this.logger.log(`Found ${ordersToCancel.length} pending algo orders. Cancelling...`);

        // 3) OKX may accept at most N items per request—safe to chunk (use 20)
        const chunks = this.chunk(ordersToCancel, 20);
        const results: any[] = [];

        for await (const chunk of chunks) {
            const bodyArray = chunk; // array of objects
            const bodyString = JSON.stringify(bodyArray);

            // IMPORTANT: use the exact same bodyString both for signature and for the HTTP body.
            const cancelPath = '/api/v5/trade/cancel-algos';
            const tsCancel = new Date().toISOString();
            const headersCancel = this.buildHeaders(tsCancel, 'POST', cancelPath, bodyString);

            const cancelRes = await axios.post(
                this.config.get<string>('okx.baseUrl') + cancelPath,
                bodyString,
                { headers: headersCancel }
            );
            this.logger.log(`Cancel response: ${JSON.stringify(cancelRes.data, null, 2)}`);
            results.push(cancelRes.data);

            // 3. Gửi request huỷ tất cả
        }
        return results;
    }

    async cancelAllOpenConditionSpotOrders(side: 'buy' | 'sell' | null = null) {
        const timestamp = new Date().toISOString();

        // 1. Get open orders
        const ordType = 'trigger';  // bắt buộc
        const instType = 'SPOT';
        const getPath = `/api/v5/trade/orders-algo-pending?instType=${instType}&ordType=${ordType}`;
        const getSign = this.sign(timestamp, 'GET', getPath);
        const getRes = await axios.get(
            this.config.get<string>('okx.baseUrl') + getPath,
            {
                headers: {
                    'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
                    'OK-ACCESS-SIGN': getSign,
                    'OK-ACCESS-TIMESTAMP': timestamp,
                    'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
                },
            }
        );

        const pendingOrders = getRes.data?.data || [];
        if (pendingOrders.length === 0) {
            this.logger.log('No pending algo orders to cancel.');
            return { message: 'No pending algo orders' };
        }

        // 2. Filter theo side
        let ordersBySide = side ? pendingOrders.filter((order: any) => order.side === side) : pendingOrders;

        if (ordersBySide.length === 0) {
            this.logger.log(`No ${side.toUpperCase()} orders to cancel`);
            return { cancelled: [] };
        }

        // 2. Chuẩn hoá orders để huỷ        
        const ordersToCancel = ordersBySide.map((o: any) => ({
            algoId: o.algoId,
            instId: o.instId,
        }));


        this.logger.log(`Found ${ordersToCancel.length} pending algo orders. Cancelling...`);

        // 3) OKX may accept at most N items per request—safe to chunk (use 20)
        const chunks = this.chunk(ordersToCancel, 20);
        const results: any[] = [];

        for await (const chunk of chunks) {
            const bodyArray = chunk; // array of objects
            const bodyString = JSON.stringify(bodyArray);

            // IMPORTANT: use the exact same bodyString both for signature and for the HTTP body.
            const cancelPath = '/api/v5/trade/cancel-algos';
            const tsCancel = new Date().toISOString();
            const headersCancel = this.buildHeaders(tsCancel, 'POST', cancelPath, bodyString);

            const cancelRes = await axios.post(
                this.config.get<string>('okx.baseUrl') + cancelPath,
                bodyString,
                { headers: headersCancel }
            );
            this.logger.log(`Cancel response: ${JSON.stringify(cancelRes.data, null, 2)}`);
            results.push(cancelRes.data);

            // 3. Gửi request huỷ tất cả
        }
        return results;
    }

    async getAccountBalance(ccy: string = null) {
        const method = 'GET';
        const requestPath = `/api/v5/account/balance?ccy=${ccy}`;
        const body = '';
        const timestamp = new Date().toISOString();

        const prehash = timestamp + method + requestPath + body;
        const sign = this.signRequest(this.config.get<string>('okx.secretKey'), prehash);

        const headers = {
            'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
            'OK-ACCESS-SIGN': sign,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
            'Content-Type': 'application/json',
        };
        const response = await axios.get(this.config.get<string>('okx.baseUrl') + requestPath, { headers });
        return response.data;
    }

    async sellAllAtCurrentPrice(
        coin: string,
        percentage: number,
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
            throw new Error(`Invalid current price fetched for ${instId}: ${currentPrice}`);
        }

        const { priceToFixed, szToFixed } = coinConfig;
        const sizeToSell = size * percentage / 100;
        const sizeFactor = 10 ** szToFixed;
        const formattedSize = (Math.floor(sizeToSell * sizeFactor) / sizeFactor).toFixed(szToFixed);
        const formattedPrice = currentPrice.toFixed(priceToFixed);
        if (Number(formattedSize) <= 0) {
            throw new Error(`Available balance ${availableBalance} is below the order size precision for ${normalizedCoin}`);
        }

        const order = await this.placeOneOrder(
            normalizedCoin,
            'sell',
            formattedSize,
            formattedPrice,
            formattedPrice,
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
            estimatedValueUsdt: Number((Number(formattedSize) * currentPrice).toFixed(8)),
            order,
        };

        this.logger.log(
            JSON.stringify(result, null, 2),
            'Sell percentage of available balance at current price',
            normalizedCoin,
        );
        return result;
    }

    async sellAtTriggerPrice(
        coin: string,
        triggerPrice: number,
        percentage: number,
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
            throw new Error(`Invalid current price fetched for ${instId}: ${currentPrice}`);
        }

        const { priceToFixed, szToFixed } = coinConfig;
        const sizeToSell = size * percentage / 100;
        const sizeFactor = 10 ** szToFixed;
        const formattedSize = (Math.floor(sizeToSell * sizeFactor) / sizeFactor).toFixed(szToFixed);
        if (Number(formattedSize) <= 0) {
            throw new Error(`Available balance ${availableBalance} is below the order size precision for ${normalizedCoin}`);
        }

        const orderPriceOffsetRatio = 0.002;
        const orderPrice = triggerPrice < currentPrice
            ? triggerPrice * (1 - orderPriceOffsetRatio)
            : triggerPrice > currentPrice
                ? triggerPrice * (1 + orderPriceOffsetRatio)
                : triggerPrice;
        const formattedTriggerPrice = triggerPrice.toFixed(priceToFixed);
        const formattedOrderPrice = orderPrice.toFixed(priceToFixed);
        const priceDirection = triggerPrice < currentPrice
            ? 'below_current_price'
            : triggerPrice > currentPrice
                ? 'above_current_price'
                : 'at_current_price';

        const order = await this.placeOneOrder(
            normalizedCoin,
            'sell',
            formattedSize,
            formattedTriggerPrice,
            formattedOrderPrice,
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
            orderPrice: Number(formattedOrderPrice),
            priceDirection,
            orderPriceOffsetRatio,
            estimatedValueUsdt: Number((Number(formattedSize) * triggerPrice).toFixed(8)),
            order,
        };

        this.logger.log(
            JSON.stringify(result, null, 2),
            'Sell percentage of available balance at trigger price',
            normalizedCoin,
        );
        return result;
    }

    private validateSellPercentage(percentage: number) {
        if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
            throw new Error(`Invalid percentage: ${percentage}. It must be greater than 0 and less than or equal to 100`);
        }
    }

    async autobuyFromMaxPriceToStopLostPriceForUp(coin: string, testing: boolean = true) {
        const data = [];
        this.logger.log(`Starting to place auto orders for ${coin.toUpperCase()}, testing mode: ${testing}`, null, coin);
        const maxUsdt = this.config.get<number>('maxUsdt');
        const riskPerTrade = this.config.get<number>('riskPerTrade');
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
        let minBuyPriceRatio = this.config.get<number>('minBuyPriceRatio');
        let maxBuyPriceRatio = this.config.get<number>('maxBuyPriceRatio');
        const stopLossBuyPriceRatio = this.config.get<number>('stopLossBuyPriceRatio');
        const buyWithoutCheckAvarageCost = this.config.get<boolean>('buyWithoutCheckAvarageCost');

        this.logger.log(`maxUsdt ${maxUsdt}, riskPerTrade ${riskPerTrade}`, null, coin)

        this.logger.log(`amountOfUsdtPerStep ${amountOfUsdtPerStep}, minBuyPriceRatio ${minBuyPriceRatio}, maxBuyPriceRatio ${maxBuyPriceRatio}, stopLossBuyPriceRatio ${stopLossBuyPriceRatio}`, null, coin)
        const coinConfig = this.config.get<any>(`coin.${coin.toUpperCase()}`);
        minBuyPriceRatio = coinConfig?.minBuyPriceRatio ?? minBuyPriceRatio;
        maxBuyPriceRatio = coinConfig?.maxBuyPriceRatio ?? maxBuyPriceRatio;
        this.logger.log(`Placing auto buy orders for ${coin.toUpperCase()} with config: ${JSON.stringify(coinConfig)}`, null, coin);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { szToFixed, priceToFixed } = coinConfig;
        if (amountOfUsdtPerStep <= 10) {
            throw new Error(`Invalid configuration: amountOfUsdtPerStep (${amountOfUsdtPerStep}) must be greater than 10 USDT`);
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
                this.logger.log(`BUY ${coin} Invalid calculated prices: minBuyPrice (${minBuyPrice}) must be less than maxBuyPrice (${maxBuyPrice}) and stopLossPrice (${stopLossPrice}) must be less than minBuyPrice (${minBuyPrice})`, null, coin);
                throw new Error(`Invalid calculated prices`);
            }

            const amountOfUsdtRisk = maxUsdt * riskPerTrade; // 30 USDT
            this.logger.log(`BUY ${coin} minBuyPrice: ${minBuyPrice}, maxBuyPrice: ${maxBuyPrice}, stopLossPrice: ${stopLossPrice}, amountOfUsdtRisk ${amountOfUsdtRisk}`, null, coin)

            const totalNnumberOfCoinWillBeBought = (amountOfUsdtRisk / (maxBuyPrice - stopLossPrice));
            if (totalNnumberOfCoinWillBeBought <= 0) {
                this.logger.log(`BUY ${coin} totalNnumberOfCoinWillBeBought <= 0: ${totalNnumberOfCoinWillBeBought <= 0}`, null, coin);
                return data;
            }

            const coinBalanceData = await this.getAccountBalance(coin);
            const numberOfBoughtCoin = Number(coinBalanceData?.data[0]?.details[0]?.availBal ?? 0);
            const numberOfCoinWillBeBought = totalNnumberOfCoinWillBeBought - numberOfBoughtCoin;
            const totalCostByUsdt = totalNnumberOfCoinWillBeBought * maxBuyPrice;
            const costByUsdt = numberOfCoinWillBeBought * (stopLossPrice + maxBuyPrice) / 2;
            const numberOfSteps = Math.ceil(costByUsdt / amountOfUsdtPerStep);
            this.logger.log(`BUY ${coin} totalNnumberOfCoinWillBeBought: ${totalNnumberOfCoinWillBeBought}, numberOfBoughtCoin: ${numberOfBoughtCoin}, numberOfCoinWillBeBought: ${numberOfCoinWillBeBought}, totalCostByUsdt ${totalCostByUsdt}, costByUsdt: ${costByUsdt}, numberOfSteps: ${numberOfSteps}`, null, coin)
            if (numberOfCoinWillBeBought <= 0) {
                this.logger.log(`BUY ${coin} numberOfCoinWillBeBought <= 0: ${numberOfCoinWillBeBought <= 0}`, null, coin);
                return data;
            }
            const priceDistanceBetweenEachStep = (maxBuyPrice - stopLossPrice) / numberOfSteps;
            this.logger.log(`BUY ${coin} priceDistanceBetweenEachStep: ${priceDistanceBetweenEachStep}`, null, coin);

            if (!priceDistanceBetweenEachStep || priceDistanceBetweenEachStep <= 0) {
                this.logger.log(`BUY ${coin} priceDistanceBetweenEachStep : ${priceDistanceBetweenEachStep}`, null, coin);
            }

            const steps = Array.from({ length: numberOfSteps + 1 }, (_, i) => i);
            this.logger.log('BUY ${coin} steps:', JSON.stringify(steps), coin);
            const avarageCost = Number(coinBalanceData?.data[0]?.details[0]?.openAvgPx ?? 0);
            this.logger.log(`BUY ${coin} avarageCost ${avarageCost}`, null, coin);
            if (!testing) {
                this.emailService.sendEmail(process.env.EMAIL_TO, `Buy ${coin} status`, { info: `currentPrice ${currentPrice.toFixed(priceToFixed)}, avarageCost ${avarageCost.toFixed(priceToFixed)}, profit: ${(Number(coinBalanceData?.data[0]?.details[0]?.spotUplRatio ?? 0)*100).toFixed(2)}% ${Number(coinBalanceData?.data[0]?.details[0]?.spotUpl ?? 0).toFixed(2)}USD${Number(coinBalanceData?.data[0]?.details[0]?.totalPnl ?? 0).toFixed(2)}USD` });
                this.logger.log(`Buy ${coin} currentPrice ${currentPrice}, avarageCost ${avarageCost}, profit: ${(Number(coinBalanceData?.data[0]?.details[0]?.spotUplRatio ?? 0)*100).toFixed(2)}% ${Number(coinBalanceData?.data[0]?.details[0]?.spotUpl ?? 0).toFixed(2)}USD${Number(coinBalanceData?.data[0]?.details[0]?.totalPnl ?? 0).toFixed(2)}USD`, null, coin);
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
                        this.logger.log(`BUY ${coin} sz ${sz} <= 0, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`, null, coin);
                        break;
                    }
                    if (triggerPx < minBuyPrice) {
                        this.logger.log(`BUY ${coin} triggerPx ${triggerPx} < minBuyPrice ${minBuyPrice}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`, null, coin);
                        break;
                    }

                    if (!buyWithoutCheckAvarageCost && !!newAvarageCost && triggerPx >= newAvarageCost) {
                        this.logger.log(`BUY ${coin} triggerPx ${triggerPx} >= newWvarageCost ${newAvarageCost}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`, null, coin);
                        continue;
                    }

                    this.logger.log(`BUY ${coin} Placing order: Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`, null, coin);
                    let res = await this.placeOneOrder(coin, 'buy', sz.toFixed(szToFixed), triggerPx.toFixed(priceToFixed), orderPx.toFixed(priceToFixed), testing);

                    data.push({ type: 'BUY', data: step, body: res.body });

                    const stopLossOrderPx = orderPx * (1 - stopLossBuyPriceRatio);                    
                    const stopLossTriggerPx = stopLossOrderPx + stopLossOrderPx * 0.002; // trigger cao hơn order
                    res = await this.placeOneOrder(
                        coin,
                        'sell',
                        sz.toFixed(szToFixed),
                        stopLossTriggerPx.toFixed(priceToFixed),
                        stopLossOrderPx.toFixed(priceToFixed),
                        testing
                    );

                    data.push({ type: 'STOPLOSS', step, body: res.body });

                    newTotalCost += orderPx * sz;
                    newBoughtCoin += sz;
                    newAvarageCost = newTotalCost / newBoughtCoin;
                    this.logger.log(`BUY ${coin} newTotalCost ${newTotalCost}, newBoughtCoin ${newBoughtCoin}, newWvarageCost ${newAvarageCost}`, null, coin);
                    await this.sleep(1000 * Math.random());
                }

            } catch (error) {
                this.logger.log('BUY ${coin} Error placing trigger order:', error.response?.data || error.message, coin);
                throw error;
            }
            if (!testing && data.length > 0) {
                this.emailService.sendEmail(process.env.EMAIL_TO, `buy ${coin}`, data.map((item => {
                    const triggerPx = Number(item.body?.triggerPx);
                    return `${triggerPx.toFixed(priceToFixed)}:${((triggerPx - avarageCost) / avarageCost * 100).toFixed(2)}%`;
                })));
            }
            await this.sleep(5000 * 60);
            const price = await this.getTicker(instId);
            this.logger.log(`BUY ${coin} Current price: ${price}, Previous price: ${currentPrice}`, null, coin);            
            count++;
            // break if price increase, otherwise continue order buy to get lower price
            if (currentPrice*0.99 <= price || count > 10) {
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
        this.logger.log(`Starting trigger BUY range for ${normalizedCoin}, minPrice: ${minBuyPrice}, maxPrice: ${maxBuyPrice}, testing: ${testing}`, null, coin);

        if (!Number.isFinite(minBuyPrice) || minBuyPrice <= 0) {
            throw new Error(`Invalid minPrice: ${minBuyPrice}`);
        }
        if (!Number.isFinite(maxBuyPrice) || maxBuyPrice <= 0) {
            throw new Error(`Invalid maxPrice: ${maxBuyPrice}`);
        }
        if (minBuyPrice >= maxBuyPrice) {
            throw new Error(`Invalid price range: minPrice (${minBuyPrice}) must be less than maxPrice (${maxBuyPrice})`);
        }

        const coinConfig = this.config.get<any>(`coin.${normalizedCoin}`);
        this.logger.log(`Placing trigger BUY range for ${normalizedCoin} with config: ${JSON.stringify(coinConfig)}`, null, coin);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }

        const amountOfUsdtPerStep = coinConfig?.amountOfUsdtPerStep ?? this.config.get<number>('amountOfUsdtPerStep');
        const maxUsdt = this.config.get<number>('maxUsdt');
        const riskPerTrade = coinConfig?.riskPerTrade ?? this.config.get<number>('riskPerTrade');
        const stopLossBuyPriceRatio = this.config.get<number>('stopLossBuyPriceRatio');
        const buyWithoutCheckAvarageCost = this.config.get<boolean>('buyWithoutCheckAvarageCost');
        const { szToFixed, priceToFixed } = coinConfig;

        if (amountOfUsdtPerStep <= 10) {
            throw new Error(`Invalid configuration: amountOfUsdtPerStep (${amountOfUsdtPerStep}) must be greater than 10 USDT`);
        }
        if (!stopLossBuyPriceRatio || stopLossBuyPriceRatio <= 0) {
            throw new Error(`Invalid configuration: stopLossBuyPriceRatio (${stopLossBuyPriceRatio}) must be greater than 0`);
        }

        const stopLossPrice = minBuyPrice * (1 - stopLossBuyPriceRatio);
        if (stopLossPrice <= 0 || stopLossPrice >= minBuyPrice) {
            throw new Error(`Invalid stopLossPrice calculated from minPrice: ${stopLossPrice}`);
        }

        const coinBalanceData = await this.getAccountBalance(coin);
        const numberOfBoughtCoin = Number(coinBalanceData?.data[0]?.details[0]?.availBal ?? 0);
        const avarageCost = Number(coinBalanceData?.data[0]?.details[0]?.openAvgPx ?? 0);
        const amountOfUsdtRisk = maxUsdt * riskPerTrade;
        const totalNnumberOfCoinWillBeBought = amountOfUsdtRisk / (maxBuyPrice - stopLossPrice);
        const numberOfCoinWillBeBought = totalNnumberOfCoinWillBeBought - numberOfBoughtCoin;
        const avarageBuyPrice = (minBuyPrice + maxBuyPrice) / 2;
        const costByUsdt = numberOfCoinWillBeBought * avarageBuyPrice;

        let numberOfOrders = options.numberOfOrders;
        if (numberOfOrders === undefined || numberOfOrders === null) {
            if (numberOfCoinWillBeBought <= 0) {
                this.logger.log(`BUY ${coin} numberOfCoinWillBeBought <= 0: ${numberOfCoinWillBeBought}`, null, coin);
                return data;
            }
            numberOfOrders = Math.ceil(costByUsdt / amountOfUsdtPerStep);
        }

        if (!Number.isFinite(numberOfOrders) || numberOfOrders <= 0) {
            throw new Error(`Invalid numberOfOrders: ${numberOfOrders}`);
        }
        numberOfOrders = Math.ceil(numberOfOrders);

        const priceDistanceBetweenEachStep = numberOfOrders === 1 ? 0 : (maxBuyPrice - minBuyPrice) / (numberOfOrders - 1);
        this.logger.log(
            `BUY ${coin} minBuyPrice: ${minBuyPrice}, maxBuyPrice: ${maxBuyPrice}, stopLossPrice: ${stopLossPrice}, amountOfUsdtRisk: ${amountOfUsdtRisk}, numberOfBoughtCoin: ${numberOfBoughtCoin}, numberOfCoinWillBeBought: ${numberOfCoinWillBeBought}, costByUsdt: ${costByUsdt}, numberOfOrders: ${numberOfOrders}, priceDistanceBetweenEachStep: ${priceDistanceBetweenEachStep}`,
            null,
            coin,
        );

        let newTotalCost = avarageCost * numberOfBoughtCoin;
        let newBoughtCoin = numberOfBoughtCoin;
        let newAvarageCost = avarageCost;

        try {
            for await (const step of Array.from({ length: numberOfOrders }, (_, i) => i)) {
                const orderPx = maxBuyPrice - step * priceDistanceBetweenEachStep;
                const triggerPx = orderPx - orderPx * 0.002;
                const sz = amountOfUsdtPerStep / orderPx;

                if (sz <= 0) {
                    this.logger.log(`BUY ${coin} sz ${sz} <= 0, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`, null, coin);
                    break;
                }

                if (!buyWithoutCheckAvarageCost && !!newAvarageCost && triggerPx >= newAvarageCost) {
                    this.logger.log(`BUY ${coin} triggerPx ${triggerPx} >= newAvarageCost ${newAvarageCost}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`, null, coin);
                    continue;
                }

                this.logger.log(`BUY ${coin} Placing range trigger order: Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`, null, coin);
                let res = await this.placeOneOrder(coin, 'buy', sz.toFixed(szToFixed), triggerPx.toFixed(priceToFixed), orderPx.toFixed(priceToFixed), testing);
                data.push({ type: 'BUY', step, body: res.body });

                if (options.addStopLoss) {
                    const stopLossOrderPx = orderPx * (1 - stopLossBuyPriceRatio);
                    const stopLossTriggerPx = stopLossOrderPx + stopLossOrderPx * 0.002;
                    res = await this.placeOneOrder(
                        coin,
                        'sell',
                        sz.toFixed(szToFixed),
                        stopLossTriggerPx.toFixed(priceToFixed),
                        stopLossOrderPx.toFixed(priceToFixed),
                        testing
                    );
                    data.push({ type: 'STOPLOSS', step, body: res.body });
                }

                newTotalCost += orderPx * sz;
                newBoughtCoin += sz;
                newAvarageCost = newTotalCost / newBoughtCoin;
                this.logger.log(`BUY ${coin} newTotalCost ${newTotalCost}, newBoughtCoin ${newBoughtCoin}, newAvarageCost ${newAvarageCost}`, null, coin);
                await this.sleep(1000 * Math.random());
            }
        } catch (error) {
            this.logger.log(`BUY ${coin} Error placing range trigger order:`, error.response?.data || error.message, coin);
            throw error;
        }

        if (!testing && data.length > 0) {
            this.emailService.sendEmail(process.env.EMAIL_TO, `buy range ${coin}`, data.map((item =>
                `${Number(item.body?.triggerPx).toFixed(priceToFixed)}:${Number(item.body?.orderPx).toFixed(priceToFixed)}`
            )));
        }

        return data;
    }

    async autoSellFromMinPriceToStopLossPriceForDown(
        coin: string,
        testing: boolean = true
    ) {
        const data = [];
        this.logger.log(`Starting auto SELL for ${coin.toUpperCase()}, testing: ${testing}`, null, coin);

        const maxUsdt = this.config.get<number>('maxUsdt');
        const riskPerTrade = this.config.get<number>('riskPerTrade');
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');

        let minSellPriceRatio = this.config.get<number>('minSellPriceRatio');
        let maxSellPriceRatio = this.config.get<number>('maxSellPriceRatio');
        const stopLossSellPriceRatio = this.config.get<number>('stopLossSellPriceRatio');
        const minTakeProfitRatio = this.config.get<number>('minTakeProfitRatio');
        const sellWithoutCheckAvarageCost = this.config.get<boolean>('sellWithoutCheckAvarageCost');

        const coinConfig = this.config.get<any>(`coin.${coin.toUpperCase()}`);
        if (!coinConfig) throw new Error(`No config for ${coin}`);

        minSellPriceRatio = coinConfig?.minSellPriceRatio ?? minSellPriceRatio;
        maxSellPriceRatio = coinConfig?.maxSellPriceRatio ?? maxSellPriceRatio;

        const { szToFixed, priceToFixed } = coinConfig;

        const instId = `${coin.toUpperCase()}-USDT`;
        let currentPrice = await this.getTicker(instId);
        let count = 0
        while(true) {
            this.logger.log(`SELL ${coin}  Current price: ${currentPrice}`, null, coin);

            // SELL prices (below current)
            const minSellPrice = currentPrice * (1 - maxSellPriceRatio);
            const maxSellPrice = currentPrice * (1 - minSellPriceRatio);
            const stopLossPrice = currentPrice * (1 + stopLossSellPriceRatio);
            this.logger.log(`SELL ${coin}  minSellPrice: ${minSellPrice}, maxSellPrice: ${maxSellPrice}, stopLossPrice: ${stopLossPrice}, minTakeProfitRatio: ${minTakeProfitRatio}`, null, coin);

            if (minSellPrice >= maxSellPrice || stopLossPrice <= maxSellPrice) {
                throw new Error(`SELL ${coin} Invalid SELL price configuration`);
            }

            const amountOfUsdtRisk = maxUsdt * riskPerTrade;
            const totalCoinWillBeSold =
                amountOfUsdtRisk / (stopLossPrice - minSellPrice);

            if (totalCoinWillBeSold <= 0) return data;

            const coinBalanceData = await this.getAccountBalance(coin);
            this.logger.log(`SELL ${coin} coinBalanceData: ${JSON.stringify(coinBalanceData)}`, null, coin);
            const availableCoin = Number(
                coinBalanceData?.data[0]?.details[0]?.availBal ?? 0
            );

            const coinToSell = Math.min(totalCoinWillBeSold, availableCoin);
            if (coinToSell <= 0) return data;

            const costByUsdt = coinToSell * (minSellPrice + stopLossPrice) / 2;
            const numberOfSteps = Math.ceil(costByUsdt / amountOfUsdtPerStep);

            const priceDistanceBetweenEachStep =
                (stopLossPrice - minSellPrice) / numberOfSteps;

            this.logger.log(`SELL ${coin} costByUsdt: ${costByUsdt}, steps: ${numberOfSteps}`, null, coin);
            this.logger.log(`SELL ${coin} priceDistanceEachStep: ${priceDistanceBetweenEachStep}`, null, coin);

            const steps = Array.from({ length: numberOfSteps + 1 }, (_, i) => i);

            let remainingCoin = coinToSell;
            const avarageCost = Number(coinBalanceData?.data[0]?.details[0]?.openAvgPx ?? 0);
            const minTakeProfitPrice = avarageCost * (1 + minTakeProfitRatio); // tối thiểu phải có lãi 5%
            if (!testing) {
                this.emailService.sendEmail(process.env.EMAIL_TO, `Sell ${coin} status`, { info: `currentPrice ${currentPrice.toFixed(priceToFixed)}, avarageCost ${avarageCost.toFixed(priceToFixed)}, profit: ${(Number(coinBalanceData?.data[0]?.details[0]?.spotUplRatio ?? 0)*100).toFixed(2)}% ${Number(coinBalanceData?.data[0]?.details[0]?.spotUpl ?? 0).toFixed(2)}USD${Number(coinBalanceData?.data[0]?.details[0]?.totalPnl ?? 0).toFixed(2)}USD` });
                this.logger.log(`SELL ${coin} currentPrice ${currentPrice.toFixed(priceToFixed)}, avarageCost ${avarageCost.toFixed(priceToFixed)}, profit: ${(Number(coinBalanceData?.data[0]?.details[0]?.spotUplRatio ?? 0)*100).toFixed(2)}% ${Number(coinBalanceData?.data[0]?.details[0]?.spotUpl ?? 0).toFixed(2)}USD${Number(coinBalanceData?.data[0]?.details[0]?.totalPnl ?? 0).toFixed(2)}USD, minTakeProfitPrice ${minTakeProfitPrice}, minSellPrice ${minSellPrice}, maxSellPrice ${maxSellPrice}, stopLossPrice ${stopLossPrice}`, null, coin);
            }
            this.logger.log(`SELL ${coin} avarageCost: ${avarageCost} minTakeProfitPrice ${minTakeProfitPrice}: ${avarageCost > 0 ? (minTakeProfitPrice / avarageCost - 1) * 100 : 0 }%`, null, coin);
            try {
                for await (let step of steps) {
                    const orderPx = minSellPrice + step * priceDistanceBetweenEachStep;
                    const triggerPx = orderPx + orderPx * 0.002; // trigger cao hơn order
                    const sz = Math.min(
                        amountOfUsdtPerStep / orderPx,
                        remainingCoin
                    );

                    if (sz <= 0) {
                        this.logger.log(`SELL ${coin} sz ${sz} <= 0, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`, null, coin);
                        break;
                    }
                    if (triggerPx > maxSellPrice) {
                        this.logger.log(`SELL ${coin} triggerPx ${triggerPx} > maxSellPrice ${maxSellPrice}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`, null, coin);
                        break;
                    }
                    if (orderPx < minTakeProfitPrice) {
                        this.logger.log(`SELL ${coin} orderPx ${orderPx} < minTakeProfitPrice ${minTakeProfitPrice}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`, null, coin);
                        continue;
                    }

                    if (!sellWithoutCheckAvarageCost && !!avarageCost && triggerPx < avarageCost) {
                        this.logger.log(`SELL ${coin} triggerPx ${triggerPx} < avarageCost ${avarageCost}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`, null, coin);
                        continue;
                    }

                    this.logger.log(
                        `SELL ${coin}  step ${step} | orderPx ${orderPx.toFixed(priceToFixed)} | triggerPx ${triggerPx.toFixed(priceToFixed)} | sz ${sz.toFixed(szToFixed)} | profit: ${(orderPx - avarageCost)/avarageCost*100}%`, null, coin
                    );

                    const res = await this.placeOneOrder(
                        coin,
                        'sell',
                        sz.toFixed(szToFixed),
                        triggerPx.toFixed(priceToFixed),
                        orderPx.toFixed(priceToFixed),
                        testing
                    );

                    data.push({ type: 'SELL', step, body: res.body });
                    remainingCoin -= sz;
                    await this.sleep(1000 * Math.random());
                }
            } catch (error) {
                this.logger.error(
                    'Error placing SELL orders:',
                    error.response?.data || error.message
                );
                throw error;
            }
            if (!testing && data.length > 0) {
                this.emailService.sendEmail(process.env.EMAIL_TO, `SELL ${coin}`, data.map((item => {
                    const triggerPx = Number(item.body?.triggerPx);
                    return `${triggerPx.toFixed(priceToFixed)}:${((triggerPx - avarageCost) / avarageCost * 100).toFixed(2)}%`;
                })));
            }
            await this.sleep(5000 * 60);
            const price = await this.getTicker(instId);
            this.logger.log(`SELL ${coin} Current price: ${price}, Previous price: ${currentPrice}`, null, coin);
            count ++;
            // break if price decreases, otherwise continue order sell to get higher price        
            if (currentPrice*1.01 >= price || count > 10) {
                this.logger.log(`SELL ${coin} stop`, null, coin);
                break;
            }
            currentPrice = price;
        }
        return data;
    }


    async placeTakeProfitOrder(coin: string, onlyForDown: boolean, justOneOrder: boolean = false, testing: boolean = true) {
        const data = [];
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
        const coinConfig = this.config.get<any>(`coin.${coin.toUpperCase()}`);
        this.logger.log(`Placing take profit order for ${coin.toUpperCase()} with config: ${JSON.stringify(coinConfig)}`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const stopLossRatio = this.config.get<number>('stopLossRatio');
        if (!stopLossRatio || stopLossRatio <= 0) {
            throw new Error(`Invalid configuration: stopLossRatio (${stopLossRatio}) must be greater than 0`);
        }
        const { priceToFixed, szToFixed } = coinConfig;

        const minTakeProfitPrice = await this.getTicker(`${coin.toUpperCase()}-USDT`) * (1 + stopLossRatio + 0.05); // tối thiểu phải có lãi 5%

        const takeProfitPricePercentage = [0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1] // % so với giá hiện tại

        const percentageOfNUmberOfBoughtCoinToSell = 0.05; // 5% số coin đã mua sẽ bán ở mỗi mức giá take profit
        this.logger.log(`Placing take profit price order for ${coin.toUpperCase()}, testing mode: ${testing}`);
        const currentPrice = await this.getTicker(`${coin.toUpperCase()}-USDT`);
        this.logger.log(`Current price: ${currentPrice}`);
        if (!currentPrice || currentPrice <= 0) {
            throw new Error(`Invalid current price fetched for ${coin.toUpperCase()}-USDT: ${currentPrice}`);
        }

        if (currentPrice <= minTakeProfitPrice) {
            this.logger.log(`Current price ${currentPrice} <= minTakeProfitPrice ${minTakeProfitPrice}, not placing take profit orders.`);
            return data;
        }

        // get balance
        const coinBalanceData = await this.getAccountBalance(coin);
        const numberOfBoughtCoin = coinBalanceData?.data[0]?.details[0]?.availBal;
        this.logger.log(`numberOfBoughtCoin: ${numberOfBoughtCoin}`);
        if (!numberOfBoughtCoin || numberOfBoughtCoin <= 0) {
            return data;
        }
        const avarageCost = Number(coinBalanceData?.data[0]?.details[0]?.openAvgPx ?? 0);
        this.logger.log(`avarageCost: ${avarageCost}`);
        if (avarageCost <= 0) {
            return data;
        }
        if (avarageCost >= currentPrice) {
            this.logger.log(`avarageCost: ${avarageCost} >= currentPrice: ${currentPrice}, not place take profit order`);
            return data;
        }
        let totalNnumberOfCoinWillBeSell = 0;
        this.logger.log(`takeProfitPricePercentage: ${JSON.stringify(takeProfitPricePercentage)}`);
        for await (const percentage of takeProfitPricePercentage) {
            this.logger.log(`Processing take profit at percentage: ${percentage * 100}%`);
            if (totalNnumberOfCoinWillBeSell > numberOfBoughtCoin) {
                this.logger.log(`totalNnumberOfCoinWillBeSell: ${totalNnumberOfCoinWillBeSell} > numberOfBoughtCoin: ${numberOfBoughtCoin}, break the loop`);
                break;
            }

            const orderPrice = avarageCost * (1 + percentage);
            const triggerPx = orderPrice > currentPrice ? orderPrice - orderPrice * 0.002 : orderPrice + orderPrice * 0.002;
            if (onlyForDown && orderPrice >= currentPrice) {
                this.logger.log(`at percentage: ${percentage * 100}%,onlyForDown is true and orderPrice: ${orderPrice} >= currentPrice: ${currentPrice} and triggerPx: ${orderPrice + orderPrice * 0.002}, not order`);
                continue;
            }
            if (onlyForDown && triggerPx >= currentPrice) {
                this.logger.log(`at percentage: ${percentage * 100}%,onlyForDown is true and triggerPx: ${triggerPx} >= currentPrice: ${currentPrice}, not order`);
                continue;
            }
            // minimum number of coin to sell must greater than amountOfUsdtPerStep in config     
            let sz = numberOfBoughtCoin * percentageOfNUmberOfBoughtCoinToSell;
            if (sz * orderPrice < amountOfUsdtPerStep) {
                sz = amountOfUsdtPerStep / orderPrice;
            }
            totalNnumberOfCoinWillBeSell += sz;
            this.logger.log(`Placed take profit price order for ${coin.toUpperCase()} at percentage: ${percentage * 100}%, sz: ${sz}, px: ${orderPrice} and triggerPx: ${triggerPx}, cost: ${orderPrice * sz}, testing mode: ${testing}`);
            const res = await this.placeOneOrder(coin, 'sell', sz.toFixed(szToFixed), triggerPx.toFixed(priceToFixed), orderPrice.toFixed(priceToFixed), testing);
            data.push({ data: res.data, step: `take_profit_${(percentage * 100).toFixed(1)}%`, body: res.body });

            if (justOneOrder) {
                break;
            }
        }
        return data;
    }

    async placeStopLossOrder(coin: string, testing: boolean = true) {
        this.logger.log(`Starting to place stop loss order for ${coin.toUpperCase()}, testing mode: ${testing}`, null, coin);
        const stopLossRatio = this.config.get<number>('stopLossRatio');
        if (!stopLossRatio || stopLossRatio <= 0) {
            throw new Error(`Invalid configuration: stopLossRatio (${stopLossRatio}) must be greater than 0`);
        }
        const coinConfig = this.config.get<any>(`coin.${coin.toUpperCase()}`);
        this.logger.log(`Placing stop loss order for ${coin.toUpperCase()} with config: ${JSON.stringify(coinConfig)}`, null, coin);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { priceToFixed } = coinConfig;

        const instId = `${coin.toUpperCase()}-USDT`;
        const currentPrice = await this.getTicker(instId);
        this.logger.log(`Current price: ${currentPrice}`, null, coin);
        const data = [];
        // stop loss
        const coinBalanceData = await this.getAccountBalance(coin);
        const numberOfBoughtCoin = coinBalanceData?.data[0]?.details[0]?.availBal;
        this.logger.log(`numberOfBoughtCoin: ${numberOfBoughtCoin}`, null, coin);
        if (!numberOfBoughtCoin || numberOfBoughtCoin <= 0) {
            return data;
        }
        const avarageCost = Number(coinBalanceData?.data[0]?.details[0]?.openAvgPx ?? 0);
        this.logger.log(`avarageCost: ${avarageCost}`, null, coin);
        if (avarageCost <= 0 || avarageCost < currentPrice) {
            return data;
        }
        // const stopLossPrice = avarageCost * (1 - stopLossRatio);
        const stopLossPrice = currentPrice * (1 - stopLossRatio);
        const triggerPx = stopLossPrice + stopLossPrice * 0.002;
        this.logger.log(`Calculated stop loss price: ${stopLossPrice}, triggerPx: ${triggerPx}`, null, coin);
        const res = await this.placeOneOrder(coin, 'sell', numberOfBoughtCoin, triggerPx.toFixed(priceToFixed), stopLossPrice.toFixed(priceToFixed), testing);
        data.push({ data: res.data, step: 'stoploss', body: res.body });
        return data;
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
            side,                 // 'buy' hoặc 'sell'
            ordType: 'trigger',   // lệnh kích hoạt
            sz,                   // khối lượng
            triggerPx,            // giá kích hoạt
            orderPx: orderPx ?? '-1', // '-1' = market price
        };

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

    async buyOneCoin(isTesting: boolean, removeExistingBuyOrders: string, coin: string, results: any[], autobuy: string) {
        if (!isTesting) {
            if (removeExistingBuyOrders === 'true') {
                const res1 = await this.cancelOpenConditionSpotOrdersForOneCoin(coin, 'buy');
                this.logger.log('Cancel existing buy orders:', JSON.stringify(res1, null, 2));
                results.push({ coin, action: 'cancel_existing_buy_orders', result: res1 });
            }
        }

        if (autobuy === 'true') {
            const res4 = await this.autobuyFromMaxPriceToStopLostPriceForUp(coin, isTesting);
            this.logger.log('Palce auto buy order:', JSON.stringify(res4, null, 2));
            results.push({ coin, action: 'place_auto_buy_order', result: res4 });
        }
    }

    async sellOneCoin({ coin, isTesting, removeExistingSellOrders, addSellStopLoss, addSellTakeProfit, onlyForDown, justOneOrder, results }: { isTesting: boolean, removeExistingSellOrders: string, coin: string, addSellStopLoss: string, addSellTakeProfit: string, onlyForDown: string, justOneOrder: string, results: any[] }) {
        if (!isTesting) {
            if (removeExistingSellOrders === 'true') {
                const res1 = await this.cancelOpenConditionSpotOrdersForOneCoin(coin, 'sell', onlyForDown === 'true');
                this.logger.log('Cancel existing sell orders:', JSON.stringify(res1, null, 2), coin);
                results.push({ coin, action: 'cancel_existing_sell_orders', result: res1 });
            }
        }

        if (addSellStopLoss === 'true') {
            const res2 = await this.placeStopLossOrder(coin, isTesting);
            this.logger.log('Place stop loss order:', JSON.stringify(res2, null, 2), coin);
            results.push({ coin, action: 'place_stop_loss_order', result: res2 });
        }
        // if (addSellTakeProfit === 'true') {
        //     const res4 = await this.placeTakeProfitOrder(coin, onlyForDown === 'true', justOneOrder === 'true', isTesting);
        //     this.logger.log('Place take profit order:', JSON.stringify(res4, null, 2));
        //     results.push({ coin, action: 'place_take_profit_order', result: res4 });
        // }
        if (addSellTakeProfit === 'true') {
            const res4 = await this.autoSellFromMinPriceToStopLossPriceForDown(coin, isTesting);
            this.logger.log('Place auto sell order:', JSON.stringify(res4, null, 2), coin);
            results.push({ coin, action: 'place_auto_sell_order', result: res4 });
        }
    }
}

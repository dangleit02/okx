import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';
import { AppLogger } from 'src/logger/logger.service';
import { TradeOneCoinParams } from 'src/interfaces/interface';
import { EmailService } from 'src/email/email.service';

export type FutureDirection = 'long' | 'short';
export type FutureOrderIntent = 'open' | 'close' | 'all';

export interface FutureRangeOptions {
    numberOfOrders?: number;
    stopLossPrice?: number;
    testing?: boolean;
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
    ) { }

    // ---------- abstract methods child must implement ----------
    protected abstract includePosSide(): boolean;
    protected abstract getPosSide(direction: 'long' | 'short'): 'long' | 'short' | undefined;

    protected getPositionMode() {
        return this.includePosSide() ? 'hedge' : 'oneway';
    }

    protected getFutureLogFileKey(direction?: FutureDirection, coin: string = 'ALL') {
        return `${coin.toUpperCase()}_${direction ?? 'all'}_${this.getPositionMode()}`;
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

    protected sign(timestamp: string, method: string, requestPath: string, body: string = '') {
        const prehash = timestamp + method.toUpperCase() + requestPath + body;
        return crypto.createHmac('sha256', this.config.get<string>('okx.secretKeyHEDGE')).update(prehash).digest('base64');
    }

    protected buildHeaders(timestamp: string, method: string, path: string, body: string = '') {
        const prehash = timestamp + method + path + body;
        const sign = this.signRequest(this.config.get<string>('okx.secretKeyHEDGE'), prehash);

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

    // ---------- instrument cache & helpers ----------
    // cache instId => instrument data
    private instrumentCache: Map<string, any> = new Map();

    protected async fetchInstrument(instId: string) {
        // use cached if available
        const key = instId;
        if (this.instrumentCache.has(key)) return this.instrumentCache.get(key);

        try {
            const url = `${this.config.get<string>('okx.baseUrl')}/api/v5/public/instruments?instId=${encodeURIComponent(instId)}&instType=SWAP`;
            const res = await axios.get(url);
            const inst = res.data?.data?.[0] || null;
            if (inst) {
                // normalize numeric fields
                inst.lotSz = Number(inst.lotSz);
                inst.minSz = Number(inst.minSz || inst.lotSz || 0);
                inst.tickSz = Number(inst.tickSz || 0.0001);
                inst.ctVal = Number(inst.ctVal || 1);
                // store
                this.instrumentCache.set(key, inst);
                this.logger.log(`Fetched instrument for ${instId}: ${JSON.stringify(inst)}`);
                this.logger.log(`lotSz=${inst.lotSz}, minSz=${inst.minSz}, tickSz=${inst.tickSz}`);
                return inst;
            }
            return null;
        } catch (err: any) {
            this.logger.error(`Error fetching instrument for ${instId}`, err.response?.data || err.message);
            return null;
        }
    }

    // compute decimal places of a number like 0.0001 -> 4; 1 -> 0
    protected decimalPlaces(x: number) {
        if (!isFinite(x)) return 0;
        let e = 1, p = 0;
        while (Math.round(x * e) / e !== x) { e *= 10; p++; if (p > 18) break; }
        // fallback: convert to string
        const s = String(x);
        if (s.indexOf('.') >= 0) return s.split('.')[1].length;
        return 0;
    }

    // format size: floor to lot size multiple, ensure >= minSz
    protected formatSize(rawSz: number, inst: any) {
        const lot = Number(inst.lotSz || inst.minSz || 1);
        if (!lot || lot <= 0) throw new Error(`Invalid lot size for ${inst.instId}`);
        // floor to multiple of lot
        const multiplier = Math.floor(rawSz / lot);
        const sz = multiplier * lot;
        const minSz = Number(inst.minSz || lot);
        if (sz < minSz) {
            this.logger.warn(`Computed size ${sz} is less than minSz ${minSz} for ${inst.instId}, multiplier: ${multiplier}, returning 0`);
            return 0;
        }
        // avoid floating rounding issues: fix decimals according to lot
        const decimals = this.decimalPlaces(lot);
        return Number(sz.toFixed(decimals));
    }

    // format price: round to nearest tick
    protected formatPrice(rawPx: number, inst: any) {
        const tick = Number(inst.tickSz || 0.0001);
        if (!tick || tick <= 0) throw new Error(`Invalid tick size for ${inst.instId}`);
        const rounded = Math.round(rawPx / tick) * tick;
        const decimals = this.decimalPlaces(tick);
        return Number(rounded.toFixed(decimals));
    }

    protected contractsForNotional(notionalUsdt: number, price: number, inst: any) {
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
            this.logger.error(`Error fetching ticker for ${instId}`, err.response?.data || err.message);
            return null;
        }
    }

    // ---------- pending orders (per coin or all) ----------
    async getPendingTriggerOrdersForCoin(coin: string, instType: 'SWAP' | 'SPOT' = 'SWAP') {
        return this.getPendingAlgoOrdersForCoin(coin, 'trigger', instType);
    }

    async getPendingConditionalOrdersForCoin(coin: string, instType: 'SWAP' | 'SPOT' = 'SWAP') {
        return this.getPendingAlgoOrdersForCoin(coin, 'conditional', instType);
    }

    private async getPendingAlgoOrdersForCoin(
        coin: string,
        ordType: 'trigger' | 'conditional',
        instType: 'SWAP' | 'SPOT' = 'SWAP',
    ) {
        const timestamp = new Date().toISOString();
        const instId = `${coin.toUpperCase()}-USDT-${instType}`;
        const getPath = `/api/v5/trade/orders-algo-pending?instType=${instType}&ordType=${ordType}&instId=${instId}`;
        const getSign = this.sign(timestamp, 'GET', getPath);

        const res = await axios.get(this.config.get<string>('okx.baseUrl') + getPath, {
            headers: {
                'OK-ACCESS-KEY': this.config.get<string>('okx.apiKeyHEDGE'),
                'OK-ACCESS-SIGN': getSign,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphraseHEDGE'),
            },
        });

        if (res.data?.code !== undefined && String(res.data.code) !== '0') {
            throw new Error(`OKX rejected pending ${ordType} orders request: ${JSON.stringify(res.data)}`);
        }

        return res.data?.data || [];
    }

    async getAllPendingTriggerOrders(instType: 'SWAP' | 'SPOT' = 'SWAP') {
        const timestamp = new Date().toISOString();
        const ordType = 'trigger';
        const getPath = `/api/v5/trade/orders-algo-pending?instType=${instType}&ordType=${ordType}`;
        const getSign = this.sign(timestamp, 'GET', getPath);

        const getRes = await axios.get(this.config.get<string>('okx.baseUrl') + getPath, {
            headers: {
                'OK-ACCESS-KEY': this.config.get<string>('okx.apiKeyHEDGE'),
                'OK-ACCESS-SIGN': getSign,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphraseHEDGE'),
            },
        });

        return getRes.data?.data || [];
    }

    private getOrderIntent(order: any, direction: FutureDirection): 'open' | 'close' {
        const openSide = direction === 'long' ? 'buy' : 'sell';
        return order.side === openSide ? 'open' : 'close';
    }

    private filterOrdersByDirectionAndIntent(
        orders: any[],
        direction: FutureDirection,
        intent: FutureOrderIntent = 'all',
    ) {
        const posSideOrders = this.includePosSide()
            ? orders.filter((order) => !order.posSide || order.posSide === direction)
            : orders;
        return posSideOrders.filter((order) =>
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
        const orders = this.filterOrdersByDirectionAndIntent(
            await this.getAllPendingTriggerOrders('SWAP'),
            direction,
            intent,
        );
        const byCoin = new Map<string, any[]>();
        for (const order of orders) {
            const coin = String(order.instId ?? '').split('-')[0].toUpperCase();
            if (!byCoin.has(coin)) byCoin.set(coin, []);
            byCoin.get(coin)!.push(order);
        }
        const result = {
            direction,
            intent,
            orderCount: orders.length,
            coins: Array.from(byCoin.entries()).map(([coin, coinOrders]) => ({
                coin,
                instId: `${coin}-USDT-SWAP`,
                orderCount: coinOrders.length,
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
    ) {
        const normalizedCoin = coin.toUpperCase();
        this.logger.log(
            `FUTURE ${this.getPositionMode()} cancel one coin start: coin=${normalizedCoin}, direction=${direction}, intent=${intent}`,
            null,
            this.getFutureLogFileKey(direction, normalizedCoin),
        );
        const orders = this.filterOrdersByDirectionAndIntent(
            await this.getPendingTriggerOrdersForCoin(coin, 'SWAP'),
            direction,
            intent,
        );
        const result = await this.cancelOrdersFromList({ orders });
        this.logger.log(
            `FUTURE ${this.getPositionMode()} cancel one coin result: coin=${normalizedCoin}, direction=${direction}, intent=${intent}, matched=${orders.length}, result=${JSON.stringify(result)}`,
            null,
            this.getFutureLogFileKey(direction, normalizedCoin),
        );
        if (orders.length > 0) {
            await this.sendFutureEmail(`Cancel ${direction} ${intent} orders ${normalizedCoin}`, {
                mode: this.getPositionMode(),
                coin: normalizedCoin,
                direction,
                intent,
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

    async cancelFutureOrdersForAllCoins(
        direction: FutureDirection,
        intent: FutureOrderIntent = 'all',
    ) {
        this.logger.log(
            `FUTURE ${this.getPositionMode()} cancel all start: direction=${direction}, intent=${intent}`,
            null,
            this.getFutureLogFileKey(direction),
        );
        const orders = this.filterOrdersByDirectionAndIntent(
            await this.getAllPendingTriggerOrders('SWAP'),
            direction,
            intent,
        );
        const result = await this.cancelOrdersFromList({ orders });
        this.logger.log(
            `FUTURE ${this.getPositionMode()} cancel all result: direction=${direction}, intent=${intent}, matched=${orders.length}, result=${JSON.stringify(result)}`,
            null,
            this.getFutureLogFileKey(direction),
        );
        if (orders.length > 0) {
            await this.sendFutureEmail(`Cancel all ${direction} ${intent} orders`, {
                mode: this.getPositionMode(),
                direction,
                intent,
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

    // ---------- cancel helper that takes a list of orders and cancels them (supports filtering) ----------
    async cancelOrdersFromList(
        {
            orders,
            direction,
            enableTakeProfit = false,
            partialCloseOnRetrace = false,
            autoTrade = false
        }: {
            orders: any[],
            direction?: 'long' | 'short',
            enableTakeProfit?: boolean,
            partialCloseOnRetrace?: boolean,
            autoTrade?: boolean
        }
    ) {
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
            filtered = filtered.filter(o => o.side === sideToKeep);
        }

        // if retrace-only filter: we need to keep only orders that are retrace for their own coin
        if (partialCloseOnRetrace && filtered.length > 0) {
            const byCoin = new Map<string, any[]>();
            filtered.forEach(o => {
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
                    const isRetrace = direction === 'long' ? (Number(o.ordPx) < currentPrice) : (Number(o.ordPx) > currentPrice);
                    if (isRetrace) finalFiltered.push(o);
                }
            }
            filtered = finalFiltered;
        }

        if (!filtered.length) return { cancelled: [] };

        // chunk cancel (OKX safe chunk size 20)
        const payloadItems = filtered.map(o => ({ algoId: o.algoId, instId: o.instId }));
        const chunks = this.chunk(payloadItems, 20);
        const results: any[] = [];

        for (const chunk of chunks) {
            const bodyString = JSON.stringify(chunk);
            const cancelPath = '/api/v5/trade/cancel-algos';
            const tsCancel = new Date().toISOString();
            const headersCancel = this.buildHeaders(tsCancel, 'POST', cancelPath, bodyString);

            const cancelRes = await axios.post(this.config.get<string>('okx.baseUrl') + cancelPath, bodyString, { headers: headersCancel });
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
            this.logger.warn(`Instrument info not available for ${instId}, aborting openPosition`, null, this.getFutureLogFileKey(direction, coin));
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
            throw new Error(`Computed size after applying lot size is zero. rawSz=${rawSz}, lotSz=${inst.lotSz}, minSz=${inst.minSz}`);
        }

        // order/trigger price formatting
        let formattedTriggerPx: number | undefined = undefined;
        let formattedOrderPx: number | undefined = undefined;
        if (triggerPx) {
            const rawTrigger = Number(triggerPx);
            if (!isFinite(rawTrigger)) throw new Error(`Invalid triggerPx: ${triggerPx}`);
            formattedTriggerPx = this.formatPrice(rawTrigger, inst);
        }
        if (orderPx && orderPx !== '-1') {
            const rawOrder = Number(orderPx);
            if (!isFinite(rawOrder)) throw new Error(`Invalid orderPx: ${orderPx}`);
            formattedOrderPx = this.formatPrice(rawOrder, inst);
        }

        const rawStopLoss = Number(stopLossPx);
        if (!stopLossPx || !isFinite(rawStopLoss) || rawStopLoss <= 0) {
            throw new Error(`A valid stopLossPx is required for every ${direction} entry order`);
        }
        const formattedStopLossPx = this.formatPrice(rawStopLoss, inst);
        const referenceEntryPrice = formattedOrderPx ?? formattedTriggerPx;
        if (referenceEntryPrice !== undefined) {
            const invalidStopLoss = direction === 'long'
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
        const posSide = this.includePosSide() ? this.getPosSide(direction) : undefined;

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
                orderPx: formattedOrderPx !== undefined ? formattedOrderPx.toString() : orderPx, // keep '-1' if market
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
        body.attachAlgoOrds = [{
            slTriggerPx: formattedStopLossPx.toString(),
            slTriggerPxType: 'last',
            slOrdPx: '-1',
        }];

        const timestamp = new Date().toISOString();
        const futureLeverage = this.config.get<number>('futureLeverage') || 1;
        this.logger.log(`FutureLeverage: ${futureLeverage} (long and short)`);
                    
        // set leverage if desired (example sets to 1 for both posSides only when not testing)
        if (!testing) {
            try {
                // some coins require posSide param for setLeverage when in hedge mode
                if (this.includePosSide()) {
                    this.logger.log(`Setting leverage for ${instId} to ${futureLeverage} (long and short)`);
                    await this.setLeverage(instId, futureLeverage, 'long');
                    await this.setLeverage(instId, futureLeverage, 'short');
                } else {
                    // for one-way mode OKX may not accept posSide param; call without posSide if needed
                    await this.setLeverage(instId, 1).catch(() => { /* ignore */ });
                }
            } catch (err) {
                this.logger.warn(`setLeverage failed for ${instId}: ${err?.response?.data || err?.message}`);
                // not fatal — continue
            }
        }

        const prehash = timestamp + 'POST' + requestPath + JSON.stringify(body);
        const sign = this.signRequest(this.config.get<string>('okx.secretKeyHEDGE')!, prehash);

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
            }
            this.logger.log(
                `FUTURE ${this.getPositionMode()} open order result: coin=${coin.toUpperCase()}, direction=${direction}, testing=${testing}, result=${JSON.stringify(res?.data ?? { preview: true })}`,
                null,
                this.getFutureLogFileKey(direction, coin),
            );
            return { data: res?.data, body };
        } catch (error: any) {
            this.logger.error('Error opening position:', JSON.stringify(error.response?.data || error.message), null, this.getFutureLogFileKey(direction, coin));
            throw error;
        }
    }

    async closePartialPosition(
        coin: string,
        direction: 'long' | 'short',
        sz: string,
        triggerPx: string,
        orderPx?: string,
        testing: boolean = true
    ) {
        const instId = `${coin.toUpperCase()}-USDT-SWAP`;
        const inst = await this.fetchInstrument(instId);
        if (!inst) {
            this.logger.warn(`Instrument info not available for ${instId}, aborting closePartialPosition`, null, this.getFutureLogFileKey(direction, coin));
            throw new Error(`Instrument info not available for ${instId}`);
        }

        // parse inputs
        let rawSz = Number(sz);
        if (!isFinite(rawSz) || rawSz <= 0) throw new Error(`Invalid size: ${sz}`);

        const formattedSz = this.formatSize(rawSz, inst);
        if (!formattedSz || formattedSz <= 0) {
            throw new Error(`Computed size after applying lot size is zero. rawSz=${rawSz}, lotSz=${inst.lotSz}, minSz=${inst.minSz}`);
        }

        const rawTrigger = Number(triggerPx);
        if (!isFinite(rawTrigger)) throw new Error(`Invalid triggerPx: ${triggerPx}`);
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
        const posSide = this.includePosSide() ? this.getPosSide(direction) : undefined;

        const body: any = {
            instId,
            tdMode,
            side,
            ordType: 'trigger',
            sz: formattedSz.toString(),
            triggerPx: formattedTrigger.toString(),
            orderPx: formattedOrderPx !== undefined ? formattedOrderPx.toString() : (orderPx ?? '-1'),
            reduceOnly: true,
        };
        if (posSide) body.posSide = posSide;

        const prehash = timestamp + 'POST' + requestPath + JSON.stringify(body);
        const sign = this.signRequest(this.config.get<string>('okx.secretKeyHEDGE')!, prehash);

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
            }
            this.logger.log(
                `FUTURE ${this.getPositionMode()} close order result: coin=${coin.toUpperCase()}, direction=${direction}, testing=${testing}, result=${JSON.stringify(res?.data ?? { preview: true })}`,
                null,
                this.getFutureLogFileKey(direction, coin),
            );
            return { data: res?.data, body };
        } catch (error: any) {
            this.logger.error('Error placing close partial position trigger:', JSON.stringify(error.response?.data || error.message), null, this.getFutureLogFileKey(direction, coin));
            throw error;
        }
    }

    // ---------- open position abstraction used by autoOpenPosition ----------
    protected async getOpenPosition(instId: string) {
        const method = 'GET';
        const requestPath = instId
            ? `/api/v5/account/positions?instId=${instId}`
            : '/api/v5/account/positions?instType=SWAP';
        const body = '';
        const timestamp = new Date().toISOString();

        const prehash = timestamp + method + requestPath + body;
        const sign = this.signRequest(this.config.get<string>('okx.secretKeyHEDGE'), prehash);

        const headers = {
            'OK-ACCESS-KEY': this.config.get<string>('okx.apiKeyHEDGE'),
            'OK-ACCESS-SIGN': sign,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphraseHEDGE'),
            'Content-Type': 'application/json',
        };

        const url = this.config.get<string>('okx.baseUrl') + requestPath;
        const response = await axios.get(url, { headers });

        return response.data;
    }

    protected selectPositionForDirection(positions: any[], direction: FutureDirection) {
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

        if (!Number.isFinite(size) || size <= 0) throw new Error(`Invalid stop-loss size: ${size}`);
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
        const headers = this.buildHeaders(timestamp, 'POST', requestPath, bodyString);
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
                const rejectedItem = responseData?.data?.find((item: any) => item.sCode && item.sCode !== '0');
                if (responseData?.code !== '0' || rejectedItem) {
                    throw new Error(`OKX rejected stop-loss order: ${JSON.stringify(responseData)}`);
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

    async ensurePositionStopLoss(
        coin: string,
        direction: FutureDirection,
        testing: boolean = true,
    ) {
        const normalizedCoin = coin.toUpperCase();
        const instId = `${normalizedCoin}-USDT-SWAP`;
        const logFileKey = this.getFutureLogFileKey(direction, normalizedCoin);
        const positionResponse = await this.getOpenPosition(instId);
        if (positionResponse?.code !== undefined && String(positionResponse.code) !== '0') {
            throw new Error(`OKX rejected position request for ${instId}: ${JSON.stringify(positionResponse)}`);
        }
        const position = this.selectPositionForDirection(positionResponse?.data ?? [], direction);
        const positionSize = Math.abs(Number(position?.pos ?? 0));

        if (!Number.isFinite(positionSize) || positionSize <= 0) {
            const result = {
                status: 'no_open_position',
                coin: normalizedCoin,
                direction,
                positionSize: 0,
                protectedSize: 0,
                missingSize: 0,
            };
            this.logger.log(
                `FUTURE ${this.getPositionMode()} ensure stop-loss skipped: coin=${normalizedCoin}, direction=${direction}, reason=no_open_position`,
                null,
                logFileKey,
            );
            return result;
        }

        const closeSide = direction === 'long' ? 'sell' : 'buy';
        const conditionalOrders = await this.getPendingConditionalOrdersForCoin(normalizedCoin, 'SWAP');
        const stopLossOrders = conditionalOrders.filter((order: any) => {
            const matchesDirection = !this.includePosSide() || order.posSide === direction;
            const hasMarketStopLoss = Number(order.slTriggerPx) > 0
                && String(order.slOrdPx ?? '') === '-1';
            return matchesDirection && order.side === closeSide && hasMarketStopLoss;
        });
        const protectedSizeRaw = stopLossOrders.reduce((total: number, order: any) => {
            if (String(order.closeFraction ?? '') === '1') return positionSize;
            const orderSize = Number(order.sz ?? 0);
            return total + (Number.isFinite(orderSize) && orderSize > 0 ? orderSize : 0);
        }, 0);
        const protectedSize = Math.min(positionSize, protectedSizeRaw);
        const missingSize = Math.max(0, positionSize - protectedSize);

        const inst = await this.fetchInstrument(instId);
        if (!inst) throw new Error(`Instrument info not available for ${instId}`);
        const sizeTolerance = Number(inst.lotSz || inst.minSz || 1) * 1e-8;
        if (missingSize <= sizeTolerance) {
            const result = {
                status: 'already_protected',
                coin: normalizedCoin,
                direction,
                positionSize,
                protectedSize,
                missingSize: 0,
                protectedOrderCount: stopLossOrders.length,
            };
            this.logger.log(
                `FUTURE ${this.getPositionMode()} ensure stop-loss complete: coin=${normalizedCoin}, direction=${direction}, status=already_protected, positionSize=${positionSize}, protectedSize=${protectedSize}, missingSize=0`,
                null,
                logFileKey,
            );
            return result;
        }
        const formattedMissingSize = this.formatSize(missingSize + sizeTolerance, inst);
        if (!formattedMissingSize) {
            const message = `Cannot protect missing position size for ${instId}: missingSize=${missingSize}, minSz=${inst.minSz}`;
            this.logger.error(message, null, null, logFileKey);
            throw new Error(message);
        }

        const stopLossRatio = Number(this.config.get<number>('stopLossBuyPriceRatio'));
        if (!Number.isFinite(stopLossRatio) || stopLossRatio <= 0 || stopLossRatio >= 1) {
            throw new Error(`Invalid stopLossBuyPriceRatio: ${stopLossRatio}`);
        }
        const currentPrice = await this.getTicker(instId);
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
            throw new Error(`Invalid current price for ${instId}: ${currentPrice}`);
        }
        const rawStopLossPrice = direction === 'long'
            ? currentPrice * (1 - stopLossRatio)
            : currentPrice * (1 + stopLossRatio);
        const order = await this.placePositionStopLoss(
            normalizedCoin,
            direction,
            formattedMissingSize,
            rawStopLossPrice,
            testing,
        );
        const result = {
            status: testing ? 'preview' : 'submitted',
            coin: normalizedCoin,
            direction,
            positionSize,
            protectedSize,
            missingSize: formattedMissingSize,
            protectedOrderCount: stopLossOrders.length,
            currentPrice,
            stopLossPrice: Number(order.body.slTriggerPx),
            order,
        };
        this.logger.log(
            `FUTURE ${this.getPositionMode()} ensure stop-loss complete: coin=${normalizedCoin}, direction=${direction}, status=${result.status}, positionSize=${positionSize}, protectedSize=${protectedSize}, missingSize=${formattedMissingSize}, stopLossPrice=${result.stopLossPrice}`,
            null,
            logFileKey,
        );
        if (!testing) {
            await this.sendFutureEmail(`Ensure ${direction} stop-loss ${normalizedCoin}`, {
                mode: this.getPositionMode(),
                ...result,
                order: order.body,
                response: order.data,
            });
        }
        return result;
    }

    private normalizePosition(position: any, direction: FutureDirection) {
        const signedSize = Number(position?.pos ?? 0);
        return {
            ...position,
            coin: String(position?.instId ?? '').split('-')[0].toUpperCase(),
            direction,
            size: Math.abs(signedSize),
            averagePrice: Number(position?.avgPx ?? 0),
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
                if (positionDirection !== 'long' && positionDirection !== 'short') return [];
                if (direction && positionDirection !== direction) return [];
                return [this.normalizePosition(position, positionDirection)];
            }
            const positionDirection: FutureDirection = Number(position.pos) > 0 ? 'long' : 'short';
            if (direction && positionDirection !== direction) return [];
            return [this.normalizePosition(position, positionDirection)];
        });
        const result = { direction: direction ?? 'all', positionCount: normalized.length, positions: normalized };
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
        if (!Number.isFinite(minPrice) || minPrice <= 0 || !Number.isFinite(maxPrice) || maxPrice <= minPrice) {
            throw new Error(`Invalid entry range: minPrice=${minPrice}, maxPrice=${maxPrice}`);
        }
        const numberOfOrders = Math.ceil(options.numberOfOrders ?? 10);
        if (!Number.isFinite(numberOfOrders) || numberOfOrders <= 0) {
            throw new Error(`Invalid numberOfOrders: ${options.numberOfOrders}`);
        }

        const stopLossRatio = this.config.get<number>('stopLossBuyPriceRatio');
        const stopLossPrice = options.stopLossPrice ?? (direction === 'long'
            ? minPrice * (1 - stopLossRatio)
            : maxPrice * (1 + stopLossRatio));
        if (!Number.isFinite(stopLossPrice) || stopLossPrice <= 0) {
            throw new Error(`Invalid stopLossPrice: ${stopLossPrice}`);
        }
        if (direction === 'long' && stopLossPrice >= minPrice) {
            throw new Error(`Long stopLossPrice (${stopLossPrice}) must be below minPrice (${minPrice})`);
        }
        if (direction === 'short' && stopLossPrice <= maxPrice) {
            throw new Error(`Short stopLossPrice (${stopLossPrice}) must be above maxPrice (${maxPrice})`);
        }

        const amountPerOrder = this.config.get<number>('amountOfUsdtPerStep');
        if (!Number.isFinite(amountPerOrder) || amountPerOrder <= 0) {
            throw new Error(`Invalid amountOfUsdtPerStep: ${amountPerOrder}`);
        }
        const inst = await this.fetchInstrument(`${normalizedCoin}-USDT-SWAP`);
        if (!inst) throw new Error(`Instrument info not available for ${normalizedCoin}-USDT-SWAP`);
        const distance = numberOfOrders === 1 ? 0 : (maxPrice - minPrice) / (numberOfOrders - 1);
        const results: any[] = [];
        for (let step = 0; step < numberOfOrders; step++) {
            const orderPrice = direction === 'long'
                ? maxPrice - step * distance
                : minPrice + step * distance;
            const triggerPrice = direction === 'long'
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

    private async getPositionSnapshot(coin: string, direction: FutureDirection) {
        const instId = `${coin.toUpperCase()}-USDT-SWAP`;
        const response = await this.getOpenPosition(instId);
        const position = this.selectPositionForDirection(response?.data ?? [], direction);
        const size = Math.abs(Number(position?.pos ?? 0));
        if (!position || !Number.isFinite(size) || size <= 0) {
            return { instId, position: undefined, size: 0 };
        }
        return { instId, position, size };
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
            const noPositionResult = { status: 'no_open_position', coin: normalizedCoin, direction, testing };
            this.logger.log(
                `FUTURE ${this.getPositionMode()} close trigger skipped: coin=${normalizedCoin}, direction=${direction}, reason=no_open_position`,
                null,
                this.getFutureLogFileKey(direction, normalizedCoin),
            );
            return noPositionResult;
        }
        const currentPrice = currentPriceOverride
            ?? await this.getTicker(`${coin.toUpperCase()}-USDT-SWAP`);
        if (!currentPrice || currentPrice <= 0) {
            throw new Error(`Invalid current price: ${currentPrice}`);
        }
        const size = snapshot.size * percentage / 100;
        const isStopLoss = direction === 'long'
            ? triggerPrice < currentPrice
            : triggerPrice > currentPrice;
        const orderPrice = isStopLoss
            ? '-1'
            : (direction === 'long'
                ? triggerPrice * (1 - 0.002)
                : triggerPrice * (1 + 0.002)).toString();
        const result = await this.closePartialPosition(
            coin,
            direction,
            size.toString(),
            triggerPrice.toString(),
            orderPrice,
            testing,
        );
        const response = {
            status: testing ? 'preview' : 'submitted',
            coin: normalizedCoin,
            direction,
            percentage,
            closeType: isStopLoss ? 'stop_loss' : 'take_profit',
            executionType: isStopLoss ? 'market' : 'limit',
            ...result,
        };
        this.logger.log(
            `FUTURE ${this.getPositionMode()} close trigger complete: coin=${normalizedCoin}, direction=${direction}, testing=${testing}, closeType=${response.closeType}, executionType=${response.executionType}, triggerPx=${result.body.triggerPx}, orderPx=${result.body.orderPx}, size=${result.body.sz}`,
            null,
            this.getFutureLogFileKey(direction, normalizedCoin),
        );
        if (!testing) {
            await this.sendFutureEmail(`Close ${direction} ${response.closeType} ${normalizedCoin}`, {
                mode: this.getPositionMode(),
                coin: normalizedCoin,
                direction,
                percentage,
                currentPrice,
                closeType: response.closeType,
                executionType: response.executionType,
                triggerPx: result.body.triggerPx,
                orderPx: result.body.orderPx,
                size: result.body.sz,
                reduceOnly: result.body.reduceOnly,
                response: result.data,
            });
        }
        return response;
    }

    async closePositionAtCurrentPrice(
        coin: string,
        direction: FutureDirection,
        percentage: number = 100,
        testing: boolean = true,
    ) {
        const currentPrice = await this.getTicker(`${coin.toUpperCase()}-USDT-SWAP`);
        if (!currentPrice || currentPrice <= 0) throw new Error(`Invalid current price: ${currentPrice}`);
        const triggerPrice = direction === 'long'
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
        const log = (...args: any[]) => this.logger.log(
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

        if (amountOfUsdtPerStep <= 10) throw new Error(`amountOfUsdtPerStep must > 10`);

        const instId = `${coin.toUpperCase()}-USDT-SWAP`;
        const currentPrice = await this.getTicker(instId);
        log(`Current price: ${currentPrice}`);

        // ====== TÍNH GIÁ ==== //
        const isLong = direction === 'long';

        const minPrice = isLong ? currentPrice * (1 + priceRatioMin) : currentPrice * (1 - priceRatioMin);
        const maxPrice = isLong ? currentPrice * (1 + priceRatioMax) : currentPrice * (1 - priceRatioMax);
        const stopLossPrice = isLong ? currentPrice * (1 - stopLossRatio) : currentPrice * (1 + stopLossRatio);

        log(`minPrice=${minPrice}, maxPrice=${maxPrice}, stopLoss=${stopLossPrice}`);

        // ====== RISK ===== //
        const inst = await this.fetchInstrument(instId);
        if (!inst) throw new Error(`Instrument info not available for ${instId}`);
        const contractValue = Number(inst.ctVal || 1);
        const amountRisk = maxUsdt * riskPerTrade;
        const totalSafeSize = amountRisk / (Math.abs(maxPrice - stopLossPrice) * contractValue);
        if (totalSafeSize <= 0) return data;

        const posData = await this.getOpenPosition(instId);
        const pos = this.selectPositionForDirection(posData?.data ?? [], direction);
        const currentSize = Math.abs(Number(pos?.pos ?? 0));
        const avgPrice = Number(pos?.avgPx ?? 0);

        log(`Open pos size ${currentSize}, avgPrice=${avgPrice}`);

        const sizeToOpen = totalSafeSize - currentSize;
        if (sizeToOpen <= 0) return data;

        const costUsdt = sizeToOpen * contractValue * (stopLossPrice + maxPrice) / 2;
        const steps = Math.ceil(costUsdt / amountOfUsdtPerStep);

        log(`Total safe size: ${totalSafeSize}, sizeToOpen: ${sizeToOpen}, costUsdt: ${costUsdt}, steps: ${steps}`);

        const stepDistance = Math.abs(stopLossPrice - maxPrice) / steps;
        const arr = Array.from({ length: steps + 1 }, (_, i) => i);

        let newTotalCost = avgPrice * currentSize;
        let newSize = currentSize;

        for await (let step of arr) {
            const orderPx = isLong ? maxPrice - step * stepDistance : maxPrice + step * stepDistance;

            const triggerPx = isLong ? orderPx - orderPx * 0.002 : orderPx + orderPx * 0.002;

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

        log(`Complete ${coin}: testing=${isTesting}, placed=${data.length}, stopLoss=${stopLossPrice}`);
        if (!isTesting && data.length > 0) {
            await this.sendFutureEmail(`Auto open ${direction} ${coin.toUpperCase()}`, {
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
            });
        }
        return data;
    }

    // ---------- take profit partial close ladder ----------
    async placeTakeProfitByClosePartialPosition(
        coin: string,
        direction: 'long' | 'short',
        enablePartialCloseOnRetrace: boolean = true,
        justOneOrder: boolean = false,
        testing: boolean = true
    ) {
        const data: any[] = [];
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');

        const normalizedCoin = coin.toUpperCase();
        const logFileKey = this.getFutureLogFileKey(direction, normalizedCoin);
        this.logger.log(`FUTURE ${this.getPositionMode()} close ladder start: coin=${normalizedCoin}, direction=${direction}, testing=${testing}, retraceOnly=${enablePartialCloseOnRetrace}, justOneOrder=${justOneOrder}`, null, logFileKey);

        const takeProfitPercentages = [0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05];
        const percentageOfPositionToClosePerStep = 0.05; // 5% position per step

        const instId = `${coin.toUpperCase()}-USDT-SWAP`;
        const currentPrice = await this.getTicker(instId);
        if (!currentPrice || currentPrice <= 0) throw new Error(`Invalid current price: ${currentPrice}`);
        const inst = await this.fetchInstrument(instId);
        if (!inst) throw new Error(`Instrument info not available for ${instId}`);

        const posData = await this.getOpenPosition(instId);
        const pos = this.selectPositionForDirection(posData?.data ?? [], direction);
        const currentSize = Math.abs(Number(pos?.pos ?? 0));
        const avgPrice = Number(pos?.avgPx ?? 0);

        if (!currentSize || currentSize <= 0 || avgPrice <= 0) {
            this.logger.log(`FUTURE ${this.getPositionMode()} close ladder skipped: coin=${normalizedCoin}, direction=${direction}, reason=no_open_position_or_average_price`, null, logFileKey);
            return data;
        }

        this.logger.log(`Current position: size=${currentSize}, avgPrice=${avgPrice}`, null, logFileKey);

        let totalSizeClosed = 0;

        for (const percentage of takeProfitPercentages) {
            if (totalSizeClosed >= currentSize) {
                this.logger.log(`totaSizeWillBeClosed: ${totalSizeClosed} >= currentSize: ${currentSize}, break the loop`, null, logFileKey);
                break;
            }

            let orderPrice: number;
            if (direction === 'long') {
                // long: take profit khi giá tăng
                orderPrice = avgPrice * (1 + percentage);
            } else {
                // short: take profit khi giá giảm
                orderPrice = avgPrice * (1 - percentage);
            }

            // trigger pricing rule (we use relation to currentPrice so trigger is placed to 'catch' price movement)
            const triggerPx = orderPrice > currentPrice ? orderPrice - orderPrice * 0.002 : orderPrice + orderPrice * 0.002;

            const isRetraceOrder = direction === 'long'
                ? triggerPx < currentPrice
                : triggerPx > currentPrice;

            if (enablePartialCloseOnRetrace && !isRetraceOrder) {
                this.logger.log(`Skipping percentage=${(percentage * 100).toFixed(1)}% as enablePartialCloseOnRetrace=true and order not in retrace direction`, null, logFileKey);
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

            const closeType = isRetraceOrder ? 'stop_loss' : 'take_profit';
            const executionOrderPrice = isRetraceOrder ? '-1' : orderPrice.toString();
            this.logger.log(`Step percentage=${(percentage * 100).toFixed(1)}%, type=${closeType}, raw sz=${sz}, orderPrice=${executionOrderPrice}, triggerPx=${triggerPx.toString()}, testing=${testing}`, null, logFileKey);

            // closePartialPosition will format the size & prices
            const res = await this.closePartialPosition(coin, direction, sz.toString(), triggerPx.toString(), executionOrderPrice, testing);

            data.push({
                data: res.data,
                step: `${closeType}_${(percentage * 100).toFixed(1)}%`,
                closeType,
                executionType: isRetraceOrder ? 'market' : 'limit',
                body: res.body,
            });

            if (justOneOrder) break;
        }

        this.logger.log(
            `FUTURE ${this.getPositionMode()} close ladder complete: coin=${normalizedCoin}, direction=${direction}, testing=${testing}, placed=${data.length}`,
            null,
            logFileKey,
        );
        if (!testing && data.length > 0) {
            await this.sendFutureEmail(`Close ${direction} ladder ${normalizedCoin}`, {
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
            });
        }
        return data;
    }

    // ---------- cancel helpers that call cancelOrdersFromList using pending orders for a coin ----------
    async cancelAllTypeOfOpenOrdersForOneCoin({
        coin,
        direction,
        enableTakeProfit,
        partialCloseOnRetrace,
        autoTrade
    }: {
        coin: string,
        direction: 'long' | 'short',
        enableTakeProfit: boolean,
        partialCloseOnRetrace: boolean,
        autoTrade: boolean
    }) {
        const allOrders = await this.getPendingTriggerOrdersForCoin(coin, 'SWAP');
        const cancelOneCoinRes = await this.cancelOrdersFromList({ orders: allOrders, direction, enableTakeProfit, partialCloseOnRetrace, autoTrade });
        return cancelOneCoinRes;
    }

    async cancelAllTypeOfOpenSwapOrders(direction: 'long' | 'short') {
        const allOrders = await this.getAllPendingTriggerOrders('SWAP');
        const cancelAllRes = await this.cancelOrdersFromList({ orders: allOrders, direction });
        return cancelAllRes;
    }

    // ---------- top-level action used by controllers ----------
    async tradeOneCoin({
        coin,
        direction, // 'long' | 'short'
        isTesting = true,
        removeExistingOrders = false,
        enableTakeProfit = false,
        partialCloseOnRetrace = false,
        justOnePartialOrder = false,
        autoTrade = false
    }: TradeOneCoinParams) {
        const results: any[] = [];

        // 1️⃣ cancel existing take profit orders if requested
        if (!isTesting && removeExistingOrders) {
            const cancelRes = await this.cancelAllTypeOfOpenOrdersForOneCoin({ coin, direction, enableTakeProfit, partialCloseOnRetrace, autoTrade });
            this.logger.log(`Cancel existing ${direction} orders: ${JSON.stringify(cancelRes, null, 2)}`, null, this.getFutureLogFileKey(direction, coin));
            results.push({ coin, action: 'cancel_existing_orders', direction, result: cancelRes });
        }

        // 2️⃣ place take profit partial close
        if (enableTakeProfit) {
            const partialRes = await this.placeTakeProfitByClosePartialPosition(
                coin,
                direction,
                partialCloseOnRetrace,
                justOnePartialOrder,
                isTesting
            );
            this.logger.log(`Place partial close orders for ${direction}: ${JSON.stringify(partialRes, null, 2)}`, null, this.getFutureLogFileKey(direction, coin));
            results.push({ coin, action: 'place_partial_close_orders', direction, result: partialRes });
        }

        // 3️⃣ auto open
        if (autoTrade) {
            const autoRes = await this.autoOpenPosition({ coin, direction, isTesting });
            this.logger.log(`Place auto ${direction} orders: ${JSON.stringify(autoRes, null, 2)}`, null, this.getFutureLogFileKey(direction, coin));
            results.push({ coin, action: 'place_auto_order', direction, result: autoRes });
        }

        return results;
    }

    async setLeverage(instId: string, leverage: number, posSide: 'long' | 'short' = null) {
        const timestamp = new Date().toISOString();
        const requestPath = '/api/v5/account/set-leverage';

        const body = {
            instId,
            lever: String(leverage),
            mgnMode: 'isolated',
            posSide: posSide
        };
        if (posSide === null) {
            delete body.posSide;
        }
        const prehash = timestamp + 'POST' + requestPath + JSON.stringify(body);
        const sign = this.signRequest(
            this.config.get<string>('okx.secretKeyHEDGE'),
            prehash
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
            this.logger.error('Error setting leverage:', error.response?.data || error.message);
            throw error;
        }
    }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';
import { AppLogger } from './common/logger.service';
import { TradeOneCoinParams } from './interfaces/interface';

/**
 * Base service: contains shared logic. Child classes must implement:
 *  - includePosSide(): boolean
 *  - getPosSide(direction): 'long' | 'short' | undefined
 */
@Injectable()
export abstract class OkxFutureBaseService {
    constructor(protected config: ConfigService, protected readonly logger: AppLogger) { }

    // ---------- abstract methods child must implement ----------
    protected abstract includePosSide(): boolean;
    protected abstract getPosSide(direction: 'long' | 'short'): 'long' | 'short' | undefined;

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
                // store
                this.instrumentCache.set(key, inst);
                this.logger.log(`Fetched instrument for ${instId}: ${JSON.stringify(inst)}`);
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
        if (sz < minSz) return 0;
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
        const timestamp = new Date().toISOString();
        const ordType = 'trigger';
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
        testing: boolean = true
    ) {
        const instId = `${coin.toUpperCase()}-USDT-SWAP`;
        const inst = await this.fetchInstrument(instId);
        if (!inst) {
            this.logger.warn(`Instrument info not available for ${instId}, aborting openPosition`);
            throw new Error(`Instrument info not available for ${instId}`);
        }

        // parse and format sizes/prices
        let rawSz = Number(sz);
        if (!isFinite(rawSz) || rawSz <= 0) throw new Error(`Invalid size: ${sz}`);
        let formattedSz = rawSz;
        if (rawSz > 1) {
            formattedSz = this.formatSize(rawSz, inst);
            if (!formattedSz || formattedSz <= 0) {
                throw new Error(`Computed size after applying lot size is zero. rawSz=${rawSz}, lotSz=${inst.lotSz}, minSz=${inst.minSz}`);
            }
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

        const timestamp = new Date().toISOString();

        // set leverage if desired (example sets to 1 for both posSides only when not testing)
        if (!testing) {
            try {
                // some coins require posSide param for setLeverage when in hedge mode
                if (this.includePosSide()) {
                    await this.setLeverage(instId, 1, 'long');
                    await this.setLeverage(instId, 1, 'short');
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
            let res;
            if (!testing) {
                res = await axios.post(url, body, { headers });
            }
            return { data: res?.data, body };
        } catch (error: any) {
            this.logger.error('Error opening position:', error.response?.data || error.message);
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
            this.logger.warn(`Instrument info not available for ${instId}, aborting closePartialPosition`);
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
            let res;
            if (!testing) {
                res = await axios.post(url, body, { headers });
            }
            return { data: res?.data, body };
        } catch (error: any) {
            this.logger.log('Error placing close partial position trigger:', error.response?.data || error.message);
            throw error;
        }
    }

    // ---------- open position abstraction used by autoOpenPosition ----------
    protected async getOpenPosition(instId: string) {
        const method = 'GET';
        const requestPath = `/api/v5/account/positions?instId=${instId}`;
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
        const log = (...args: any[]) => this.logger.log(`[${direction.toUpperCase()}]`, ...args);

        const maxUsdt = this.config.get<number>('maxUsdt');
        const riskPerTrade = this.config.get<number>('riskPerTrade');
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
        const priceRatioMin = this.config.get<number>('minPriceRatio');
        const priceRatioMax = this.config.get<number>('maxPriceRatio');
        const stopLossRatio = this.config.get<number>('stopLossPriceRatio');

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
        const amountRisk = maxUsdt * riskPerTrade;
        const totalSafeSize = amountRisk / Math.abs(maxPrice - stopLossPrice);
        if (totalSafeSize <= 0) return data;

        const posData = await this.getOpenPosition(instId);
        const pos = posData?.data?.[0];
        const currentSize = Number(pos?.pos ?? 0);
        const avgPrice = Number(pos?.avgPx ?? 0);

        log(`Open pos size ${currentSize}, avgPrice=${avgPrice}`);

        const sizeToOpen = totalSafeSize - currentSize;
        if (sizeToOpen <= 0) return data;

        const costUsdt = sizeToOpen * (stopLossPrice + maxPrice) / 2;
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

            const sz = amountOfUsdtPerStep / orderPx;

            log(`Step ${step}: order ${orderPx}, trigger ${triggerPx}, sz ${sz}`);

            // openPosition now formats size/price internally
            const res = await this.openPosition(coin, direction, sz.toString(), triggerPx.toString(), orderPx.toString(), isTesting);

            data.push({ step, data: res.data, body: res.body });

            // update average cost
            newTotalCost += orderPx * sz;
            newSize += sz;
            const newAvg = newTotalCost / newSize;
            log(`New avg cost = ${newAvg}`);
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
        
        this.logger.log(`Placing take profit orders for ${coin.toUpperCase()}, direction=${direction}, testing=${testing}`);

        const takeProfitPercentages = [0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05];
        const percentageOfPositionToClosePerStep = 0.05; // 5% position per step

        const instId = `${coin.toUpperCase()}-USDT-SWAP`;
        const currentPrice = await this.getTicker(instId);
        if (!currentPrice || currentPrice <= 0) throw new Error(`Invalid current price: ${currentPrice}`);

        const posData = await this.getOpenPosition(instId);
        const pos = posData?.data?.[0];
        const currentSize = Number(pos?.pos ?? 0);
        const avgPrice = Number(pos?.avgPx ?? 0);

        if (!currentSize || currentSize <= 0 || avgPrice <= 0) return data;

        this.logger.log(`Current position: size=${currentSize}, avgPrice=${avgPrice}`);

        let totalSizeClosed = 0;

        for (const percentage of takeProfitPercentages) {
            if (totalSizeClosed >= currentSize) {
                this.logger.log(`totaSizeWillBeClosed: ${totalSizeClosed} >= currentSize: ${currentSize}, break the loop`);
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
                ? (orderPrice < currentPrice || triggerPx < currentPrice)  // long nhưng giá giảm → ngược chiều
                : (orderPrice > currentPrice || triggerPx > currentPrice); // short nhưng giá tăng → ngược chiều

            if (enablePartialCloseOnRetrace && !isRetraceOrder) {
                this.logger.log(`Skipping percentage=${(percentage * 100).toFixed(1)}% as enablePartialCloseOnRetrace=true and order not in retrace direction`);
                continue;
            }

            // compute size to close
            let sz = currentSize * percentageOfPositionToClosePerStep;
            if (sz * orderPrice < amountOfUsdtPerStep) {
                sz = amountOfUsdtPerStep / orderPrice;
            }

            // cap to remaining position
            if (totalSizeClosed + sz > currentSize) {
                sz = currentSize - totalSizeClosed;
            }

            totalSizeClosed += sz;

            this.logger.log(`Step percentage=${(percentage * 100).toFixed(1)}%, raw sz=${sz}, orderPrice=${orderPrice.toString()}, triggerPx=${triggerPx.toString()}, testing=${testing}`);

            // closePartialPosition will format the size & prices
            const res = await this.closePartialPosition(coin, direction, sz.toString(), triggerPx.toString(), orderPrice.toString(), testing);

            data.push({ data: res.data, step: `take_profit_${(percentage * 100).toFixed(1)}%`, body: res.body });

            if (justOneOrder) break;
        }

        return data;
    }

    // ---------- cancel helpers that call cancelOrdersFromList using pending orders for a coin ----------
    async cancelAllTypeOfOpenOrdersForOneCoin( {
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
            this.logger.log(`Cancel existing ${direction} orders:`, JSON.stringify(cancelRes, null, 2));
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
            this.logger.log(`Place partial close orders for ${direction}:`, JSON.stringify(partialRes, null, 2));
            results.push({ coin, action: 'place_partial_close_orders', direction, result: partialRes });
        }

        // 3️⃣ auto open
        if (autoTrade) {
            const autoRes = await this.autoOpenPosition({ coin, direction, isTesting });
            this.logger.log(`Place auto ${direction} orders:`, JSON.stringify(autoRes, null, 2));
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

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';
import { AppLogger } from './common/logger.service';
import { TradeOneCoinParams } from './interfaces/interface';

@Injectable()
export class OkxFutureService {
    constructor(private config: ConfigService, private readonly logger: AppLogger) { }

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

    private async getTicker(instId: string) {
        try {
            const url = `${this.config.get<string>('okx.baseUrl')}/api/v5/market/ticker?instId=${instId}`;
            const res = await axios.get(url);

            const ticker = res.data.data?.[0];
            if (!ticker) return null;

            return Number(ticker.last);
        } catch (err) {
            this.logger.error(`Error fetching ticker for ${instId}`, err.response?.data || err.message);
            return null;
        }
    }

    async cancelAllTypeOfOpenOrdersForOneCoin(
        coin: string,
        direction: 'long' | 'short',
        enablePartialCloseOnRetrace: boolean = false
    ) {
        const allOrders = await this.getPendingTriggerOrdersForCoin(coin, 'SWAP');
        const cancelOneCoinRes = await this.cancelOrdersFromList(allOrders,direction, enablePartialCloseOnRetrace);
        return cancelOneCoinRes;
    }


    async cancelAllTypeOfOpenSwapOrders(direction: 'long' | 'short') {
        const allOrders = await this.getAllPendingTriggerOrders('SWAP');
        const cancelAllRes = await this.cancelOrdersFromList(allOrders, direction);
        return cancelAllRes
    }

    async getPendingTriggerOrdersForCoin(
        coin: string,
        instType: 'SWAP' | 'SPOT' = 'SWAP'
    ) {
        const timestamp = new Date().toISOString();
        const ordType = 'trigger';
        const instId = `${coin.toUpperCase()}-USDT-${instType}`;
        const getPath = `/api/v5/trade/orders-algo-pending?instType=${instType}&ordType=${ordType}&instId=${instId}`;
        const getSign = this.sign(timestamp, 'GET', getPath);

        const res = await axios.get(this.config.get<string>('okx.baseUrl') + getPath, {
            headers: {
                'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
                'OK-ACCESS-SIGN': getSign,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
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
                'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
                'OK-ACCESS-SIGN': getSign,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
            },
        });

        return getRes.data?.data || [];
    }

    async cancelOrdersFromList(
        orders: any[],
        direction?: 'long' | 'short',
        enablePartialCloseOnRetrace: boolean = false
    ) {
        if (!orders.length) return { cancelled: [] };

        let filtered = orders;

        // filter theo direction
        if (direction) {
            const side = direction === 'long' ? 'buy' : 'sell';
            filtered = filtered.filter(o => o.side === side);
        }

        // filter retrace nếu cần
        if (enablePartialCloseOnRetrace) {
            const coins = Array.from(new Set(filtered.map(o => o.instId.split('-')[0])));
            for (const coin of coins) {
                const instId = `${coin}-USDT-SWAP`;
                const currentPrice = await this.getTicker(instId);
                filtered = filtered.filter(o => {
                    return direction === 'long' ? o.ordPx < currentPrice : o.ordPx > currentPrice;
                });
            }
        }

        if (!filtered.length) return { cancelled: [] };

        // chunk và gửi request cancel
        const chunks = this.chunk(filtered.map(o => ({ algoId: o.algoId, instId: o.instId })), 20);
        const results: any[] = [];

        for await (const chunk of chunks) {
            const bodyString = JSON.stringify(chunk);
            const cancelPath = '/api/v5/trade/cancel-algos';
            const tsCancel = new Date().toISOString();
            const headersCancel = this.buildHeaders(tsCancel, 'POST', cancelPath, bodyString);

            const cancelRes = await axios.post(this.config.get<string>('okx.baseUrl') + cancelPath, bodyString, { headers: headersCancel });
            results.push(cancelRes.data);
        }

        return results;
    }

    async getOpenPosition(instId: string) {
        const method = 'GET';
        const requestPath = `/api/v5/account/positions?instId=${instId}`;
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

        const url = this.config.get<string>('okx.baseUrl') + requestPath;
        const response = await axios.get(url, { headers });

        return response.data;
    }

    private async autoOpenPosition({
        coin,
        direction, // 'long' | 'short'
        isTesting,
    }: {
        coin: string,
        direction: 'long' | 'short',
        isTesting: boolean
    }) {
        const data = [];
        const log = (...args) => this.logger.log(`[${direction.toUpperCase()}]`, ...args);

        const maxUsdt = this.config.get<number>('maxUsdt');
        const riskPerTrade = this.config.get<number>('riskPerTrade');
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
        const priceRatioMin = this.config.get<number>('minPriceRatio');
        const priceRatioMax = this.config.get<number>('maxPriceRatio');
        const stopLossRatio = this.config.get<number>('stopLossPriceRatio');

        log(`Start ${coin}, test=${isTesting}`);

        const coinCfg = this.config.get<any>(`coin.${coin.toUpperCase()}`);
        if (!coinCfg) throw new Error(`No config for coin ${coin}`);
        const { szToFixed, priceToFixed } = coinCfg;

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
            const orderPx = isLong
                ? maxPrice - step * stepDistance
                : maxPrice + step * stepDistance;

            const triggerPx = isLong
                ? orderPx - orderPx * 0.002
                : orderPx + orderPx * 0.002;

            // check điều kiện để tránh vượt min/max
            if (isLong && triggerPx < minPrice) break;
            if (!isLong && triggerPx > minPrice) break;

            const sz = amountOfUsdtPerStep / orderPx;

            log(`Step ${step}: order ${orderPx}, trigger ${triggerPx}, sz ${sz}`);

            const res = await this.openPosition(
                coin,
                direction,
                sz.toFixed(szToFixed),
                triggerPx.toFixed(priceToFixed),
                orderPx.toFixed(priceToFixed),
                isTesting
            );

            data.push({ step, data: res.data, body: res.body });

            // update average cost
            newTotalCost += orderPx * sz;
            newSize += sz;
            const newAvg = newTotalCost / newSize;
            log(`New avg cost = ${newAvg}`);
        }

        return data;
    }

    async placeTakeProfitByClosePartialPosition(
        coin: string,
        posSide: 'long' | 'short',
        onlyPartialCloseOnRetrace: boolean = true,
        justOneOrder: boolean = false,
        testing: boolean = true
    ) {
        const data = [];
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
        const coinConfig = this.config.get<any>(`coin.${coin.toUpperCase()}`);
        if (!coinConfig) throw new Error(`No configuration found for coin: ${coin.toUpperCase()}`);
        const { priceToFixed, szToFixed } = coinConfig;

        this.logger.log(`Placing take profit orders for ${coin.toUpperCase()}, posSide=${posSide}, testing=${testing}`);

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
                this.logger.log(`totaSizeWillBeClosed: ${totalSizeClosed} > currentSize: ${currentSize}, break the loop`);
                break;
            }

            let orderPrice: number;
            if (posSide === 'long') {
                // long: take profit khi giá tăng
                orderPrice = avgPrice * (1 + percentage);
            } else {
                // short: take profit khi giá giảm
                orderPrice = avgPrice * (1 - percentage);
            }

            // Trigger price ±0.2% để tránh không khớp ngay
            const triggerPx = orderPrice > currentPrice ? orderPrice - orderPrice * 0.002 : orderPrice + orderPrice * 0.002;

            const isRetraceOrder = posSide === 'long'
                ? (orderPrice < currentPrice || triggerPx < currentPrice)  // long nhưng giá giảm → ngược chiều
                : (orderPrice > currentPrice || triggerPx > currentPrice); // short nhưng giá tăng → ngược chiều

            if (onlyPartialCloseOnRetrace && !isRetraceOrder) {
                this.logger.log(`Skipping percentage=${(percentage * 100).toFixed(1)}% as enablePartialCloseOnRetrace=true and order not in retrace direction`);
                continue;
            }

            // Tính size đóng
            let sz = currentSize * percentageOfPositionToClosePerStep;
            if (sz * orderPrice < amountOfUsdtPerStep) {
                sz = amountOfUsdtPerStep / orderPrice;
            }

            // Tránh vượt quá position hiện tại
            if (totalSizeClosed + sz > currentSize) {
                sz = currentSize - totalSizeClosed;
            }

            totalSizeClosed += sz;

            this.logger.log(`Step percentage=${(percentage * 100).toFixed(1)}%, sz=${sz.toFixed(szToFixed)}, orderPrice=${orderPrice.toFixed(priceToFixed)}, triggerPx=${triggerPx.toFixed(priceToFixed)}, testing=${testing}`);

            const res = await this.closePartialPosition(
                coin,
                posSide,
                sz.toFixed(szToFixed),
                triggerPx.toFixed(priceToFixed),
                orderPrice.toFixed(priceToFixed),
                testing
            );

            data.push({ data: res.data, step: `take_profit_${(percentage * 100).toFixed(1)}%`, body: res.body });

            if (justOneOrder) break;
        }

        return data;
    }

    async openPosition(
        coin: string,
        posSide: 'long' | 'short',   // mở long hoặc short
        sz: string,                   // khối lượng
        triggerPx?: string,           // giá kích hoạt (optional)
        orderPx: string = '-1',       // '-1' = market
        testing: boolean = true,
    ) {
        const timestamp = new Date().toISOString();
        const instId = `${coin.toUpperCase()}-USDT-SWAP`;
        const tdMode = 'isolated';

        // xác định side đúng:
        // mở long  -> buy
        // mở short -> sell
        const side = posSide === 'long' ? 'buy' : 'sell';

        let requestPath = '';
        let body: any = {};

        // -------------------------
        // 1) Nếu có triggerPx → mở lệnh trigger
        // -------------------------
        if (triggerPx) {
            requestPath = '/api/v5/trade/order-algo';

            body = {
                instId,
                tdMode,
                ordType: 'trigger',
                posSide,
                side,         // buy long / sell short
                sz,
                triggerPx,
                orderPx,      // -1 = market
            };
        }

        // -------------------------
        // 2) Nếu không có trigger → mở market trực tiếp
        // -------------------------
        else {
            requestPath = '/api/v5/trade/order';

            body = {
                instId,
                tdMode,
                side,
                posSide,
                ordType: 'market',
                sz,
            };
        }

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
            this.logger.error(
                'Error opening position:',
                error.response?.data || error.message,
            );
            throw error;
        }
    }

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
        const results = [];

        const instId = `${coin.toUpperCase()}-USDT-SWAP`;

        // 1️⃣ Hủy lệnh tồn tại nếu cần
        if (!isTesting && removeExistingOrders) {
            const cancelRes = await this.cancelAllTypeOfOpenOrdersForOneCoin(coin, direction, partialCloseOnRetrace);
            this.logger.log(`Cancel existing ${direction} orders:`, JSON.stringify(cancelRes, null, 2));
            results.push({ coin, action: 'cancel_existing_orders', direction, result: cancelRes });
        }

        // 3️⃣ Partial Close / Take Profit
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

        // 4️⃣ Auto Open Position
        if (autoTrade) {
            const autoRes = await this.autoOpenPosition({ coin, direction, isTesting });
            this.logger.log(`Place auto ${direction} orders:`, JSON.stringify(autoRes, null, 2));
            results.push({ coin, action: 'place_auto_order', direction, result: autoRes });
        }

        return results;
    }
    
    async closePartialPosition(
        coin: string,
        posSide: 'long' | 'short',
        sz: string,
        triggerPx: string,
        orderPx?: string,
        testing: boolean = true,
    ) {
        const timestamp = new Date().toISOString();
        const requestPath = '/api/v5/trade/order-algo';

        const body: any = {
            instId: `${coin.toUpperCase()}-USDT-SWAP`,
            tdMode: 'isolated',
            side: posSide === 'long' ? 'sell' : 'buy', // nếu đang long thì sell để đóng
            posSide, // long hoặc short
            ordType: 'trigger',
            sz, // số lượng cần đóng (ví dụ: 0.5)
            triggerPx, // giá kích hoạt
            orderPx: orderPx ?? '-1', // '-1' = market
            reduceOnly: true, // chỉ đóng vị thế hiện tại
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
            this.logger.log('Error placing close partial positon trigger:', error.response?.data || error.message);
            throw error;
        }
    }
}

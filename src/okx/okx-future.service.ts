import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';
import { AppLogger } from 'src/logger/logger.service';
import { TradeOneCoinParams } from 'src/interfaces/interface';

@Injectable()
export class OkxFutureService {
    private instrumentCache = new Map<string, any>();

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

    private async fetchInstrument(instId: string) {
        if (this.instrumentCache.has(instId)) return this.instrumentCache.get(instId);
        const url = `${this.config.get<string>('okx.baseUrl')}/api/v5/public/instruments?instType=SWAP&instId=${encodeURIComponent(instId)}`;
        const response = await axios.get(url);
        const raw = response.data?.data?.[0];
        if (!raw) throw new Error(`Instrument info not available for ${instId}`);
        const instrument = {
            ...raw,
            ctVal: Number(raw.ctVal),
            lotSz: Number(raw.lotSz),
            minSz: Number(raw.minSz || raw.lotSz),
            tickSz: Number(raw.tickSz),
        };
        if (![instrument.ctVal, instrument.lotSz, instrument.minSz, instrument.tickSz].every(value => Number.isFinite(value) && value > 0)) {
            throw new Error(`Invalid SWAP instrument metadata for ${instId}: ${JSON.stringify(raw)}`);
        }
        this.instrumentCache.set(instId, instrument);
        return instrument;
    }

    private decimalPlaces(value: number) {
        const normalized = value.toString().toLowerCase();
        if (normalized.includes('e-')) return Number(normalized.split('e-')[1]);
        return normalized.split('.')[1]?.length ?? 0;
    }

    private formatSize(rawSize: number, instrument: any) {
        const multiplier = Math.floor((rawSize + instrument.lotSz * 1e-10) / instrument.lotSz);
        const size = multiplier * instrument.lotSz;
        if (size < instrument.minSz) {
            throw new Error(`Futures size is below minimum for ${instrument.instId}: rawSize=${rawSize}, minSz=${instrument.minSz}, lotSz=${instrument.lotSz}`);
        }
        return size.toFixed(this.decimalPlaces(instrument.lotSz));
    }

    private formatPrice(rawPrice: number, instrument: any) {
        const price = Math.round(rawPrice / instrument.tickSz) * instrument.tickSz;
        return price.toFixed(this.decimalPlaces(instrument.tickSz));
    }

    private contractsForNotional(amountUsdt: number, price: number, instrument: any) {
        return amountUsdt / (price * instrument.ctVal);
    }

    private assertOkxTradeAccepted(responseData: any, operation: string) {
        const rejectedItem = responseData?.data?.find(
            (item: any) => item?.sCode !== undefined && String(item.sCode) !== '0',
        );
        if (String(responseData?.code) !== '0' || rejectedItem) {
            throw new Error(`OKX rejected ${operation}: ${JSON.stringify(responseData)}`);
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
        const priceRatioMin = this.config.get<number>('minBuyPriceRatio');
        const priceRatioMax = this.config.get<number>('maxBuyPriceRatio');
        const stopLossRatio = this.config.get<number>('stopLossBuyPriceRatio');

        log(`Start ${coin}, test=${isTesting}`);

        const coinCfg = this.config.get<any>(`coin.${coin.toUpperCase()}`);
        if (!coinCfg) throw new Error(`No config for coin ${coin}`);
        const { priceToFixed } = coinCfg;

        if (amountOfUsdtPerStep <= 10)
            throw new Error(`amountOfUsdtPerStep must > 10`);

        const instId = `${coin.toUpperCase()}-USDT-SWAP`;
        const instrument = await this.fetchInstrument(instId);
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

        const totalSafeSize = amountRisk / (
            Math.abs(maxPrice - stopLossPrice) * instrument.ctVal
        );
        if (totalSafeSize <= 0) return data;

        const posData = await this.getOpenPosition(instId);
        const pos = posData?.data?.[0];
        const currentSize = Number(pos?.pos ?? 0);
        const avgPrice = Number(pos?.avgPx ?? 0);

        log(`Open pos size ${currentSize}, avgPrice=${avgPrice}`);

        const sizeToOpen = totalSafeSize - currentSize;
        if (sizeToOpen <= 0) return data;

        const costUsdt = sizeToOpen * instrument.ctVal * (stopLossPrice + maxPrice) / 2;
        const steps = Math.ceil(costUsdt / amountOfUsdtPerStep);

        log(`Total safe size: ${totalSafeSize}, sizeToOpen: ${sizeToOpen}, costUsdt: ${costUsdt}, steps: ${steps}`);

        const stepDistance = Math.abs(stopLossPrice - maxPrice) / steps;

        const arr = Array.from({ length: steps + 1 }, (_, i) => i);

        let newTotalCost = avgPrice * currentSize * instrument.ctVal;
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

            const sz = this.contractsForNotional(
                amountOfUsdtPerStep,
                orderPx,
                instrument,
            );

            log(`Step ${step}: order ${orderPx}, trigger ${triggerPx}, sz ${sz}`);

            const res = await this.openPosition(
                coin,
                direction,
                sz.toString(),
                triggerPx.toFixed(priceToFixed),
                orderPx.toFixed(priceToFixed),
                isTesting,
                stopLossPrice.toFixed(priceToFixed),
            );

            data.push({ step, data: res.data, body: res.body });

            // update average cost
            newTotalCost += orderPx * sz * instrument.ctVal;
            newSize += sz;
            const newAvg = newTotalCost / (newSize * instrument.ctVal);
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
        const { priceToFixed } = coinConfig;
        const minClosePriceRatio = coinConfig.minClosePriceRatio
            ?? this.config.get<number>('minClosePriceRatio');
        const maxClosePriceRatio = coinConfig.maxClosePriceRatio
            ?? this.config.get<number>('maxClosePriceRatio');

        this.logger.log(`Placing take profit orders for ${coin.toUpperCase()}, posSide=${posSide}, testing=${testing}`);

        const numberOfCloseOrders = 10;
        const percentageOfPositionToClosePerStep = 0.05; // 5% position per step

        const instId = `${coin.toUpperCase()}-USDT-SWAP`;
        const instrument = await this.fetchInstrument(instId);
        const currentPrice = await this.getTicker(instId);
        if (!currentPrice || currentPrice <= 0) throw new Error(`Invalid current price: ${currentPrice}`);

        const posData = await this.getOpenPosition(instId);
        const pos = posData?.data?.[0];
        const currentSize = Number(pos?.pos ?? 0);
        const avgPrice = Number(pos?.avgPx ?? 0);

        if (!currentSize || currentSize <= 0) return data;

        const minClosePrice = posSide === 'long'
            ? currentPrice * (1 - maxClosePriceRatio)
            : currentPrice * (1 + minClosePriceRatio);
        const maxClosePrice = posSide === 'long'
            ? currentPrice * (1 - minClosePriceRatio)
            : currentPrice * (1 + maxClosePriceRatio);
        const closePriceDistance = (maxClosePrice - minClosePrice) / (numberOfCloseOrders - 1);

        this.logger.log(`Current position: size=${currentSize}, avgPrice=${avgPrice} for reporting only, minClosePrice=${minClosePrice}, maxClosePrice=${maxClosePrice}`);

        let totalSizeClosed = 0;

        for (let stepIndex = 0; stepIndex < numberOfCloseOrders; stepIndex++) {
            if (totalSizeClosed >= currentSize) {
                this.logger.log(`totaSizeWillBeClosed: ${totalSizeClosed} > currentSize: ${currentSize}, break the loop`);
                break;
            }

            const orderPrice = minClosePrice + stepIndex * closePriceDistance;

            // Trigger price ±0.2% để tránh không khớp ngay
            const triggerPx = orderPrice > currentPrice ? orderPrice - orderPrice * 0.002 : orderPrice + orderPrice * 0.002;

            const isRetraceOrder = posSide === 'long'
                ? (orderPrice < currentPrice || triggerPx < currentPrice)  // long nhưng giá giảm → ngược chiều
                : (orderPrice > currentPrice || triggerPx > currentPrice); // short nhưng giá tăng → ngược chiều

            if (onlyPartialCloseOnRetrace && !isRetraceOrder) {
                this.logger.log(`Skipping step=${stepIndex} as enablePartialCloseOnRetrace=true and order not in retrace direction`);
                continue;
            }

            // Tính size đóng
            let sz = currentSize * percentageOfPositionToClosePerStep;
            if (sz * orderPrice * instrument.ctVal < amountOfUsdtPerStep) {
                sz = this.contractsForNotional(
                    amountOfUsdtPerStep,
                    orderPrice,
                    instrument,
                );
            }

            // Tránh vượt quá position hiện tại
            if (totalSizeClosed + sz > currentSize) {
                sz = currentSize - totalSizeClosed;
            }

            totalSizeClosed += sz;

            this.logger.log(`Step index=${stepIndex}, raw sz=${sz}, orderPrice=-1, triggerPx=${triggerPx.toFixed(priceToFixed)}, testing=${testing}`);

            const res = await this.closePartialPosition(
                coin,
                posSide,
                sz.toString(),
                triggerPx.toFixed(priceToFixed),
                '-1',
                testing
            );

            data.push({ data: res.data, step: `current_price_close_${stepIndex}`, body: res.body });

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
        stopLossPx?: string,
    ) {
        const timestamp = new Date().toISOString();
        const instId = `${coin.toUpperCase()}-USDT-SWAP`;
        const instrument = await this.fetchInstrument(instId);
        const tdMode = 'isolated';
        const formattedSize = this.formatSize(Number(sz), instrument);
        const formattedTriggerPx = triggerPx
            ? this.formatPrice(Number(triggerPx), instrument)
            : undefined;
        const formattedOrderPx = orderPx !== '-1'
            ? this.formatPrice(Number(orderPx), instrument)
            : '-1';
        const formattedStopLossPx = this.formatPrice(Number(stopLossPx), instrument);

        // xác định side đúng:
        // mở long  -> buy
        // mở short -> sell
        const side = posSide === 'long' ? 'buy' : 'sell';
        const parsedStopLoss = Number(formattedStopLossPx);
        if (!stopLossPx || !Number.isFinite(parsedStopLoss) || parsedStopLoss <= 0) {
            throw new Error(`A valid stopLossPx is required for every ${posSide} entry order`);
        }
        const referenceEntryPrice = Number(formattedOrderPx !== '-1' ? formattedOrderPx : formattedTriggerPx);
        if (Number.isFinite(referenceEntryPrice)) {
            const invalidStopLoss = posSide === 'long'
                ? parsedStopLoss >= referenceEntryPrice
                : parsedStopLoss <= referenceEntryPrice;
            if (invalidStopLoss) {
                throw new Error(`Invalid ${posSide} stopLossPx ${parsedStopLoss} for entry price ${referenceEntryPrice}`);
            }
        }

        let requestPath = '';
        let body: any = {};

        // -------------------------
        // 1) Nếu có triggerPx → mở lệnh trigger
        // -------------------------
        if (formattedTriggerPx) {
            requestPath = '/api/v5/trade/order-algo';

            body = {
                instId,
                tdMode,
                ordType: 'trigger',
                posSide,
                side,         // buy long / sell short
                sz: formattedSize,
                triggerPx: formattedTriggerPx,
                orderPx: formattedOrderPx,
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
                sz: formattedSize,
            };
        }
        body.attachAlgoOrds = [{
            slTriggerPx: formattedStopLossPx,
            slTriggerPxType: 'last',
            slOrdPx: '-1',
        }];

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
                this.assertOkxTradeAccepted(res.data, 'legacy future open order');
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
        const instId = `${coin.toUpperCase()}-USDT-SWAP`;
        const instrument = await this.fetchInstrument(instId);
        const formattedSize = this.formatSize(Number(sz), instrument);
        const formattedTriggerPx = this.formatPrice(Number(triggerPx), instrument);
        const formattedOrderPx = orderPx && orderPx !== '-1'
            ? this.formatPrice(Number(orderPx), instrument)
            : '-1';

        const body: any = {
            instId,
            tdMode: 'isolated',
            side: posSide === 'long' ? 'sell' : 'buy', // nếu đang long thì sell để đóng
            posSide, // long hoặc short
            ordType: 'trigger',
            sz: formattedSize,
            triggerPx: formattedTriggerPx,
            orderPx: formattedOrderPx,
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
                this.assertOkxTradeAccepted(res.data, 'legacy future close order');
            }
            return { data: res?.data, body };
        } catch (error) {
            this.logger.log('Error placing close partial positon trigger:', error.response?.data || error.message);
            throw error;
        }
    }
}

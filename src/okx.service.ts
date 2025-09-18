import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';
import { AppLogger } from './common/logger.service';
import { min } from 'rxjs';

@Injectable()
export class OkxService {
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

    async cancelOpenOrdersForOneCoin(coin: string, instType: string = 'SPOT') {
        const timestamp = new Date().toISOString();

        // 1. Get open orders
        const instId = `${coin}-USDT`; // coin cụ thể
        const getPath = `/api/v5/trade/orders-pending?instType=${instType}&instId=${instId}`;
        const getSign = this.sign(timestamp, 'GET', getPath);
        const pendingRes = await axios.get(
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

        const orders = pendingRes.data.data;
        if (!orders.length) return { msg: 'No open orders' };

        // 2. Cancel in batch (20 each)
        const batches = [];
        for (let i = 0; i < orders.length; i += 20) {
            const chunk = orders.slice(i, i + 20);
            batches.push(chunk);
        }

        const results = [];
        for (const batch of batches) {
            const cancelBody = {
                instId: batch[0].instId, // OKX yêu cầu cùng instId trong 1 batch
                ordIds: batch.map(o => o.ordId),
            };

            const cancelPath = '/api/v5/trade/cancel-batch-orders';
            const cancelTimestamp = new Date().toISOString();
            const cancelSign = this.sign(cancelTimestamp, 'POST', cancelPath, JSON.stringify(cancelBody));

            const res = await axios.post(
                this.config.get<string>('okx.baseUrl') + cancelPath,
                cancelBody,
                {
                    headers: {
                        'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
                        'OK-ACCESS-SIGN': cancelSign,
                        'OK-ACCESS-TIMESTAMP': cancelTimestamp,
                        'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
                        'Content-Type': 'application/json',
                    },
                }
            );

            results.push(res.data);
        }

        return results;
    }

    async cancelAllOpenOrders(instType: string = 'SPOT') {
        const timestamp = new Date().toISOString();

        // 1. Get open orders
        const getPath = `/api/v5/trade/orders-pending?instType=${instType}`;
        const getSign = this.sign(timestamp, 'GET', getPath);
        const pendingRes = await axios.get(
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

        const orders = pendingRes.data.data;
        if (!orders.length) return { msg: 'No open orders' };

        // 2. Cancel in batch (20 each)
        const batches = [];
        for (let i = 0; i < orders.length; i += 20) {
            const chunk = orders.slice(i, i + 20);
            batches.push(chunk);
        }

        const results = [];
        for (const batch of batches) {
            const cancelBody = {
                instId: batch[0].instId, // OKX yêu cầu cùng instId trong 1 batch
                ordIds: batch.map(o => o.ordId),
            };

            const cancelPath = '/api/v5/trade/cancel-batch-orders';
            const cancelTimestamp = new Date().toISOString();
            const cancelSign = this.sign(cancelTimestamp, 'POST', cancelPath, JSON.stringify(cancelBody));

            const res = await axios.post(
                this.config.get<string>('okx.baseUrl') + cancelPath,
                cancelBody,
                {
                    headers: {
                        'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
                        'OK-ACCESS-SIGN': cancelSign,
                        'OK-ACCESS-TIMESTAMP': cancelTimestamp,
                        'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
                        'Content-Type': 'application/json',
                    },
                }
            );

            results.push(res.data);
        }

        return results;
    }

    async cancelOpenConditionalOrdersForOneCoin(coin: string, instType: string = 'SPOT') {
        const timestamp = new Date().toISOString();

        // 1. Get open orders
        const instId = `${coin}-USDT`; // coin cụ thể
        const ordType = 'trigger';  // bắt buộc
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
            this.logger.log('✅ No pending algo orders to cancel.');
            return { message: 'No pending algo orders' };
        }

        // 2. Chuẩn hoá orders để huỷ
        const ordersToCancel = pendingOrders.map((o: any) => ({
            algoId: o.algoId,
            instId: o.instId,
        }));

        this.logger.log(`Found ${ordersToCancel.length} pending algo orders. Cancelling...`);

        // 3) OKX may accept at most N items per request—safe to chunk (use 20)
        const chunks = this.chunk(ordersToCancel, 20);
        const results: any[] = [];

        for (const chunk of chunks) {
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

    async cancelAllOpenConditionalOrders(instType: string = 'SPOT') {
        const timestamp = new Date().toISOString();

        // 1. Get open orders
        const ordType = 'trigger';  // bắt buộc
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
            this.logger.log('✅ No pending algo orders to cancel.');
            return { message: 'No pending algo orders' };
        }

        // 2. Chuẩn hoá orders để huỷ
        const ordersToCancel = pendingOrders.map((o: any) => ({
            algoId: o.algoId,
            instId: o.instId,
        }));

        this.logger.log(`Found ${ordersToCancel.length} pending algo orders. Cancelling...`);

        // 3) OKX may accept at most N items per request—safe to chunk (use 20)
        const chunks = this.chunk(ordersToCancel, 20);
        const results: any[] = [];

        for (const chunk of chunks) {
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

    private sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getTicker(instId: string) {
        const url = `${this.config.get<string>('okx.baseUrl')}/api/v5/market/ticker?instId=${instId}`;
        const res = await axios.get(url);
        return parseFloat(res.data.data[0]?.last);
    }

    async getAccountBalance() {
        const method = 'GET';
        const requestPath = '/api/v5/account/balance';
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

    async placeMultipleBuyOrders(coin: string, testing: boolean = true) {
        this.logger.log(`Starting to place multiple orders for ${coin}, testing mode: ${testing}`);
        const coinConfig = this.config.get<any>(`coin.${coin}`);
        this.logger.log(`Placing multiple orders for ${coin} with config: ${JSON.stringify(coinConfig)}`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { maxUsdt, minBuyPrice, maxBuyPrice, stopLossPrice, amountOfUsdtPerStep, riskPerTrade, addForTriggerPrice, szToFixed, priceToFixed } = coinConfig;
        if (minBuyPrice >= maxBuyPrice) {
            throw new Error(`Invalid configuration: minBuyPrice (${minBuyPrice}) must be less than maxBuyPrice (${maxBuyPrice})`);
        }
        if (amountOfUsdtPerStep <= 10) {
            throw new Error(`Invalid configuration: amountOfUsdtPerStep (${amountOfUsdtPerStep}) must be greater than 10 USDT`);
        }
        if (stopLossPrice >= minBuyPrice) {
            throw new Error(`Invalid configuration: stopLossPrice (${stopLossPrice}) must be less than minBuyPrice (${minBuyPrice})`);
        }
        const avarageBuyPrice = (minBuyPrice + maxBuyPrice) / 2; // 2.2655 USDT
        const amountOfUsdtRisk = maxUsdt * riskPerTrade; // 30 USDT
        const numberOfCoinToBuy = (amountOfUsdtRisk / (avarageBuyPrice - stopLossPrice));
        const costByUsdt = numberOfCoinToBuy * avarageBuyPrice;
        const numberOfSteps = Math.ceil(costByUsdt / amountOfUsdtPerStep);
        const priceDistanceBetweenEachStep = (maxBuyPrice - minBuyPrice) / numberOfSteps;

        const steps = Array.from({ length: numberOfSteps + 1 }, (_, i) => i);

        const data = [];
        const instId = `${coin}-USDT`;
        const currentPrice = await this.getTicker(instId);
        if (!currentPrice || currentPrice <= 0) {
            throw new Error(`Invalid current price fetched for ${instId}: ${currentPrice}`);
        }
        await this.sleep(1000); // wait 1 second before each call
        try {
            for await (let step of steps) {
                const orderPx = minBuyPrice + step * priceDistanceBetweenEachStep;
                const triggerPx = orderPx - addForTriggerPrice; // giá kích hoạt thấp hơn giá đặt lệnh giới hạn một chút
                let sz;
                if (orderPx >= currentPrice) {
                    sz = amountOfUsdtPerStep / orderPx; // mua chắc chắn hơn
                } else {
                    sz = (amountOfUsdtPerStep / 2) / orderPx;
                }

                this.logger.log(`Placing order: Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`);
                const res = await this.placeOneOrder(coin, 'buy', sz.toFixed(szToFixed), triggerPx.toFixed(priceToFixed), orderPx.toFixed(priceToFixed), testing);

                data.push({ data: res.data, step, body: res.body });
            }

            // stop loss
            const res = await this.placeOneOrder(coin, 'sell', numberOfCoinToBuy.toFixed(szToFixed), stopLossPrice.toFixed(priceToFixed), null, testing);

            data.push({ data: res.data, step: 'stoploss', body: res.body });
        } catch (error) {
            this.logger.log('Error placing trigger order:', error.response?.data || error.message);
            throw error;
        }


        return data;
    }

    async placeMultipleBuyOrdersForUp(coin: string, testing: boolean = true) {
        this.logger.log(`Starting to place multiple orders for ${coin}, testing mode: ${testing}`);
        const coinConfig = this.config.get<any>(`coin.${coin}`);
        this.logger.log(`Placing multiple orders for ${coin} with config: ${JSON.stringify(coinConfig)}`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { maxUsdt, minBuyPrice, maxBuyPrice, stopLossPrice, amountOfUsdtPerStep, riskPerTrade, addForTriggerPrice, szToFixed, priceToFixed } = coinConfig;
        if (minBuyPrice >= maxBuyPrice) {
            throw new Error(`Invalid configuration: minBuyPrice (${minBuyPrice}) must be less than maxBuyPrice (${maxBuyPrice})`);
        }
        if (amountOfUsdtPerStep <= 10) {
            throw new Error(`Invalid configuration: amountOfUsdtPerStep (${amountOfUsdtPerStep}) must be greater than 10 USDT`);
        }
        if (stopLossPrice >= minBuyPrice) {
            throw new Error(`Invalid configuration: stopLossPrice (${stopLossPrice}) must be less than minBuyPrice (${minBuyPrice})`);
        }
        const avarageBuyPrice = (minBuyPrice + maxBuyPrice) / 2; // 2.2655 USDT
        const amountOfUsdtRisk = maxUsdt * riskPerTrade; // 30 USDT
        const numberOfCoinToBuy = (amountOfUsdtRisk / (avarageBuyPrice - stopLossPrice));
        const costByUsdt = numberOfCoinToBuy * avarageBuyPrice;
        const numberOfSteps = Math.ceil(costByUsdt / amountOfUsdtPerStep);
        const priceDistanceBetweenEachStep = (maxBuyPrice - minBuyPrice) / numberOfSteps;

        const steps = Array.from({ length: numberOfSteps + 1 }, (_, i) => i);

        const data = [];
        const instId = `${coin}-USDT`;
        const currentPrice = await this.getTicker(instId);
        this.logger.log(`Current price: ${currentPrice}`);

        try {
            for await (let step of steps) {
                const previousOrderPx = minBuyPrice + (step - 1) * priceDistanceBetweenEachStep;
                const orderPx = previousOrderPx + priceDistanceBetweenEachStep;
                const triggerPx = orderPx - addForTriggerPrice * 10; // giá kích hoạt thấp hơn giá đặt lệnh giới hạn một chút
                const sz = amountOfUsdtPerStep / orderPx;
                if (previousOrderPx < currentPrice) {
                    continue
                }

                this.logger.log(`Placing order: Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`);
                const res = await this.placeOneOrder(coin, 'buy', sz.toFixed(szToFixed), triggerPx.toFixed(priceToFixed), orderPx.toFixed(priceToFixed), testing);

                data.push({ data: res.data, step, body: res.body });
            }

            // stop loss
            const res = await this.placeOneOrder(coin, 'sell', numberOfCoinToBuy.toFixed(szToFixed), stopLossPrice.toFixed(priceToFixed), null, testing);

            data.push({ data: res.data, step: 'stoploss', body: res.body });
        } catch (error) {
            this.logger.log('Error placing trigger order:', error.response?.data || error.message);
            throw error;
        }


        return data;
    }

    async placeAllBuyOrdersForUp(testing: boolean = true) {
        this.logger.log(`Starting to place all orders for all coins, testing mode: ${testing}`);
        const coinConfig = this.config.get<any>(`coin`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coins: ${JSON.stringify(coinConfig)}`);
        }
        const results = [];
        for await (const coin of Object.keys(coinConfig)) {
            this.logger.log(`Placing multiple orders for ${coin}`);
            const res = await this.placeMultipleBuyOrdersForUp(coin, testing);
            results.push({ coin, result: res });
        }
        return results;
    }

    async placeMultipleSellOrdersForDown(coin: string, testing: boolean = true) {
        this.logger.log(`Starting to place multiple orders for ${coin}, testing mode: ${testing}`);
        const coinConfig = this.config.get<any>(`coin.${coin}`);
        this.logger.log(`Placing multiple orders for ${coin} with config: ${JSON.stringify(coinConfig)}`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { maxUsdt, minBuyPrice, maxBuyPrice, stopLossPrice, amountOfUsdtPerStep, riskPerTrade, addForTriggerPrice, szToFixed, priceToFixed, numberOfBoughtCoin, maxTakeProfitPrice, minTakeProfitPrice } = coinConfig;
        if (minBuyPrice >= maxBuyPrice) {
            throw new Error(`Invalid configuration: minBuyPrice (${minBuyPrice}) must be less than maxBuyPrice (${maxBuyPrice})`);
        }
        if (amountOfUsdtPerStep <= 10) {
            throw new Error(`Invalid configuration: amountOfUsdtPerStep (${amountOfUsdtPerStep}) must be greater than 10 USDT`);
        }
        if (stopLossPrice >= minBuyPrice) {
            throw new Error(`Invalid configuration: stopLossPrice (${stopLossPrice}) must be less than minBuyPrice (${minBuyPrice})`);
        }

        if (!numberOfBoughtCoin || !maxTakeProfitPrice || !minTakeProfitPrice) {
            throw new Error(`Invalid values for take profit`);
        }

        if (maxTakeProfitPrice < minTakeProfitPrice) {
            throw new Error(`Invalid configuration: minTakeProfitPrice (${minTakeProfitPrice}) must be less than maxTakeProfitPrice (${maxTakeProfitPrice})`); 
        }

        const instId = `${coin}-USDT`;
        const currentPrice = await this.getTicker(instId);
        this.logger.log(`Current price: ${currentPrice}`);

        const amountOfBoughtCoinByUsdt = numberOfBoughtCoin * currentPrice;
        const numberOfSteps = Math.ceil(amountOfBoughtCoinByUsdt / (amountOfUsdtPerStep / 2));
        const priceDistanceBetweenEachStep = (maxTakeProfitPrice - minTakeProfitPrice) / (numberOfSteps);

        this.logger.log(`amountOfBoughtCoinByUsdt: ${amountOfBoughtCoinByUsdt}, numberOfSteps: ${numberOfSteps}, priceDistanceBetweenEachStep: ${priceDistanceBetweenEachStep}`)
        const data = [];

        try {
            let totalSz = 0;
            let previousOrderPx = maxTakeProfitPrice + priceDistanceBetweenEachStep;
            while (totalSz < numberOfBoughtCoin) {
                const triggerPx = previousOrderPx - priceDistanceBetweenEachStep;
                const orderPx = triggerPx - addForTriggerPrice * 10; // giá kích hoạt thấp hơn giá đặt lệnh giới hạn một chút
                const sz = (amountOfUsdtPerStep / 2) / orderPx;

                const res = await this.placeOneOrder(coin, 'sell', sz.toFixed(szToFixed), triggerPx.toFixed(priceToFixed), orderPx.toFixed(priceToFixed), testing);

                data.push({ data: res.data, body: res.body });

                totalSz += sz;
                previousOrderPx = triggerPx;
            }
        } catch (error) {
            this.logger.log('Error placing trigger order:', error.response?.data || error.message);
            throw error;
        }


        return data;
    }

    async placeAllSellOrdersForDown(testing: boolean = true) {
        this.logger.log(`Starting to place all orders for all coins, testing mode: ${testing}`);
        const coins = this.config.get<any>(`coinsForTakeProfit`);
        if (!coins) {
            throw new Error(`No configuration found for coins: ${JSON.stringify(coins)}`);
        }
        const results = [];
        for await (const coin of coins) {
            this.logger.log(`Placing multiple orders for ${coin}`);
            const res = await this.placeMultipleSellOrdersForDown(coin, testing);
            results.push({ coin, result: res });
        }
        return results;
    }

    async placeOneOrder(coin: string, side: 'buy' | 'sell', sz: string, triggerPx: string, orderPx?: string, testing: boolean = true) {
        const timestamp = new Date().toISOString();
        const requestPath = '/api/v5/trade/order-algo';

        const body = {
            instId: `${coin}-USDT`,
            tdMode: 'cash',
            side,                 // 'buy' hoặc 'sell'
            ordType: 'trigger', // lệnh kích hoạt
            sz,                   // khối lượng, ví dụ "5"
            triggerPx,            // giá kích hoạt
        };

        // Nếu orderPx null hoặc undefined thì dùng market (-1)
        if (orderPx) {
            body['orderPx'] = orderPx;  // lệnh limit
        } else {
            body['orderPx'] = '-1';     // khớp giá thị trường
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
            this.logger.log('Error placing trigger order:', error.response?.data || error.message);
            throw error;
        }
    }

    // Helper to chunk arrays
    private chunk<T>(arr: T[], n: number): T[][] {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
        return out;
    }
}

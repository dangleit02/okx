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

    async cancelAllTypeOfOpenOrdersForOneCoin(coin: string, instType: string = 'SPOT', side: 'buy' | 'sell' | null = null, onlyForDown: boolean = false) {
        // const res1 = await this.cancelOpenOrdersForOneCoin(coin, instType, side, onlyForDown);
        const res2 = await this.cancelOpenConditionalOrdersForOneCoin(coin, instType, side, onlyForDown);
        return { res2 };
    }

    // async cancelOpenOrdersForOneCoin(coin: string, instType: string = 'SPOT', side: 'buy' | 'sell' | null = null, onlyForDown: boolean = false) {
    //     const timestamp = new Date().toISOString();

    //     // 1. Get open orders
    //     const instId = `${coin}-USDT`; // coin cụ thể
    //     const getPath = `/api/v5/trade/orders-pending?instType=${instType}&instId=${instId}`;
    //     const getSign = this.sign(timestamp, 'GET', getPath);
    //     const pendingRes = await axios.get(
    //         this.config.get<string>('okx.baseUrl') + getPath,
    //         {
    //             headers: {
    //                 'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
    //                 'OK-ACCESS-SIGN': getSign,
    //                 'OK-ACCESS-TIMESTAMP': timestamp,
    //                 'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
    //             },
    //         }
    //     );
    //     this.logger.log(`pendingRes ${JSON.stringify(pendingRes.data)}`);

    //     const orders = pendingRes.data.data;
    //     if (!orders.length) return { msg: 'No open orders' };
    //     this.logger.log(`orders ${JSON.stringify(orders)}`);

    //     // 2. Filter theo side
    //     let ordersBySide = side ? orders.filter((order: any) => order.side === side) : orders;
    //     this.logger.log(`ordersBySide ${JSON.stringify(ordersBySide)}`);

    //     const currentPrice = await this.getTicker(instId);
    //     this.logger.log(`Current price for ${instId}: ${currentPrice}`);
    //     if (!currentPrice || currentPrice <= 0) {
    //         throw new Error(`Invalid current price fetched for ${instId}: ${currentPrice}`);
    //     }
    //     if (side === 'sell') {
    //         if (onlyForDown) {
    //             ordersBySide = ordersBySide.filter((order: any) => order.ordPx < currentPrice);
    //         } 
    //         // else {
    //         //     ordersBySide = ordersBySide.filter((order: any) => order.ordPx > currentPrice);
    //         // }
    //     }

    //     if (ordersBySide.length === 0) {
    //         this.logger.log(`No ${side.toUpperCase()} orders to cancel`);
    //         return { cancelled: [] };
    //     }
    //     // 2. Cancel in batch (20 each)
    //     const batches = [];
    //     for (let i = 0; i < ordersBySide.length; i += 20) {
    //         const chunk = orders.slice(i, i + 20);
    //         batches.push(chunk);
    //     }
    //     this.logger.log(`batches ${JSON.stringify(batches)}`);

    //     const results = [];
    //     for await (const batch of batches) {
    //         const cancelBody = {
    //             instId: batch[0].instId, // OKX yêu cầu cùng instId trong 1 batch
    //             ordIds: batch.map(o => o.ordId),
    //         };

    //         const cancelPath = '/api/v5/trade/cancel-batch-orders';
    //         const cancelTimestamp = new Date().toISOString();
    //         const cancelSign = this.sign(cancelTimestamp, 'POST', cancelPath, JSON.stringify(cancelBody));

    //         this.logger.log(`cancelBody ${JSON.stringify(cancelBody)}`);
            // const res = await axios.post(
            //     this.config.get<string>('okx.baseUrl') + cancelPath,
            //     cancelBody,
            //     {
            //         headers: {
            //             'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
            //             'OK-ACCESS-SIGN': cancelSign,
            //             'OK-ACCESS-TIMESTAMP': cancelTimestamp,
            //             'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
            //             'Content-Type': 'application/json',
            //         },
            //     }
            // );

    //         // results.push(res.data);
    //     }

    //     return results;
    // }

    cancelAllTypeOfOpenOrders(instType: string = 'SPOT', side: 'buy' | 'sell' | null = null) {
        // const res1 = await this.cancelAllOpenOrders(instType, side);
        return this.cancelAllOpenConditionalOrders(instType, side);
    }

    // async cancelAllOpenOrders(instType: string = 'SPOT', side: 'buy' | 'sell' | null = null) {
    //     const timestamp = new Date().toISOString();

    //     // 1. Get open orders
    //     const getPath = `/api/v5/trade/orders-pending?instType=${instType}`;
    //     const getSign = this.sign(timestamp, 'GET', getPath);
    //     const pendingRes = await axios.get(
    //         this.config.get<string>('okx.baseUrl') + getPath,
    //         {
    //             headers: {
    //                 'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
    //                 'OK-ACCESS-SIGN': getSign,
    //                 'OK-ACCESS-TIMESTAMP': timestamp,
    //                 'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
    //             },
    //         }
    //     );

    //     const orders = pendingRes.data.data;
    //     if (!orders.length) return { msg: 'No open orders' };

    //     // 2. Filter theo side
    //     let ordersBySide = side ? orders.filter((order: any) => order.side === side) : orders;

    //     if (ordersBySide.length === 0) {
    //         this.logger.log(`No ${side.toUpperCase()} orders to cancel`);
    //         return { cancelled: [] };
    //     }
    //     // 2. Cancel in batch (20 each)
    //     const batches = [];
    //     for (let i = 0; i < ordersBySide.length; i += 20) {
    //         const chunk = orders.slice(i, i + 20);
    //         batches.push(chunk);
    //     }

    //     const results = [];
    //     for (const batch of batches) {
    //         const cancelBody = {
    //             instId: batch[0].instId, // OKX yêu cầu cùng instId trong 1 batch
    //             ordIds: batch.map(o => o.ordId),
    //         };

    //         const cancelPath = '/api/v5/trade/cancel-batch-orders';
    //         const cancelTimestamp = new Date().toISOString();
    //         const cancelSign = this.sign(cancelTimestamp, 'POST', cancelPath, JSON.stringify(cancelBody));

    //         const res = await axios.post(
    //             this.config.get<string>('okx.baseUrl') + cancelPath,
    //             cancelBody,
    //             {
    //                 headers: {
    //                     'OK-ACCESS-KEY': this.config.get<string>('okx.apiKey'),
    //                     'OK-ACCESS-SIGN': cancelSign,
    //                     'OK-ACCESS-TIMESTAMP': cancelTimestamp,
    //                     'OK-ACCESS-PASSPHRASE': this.config.get<string>('okx.passphrase'),
    //                     'Content-Type': 'application/json',
    //                 },
    //             }
    //         );

    //         results.push(res.data);
    //     }

    //     return results;
    // }

    async cancelOpenConditionalOrdersForOneCoin(coin: string, instType: string = 'SPOT', side: 'buy' | 'sell' | null = null, onlyForDown: boolean = false) {
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
            this.logger.log(`✅ No pending algo orders to cancel for ${instId}.`);
            return { message: 'No pending algo orders' };
        }

        // 2. Filter theo side
        let ordersBySide = side ? pendingOrders.filter((order: any) => order.side === side) : pendingOrders;
        // this.logger.log(`ordersBySide ${JSON.stringify(ordersBySide)}`);
        const currentPrice = await this.getTicker(instId);
        this.logger.log(`currentPrice ${currentPrice}`);
        if (!currentPrice || currentPrice <= 0) {
            throw new Error(`Invalid current price fetched for ${instId}: ${currentPrice}`);
        }
        if (side === 'sell') {
            if (onlyForDown) {
                ordersBySide = ordersBySide.filter((order: any) => order.ordPx < currentPrice);
            }
            //  else {
            //     ordersBySide = ordersBySide.filter((order: any) => order.ordPx > currentPrice);
            // }
        }

        if (ordersBySide.length === 0) {
            this.logger.log(`No ${side.toUpperCase()} orders to cancel for ${instId}`);
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

    async cancelAllOpenConditionalOrders(instType: string = 'SPOT', side: 'buy' | 'sell' | null = null) {
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

    private sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getTicker(instId: string) {
        const url = `${this.config.get<string>('okx.baseUrl')}/api/v5/market/ticker?instId=${instId}`;
        const res = await axios.get(url);
        return parseFloat(res.data.data[0]?.last);
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

    async placeMultipleBuyOrders(coin: string, testing: boolean = true) {
        this.logger.log(`Starting to place multiple orders for ${coin}, testing mode: ${testing}`);
        const maxUsdt = this.config.get<number>('maxUsdt');
        const riskPerTrade = this.config.get<number>('riskPerTrade');
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
        const coinConfig = this.config.get<any>(`coin.${coin}`);
        this.logger.log(`Placing multiple orders for ${coin} with config: ${JSON.stringify(coinConfig)}`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { minBuyPrice, maxBuyPrice, stopLossPrice, addForTriggerPrice, szToFixed, priceToFixed } = coinConfig;
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

        if (!priceDistanceBetweenEachStep || priceDistanceBetweenEachStep <= 0) {
            this.logger.log(`priceDistanceBetweenEachStep : ${priceDistanceBetweenEachStep}`);
        }

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

    async autobuy(coin: string, testing: boolean = true) {
        const data = [];
        this.logger.log(`Starting to place auto orders for ${coin}, testing mode: ${testing}`);
        const maxUsdt = this.config.get<number>('maxUsdt');
        const riskPerTrade = this.config.get<number>('riskPerTrade');
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
        this.logger.log(`maxUsdt ${maxUsdt}, riskPerTrade ${riskPerTrade}`)
        const coinConfig = this.config.get<any>(`coin.${coin}`);
        this.logger.log(`Placing auto buy orders for ${coin} with config: ${JSON.stringify(coinConfig)}`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { szToFixed, priceToFixed } = coinConfig;
        if (amountOfUsdtPerStep <= 10) {
            throw new Error(`Invalid configuration: amountOfUsdtPerStep (${amountOfUsdtPerStep}) must be greater than 10 USDT`);
        }
        
        const instId = `${coin}-USDT`;
        const currentPrice = await this.getTicker(instId);
        this.logger.log(`Current price: ${currentPrice}`);
        const minBuyPrice = currentPrice;
        const maxBuyPrice = minBuyPrice * 1.1; // +10%
        const stopLossPrice = minBuyPrice * 0.9; // -10%

        const avarageBuyPrice = (minBuyPrice + maxBuyPrice) / 2; // 2.2655 USDT
        const amountOfUsdtRisk = maxUsdt * riskPerTrade; // 30 USDT
        this.logger.log(`minBuyPrice: ${minBuyPrice}, maxBuyPrice: ${maxBuyPrice}, stopLossPrice: ${stopLossPrice}, avarageBuyPrice ${avarageBuyPrice}, amountOfUsdtRisk ${amountOfUsdtRisk}`)

        const totalNnumberOfCoinWillBeBought = (amountOfUsdtRisk / (avarageBuyPrice - stopLossPrice));
        if (totalNnumberOfCoinWillBeBought <= 0) {
            this.logger.log(`totalNnumberOfCoinWillBeBought <= 0: ${totalNnumberOfCoinWillBeBought <= 0}`);
            return data;
        }
        
        const coinBalanceData = await this.getAccountBalance(coin);
        const numberOfBoughtCoin = Number(coinBalanceData?.data[0]?.details[0]?.availBal ?? 0);
        const numberOfCoinWillBeBought = totalNnumberOfCoinWillBeBought - numberOfBoughtCoin;
        const costByUsdt = numberOfCoinWillBeBought * avarageBuyPrice;
        const numberOfSteps = Math.ceil(costByUsdt / amountOfUsdtPerStep);
        this.logger.log(`avarageBuyPrice: ${avarageBuyPrice}, totalNnumberOfCoinWillBeBought: ${totalNnumberOfCoinWillBeBought}, numberOfBoughtCoin: ${numberOfBoughtCoin}, numberOfCoinWillBeBought: ${numberOfCoinWillBeBought}, costByUsdt: ${costByUsdt}, numberOfSteps: ${numberOfSteps}`)
        if (numberOfCoinWillBeBought <= 0) {
            this.logger.log(`numberOfCoinWillBeBought <= 0: ${numberOfCoinWillBeBought <= 0}`);
            return data;
        }
        const priceDistanceBetweenEachStep = (maxBuyPrice - minBuyPrice) / numberOfSteps;
        this.logger.log(`priceDistanceBetweenEachStep: ${priceDistanceBetweenEachStep}`);

        if (!priceDistanceBetweenEachStep || priceDistanceBetweenEachStep <= 0) {
            this.logger.log(`priceDistanceBetweenEachStep : ${priceDistanceBetweenEachStep}`);
        }

        const steps = Array.from({ length: numberOfSteps + 1 }, (_, i) => i);
        this.logger.log('steps:', JSON.stringify(steps));
        const avarageCost = Number(coinBalanceData?.data[0]?.details[0]?.openAvgPx ?? 0);
        this.logger.log(`avarageCost ${avarageCost}`);
        let newTotalCost = avarageCost * numberOfBoughtCoin;
        let newBoughtCoin = numberOfBoughtCoin;
        let newWvarageCost = avarageCost;
        try {
            for await (let step of steps) {
                const previousOrderPx = minBuyPrice + (step - 1) * priceDistanceBetweenEachStep;
                const orderPx = previousOrderPx + priceDistanceBetweenEachStep;
                // const triggerPx = orderPx - addForTriggerPrice * 10; // giá kích hoạt thấp hơn giá đặt lệnh giới hạn một chút
                const triggerPx = orderPx - orderPx * 0.002; // giá kích hoạt thấp hơn giá đặt lệnh giới hạn một chút
                const sz = amountOfUsdtPerStep / orderPx;
                this.logger.log(`step: ${step}, previousOrderPx: ${previousOrderPx}, orderPx: ${orderPx}, currentPrice: ${currentPrice}, previousOrderPx < currentPrice: ${previousOrderPx < currentPrice}`);
                if (previousOrderPx < currentPrice) {
                    continue
                }

                // if (triggerPx >= newWvarageCost) {
                //     this.logger.log(`Break triggerPx >= newWvarageCost ${newWvarageCost}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`);
                //     break;
                // }

                this.logger.log(`Placing order: Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`);
                const res = await this.placeOneOrder(coin, 'buy', sz.toFixed(szToFixed), triggerPx.toFixed(priceToFixed), orderPx.toFixed(priceToFixed), testing);

                data.push({ data: res.data, step, body: res.body });
                
                newTotalCost += orderPx * sz;
                newBoughtCoin += sz;
                newWvarageCost = newTotalCost / newBoughtCoin;
                this.logger.log(`newTotalCost ${newTotalCost}, newBoughtCoin ${newBoughtCoin}, newWvarageCost ${newWvarageCost}`);
            }

        } catch (error) {
            this.logger.log('Error placing trigger order:', error.response?.data || error.message);
            throw error;
        }


        return data;
    }

    async placeMultipleBuyOrdersForUp(coin: string, testing: boolean = true) {
        this.logger.log(`Starting to place multiple orders for ${coin}, testing mode: ${testing}`);
        const maxUsdt = this.config.get<number>('maxUsdt');
        const riskPerTrade = this.config.get<number>('riskPerTrade');
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
        const coinConfig = this.config.get<any>(`coin.${coin}`);
        this.logger.log(`Placing multiple orders for ${coin} with config: ${JSON.stringify(coinConfig)}`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { minBuyPrice, maxBuyPrice, stopLossPrice, szToFixed, priceToFixed } = coinConfig;
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

        const totalNnumberOfCoinWillBeBought = (amountOfUsdtRisk / (avarageBuyPrice - stopLossPrice));
        const data = [];
        // if (totalNnumberOfCoinWillBeBought > 0) {
        //     // stop loss
        //     const res = await this.placeOneOrder(coin, 'sell', totalNnumberOfCoinWillBeBought.toFixed(szToFixed), stopLossPrice.toFixed(priceToFixed), null, testing);

        //     data.push({ data: res.data, step: 'stoploss', body: res.body });
        // }
        const coinBalanceData = await this.getAccountBalance(coin);
        const numberOfBoughtCoin = coinBalanceData?.data[0]?.details[0]?.availBal ?? 0;
        const numberOfCoinWillBeBought = totalNnumberOfCoinWillBeBought - numberOfBoughtCoin;
        const costByUsdt = numberOfCoinWillBeBought * avarageBuyPrice;
        const numberOfSteps = Math.ceil(costByUsdt / amountOfUsdtPerStep);
        this.logger.log(`avarageBuyPrice: ${avarageBuyPrice}, totalNnumberOfCoinWillBeBought: ${totalNnumberOfCoinWillBeBought}, numberOfBoughtCoin: ${numberOfBoughtCoin}, numberOfCoinWillBeBought: ${numberOfCoinWillBeBought}, costByUsdt: ${costByUsdt}, numberOfSteps: ${numberOfSteps}`)
        if (totalNnumberOfCoinWillBeBought <= 0) {
            this.logger.log(`totalNnumberOfCoinWillBeBought <= 0: ${totalNnumberOfCoinWillBeBought <= 0}`);
            return data;
        }
        const priceDistanceBetweenEachStep = (maxBuyPrice - minBuyPrice) / numberOfSteps;
        this.logger.log(`priceDistanceBetweenEachStep: ${priceDistanceBetweenEachStep}`);

        if (!priceDistanceBetweenEachStep || priceDistanceBetweenEachStep <= 0) {
            this.logger.log(`priceDistanceBetweenEachStep : ${priceDistanceBetweenEachStep}`);
        }

        const steps = Array.from({ length: numberOfSteps + 1 }, (_, i) => i);
        this.logger.log('steps:', JSON.stringify(steps));
        const instId = `${coin}-USDT`;
        const currentPrice = await this.getTicker(instId);
        this.logger.log(`Current price: ${currentPrice}`);

        try {
            for await (let step of steps) {
                const previousOrderPx = minBuyPrice + (step - 1) * priceDistanceBetweenEachStep;
                const orderPx = previousOrderPx + priceDistanceBetweenEachStep;
                // const triggerPx = orderPx - addForTriggerPrice * 10; // giá kích hoạt thấp hơn giá đặt lệnh giới hạn một chút
                const triggerPx = orderPx - orderPx * 0.002; // giá kích hoạt thấp hơn giá đặt lệnh giới hạn một chút
                const sz = amountOfUsdtPerStep / orderPx;
                this.logger.log(`step: ${step}, previousOrderPx: ${previousOrderPx}, orderPx: ${orderPx}, currentPrice: ${currentPrice}, previousOrderPx < currentPrice: ${previousOrderPx < currentPrice}`);
                if (previousOrderPx < currentPrice) {
                    continue
                }

                this.logger.log(`Placing order: Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`);
                const res = await this.placeOneOrder(coin, 'buy', sz.toFixed(szToFixed), triggerPx.toFixed(priceToFixed), orderPx.toFixed(priceToFixed), testing);

                data.push({ data: res.data, step, body: res.body });
            }

        } catch (error) {
            this.logger.log('Error placing trigger order:', error.response?.data || error.message);
            throw error;
        }


        return data;
    }

    async placeAllBuyOrdersForUp(testing: boolean = true) {
        this.logger.log(`Starting to place all orders for all coins, testing mode: ${testing}`);
        const coins = this.config.get<any>(`coinsForBuy`);
        if (!coins) {
            throw new Error(`No configuration found for coins: ${JSON.stringify(coins)}`);
        }
        const results = [];
        for await (const coin of coins) {
            if (!testing) {
                // await this.cancelOpenOrdersForOneCoin(coin, 'SPOT');
                await this.cancelOpenConditionalOrdersForOneCoin(coin, 'SPOT');
            }
            this.logger.log(`Placing multiple orders for ${coin}`);
            const res = await this.placeMultipleBuyOrdersForUp(coin, testing);
            results.push({ coin, result: res });
        }
        return results;
    }

    async placeSurprisePriceBuyOrder(coin: string, numberOfUSDT: number, testing: boolean = true) {
        const data = [];
        const coinConfig = this.config.get<any>(`coin.${coin}`);
        this.logger.log(`Placing surprise price order for ${coin} with config: ${JSON.stringify(coinConfig)}`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { priceToFixed, szToFixed } = coinConfig;

        const surprisePricePercentage = 0.3 // % so với giá hiện tại
        this.logger.log(`Placing surprise price order for ${coin}, testing mode: ${testing}`);
        const currentPrice = await this.getTicker(`${coin}-USDT`);
        this.logger.log(`Current price: ${currentPrice}`);
        if (!currentPrice || currentPrice <= 0) {
            throw new Error(`Invalid current price fetched for ${coin}-USDT: ${currentPrice}`);
        }
        // // get balance
        // const usdtBalanceData = await this.getAccountBalance('USDT');
        // const numberOfUSDT = usdtBalanceData?.data[0]?.details[0]?.availBal;
        this.logger.log(`numberOfUSDT: ${numberOfUSDT}`);
        if (!numberOfUSDT || numberOfUSDT <= 0) {
            return data;
        }

        const orderPrice = currentPrice * (1 - surprisePricePercentage);
        const triggerPx = orderPrice + orderPrice * 0.002;
        const totalNnumberOfCoinWillBeBought = (numberOfUSDT) / orderPrice;
        this.logger.log(`Placing surprise price order for ${coin} at percentage: ${surprisePricePercentage * 100}%, px: ${orderPrice}, cost: ${totalNnumberOfCoinWillBeBought * orderPrice} testing mode: ${testing}`);
        const res = await this.placeOneOrder(coin, 'buy', totalNnumberOfCoinWillBeBought.toFixed(szToFixed), triggerPx.toFixed(priceToFixed), orderPrice.toFixed(priceToFixed), testing);
        data.push({ data: res.data, step: `surprise_${(surprisePricePercentage * 100).toFixed(1)}%`, body: res.body });

        return data;
    }

    async placeSurprisePriceSellOrder(coin: string, testing: boolean = true) {
        const data = [];
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
        const coinConfig = this.config.get<any>(`coin.${coin}`);
        this.logger.log(`Placing surprise price order for ${coin} with config: ${JSON.stringify(coinConfig)}`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { priceToFixed, szToFixed } = coinConfig;

        const surprisePricePercentage = [0.5, 0.4, 0.3, 0.2, 0.1] // % so với giá hiện tại
        const percentageOfNUmberOfBoughtCoinToSell = 0.1; // 10% số coin đã mua sẽ bán ở mỗi mức giá bất ngờ
        this.logger.log(`Placing surprise price order for ${coin}, testing mode: ${testing}`);
        const currentPrice = await this.getTicker(`${coin}-USDT`);
        this.logger.log(`Current price: ${currentPrice}`);
        if (!currentPrice || currentPrice <= 0) {
            throw new Error(`Invalid current price fetched for ${coin}-USDT: ${currentPrice}`);
        }
        // get balance
        const coinBalanceData = await this.getAccountBalance(coin);
        const numberOfBoughtCoin = coinBalanceData?.data[0]?.details[0]?.availBal;
        this.logger.log(`numberOfBoughtCoin: ${numberOfBoughtCoin}`);
        if (!numberOfBoughtCoin || numberOfBoughtCoin <= 0) {
            return data;
        }
        let totalNnumberOfCoinWillBeSell = 0;
        let totalCost = 0;
        for await (const percentage of surprisePricePercentage) {
            if (totalNnumberOfCoinWillBeSell > numberOfBoughtCoin) {
                this.logger.log(`totalNnumberOfCoinWillBeSell: ${totalNnumberOfCoinWillBeSell} > numberOfBoughtCoin: ${numberOfBoughtCoin}, break the loop`);
                break;
            }

            const orderPrice = currentPrice * (1 + percentage);
            const triggerPx = orderPrice - orderPrice * 0.002;
            // minimum number of coin to sell must greater than amountOfUsdtPerStep in config     
            let sz = numberOfBoughtCoin * percentageOfNUmberOfBoughtCoinToSell;
            if (sz * orderPrice < amountOfUsdtPerStep) {
                sz = amountOfUsdtPerStep / orderPrice;
            }
            totalNnumberOfCoinWillBeSell += sz;
            this.logger.log(`Placing surprise price order for ${coin} at percentage: ${percentage * 100}%, sz: ${sz}, px: ${orderPrice}, cost: ${orderPrice * sz}, testing mode: ${testing}`);
            const res = await this.placeOneOrder(coin, 'sell', sz.toFixed(szToFixed), triggerPx.toFixed(priceToFixed), orderPrice.toFixed(priceToFixed), testing);
            data.push({ data: res.data, step: `surprise_${(percentage * 100).toFixed(1)}%`, body: res.body });
            totalCost += orderPrice * sz;
        }
        this.logger.log(`Total cosst ${totalCost}`);
        return data;
    }

    async placeTakeProfitOrder(coin: string, onlyForDown: boolean, justOneOrder: boolean = false, testing: boolean = true) {
        const data = [];
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
        const coinConfig = this.config.get<any>(`coin.${coin}`);
        this.logger.log(`Placing surprise price order for ${coin} with config: ${JSON.stringify(coinConfig)}`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { priceToFixed, szToFixed } = coinConfig;

        const takeProfitPricePercentage = [0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05] // % so với giá hiện tại
        const percentageOfNUmberOfBoughtCoinToSell = 0.05; // 10% số coin đã mua sẽ bán ở mỗi mức giá take profit
        this.logger.log(`Placing take profit price order for ${coin}, testing mode: ${testing}`);
        const currentPrice = await this.getTicker(`${coin}-USDT`);
        this.logger.log(`Current price: ${currentPrice}`);
        if (!currentPrice || currentPrice <= 0) {
            throw new Error(`Invalid current price fetched for ${coin}-USDT: ${currentPrice}`);
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
        let totalNnumberOfCoinWillBeSell = 0;
        for await (const percentage of takeProfitPricePercentage) {
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
            this.logger.log(`Placing take profit price order for ${coin} at percentage: ${percentage * 100}%, sz: ${sz}, px: ${orderPrice} and triggerPx: ${triggerPx}, cost: ${orderPrice * sz}, testing mode: ${testing}`);
            const res = await this.placeOneOrder(coin, 'sell', sz.toFixed(szToFixed), triggerPx.toFixed(priceToFixed), orderPrice.toFixed(priceToFixed), testing);
            data.push({ data: res.data, step: `take_profit_${(percentage * 100).toFixed(1)}%`, body: res.body });

            if (justOneOrder) {
                break;
            }
        }
        return data;
    }

    async placeStopLossOrder(coin: string, testing: boolean = true) {
        this.logger.log(`Starting to place stop loss order for ${coin}, testing mode: ${testing}`);
        const coinConfig = this.config.get<any>(`coin.${coin}`);
        this.logger.log(`Placing stop loss order for ${coin} with config: ${JSON.stringify(coinConfig)}`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { stopLossPrice, priceToFixed } = coinConfig;

        const instId = `${coin}-USDT`;
        const currentPrice = await this.getTicker(instId);
        this.logger.log(`Current price: ${currentPrice}`);
        const data = [];
        // stop loss
        const coinBalanceData = await this.getAccountBalance(coin);
        const numberOfBoughtCoin = coinBalanceData?.data[0]?.details[0]?.availBal;
        this.logger.log(`numberOfBoughtCoin: ${numberOfBoughtCoin}`);
        if (!numberOfBoughtCoin || numberOfBoughtCoin <= 0) {
            return data;
        }
        const res = await this.placeOneOrder(coin, 'sell', numberOfBoughtCoin, stopLossPrice.toFixed(priceToFixed), null, testing);
        data.push({ data: res.data, step: 'stoploss', body: res.body });
        return data;
    }

    async placeMultipleSellOrdersForDown(coin: string, testing: boolean = true) {
        this.logger.log(`Starting to place multiple orders for ${coin}, testing mode: ${testing}`);
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
        const coinConfig = this.config.get<any>(`coin.${coin}`);
        this.logger.log(`Placing multiple orders for ${coin} with config: ${JSON.stringify(coinConfig)}`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { minBuyPrice, maxBuyPrice, priceToFixed, minTakeProfitPrice, maxTakeProfitPrice } = coinConfig;

        if (minBuyPrice >= maxBuyPrice) {
            throw new Error(`Invalid configuration: minBuyPrice (${minBuyPrice}) must be less than maxBuyPrice (${maxBuyPrice})`);
        }

        if (minTakeProfitPrice >= maxTakeProfitPrice) {
            throw new Error(`Invalid configuration: minTakeProfitPrice (${minTakeProfitPrice}) must be less than maxTakeProfitPrice (${maxTakeProfitPrice})`);
        }

        const instId = `${coin}-USDT`;
        const currentPrice = await this.getTicker(instId);
        this.logger.log(`Current price: ${currentPrice}`);
        // const maxPrice = Math.min(currentPrice - addForTriggerPrice * 10, maxTakeProfitPrice);
        const data = [];
        // stop loss
        const coinBalanceData = await this.getAccountBalance(coin);
        const numberOfBoughtCoin = coinBalanceData?.data[0]?.details[0]?.availBal;
        this.logger.log(`numberOfBoughtCoin: ${numberOfBoughtCoin}`);
        if (!numberOfBoughtCoin || numberOfBoughtCoin <= 0) {
            return data;
        }
        // const res = await this.placeOneOrder(coin, 'sell', numberOfBoughtCoin, stopLossPrice.toFixed(priceToFixed), null, testing);
        // data.push({ data: res.data, step: 'stoploss', body: res.body });
        // const minTakeProfitPrice = (minBuyPrice + maxBuyPrice) / 2.0;
        // const minPrice = Math.max(minTakeProfitPrice, maxBuyPrice);
        // if (maxTakeProfitPrice <= minPrice) {
        //     return data;
        // }
        // const minTakeProfitPrice = (maxTakeProfitPrice + maxBuyPrice) / 2.0;
        // if (maxTakeProfitPrice <= minTakeProfitPrice) {
        //     return data;
        // }
        const amountOfBoughtCoinByUsdt = numberOfBoughtCoin * currentPrice;
        const numberOfSteps = Math.ceil(amountOfBoughtCoinByUsdt / amountOfUsdtPerStep);
        const priceDistanceBetweenEachStep = (maxTakeProfitPrice - minTakeProfitPrice) / Math.max(numberOfSteps, 1.0);

        if (!priceDistanceBetweenEachStep || priceDistanceBetweenEachStep <= 0) {
            this.logger.log(`priceDistanceBetweenEachStep : ${priceDistanceBetweenEachStep}`);
        }

        this.logger.log(`amountOfBoughtCoinByUsdt: ${amountOfBoughtCoinByUsdt}, numberOfSteps: ${numberOfSteps}, priceDistanceBetweenEachStep: ${priceDistanceBetweenEachStep}`)

        try {
            let totalSz = 0;
            let previousOrderPx = minTakeProfitPrice - priceDistanceBetweenEachStep;
            while (totalSz < numberOfBoughtCoin) {
                const triggerPx = previousOrderPx + priceDistanceBetweenEachStep;
                // const orderPx = triggerPx - addForTriggerPrice * 10; // giá kích hoạt thấp hơn giá đặt lệnh giới hạn một chút
                const orderPx = triggerPx - triggerPx * 0.002;
                previousOrderPx = triggerPx;
                let sz = (amountOfUsdtPerStep) / orderPx;
                totalSz += sz;
                this.logger.log(`sz: ${sz}, orderPx: ${orderPx}, totalSz: ${totalSz}`);

                if (orderPx >= currentPrice) {
                    break;
                }


                const res = await this.placeOneOrder(coin, 'sell', sz.toString(), triggerPx.toFixed(priceToFixed), orderPx.toFixed(priceToFixed), testing);

                data.push({ data: res.data, body: res.body });

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

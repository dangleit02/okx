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
        const sign = this.signRequest(this.config.get<string>('okx.secretKey')!, prehash);

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

    async placeMultipleOrders(coin: string, testing: boolean = true) {
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

    async placeMultipleOrdersForUp(coin: string, testing: boolean = true) {
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
                const orderPx = minBuyPrice + step * priceDistanceBetweenEachStep;
                const triggerPx = orderPx - addForTriggerPrice; // giá kích hoạt thấp hơn giá đặt lệnh giới hạn một chút
                const sz = amountOfUsdtPerStep / orderPx;
                if (orderPx < currentPrice) {
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

    async placeAllOrdersForUp(testing: boolean = true) {
        this.logger.log(`Starting to place all orders for all coins, testing mode: ${testing}`);
        const coinConfig = this.config.get<any>(`coin`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coins: ${JSON.stringify(coinConfig)}`);
        }
        const results = [];
        for await (const coin of Object.keys(coinConfig)) {
            this.logger.log(`Placing multiple orders for ${coin}`);
            const res = await this.placeMultipleOrdersForUp(coin, testing);
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
}

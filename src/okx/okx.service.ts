import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';
import { AppLogger } from 'src/logger/logger.service';
import * as _ from 'lodash';
import { EmailService } from 'src/email/email.service';
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
            this.emailService.sendEmail(process.env.EMAIL_TO, `Number of ${side} orders of ${coin} to cancel`, 0);
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

    async autobuyFromMaxPriceToStopLostPriceForUp(coin: string, testing: boolean = true) {
        const data = [];
        this.logger.log(`Starting to place auto orders for ${coin.toUpperCase()}, testing mode: ${testing}`);
        const maxUsdt = this.config.get<number>('maxUsdt');
        const riskPerTrade = this.config.get<number>('riskPerTrade');
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
        const minBuyPriceRatio = this.config.get<number>('minBuyPriceRatio');
        const maxBuyPriceRatio = this.config.get<number>('maxBuyPriceRatio');
        const stopLossBuyPriceRatio = this.config.get<number>('stopLossBuyPriceRatio');
        const buyWithoutCheckAvarageCost = this.config.get<boolean>('buyWithoutCheckAvarageCost');

        this.logger.log(`maxUsdt ${maxUsdt}, riskPerTrade ${riskPerTrade}`)

        this.logger.log(`amountOfUsdtPerStep ${amountOfUsdtPerStep}, minBuyPriceRatio ${minBuyPriceRatio}, maxBuyPriceRatio ${maxBuyPriceRatio}, stopLossBuyPriceRatio ${stopLossBuyPriceRatio}`)
        const coinConfig = this.config.get<any>(`coin.${coin.toUpperCase()}`);
        this.logger.log(`Placing auto buy orders for ${coin.toUpperCase()} with config: ${JSON.stringify(coinConfig)}`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { szToFixed, priceToFixed } = coinConfig;
        if (amountOfUsdtPerStep <= 10) {
            throw new Error(`Invalid configuration: amountOfUsdtPerStep (${amountOfUsdtPerStep}) must be greater than 10 USDT`);
        }

        const instId = `${coin.toUpperCase()}-USDT`;
        const currentPrice = await this.getTicker(instId);
        this.logger.log(`Current price: ${currentPrice}`);
        const minBuyPrice = currentPrice * (1 + minBuyPriceRatio);
        const maxBuyPrice = currentPrice * (1 + maxBuyPriceRatio);
        const stopLossPrice = currentPrice * (1 - stopLossBuyPriceRatio);
        
        if (minBuyPrice >= maxBuyPrice || stopLossPrice >= minBuyPrice) {
            this.logger.log(`Invalid calculated prices: minBuyPrice (${minBuyPrice}) must be less than maxBuyPrice (${maxBuyPrice}) and stopLossPrice (${stopLossPrice}) must be less than minBuyPrice (${minBuyPrice})`);
            throw new Error(`Invalid calculated prices`);
        }

        const amountOfUsdtRisk = maxUsdt * riskPerTrade; // 30 USDT
        this.logger.log(`minBuyPrice: ${minBuyPrice}, maxBuyPrice: ${maxBuyPrice}, stopLossPrice: ${stopLossPrice}, amountOfUsdtRisk ${amountOfUsdtRisk}`)

        const totalNnumberOfCoinWillBeBought = (amountOfUsdtRisk / (maxBuyPrice - stopLossPrice));
        if (totalNnumberOfCoinWillBeBought <= 0) {
            this.logger.log(`totalNnumberOfCoinWillBeBought <= 0: ${totalNnumberOfCoinWillBeBought <= 0}`);
            return data;
        }

        const coinBalanceData = await this.getAccountBalance(coin);
        const numberOfBoughtCoin = Number(coinBalanceData?.data[0]?.details[0]?.availBal ?? 0);
        const numberOfCoinWillBeBought = totalNnumberOfCoinWillBeBought - numberOfBoughtCoin;
        const totalCostByUsdt = totalNnumberOfCoinWillBeBought * maxBuyPrice;
        const costByUsdt = numberOfCoinWillBeBought * (stopLossPrice + maxBuyPrice) / 2;
        const numberOfSteps = Math.ceil(costByUsdt / amountOfUsdtPerStep);
        this.logger.log(`totalNnumberOfCoinWillBeBought: ${totalNnumberOfCoinWillBeBought}, numberOfBoughtCoin: ${numberOfBoughtCoin}, numberOfCoinWillBeBought: ${numberOfCoinWillBeBought}, totalCostByUsdt ${totalCostByUsdt}, costByUsdt: ${costByUsdt}, numberOfSteps: ${numberOfSteps}`)
        if (numberOfCoinWillBeBought <= 0) {
            this.logger.log(`numberOfCoinWillBeBought <= 0: ${numberOfCoinWillBeBought <= 0}`);
            return data;
        }
        const priceDistanceBetweenEachStep = (maxBuyPrice - stopLossPrice) / numberOfSteps;
        this.logger.log(`priceDistanceBetweenEachStep: ${priceDistanceBetweenEachStep}`);

        if (!priceDistanceBetweenEachStep || priceDistanceBetweenEachStep <= 0) {
            this.logger.log(`priceDistanceBetweenEachStep : ${priceDistanceBetweenEachStep}`);
        }

        const steps = Array.from({ length: numberOfSteps + 1 }, (_, i) => i);
        this.logger.log('steps:', JSON.stringify(steps));
        const avarageCost = Number(coinBalanceData?.data[0]?.details[0]?.openAvgPx ?? 0);
        this.logger.log(`avarageCost ${avarageCost}`);
        this.emailService.sendEmail(process.env.EMAIL_TO, `Buy ${coin} status`, { info: `currentPrice ${currentPrice}, avarageCost ${avarageCost}, minBuyPrice ${minBuyPrice}, maxBuyPrice ${maxBuyPrice}, stopLossPrice ${stopLossPrice}` });
        
        const minTakeProfitPrice = avarageCost * (1 + 0.05); // tối thiểu phải có lãi 5%
        this.logger.log(`minTakeProfitPrice ${minTakeProfitPrice}`);
        let newTotalCost = avarageCost * numberOfBoughtCoin;
        let newBoughtCoin = numberOfBoughtCoin;
        let newAvarageCost = avarageCost;
        try {
            for await (let step of steps) {
                const orderPx = maxBuyPrice - step * priceDistanceBetweenEachStep;
                const triggerPx = orderPx - orderPx * 0.002; // giá kích hoạt thấp hơn giá đặt lệnh giới hạn một chút
                const sz = amountOfUsdtPerStep / orderPx;
                this.logger.log(`step: ${step}, orderPx: ${orderPx}, minBuyPrice: ${minBuyPrice}, triggerPx: ${triggerPx}, triggerPx < minBuyPrice: ${triggerPx < minBuyPrice}`);
                if (triggerPx < minBuyPrice) {
                    break;
                }

                // if (!!minTakeProfitPrice && orderPx >= minTakeProfitPrice) {
                //     this.logger.log(`Break orderPx >= minTakeProfitPrice ${minTakeProfitPrice}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`);
                //     break;
                // }

                if (!buyWithoutCheckAvarageCost && !!newAvarageCost && triggerPx >= newAvarageCost) {
                    this.logger.log(`Break triggerPx >= newWvarageCost ${newAvarageCost}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`);
                    break;
                }

                this.logger.log(`Placing order: Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`);
                const res = await this.placeOneOrder(coin, 'buy', sz.toFixed(szToFixed), triggerPx.toFixed(priceToFixed), orderPx.toFixed(priceToFixed), testing);

                data.push({ data: res.data, step, body: res.body });

                newTotalCost += orderPx * sz;
                newBoughtCoin += sz;
                newAvarageCost = newTotalCost / newBoughtCoin;
                this.logger.log(`newTotalCost ${newTotalCost}, newBoughtCoin ${newBoughtCoin}, newWvarageCost ${newAvarageCost}`);
            }

        } catch (error) {
            this.logger.log('Error placing trigger order:', error.response?.data || error.message);
            throw error;
        }
        if (data.length > 0) {
            this.emailService.sendEmail(process.env.EMAIL_TO, `Number of new buy orders for ${coin}`, data.length);
            this.emailService.sendEmail(process.env.EMAIL_TO, `New buy ${coin} orders`, data.map((item => item.body?.triggerPx)));
        }
        this.logger.log(`Current price: ${currentPrice}`);
        return data;
    }

    async autoSellFromMinPriceToStopLossPriceForDown(
        coin: string,
        testing: boolean = true
    ) {
        const data = [];
        this.logger.log(`Starting auto SELL for ${coin.toUpperCase()}, testing: ${testing}`);

        const maxUsdt = this.config.get<number>('maxUsdt');
        const riskPerTrade = this.config.get<number>('riskPerTrade');
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');

        const minSellPriceRatio = this.config.get<number>('minSellPriceRatio');
        const maxSellPriceRatio = this.config.get<number>('maxSellPriceRatio');
        const stopLossSellPriceRatio = this.config.get<number>('stopLossSellPriceRatio');

        const coinConfig = this.config.get<any>(`coin.${coin.toUpperCase()}`);
        if (!coinConfig) throw new Error(`No config for ${coin}`);

        const { szToFixed, priceToFixed } = coinConfig;

        const instId = `${coin.toUpperCase()}-USDT`;
        const currentPrice = await this.getTicker(instId);
        this.logger.log(`Current price: ${currentPrice}`);

        // SELL prices (below current)
        const minSellPrice = currentPrice * (1 - maxSellPriceRatio);
        const maxSellPrice = currentPrice * (1 - minSellPriceRatio);
        const stopLossPrice = currentPrice * (1 + stopLossSellPriceRatio);

        if (minSellPrice >= maxSellPrice || stopLossPrice <= maxSellPrice) {
            throw new Error(`Invalid SELL price configuration`);
        }

        const amountOfUsdtRisk = maxUsdt * riskPerTrade;
        const totalCoinWillBeSold =
            amountOfUsdtRisk / (stopLossPrice - minSellPrice);

        if (totalCoinWillBeSold <= 0) return data;

        const coinBalanceData = await this.getAccountBalance(coin);
        const availableCoin = Number(
            coinBalanceData?.data[0]?.details[0]?.availBal ?? 0
        );

        const coinToSell = Math.min(totalCoinWillBeSold, availableCoin);
        if (coinToSell <= 0) return data;

        const costByUsdt = coinToSell * (minSellPrice + stopLossPrice) / 2;
        const numberOfSteps = Math.ceil(costByUsdt / amountOfUsdtPerStep);

        const priceDistanceBetweenEachStep =
            (stopLossPrice - minSellPrice) / numberOfSteps;

        this.logger.log(`SELL steps: ${numberOfSteps}`);
        this.logger.log(`priceDistanceEachStep: ${priceDistanceBetweenEachStep}`);

        const steps = Array.from({ length: numberOfSteps + 1 }, (_, i) => i);

        let remainingCoin = coinToSell;
        const avarageCost = Number(coinBalanceData?.data[0]?.details[0]?.openAvgPx ?? 0);
        const minTakeProfitPrice = avarageCost * (1 + 0.03); // tối thiểu phải có lãi 5%
        this.emailService.sendEmail(process.env.EMAIL_TO, `Sell ${coin} status`, { info: `currentPrice ${currentPrice}, avarageCost ${avarageCost}, minTakeProfitPrice ${minTakeProfitPrice}, minSellPrice ${minSellPrice}, maxSellPrice ${maxSellPrice}, stopLossPrice ${stopLossPrice}` });
        this.logger.log(`avarageCost: ${avarageCost} minTakeProfitPrice ${minTakeProfitPrice}: ${avarageCost > 0 ? (minTakeProfitPrice / avarageCost - 1) * 100 : 0 }%`);
        try {
            for await (let step of steps) {
                const orderPx = minSellPrice + step * priceDistanceBetweenEachStep;
                const triggerPx = orderPx + orderPx * 0.002; // trigger cao hơn order
                const sz = Math.min(
                    amountOfUsdtPerStep / orderPx,
                    remainingCoin
                );

                if (triggerPx > maxSellPrice) break;
                if (sz <= 0) break;
                if (orderPx < minTakeProfitPrice) {
                    this.logger.log(`Break orderPx < minTakeProfitPrice ${minTakeProfitPrice}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`);
                    break;
                }

                if (triggerPx <= avarageCost) {
                    this.logger.log(`Break triggerPx <= newWvarageCost ${avarageCost}, Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price: ${triggerPx.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`);
                    break;
                }

                this.logger.log(
                    `SELL step ${step} | orderPx ${orderPx.toFixed(priceToFixed)} | triggerPx ${triggerPx.toFixed(priceToFixed)} | sz ${sz.toFixed(szToFixed)}`
                );

                const res = await this.placeOneOrder(
                    coin,
                    'sell',
                    sz.toFixed(szToFixed),
                    triggerPx.toFixed(priceToFixed),
                    orderPx.toFixed(priceToFixed),
                    testing
                );

                data.push({ step, data: res.data, body: res.body });
                remainingCoin -= sz;
            }
        } catch (error) {
            this.logger.error(
                'Error placing SELL orders:',
                error.response?.data || error.message
            );
            throw error;
        }
        if (data.length > 0) {
            this.emailService.sendEmail(process.env.EMAIL_TO, `Number of new sell orders for ${coin}`, data.length);
            this.emailService.sendEmail(process.env.EMAIL_TO, `New sell ${coin} orders`, data);
        }
        this.logger.log(`Current price: ${currentPrice}`);
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
        this.logger.log(`Starting to place stop loss order for ${coin.toUpperCase()}, testing mode: ${testing}`);
        const stopLossRatio = this.config.get<number>('stopLossRatio');
        if (!stopLossRatio || stopLossRatio <= 0) {
            throw new Error(`Invalid configuration: stopLossRatio (${stopLossRatio}) must be greater than 0`);
        }
        const coinConfig = this.config.get<any>(`coin.${coin.toUpperCase()}`);
        this.logger.log(`Placing stop loss order for ${coin.toUpperCase()} with config: ${JSON.stringify(coinConfig)}`);
        if (!coinConfig) {
            throw new Error(`No configuration found for coin: ${JSON.stringify(coin)}`);
        }
        const { priceToFixed } = coinConfig;

        const instId = `${coin.toUpperCase()}-USDT`;
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
        const avarageCost = Number(coinBalanceData?.data[0]?.details[0]?.openAvgPx ?? 0);
        this.logger.log(`avarageCost: ${avarageCost}`);
        if (avarageCost <= 0 || avarageCost < currentPrice) {
            return data;
        }
        // const stopLossPrice = avarageCost * (1 - stopLossRatio);
        const stopLossPrice = currentPrice * (1 - stopLossRatio);
        const triggerPx = stopLossPrice + stopLossPrice * 0.002;
        this.logger.log(`Calculated stop loss price: ${stopLossPrice}, triggerPx: ${triggerPx}`);
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

    async sellOneCoin({ coin, isTesting, removeExistingSellOrders, addSellStopLoss, addSellTakeProfit, onlyForDown, justOneOrder }: { isTesting: boolean, removeExistingSellOrders: string, coin: string, addSellStopLoss: string, addSellTakeProfit: string, onlyForDown: string, justOneOrder: string }) {
        const results: any[] = [];
        if (!isTesting) {
            if (removeExistingSellOrders === 'true') {
                const res1 = await this.cancelOpenConditionSpotOrdersForOneCoin(coin, 'sell', onlyForDown === 'true');
                this.logger.log('Cancel existing sell orders:', JSON.stringify(res1, null, 2));
                results.push({ coin, action: 'cancel_existing_sell_orders', result: res1 });
            }
        }

        if (addSellStopLoss === 'true') {
            const res2 = await this.placeStopLossOrder(coin, isTesting);
            this.logger.log('Place stop loss order:', JSON.stringify(res2, null, 2));
            results.push({ coin, action: 'place_stop_loss_order', result: res2 });
        }
        // if (addSellTakeProfit === 'true') {
        //     const res4 = await this.placeTakeProfitOrder(coin, onlyForDown === 'true', justOneOrder === 'true', isTesting);
        //     this.logger.log('Place take profit order:', JSON.stringify(res4, null, 2));
        //     results.push({ coin, action: 'place_take_profit_order', result: res4 });
        // }
        if (addSellTakeProfit === 'true') {
            const res4 = await this.autoSellFromMinPriceToStopLossPriceForDown(coin, isTesting);
            this.logger.log('Place auto sell order:', JSON.stringify(res4, null, 2));
            results.push({ coin, action: 'place_auto_sell_order', result: res4 });
        }
        return results;
    }
}

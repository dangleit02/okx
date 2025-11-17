import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as WebSocket from 'ws';
import axios from 'axios';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from './common/logger.service';
import { stringify } from 'querystring';

interface Strategy {
    instId: string;
    coinData: OrderStep[];
    testing: boolean
}

interface OrderStep {
    step: number;
    triggerPxWhenDown: string;
    triggerPxWhenUp: string;
    orderPx: string;
    priceToFixed: number
    sz: string;
    waitingForRebound?: boolean;
    active: boolean;
}

@Injectable()
export class OkxWsMultiTradingService implements OnModuleInit, OnModuleDestroy {
    private ws: WebSocket | null = null;
    private reconnectDelay = 5000; // 5 giây
    private wsUrl = 'wss://ws.okx.com:8443/ws/v5/public';
    private strategies: Record<string, Strategy> = {}; // key = instId

    constructor(
        private config: ConfigService,
        private readonly logger: AppLogger
    ) {
        // this.initWs();
    }

    private signRequest(secret: string, message: string) {
        return crypto.createHmac('sha256', secret).update(message).digest('base64');
    }

    async placeLimitBuy(instId: string, size: string, price: string, testing: boolean = true) {
        const timestamp = new Date().toISOString();
        const requestPath = '/api/v5/trade/order';

        const body = {
            instId,
            tdMode: 'cash',
            side: 'buy',
            ordType: 'limit',
            sz: size,
            px: price,
        };
        this.logger.log(`Placing limit buy order: ${JSON.stringify(body)}`);

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

    onModuleInit() {
        this.logger.log('OkxWsMultiTradingService ready.');
    }

    onModuleDestroy() {
        this.stopAll();
    }

    start(coin: string, testing: boolean = true) {
        if (!this.ws) {
            this.initWs();
        }

        const coinData = this.getCoinConfig(coin)
        this.logger.log(`Starting strategy for ${coin.toUpperCase()} with data: ${JSON.stringify(coinData)}`);
        const instId = `${coin.toUpperCase()}-USDT`;
        this.strategies[instId] = {
            instId,
            coinData,
            testing,
        };

        // Subscribe only if not already subscribed
        const msg = {
            op: 'subscribe',
            args: [{ channel: 'tickers', instId }],
        };
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws?.send(JSON.stringify(msg));
        } else {
            console.warn('⚠️ WebSocket not open. Cannot send message.');
        }

        this.logger.log(`Started strategy for ${instId}`);
    }

    stop(instId: string) {
        if (this.strategies[instId]) {
            this.logger.log(`Stopped strategy for ${instId}`);
            delete this.strategies[instId];
        }
    }

    stopAll() {
        this.strategies = {};
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    private initWs() {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
            this.logger.log('Connected to OKX WebSocket');
        });

        this.ws.on('message', async (raw) => {
            const msg = JSON.parse(raw.toString());

            if (msg.arg?.channel === 'tickers' && msg.data?.length > 0) {
                const instId = msg.arg.instId;
                const strategy = this.strategies[instId];
                if (!strategy) return;
                const price = parseFloat(msg.data[0].last);
                const timestamp = new Date().toISOString();
                this.logger.log(`[${timestamp}] Price ${instId}: ${price}`);                
                this.setItemsHavingTriggerPriceAbove(strategy, price);
                this.setItemsHavingTriggerPriceBelow(strategy, price);
            }
        });

        this.ws.on('close', () => {
            console.log('⚠️ WebSocket closed. Reconnecting...');
            // setTimeout(() => this.initWs(), this.reconnectDelay);
        });

        this.ws.on('error', (err) => {
            console.error('❌ WebSocket error:', err.message);
            this.ws?.close();
        });
    }

    getCoinConfig(coin: string): OrderStep[] {
        const coinConfig = this.config.get<any>(`coin.${coin.toUpperCase()}`);
        const maxUsdt = this.config.get<number>('maxUsdt');
        const riskPerTrade = this.config.get<number>('riskPerTrade');
        const amountOfUsdtPerStep = this.config.get<number>('amountOfUsdtPerStep');
        this.logger.log(`Placing multiple orders for ${coin.toUpperCase()} with config: ${JSON.stringify(coinConfig)}`);
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
        const numberOfCoinToBuy = (amountOfUsdtRisk / (avarageBuyPrice - stopLossPrice));
        const costByUsdt = numberOfCoinToBuy * avarageBuyPrice;
        const numberOfSteps = Math.ceil(costByUsdt / amountOfUsdtPerStep);
        const priceDistanceBetweenEachStep = (maxBuyPrice - minBuyPrice) / numberOfSteps;

        const steps = Array.from({ length: numberOfSteps + 1 }, (_, i) => i);

        const data:OrderStep[] = [];
        try {
            for (let step of steps) {
                const triggerPxWhenDown = minBuyPrice + (step - 1) * priceDistanceBetweenEachStep;
                const orderPx = minBuyPrice + step * priceDistanceBetweenEachStep;
                const triggerPxWhenUp = (orderPx + triggerPxWhenDown) / 2; // giá kích hoạt thấp hơn giá đặt lệnh giới hạn một chút
                let sz;
                sz = amountOfUsdtPerStep / orderPx; // mua chắc chắn hơn

                this.logger.log(`Prepared order: Step ${step}, Order Price: ${orderPx.toFixed(priceToFixed)}, Trigger Price When Down: ${triggerPxWhenDown.toFixed(priceToFixed)}, Trigger Price When Up: ${triggerPxWhenUp.toFixed(priceToFixed)}, Size: ${sz.toFixed(szToFixed)}`);
                data.push({ step, priceToFixed, triggerPxWhenDown: triggerPxWhenDown.toFixed(priceToFixed), triggerPxWhenUp: triggerPxWhenUp.toFixed(priceToFixed), orderPx: orderPx.toFixed(priceToFixed), sz: sz.toFixed(szToFixed), active: true, waitingForRebound: false});
            }
        } catch (error) {
            this.logger.log('Error placing trigger order:', error.response?.data || error.message);
            throw error;
        }


        return data;
    }

    private setItemsHavingTriggerPriceAbove(strategy: Strategy, currentPrice) {
        strategy.coinData.forEach(item => {
            if (item.active && !item.waitingForRebound && currentPrice <= parseFloat(item.triggerPxWhenDown)) {
                item.waitingForRebound = true;
            }
        });
        this.logger.log('strategy after prive above', JSON.stringify(strategy.coinData));
    }

    private async setItemsHavingTriggerPriceBelow(strategy: Strategy, currentPrice) {
        for await (const item of strategy.coinData) {
            if (item.active && item.waitingForRebound && currentPrice >= parseFloat(item.triggerPxWhenUp)) {
                this.logger.log(`Price ${currentPrice} >= triggerPxWhenUp ${item.triggerPxWhenUp}, placing buy order for step ${item.step} at price item.orderPrice`);
                const res = await this.placeLimitBuy(strategy.instId, item.sz, item.orderPx, strategy.testing);
                this.logger.log(`Buy order response: ${JSON.stringify(res)}`);
                item.active = false;
            }
        };
        this.logger.log('strategy after prive below', JSON.stringify(strategy.coinData));
    }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';

@Injectable()
export class OkxService {
    constructor(private config: ConfigService) { }

    private signRequest(secret: string, message: string) {
        return crypto.createHmac('sha256', secret).update(message).digest('base64');
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

    async placeOrder(coin: string) {
        const timestamp = new Date().toISOString();
        const requestPath = '/api/v5/trade/order';

        const body = {
            instId: `${coin}-USDT`,
            tdMode: 'cash',
            side: 'buy',
            ordType: 'market',
            sz: '0.01',
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

        const res = await axios.post(this.config.get<string>('okx.baseUrl') + requestPath, body, { headers });
        return res.data;
    }

    async placeTriggerOrder(coin: string, side: 'buy' | 'sell', sz: string, triggerPx: string, orderPx: string) {
        const timestamp = new Date().toISOString();
        const requestPath = '/api/v5/trade/order-algo';

        const body = {
            instId: `${coin}-USDT`,
            tdMode: 'cash',
            side,                 // 'buy' hoặc 'sell'
            ordType: 'trigger', // lệnh kích hoạt
            sz,                   // khối lượng, ví dụ "5"
            triggerPx,            // giá kích hoạt
            orderPx,              // giá đặt lệnh giới hạn khi trigger
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
            const res = await axios.post(url, body, { headers });
            return res.data;
        } catch (error) {
            console.error('Error placing trigger order:', error.response?.data || error.message);
            throw error;
        }
    }
}

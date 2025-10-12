import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { OkxService } from "src/okx.service";
import { AppLogger } from "src/common/logger.service";
import * as _ from 'lodash';

@Injectable()
export class TasksService {
    constructor(
        private config: ConfigService,
        private readonly logger: AppLogger,
        private okxService: OkxService,
    ) {
    }

    @Cron('*/30 * * * *')
    // @Cron('0 * * * * *')
    async autoSellForDown() {
        this.logger.log('Cron auto sell for down');
        try {
            this.logger.log(`Starting to place all orders for all coins ${Date.now()}`);
            let coins = this.config.get<any>(`coinsForTakeProfit`);
            if (!coins) {
                throw new Error(`No configuration found for coins: ${JSON.stringify(coins)}`);
            }
            coins = _.uniq(coins);
            this.logger.log(`Coins to process: ${JSON.stringify(coins)}`);
            const results = [];
            const isTesting = false,
                removeExistingSellOrders = 'true',
                addSellWhenDown = 'false',
                addSellSurprisePrice = 'false',
                addSellStopLoss = 'false',
                addSellTakeProfit = 'true',
                onlyForDown = 'true',
                justOneOrder = 'false';
            for await (const coin of coins) {
                this.logger.log(`Processing coin: ${coin}`);
                await this._SellOneCoin(isTesting, removeExistingSellOrders, coin, results, addSellWhenDown, addSellSurprisePrice, addSellStopLoss, addSellTakeProfit, onlyForDown, justOneOrder);
            }

            this.logger.log(`Successfully auto sell for down ${Date.now}`)
        } catch (error) {
            this.logger.log(`autoSendDailyReport, ${error.message}`)
            throw error;
        }
    }

    private async _SellOneCoin(isTesting: boolean, removeExistingSellOrders: string, coin: string, results: any[], addSellWhenDown: string, addSellSurprisePrice: string, addSellStopLoss: string, addSellTakeProfit: string, onlyForDown: string, justOneOrder: string) {
        if (!isTesting) {
            if (removeExistingSellOrders === 'true') {
                const res1 = await this.okxService.cancelAllTypeOfOpenOrdersForOneCoin(coin, 'SPOT', 'sell', onlyForDown === 'true');
                this.logger.log('Cancel existing sell orders:', JSON.stringify(res1, null, 2));
                results.push({ coin, action: 'cancel_existing_sell_orders', result: res1 });
            }
        }
        if (addSellWhenDown === 'true') {
            const res2 = await this.okxService.placeMultipleSellOrdersForDown(coin, isTesting);
            this.logger.log('Place multiple sell orders for down:', JSON.stringify(res2, null, 2));
            results.push({ coin, action: 'place_multiple_sell_orders_for_down', result: res2 });
        }
        if (addSellSurprisePrice === 'true') {
            const res3 = await this.okxService.placeSurprisePriceSellOrder(coin, isTesting);
            this.logger.log('Place surprise price sell order:', JSON.stringify(res3, null, 2));
            results.push({ coin, action: 'place_surprise_price_sell_order', result: res3 });
        }
        if (addSellStopLoss === 'true') {
            const res4 = await this.okxService.placeStopLossOrder(coin, isTesting);
            this.logger.log('Place stop loss order:', JSON.stringify(res4, null, 2));
            results.push({ coin, action: 'place_stop_loss_order', result: res4 });
        }
        if (addSellTakeProfit === 'true') {
            const res5 = await this.okxService.placeTakeProfitOrder(coin, onlyForDown === 'true', justOneOrder === 'true', isTesting);
            this.logger.log('Place take profit order:', JSON.stringify(res5, null, 2));
            results.push({ coin, action: 'place_take_profit_order', result: res5 });
        }
    }
}

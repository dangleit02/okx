import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { OkxService } from "../okx/okx.service";
import { AppLogger } from "../logger/logger.service";
import * as _ from 'lodash';
import * as moment from 'moment';
import { OkxFutureHedgeService } from "../okx/okx.future.hedge.service";
@Injectable()
export class TasksService {
    constructor(
        private config: ConfigService,
        private readonly logger: AppLogger,
        private okxService: OkxService,
        private okxFutureHedgeService: OkxFutureHedgeService,
    ) {
    }

    // run each 15 minutes
    // @Cron('*/1 * * * *')
    // run every hour at minute 30
    @Cron('4 * * * *')
    async autoBuySpotForDown() {
        this.logger.log(`Cron auto buy for down ${moment().format('YY/MM/DD HH:mm:ss')}`);
        try {
            if (!this.config.get<boolean>('runSpotTaskForBuy')) {
                this.logger.log('Auto buy spot for down task is disabled in configuration.');
                return;
            }
            this.logger.log(`Starting to place all orders for all coins ${moment().format('YY/MM/DD HH:mm:ss')}`);
            let coins = this.config.get<any>(`coinsForBuy`);
            if (!coins) {
                throw new Error(`No configuration found for coinsForBuy: ${JSON.stringify(coins)}`);
            }
            coins = _.uniq(coins);
            this.logger.log(`Coins to process: ${JSON.stringify(coins)}`);
            const results = [];
            const isTesting = false,
                removeExistingBuyOrders = 'false',
                autobuy = 'true';                
            await Promise.all(coins.map(async (coin) => {
                this.logger.log(`Processing coin: ${coin.toUpperCase()}`);
                await this.okxService.buyOneCoin(isTesting, removeExistingBuyOrders, coin, results, autobuy);
            }));
            this.logger.log(`Auto buy results: ${JSON.stringify(results, null, 2)}`);

            this.logger.log(`✅ Successfully auto buy for down ${moment().format('YYYY/MM/DD HH:mm:ss')}`)
        } catch (error) {
            this.logger.log(`⚠️ Error buy for down ${moment().format('YYYY/MM/DD HH:mm:ss')}, ${error.message}`)
            throw error;
        }
    }

    // run every hour at minute 0
    @Cron('42 * * * *')
    async autoSellSpotForDown() {
        this.logger.log(`Cron auto sell for down ${moment().format('YY/MM/DD HH:mm:ss')}`);
        try {
            if (!this.config.get<boolean>('runSpotTaskForSell')) {
                this.logger.log('Auto sell spot for down task is disabled in configuration.');
                return;
            }
            const runSpotTaskHavingStopLoss = this.config.get<boolean>('runSpotTaskHavingStopLoss');
            this.logger.log(`Starting to place all orders for all coins ${moment().format('YY/MM/DD HH:mm:ss')}`);
            const isTesting = false,
                removeExistingSellOrders = 'false',
                addSellStopLoss = runSpotTaskHavingStopLoss ? 'true' : 'false',
                addSellTakeProfit = 'true',
                onlyForDown = 'false',
                justOneOrder = 'false';
            const results = await this.okxService.sellAtPriceAllCoins({
                isTesting,
                removeExistingSellOrders,
                addSellStopLoss,
                addSellTakeProfit,
                onlyForDown,
                justOneOrder,
            });
            
            this.logger.log(`Auto sell results: ${JSON.stringify(results, null, 2)}`);

            this.logger.log(`✅ Successfully auto sell for down ${moment().format('YYYY/MM/DD HH:mm:ss')}`)
        } catch (error) {
            this.logger.log(`⚠️ Error sell for down ${moment().format('YYYY/MM/DD HH:mm:ss')}, ${error.message}`)
            throw error;
        }
    }

    // Run every 2 hours at minute 23, away from spot buy (04) and sell (42).
    @Cron('23 */2 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
    async cleanSellOrdersDaily() {
        this.logger.log(`Cron clean sell orders ${moment().format('YY/MM/DD HH:mm:ss')}`);
        try {
            if (!this.config.get<boolean>('runSpotTaskForClean')) {
                this.logger.log('Clean sell orders task is disabled in configuration.');
                return;
            }

            const results = await this.okxService.cleanSellOrdersForAllCoins(false);
            this.logger.log(`Clean sell orders results: ${JSON.stringify(results, null, 2)}`);
            this.logger.log(`✅ Successfully cleaned sell orders ${moment().format('YYYY/MM/DD HH:mm:ss')}`);
        } catch (error) {
            this.logger.log(`⚠️ Error cleaning sell orders ${moment().format('YYYY/MM/DD HH:mm:ss')}, ${error.message}`);
            throw error;
        }
    }

    // Run every hour at minute 28, gated by runSwapTaskForShort.
    @Cron('28 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
    async refreshShortFutureOrders() {
        this.logger.log(`Cron refresh short entry, stop-loss and close orders ${moment().format('YY/MM/DD HH:mm:ss')}`, null, 'ALL_short_hedge');
        try {
            if (!this.config.get<boolean>('runSwapTaskForShort')) {
                this.logger.log('Swap Short task is disabled in config', null, 'ALL_short_hedge');
                return;
            }
            this.logger.log(`Starting to place all orders for all coins ${moment().format('YY/MM/DD HH:mm:ss')}`, null, 'ALL_short_hedge');
            let coins = this.config.get<any>(`coinsForShort`);
            if (!coins) {
                throw new Error(`No configuration found for coinsForShort: ${JSON.stringify(coins)}`);
            }
            coins = _.uniq(coins);
            this.logger.log(`Coins to process: ${JSON.stringify(coins)}`, null, 'ALL_short_hedge');
            const results = [];
            const isTesting = false,
                removeExistingOrders = false,
                enableTakeProfit = true,
                partialCloseOnRetrace = true,
                autoTrade = true;

            for await (const coin of coins) {
                this.logger.log(`Processing coin: ${coin.toUpperCase()}`, null, `${coin.toUpperCase()}_short_hedge`);
                const cancelled = await this.okxFutureHedgeService.cancelFutureOrdersForOneCoin(coin, 'short', 'all');
                results.push({ coin, direction: 'short', action: 'cancel_existing_trigger_orders', result: cancelled });
                const stopLoss = await this.okxFutureHedgeService.ensurePositionStopLoss(coin, 'short', isTesting);
                results.push({ coin, direction: 'short', action: 'ensure_position_stop_loss', result: stopLoss });
                const result = await this.okxFutureHedgeService.tradeOneCoin({ coin, direction: 'short', isTesting, removeExistingOrders, enableTakeProfit, partialCloseOnRetrace, autoTrade });
                results.push(...result);
            }
            this.logger.log(`Refresh short future orders results: ${JSON.stringify(results, null, 2)}`, null, 'ALL_short_hedge');

            this.logger.log(`✅ Successfully refreshed short future orders ${moment().format('YYYY/MM/DD HH:mm:ss')}`, null, 'ALL_short_hedge')
        } catch (error) {
            this.logger.log(`⚠️ Error refreshing short future orders ${moment().format('YYYY/MM/DD HH:mm:ss')}, ${error.message}`, null, 'ALL_short_hedge')
            throw error;
        }
    }

    // Run every hour at minute 45, gated by runSwapTaskForLong.
    @Cron('45 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
    async refreshLongFutureOrders() {
        this.logger.log(`Cron refresh long entry, stop-loss and close orders ${moment().format('YY/MM/DD HH:mm:ss')}`, null, 'ALL_long_hedge');
        try {
            if (!this.config.get<boolean>('runSwapTaskForLong')) {
                this.logger.log('Swap Long task is disabled in config', null, 'ALL_long_hedge');
                return;
            }
            this.logger.log(`Starting to place all orders for all coins ${moment().format('YY/MM/DD HH:mm:ss')}`, null, 'ALL_long_hedge');
            let coins = this.config.get<any>(`coinsForLong`);
            if (!coins) {
                throw new Error(`No configuration found for coinsForLong: ${JSON.stringify(coins)}`);
            }
            coins = _.uniq(coins);
            this.logger.log(`Coins to process: ${JSON.stringify(coins)}`, null, 'ALL_long_hedge');
            const results = [];
            const isTesting = false,
                removeExistingOrders = false,
                enableTakeProfit = true,
                partialCloseOnRetrace = true,
                autoTrade = true;

            for await (const coin of coins) {
                this.logger.log(`Processing coin: ${coin.toUpperCase()}`, null, `${coin.toUpperCase()}_long_hedge`);
                const cancelled = await this.okxFutureHedgeService.cancelFutureOrdersForOneCoin(coin, 'long', 'all');
                results.push({ coin, direction: 'long', action: 'cancel_existing_trigger_orders', result: cancelled });
                const stopLoss = await this.okxFutureHedgeService.ensurePositionStopLoss(coin, 'long', isTesting);
                results.push({ coin, direction: 'long', action: 'ensure_position_stop_loss', result: stopLoss });
                const result = await this.okxFutureHedgeService.tradeOneCoin({ coin, direction: 'long', isTesting, removeExistingOrders, enableTakeProfit, partialCloseOnRetrace, autoTrade });
                results.push(...result);
            }
            this.logger.log(`Refresh long future orders results: ${JSON.stringify(results, null, 2)}`, null, 'ALL_long_hedge');

            this.logger.log(`✅ Successfully refreshed long future orders ${moment().format('YYYY/MM/DD HH:mm:ss')}`, null, 'ALL_long_hedge')
        } catch (error) {
            this.logger.log(`⚠️ Error refreshing long future orders ${moment().format('YYYY/MM/DD HH:mm:ss')}, ${error.message}`, null, 'ALL_long_hedge')
            throw error;
        }
    }
}

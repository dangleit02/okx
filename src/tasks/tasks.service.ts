import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { OkxService } from "../okx/okx.service";
import { AppLogger } from "../logger/logger.service";
import * as _ from 'lodash';
import * as moment from 'moment';
import { OkxFutureHedgeService } from "../okx/okx.future.hedge.service";
import { OkxFutureOneWayService } from "../okx/okx.future.oneway.service";
@Injectable()
export class TasksService {
    constructor(
        private config: ConfigService,
        private readonly logger: AppLogger,
        private okxService: OkxService,
        private okxFutureHedgeService: OkxFutureHedgeService,
        private okxFutureOneWayService: OkxFutureOneWayService,
    ) {
    }

    private async refreshFutureOrders(
        service: OkxFutureHedgeService | OkxFutureOneWayService,
        direction: 'long' | 'short',
        mode: 'hedge' | 'oneway',
        enabledConfigKey: string,
    ) {
        const allLogKey = `ALL_${direction}_${mode}`;
        this.logger.log(`Cron refresh ${direction} entry, stop-loss and close orders ${moment().format('YY/MM/DD HH:mm:ss')}`, null, allLogKey);
        if (!this.config.get<boolean>(enabledConfigKey)) {
            this.logger.log(`Swap ${direction} ${mode} task is disabled in config`, null, allLogKey);
            return;
        }

        let coins = this.config.get<any>(direction === 'long' ? 'coinsForLong' : 'coinsForShort');
        if (!coins) {
            throw new Error(`No configuration found for ${direction === 'long' ? 'coinsForLong' : 'coinsForShort'}: ${JSON.stringify(coins)}`);
        }
        coins = _.uniq(coins);
        const results = [];
        const isTesting = false;

        for await (const coin of coins) {
            const normalizedCoin = String(coin).toUpperCase();
            this.logger.log(`Processing coin: ${normalizedCoin}`, null, `${normalizedCoin}_${direction}_${mode}`);

            const cancelledEntries = await service.cancelFutureOrdersForOneCoin(coin, direction, 'open');
            results.push({ coin, direction, action: 'refresh_entry_trigger_orders', result: cancelledEntries });

            const cleanBefore = await service.cleanProtectiveCloseByPriceStepsOrdersForOneCoin(coin, direction, false);
            results.push({ coin, direction, action: 'clean_protective_close_by_price_steps_orders_before_refresh', result: cleanBefore });

            const stopLoss = await service.ensurePositionStopLoss(coin, direction, isTesting);
            results.push({ coin, direction, action: 'ensure_position_stop_loss', result: stopLoss });

            const refreshed = await service.tradeOneCoin({
                coin,
                direction,
                isTesting,
                removeExistingOrders: false,
                enableProtectiveClose: true,
                protectiveCloseOnly: true,
                autoTrade: true,
            });
            results.push(...refreshed);

            const cleanAfter = await service.cleanProtectiveCloseByPriceStepsOrdersForOneCoin(coin, direction, false);
            results.push({ coin, direction, action: 'clean_protective_close_by_price_steps_orders_after_refresh', result: cleanAfter });
        }

        this.logger.log(`Refresh ${direction} ${mode} future orders results: ${JSON.stringify(results, null, 2)}`, null, allLogKey);
        return results;
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

    // Run every hour at minute 28, gated by runSwapTaskForShortHedge.
    @Cron('28 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
    async refreshShortFutureOrders() {
        try {
            return await this.refreshFutureOrders(this.okxFutureHedgeService, 'short', 'hedge', 'runSwapTaskForShortHedge');
        } catch (error) {
            this.logger.log(`⚠️ Error refreshing short future orders ${moment().format('YYYY/MM/DD HH:mm:ss')}, ${error.message}`, null, 'ALL_short_hedge')
            throw error;
        }
    }

    // Run every hour at minute 45, gated by runSwapTaskForLongHedge.
    @Cron('45 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
    async refreshLongFutureOrders() {
        try {
            return await this.refreshFutureOrders(this.okxFutureHedgeService, 'long', 'hedge', 'runSwapTaskForLongHedge');
        } catch (error) {
            this.logger.log(`⚠️ Error refreshing long future orders ${moment().format('YYYY/MM/DD HH:mm:ss')}, ${error.message}`, null, 'ALL_long_hedge')
            throw error;
        }
    }

    @Cron('31 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
    async refreshShortFutureOneWayOrders() {
        try {
            return await this.refreshFutureOrders(this.okxFutureOneWayService, 'short', 'oneway', 'runSwapTaskForShortOneWay');
        } catch (error) {
            this.logger.log(`⚠️ Error refreshing short oneway future orders ${moment().format('YYYY/MM/DD HH:mm:ss')}, ${error.message}`, null, 'ALL_short_oneway');
            throw error;
        }
    }

    @Cron('48 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
    async refreshLongFutureOneWayOrders() {
        try {
            return await this.refreshFutureOrders(this.okxFutureOneWayService, 'long', 'oneway', 'runSwapTaskForLongOneWay');
        } catch (error) {
            this.logger.log(`⚠️ Error refreshing long oneway future orders ${moment().format('YYYY/MM/DD HH:mm:ss')}, ${error.message}`, null, 'ALL_long_oneway');
            throw error;
        }
    }
}

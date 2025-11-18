import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { OkxService } from "src/okx.service";
import { AppLogger } from "src/common/logger.service";
import * as _ from 'lodash';
import * as moment from 'moment';
import { OkxFutureHedgeService } from "src/okx.future.hedge.service";
@Injectable()
export class TasksService {
    constructor(
        private config: ConfigService,
        private readonly logger: AppLogger,
        private okxService: OkxService,
        private okxFutureHedgeService: OkxFutureHedgeService,
    ) {
    }

    // run every hour at minute 0
    @Cron('0 * * * *')
    async autoSellSpotForDown() {
        this.logger.log(`Cron auto sell for down ${moment().format('YY/MM/DD HH:mm:ss')}`);
        try {
            if (!this.config.get<boolean>('runSpotTask')) {
                this.logger.log('Auto sell spot for down task is disabled in configuration.');
                return;
            }
            this.logger.log(`Starting to place all orders for all coins ${moment().format('YY/MM/DD HH:mm:ss')}`);
            let coins = this.config.get<any>(`coinsForTakeProfit`);
            if (!coins) {
                throw new Error(`No configuration found for coinsForTakeProfit: ${JSON.stringify(coins)}`);
            }
            coins = _.uniq(coins);
            this.logger.log(`Coins to process: ${JSON.stringify(coins)}`);
            const results = [];
            const isTesting = false,
                removeExistingSellOrders = 'true',
                addSellStopLoss = 'false',
                addSellTakeProfit = 'true',
                onlyForDown = 'true',
                justOneOrder = 'true';
            for await (const coin of coins) {
                this.logger.log(`Processing coin: ${coin.toUpperCase()}`);
                const result = await this.okxService.sellOneCoin({ coin, isTesting, removeExistingSellOrders, addSellStopLoss, addSellTakeProfit, onlyForDown, justOneOrder });
                results.push(...result);
            }
            this.logger.log(`Auto sell results: ${JSON.stringify(results, null, 2)}`);

            this.logger.log(`✅ Successfully auto sell for down ${moment().format('YYYY/MM/DD HH:mm:ss')}`)
        } catch (error) {
            this.logger.log(`⚠️ Error sell for down ${moment().format('YYYY/MM/DD HH:mm:ss')}, ${error.message}`)
            throw error;
        }
    }

    // run every hour at minute 15
    @Cron('15 * * * *')
    async autoCloseShortPartialPositionForSwapOnRetrace() {
        this.logger.log(`Cron auto close short partial position for swap on retrace ${moment().format('YY/MM/DD HH:mm:ss')}`);
        try {
            if (!this.config.get<boolean>('runSwapTaskForShort')) {
                this.logger.log('Swap Short task is disabled in config');
                return;
            }
            this.logger.log(`Starting to place all orders for all coins ${moment().format('YY/MM/DD HH:mm:ss')}`);
            let coins = this.config.get<any>(`coinsForShort`);
            if (!coins) {
                throw new Error(`No configuration found for coinsForShort: ${JSON.stringify(coins)}`);
            }
            coins = _.uniq(coins);
            this.logger.log(`Coins to process: ${JSON.stringify(coins)}`);
            const results = [];
            const isTesting = false,
                removeExistingOrders = true,
                enableTakeProfit = true,
                partialCloseOnRetrace = true;

            for await (const coin of coins) {
                this.logger.log(`Processing coin: ${coin.toUpperCase()}`);
                const result = await this.okxFutureHedgeService.tradeOneCoin({ coin, direction: 'short', isTesting, removeExistingOrders, enableTakeProfit, partialCloseOnRetrace });
                results.push(...result);
            }
            this.logger.log(`Auto close short partial position results: ${JSON.stringify(results, null, 2)}`);

            this.logger.log(`✅ Successfully auto close short partial position for swap on retrace ${moment().format('YYYY/MM/DD HH:mm:ss')}`)
        } catch (error) {
            this.logger.log(`⚠️ Error close short partial position for swap on retrace ${moment().format('YYYY/MM/DD HH:mm:ss')}, ${error.message}`)
            throw error;
        }
    }

    // run every hour at minute 30
    @Cron('30 * * * *')
    async autoCloseLongPartialPositionForSwapOnRetrace() {
        this.logger.log(`Cron auto close long partial position for swap on retrace ${moment().format('YY/MM/DD HH:mm:ss')}`);
        try {
            if (!this.config.get<boolean>('runSwapTaskForLong')) {
                this.logger.log('Swap Long task is disabled in config');
                return;
            }
            this.logger.log(`Starting to place all orders for all coins ${moment().format('YY/MM/DD HH:mm:ss')}`);
            let coins = this.config.get<any>(`coinsForLong`);
            if (!coins) {
                throw new Error(`No configuration found for coinsForLong: ${JSON.stringify(coins)}`);
            }
            coins = _.uniq(coins);
            this.logger.log(`Coins to process: ${JSON.stringify(coins)}`);
            const results = [];
            const isTesting = false,
                removeExistingOrders = true,
                enableTakeProfit = true,
                partialCloseOnRetrace = true;

            for await (const coin of coins) {
                this.logger.log(`Processing coin: ${coin.toUpperCase()}`);
                const result = await this.okxFutureHedgeService.tradeOneCoin({ coin, direction: 'long', isTesting, removeExistingOrders, enableTakeProfit, partialCloseOnRetrace });
                results.push(...result);
            }
            this.logger.log(`Auto close long partial position results: ${JSON.stringify(results, null, 2)}`);

            this.logger.log(`✅ Successfully auto close long partial position for swap on retrace ${moment().format('YYYY/MM/DD HH:mm:ss')}`)
        } catch (error) {
            this.logger.log(`⚠️ Error close long partial position for swap on retrace ${moment().format('YYYY/MM/DD HH:mm:ss')}, ${error.message}`)
            throw error;
        }
    }
}

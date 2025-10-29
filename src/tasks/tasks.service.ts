import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { OkxService } from "src/okx.service";
import { AppLogger } from "src/common/logger.service";
import * as _ from 'lodash';
import * as moment from 'moment';
@Injectable()
export class TasksService {
    constructor(
        private config: ConfigService,
        private readonly logger: AppLogger,
        private okxService: OkxService,
    ) {
    }

    @Cron('0 * * * *')
    async autoSellForDown() {
        this.logger.log('Cron auto sell for down');
        try {
            this.logger.log(`Starting to place all orders for all coins ${moment().format('YY/MM/DD HH:mm:ss')}`);
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
                justOneOrder = 'true';
            for await (const coin of coins) {
                this.logger.log(`Processing coin: ${coin}`);
                await this.okxService.sellOneCoin(isTesting, removeExistingSellOrders, coin, results, addSellWhenDown, addSellSurprisePrice, addSellStopLoss, addSellTakeProfit, onlyForDown, justOneOrder);
            }

            this.logger.log(`✅ Successfully auto sell for down ${moment().format('YY/MM/DD HH:mm:ss')}`)
        } catch (error) {
            this.logger.log(`⚠️ Error sell for down ${moment().format('YY/MM/DD HH:mm:ss')}, ${error.message}`)
            throw error;
        }
    }    
}

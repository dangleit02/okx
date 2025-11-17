import { Controller, Param, Post, Query } from '@nestjs/common';
import { OkxFutureService } from './okx-future.service';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from './common/logger.service';
import * as _ from 'lodash';
import { TradeOneCoinParams } from './interfaces/interface';
import { parseBool } from './common/util';

@Controller('future')
export class FutureController {
  constructor(
    private readonly okxFutureService: OkxFutureService,
    private config: ConfigService,
    private readonly logger: AppLogger,
  ) { }

  @Post('long-at-price/:coin')
  async longAtPrice(
    @Param('coin') coin: string,
    @Query() query: Record<string, string>
  ) {
    const params: TradeOneCoinParams = {
      coin,
      direction: 'long',
      isTesting: query.testing !== 'false',
      removeExistingOrders: parseBool(query.removeExistingOrders),
      enableTakeProfit: parseBool(query.enableTakeProfit),
      partialCloseOnRetrace: parseBool(query.partialCloseOnRetrace),
      justOnePartialOrder: parseBool(query.justOnePartialOrder),
      autoTrade: parseBool(query.autoTrade),
    };

    return await this.okxFutureService.tradeOneCoin(params);
  }

  @Post('long-at-price-all-coins')
  async longAtPriceForAllCoins(
    @Query() query: Record<string, string>
  ) {
    const params: TradeOneCoinParams = {
      direction: 'long',
      isTesting: query.testing !== 'false',
      removeExistingOrders: parseBool(query.removeExistingOrders),
      enableTakeProfit: parseBool(query.enableTakeProfit),
      partialCloseOnRetrace: parseBool(query.partialCloseOnRetrace),
      justOnePartialOrder: parseBool(query.justOnePartialOrder),
      autoTrade: parseBool(query.autoTrade),
    };
    this.logger.log(`Starting to place all orders for all coins, testing mode: ${params.isTesting}`);
    let coins = this.config.get<any>(`coinsForBuy`);
    if (!coins) {
      throw new Error(`No configuration found for coins: ${JSON.stringify(coins)}`);
    }
    coins = _.uniq(coins);
    this.logger.log(`Coins to process: ${JSON.stringify(coins)}`);
    const results = [];
    for await (const coin of coins) {
      this.logger.log(`Processing coin: ${coin.toUpperCase()}`);
      const result = await this.okxFutureService.tradeOneCoin({ ...params, coin });
      results.push(...result);
    }
    return results;
  }

  @Post('short-at-price/:coin')
  async shortAtPrice(
    @Param('coin') coin: string,
    @Query() query: Record<string, string>
  ) {
    const params: TradeOneCoinParams = {
      coin,
      direction: 'short',
      isTesting: query.testing !== 'false',
      removeExistingOrders: parseBool(query.removeExistingOrders),
      enableTakeProfit: parseBool(query.enableTakeProfit),
      partialCloseOnRetrace: parseBool(query.partialCloseOnRetrace),
      justOnePartialOrder: parseBool(query.justOnePartialOrder),
      autoTrade: parseBool(query.autoTrade),
    };

    return await this.okxFutureService.tradeOneCoin(params);
  }

  @Post('short-at-price-all-coins')
  async shortAtPriceAllCoins(
    @Query() query: Record<string, string>
  ) {
    const params: TradeOneCoinParams = {
      direction: 'short',
      isTesting: query.testing !== 'false',
      removeExistingOrders: parseBool(query.removeExistingOrders),
      enableTakeProfit: parseBool(query.enableTakeProfit),
      partialCloseOnRetrace: parseBool(query.partialCloseOnRetrace),
      justOnePartialOrder: parseBool(query.justOnePartialOrder),
      autoTrade: parseBool(query.autoTrade),
    };
    this.logger.log(`Starting to place all orders for all coins, testing mode: ${params.isTesting}`);
    let coins = this.config.get<any>(`coinsForBuy`);
    if (!coins) {
      throw new Error(`No configuration found for coins: ${JSON.stringify(coins)}`);
    }
    coins = _.uniq(coins);
    this.logger.log(`Coins to process: ${JSON.stringify(coins)}`);
    const results = [];
    for await (const coin of coins) {
      this.logger.log(`Processing coin: ${coin.toUpperCase()}`);
      const result = await this.okxFutureService.tradeOneCoin({ ...params, coin });
      results.push(...result);
    }
    return results;
  }

  @Post('cancel-all-orders')
  async cancelAllOrders(
    @Query('direction') direction: 'long' | 'short',
  ) {
    return await this.okxFutureService.cancelAllTypeOfOpenSwapOrders(direction);
  }
}

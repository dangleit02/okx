import { Controller, Param, Post, Query } from '@nestjs/common';
import { OkxFutureHedgeService } from './okx.future.hedge.service';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from './common/logger.service';
import * as _ from 'lodash';
import { TradeOneCoinParams } from './interfaces/interface';
import { parseBool } from './common/util';

@Controller('future-hedge')
export class FutureHedgeController {
  constructor(
    private readonly okx: OkxFutureHedgeService,
    private config: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  private parseParams(direction: 'long' | 'short', query: Record<string, string>): TradeOneCoinParams {
    return {
      direction,
      isTesting: query.testing !== 'false',
      removeExistingOrders: parseBool(query.removeExistingOrders),
      enableTakeProfit: parseBool(query.enableTakeProfit),
      partialCloseOnRetrace: parseBool(query.partialCloseOnRetrace),
      justOnePartialOrder: parseBool(query.justOnePartialOrder),
      autoTrade: parseBool(query.autoTrade),
    };
  }

  @Post('long-at-price/:coin')
  async longAtPrice(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.okx.tradeOneCoin({ ...this.parseParams('long', query), coin });
  }

  @Post('short-at-price/:coin')
  async shortAtPrice(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.okx.tradeOneCoin({ ...this.parseParams('short', query), coin });
  }

  @Post('long-at-price-all-coins')
  async longAll(@Query() query: Record<string, string>) {
    return this.processAllCoins(this.parseParams('long', query));
  }

  @Post('short-at-price-all-coins')
  async shortAll(@Query() query: Record<string, string>) {
    return this.processAllCoins(this.parseParams('short', query));
  }

  private async processAllCoins(params: TradeOneCoinParams) {
    this.logger.log(`Starting batch orders in Hedge mode, testing: ${params.isTesting}`);

    let coins = _.uniq(this.config.get<any>('coinsForBuy') || []);
    if (!coins.length) throw new Error('No coins configured');

    const results = [];
    for await (const coin of coins) {
      const result = await this.okx.tradeOneCoin({ ...params, coin });
      results.push(...result);
    }
    return results;
  }

  @Post('cancel-all-orders')
  async cancelAll(@Query('direction') direction: 'long' | 'short') {
    return this.okx.cancelAllTypeOfOpenSwapOrders(direction);
  }
}

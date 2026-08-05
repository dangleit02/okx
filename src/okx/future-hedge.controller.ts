import { BadRequestException, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { OkxFutureHedgeService } from './okx.future.hedge.service';
import { FutureDirection, FutureOrderIntent } from './okx.future.base.service';
import { ConfigService } from '@nestjs/config';
import * as _ from 'lodash';
import { TradeOneCoinParams } from 'src/interfaces/interface';
import { parseBool } from 'src/common/util';
import { AppLogger } from 'src/logger/logger.service';

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
      enableProtectiveClose: parseBool(query.enableProtectiveClose ?? query.enableTakeProfit),
      protectiveCloseOnly: this.protectiveCloseOnly(query),
      justOnePartialOrder: parseBool(query.justOnePartialOrder),
      autoTrade: parseBool(query.autoTrade),
    };
  }

  private parseDirection(value?: string): FutureDirection {
    if (value !== 'long' && value !== 'short') {
      throw new BadRequestException('direction must be long or short');
    }
    return value;
  }

  private parseIntent(value?: string): FutureOrderIntent {
    const intent = value ?? 'all';
    if (intent !== 'open' && intent !== 'close' && intent !== 'all') {
      throw new BadRequestException('intent must be open, close or all');
    }
    return intent;
  }

  private configuredCoins(direction: FutureDirection) {
    const key = direction === 'long' ? 'coinsForLong' : 'coinsForShort';
    const coins = _.uniq(this.config.get<string[]>(key) || []);
    if (!coins.length) throw new Error(`No coins configured in ${key}`);
    return coins;
  }

  private protectiveCloseOnly(query: Record<string, string>) {
    return parseBool(query.protectiveCloseOnly ?? query.partialCloseOnRetrace);
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
    this.logger.log(`Starting batch orders in Hedge mode, testing: ${params.isTesting}`, null, `ALL_${params.direction}_hedge`);

    const coins = this.configuredCoins(params.direction);

    const results = [];
    for await (const coin of coins) {
      const result = await this.okx.tradeOneCoin({ ...params, coin });
      results.push(...result);
    }
    return results;
  }

  @Post('buy-trigger-from-min-to-max/:coin')
  async openTriggerRange(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.okx.openTriggerRangeWithStopLoss(
      coin,
      this.parseDirection(query.direction),
      Number(query.minPrice),
      Number(query.maxPrice),
      {
        numberOfOrders: query.numberOfOrders ? Number(query.numberOfOrders) : undefined,
        stopLossPrice: query.stopLossPrice ? Number(query.stopLossPrice) : undefined,
        testing: query.testing !== 'false',
      },
    );
  }

  @Delete('cancel-orders/:coin')
  async cancelOneCoin(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.okx.cancelFutureOrdersForOneCoin(
      coin,
      this.parseDirection(query.direction),
      this.parseIntent(query.intent),
    );
  }

  @Delete('cancel-orders-one-coin/:coin')
  async cancelOneCoinAlias(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.cancelOneCoin(coin, query);
  }

  @Delete('cancel-all-orders')
  async cancelAll(@Query() query: Record<string, string>) {
    return this.okx.cancelFutureOrdersForAllCoins(
      this.parseDirection(query.direction),
      this.parseIntent(query.intent),
    );
  }

  @Get('orders-all-coins')
  async ordersAllCoins(@Query() query: Record<string, string>) {
    return this.okx.getFutureOrdersForAllCoins(
      this.parseDirection(query.direction),
      this.parseIntent(query.intent),
    );
  }

  @Get('orders-one-coin/:coin')
  async ordersOneCoin(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.okx.getFutureOrdersForOneCoin(
      coin,
      this.parseDirection(query.direction),
      this.parseIntent(query.intent),
    );
  }

  @Get('spot-bought-coins')
  async openPositions(@Query('direction') direction?: string) {
    return this.okx.getOpenFuturePositions(
      direction === undefined ? undefined : this.parseDirection(direction),
    );
  }

  @Post('sell-at-trigger-price/:coin')
  async closeAtTriggerPrice(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.okx.closePositionAtTriggerPrice(
      coin,
      this.parseDirection(query.direction),
      Number(query.price),
      query.percentage ? Number(query.percentage) : 100,
      query.testing !== 'false',
    );
  }

  @Post('close-at-price/:coin')
  async closeAtPrice(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.closeAtTriggerPrice(coin, query);
  }

  @Post('stop-loss-at-trigger-price/:coin')
  async stopLossAtTriggerPrice(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.okx.placePositionStopLossAtTriggerPrice(
      coin,
      this.parseDirection(query.direction),
      Number(query.price),
      query.percentage ? Number(query.percentage) : 100,
      query.testing !== 'false',
    );
  }

  @Post('reconcile-position-stop-loss/:coin')
  async reconcilePositionStopLoss(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.okx.reconcilePositionStopLoss(
      coin,
      this.parseDirection(query.direction),
      query.testing !== 'false',
    );
  }

  @Post('ensure-position-stop-loss/:coin')
  async ensurePositionStopLoss(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.reconcilePositionStopLoss(coin, query);
  }

  // Backward-compatible alias. This places a stop-loss around 0.2% from current price.
  @Post('sell-all-at-price/:coin')
  async closeAtCurrentPrice(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.okx.closePositionAtCurrentPrice(
      coin,
      this.parseDirection(query.direction),
      query.percentage ? Number(query.percentage) : 100,
      query.testing !== 'false',
    );
  }

  @Post('stop-loss-near-current-price/:coin')
  async stopLossNearCurrentPrice(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.closeAtCurrentPrice(coin, query);
  }

  @Post('protective-close-by-price-steps/:coin')
  async protectiveCloseByPriceSteps(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.okx.placeProtectiveCloseByPriceSteps(
      coin,
      this.parseDirection(query.direction),
      this.protectiveCloseOnly(query),
      parseBool(query.justOneOrder),
      query.testing !== 'false',
    );
  }

  @Post('sell-at-price/:coin')
  async closeAtPriceLadder(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.protectiveCloseByPriceSteps(coin, query);
  }

  @Post('protective-close-ladder/:coin')
  async protectiveCloseLadder(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.protectiveCloseByPriceSteps(coin, query);
  }

  @Post('close-ladder/:coin')
  async closeLadder(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.protectiveCloseByPriceSteps(coin, query);
  }

  @Post('protective-close-by-price-steps-all-coins')
  async protectiveCloseByPriceStepsAllCoins(@Query() query: Record<string, string>) {
    const direction = this.parseDirection(query.direction);
    const testing = query.testing !== 'false';
    this.logger.log(`FUTURE hedge protective close by price steps all coins start: direction=${direction}, testing=${testing}`, null, `ALL_${direction}_hedge`);
    const results = [];
    for (const coin of this.configuredCoins(direction)) {
      results.push({
        coin,
        direction,
        result: await this.okx.placeProtectiveCloseByPriceSteps(
          coin,
          direction,
          this.protectiveCloseOnly(query),
          parseBool(query.justOneOrder),
          testing,
        ),
      });
    }
    this.logger.log(`FUTURE hedge protective close by price steps all coins complete: direction=${direction}, testing=${testing}, coins=${results.length}`, null, `ALL_${direction}_hedge`);
    return results;
  }

  @Post('sell-at-price-all-coins')
  async closeAtPriceAllCoins(@Query() query: Record<string, string>) {
    return this.protectiveCloseByPriceStepsAllCoins(query);
  }

  @Post('protective-close-ladder-all-coins')
  async protectiveCloseLadderAllCoins(@Query() query: Record<string, string>) {
    return this.protectiveCloseByPriceStepsAllCoins(query);
  }

  @Post('close-ladder-all-coins')
  async closeLadderAllCoins(@Query() query: Record<string, string>) {
    return this.protectiveCloseByPriceStepsAllCoins(query);
  }

  @Post('clean-protective-close-by-price-steps-orders/:coin')
  async cleanProtectiveCloseByPriceStepsOrders(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.okx.cleanProtectiveCloseByPriceStepsOrdersForOneCoin(
      coin,
      this.parseDirection(query.direction),
      query.testing !== 'false',
    );
  }

  @Post('clean-close-orders/:coin')
  async cleanCloseOrders(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.cleanProtectiveCloseByPriceStepsOrders(coin, query);
  }

  @Post('clean-protective-close-orders/:coin')
  async cleanProtectiveCloseOrders(@Param('coin') coin: string, @Query() query: Record<string, string>) {
    return this.cleanProtectiveCloseByPriceStepsOrders(coin, query);
  }

  @Post('clean-protective-close-by-price-steps-orders-all-coins')
  async cleanProtectiveCloseByPriceStepsOrdersAllCoins(@Query() query: Record<string, string>) {
    const direction = this.parseDirection(query.direction);
    const testing = query.testing !== 'false';
    const results = [];
    for (const coin of this.configuredCoins(direction)) {
      results.push({
        coin,
        direction,
        result: await this.okx.cleanProtectiveCloseByPriceStepsOrdersForOneCoin(coin, direction, testing),
      });
    }
    return results;
  }

  @Post('clean-close-orders-all-coins')
  async cleanCloseOrdersAllCoins(@Query() query: Record<string, string>) {
    return this.cleanProtectiveCloseByPriceStepsOrdersAllCoins(query);
  }

  @Post('clean-protective-close-orders-all-coins')
  async cleanProtectiveCloseOrdersAllCoins(@Query() query: Record<string, string>) {
    return this.cleanProtectiveCloseByPriceStepsOrdersAllCoins(query);
  }
}

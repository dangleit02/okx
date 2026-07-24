import { BadRequestException, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { AllPendingOrdersTotal, AllSpotBoughtCoins, OkxService, PendingOrdersSide, PendingOrdersTotalResponse } from './okx.service';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../logger/logger.service';
import * as _ from 'lodash';
import { parseBool } from '../common/util';

@Controller()
export class SpotController {
  constructor(
    private readonly okxService: OkxService,
    private config: ConfigService,
    private readonly logger: AppLogger,
  ) { }

  @Get('balance')
  async getBalance(@Query('ccy') ccy?: string) {
    const result = await this.okxService.getAccountBalance(ccy);
    this.logger.log('Balance:', JSON.stringify(result, null, 2));
    return result;
  }

  @Get('spot-bought-coins')
  async getAllSpotBoughtCoins(
    @Query('format') format: string = 'table',
  ) {
    const result = await this.okxService.getAllSpotBoughtCoins();

    if (format.toLowerCase() === 'json') {
      return result;
    }

    const table = this.formatAllSpotBoughtCoinsAsTable(result);
    this.logger.log(table, 'All bought coins in spot');
    return table;
  }

  private formatAllSpotBoughtCoinsAsTable(result: AllSpotBoughtCoins): string {
    const headers = [
      'COIN',
      'AMOUNT (USDT)',
      'AVARAGE COST',
      'CURRENT PRICE',
      'PROFIT (%)',
      'PROFIT (USDT)',
    ];
    const rows = result.coins.map((coin) => [
      coin.coin,
      String(coin.amountUsdt),
      String(coin.averageCost),
      String(coin.currentPrice),
      String(coin.profitPercentage),
      String(coin.profitUsdt),
    ]);
    const widths = headers.map((header, index) =>
      Math.max(header.length, ...rows.map((row) => row[index].length)),
    );
    const formatRow = (row: string[]) =>
      row.map((value, index) => value.padEnd(widths[index])).join(' | ');
    const separator = widths.map((width) => '-'.repeat(width)).join('-+-');

    return [
      formatRow(headers),
      separator,
      ...rows.map(formatRow),
    ].join('\n');
  }

  @Get('orders-one-coin/:coin')
  async getOrdersTotalForCoin(
    @Param('coin') coin: string,
    @Query('side') side?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('step') step?: string,
    @Query('format') format: string = 'json',
  ) {
    if (side !== 'buy' && side !== 'sell') {
      throw new BadRequestException('side must be buy or sell');
    }

    const result = await this.okxService.getPendingOrdersTotalForCoin(coin, side, {
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      step: step ? Number(step) : undefined,
    });

    if (format.toLowerCase() === 'table') {
      const table = this.formatPendingOrdersAsTable(result, side);
      this.logger.log(table, `Pending ${side} orders table`, coin.toUpperCase());
      return table;
    }

    this.logger.log(
      JSON.stringify(result, null, 2),
      `Pending ${side} orders JSON`,
      coin.toUpperCase(),
    );
    return result;
  }

  private formatPendingOrdersAsTable(
    result: PendingOrdersTotalResponse,
    side: PendingOrdersSide,
  ): string {
    const headers = ['FROM PRICE', 'TO PRICE', `AMOUNT (${result.quoteCurrency})`];
    const rows = (result.ranges ?? []).map((range) => [
      String(range.fromPrice),
      String(range.toPrice),
      String(range.amount),
    ]);
    const widths = headers.map((header, index) =>
      Math.max(header.length, ...rows.map((row) => row[index].length)),
    );
    const formatRow = (row: string[]) =>
      row.map((value, index) => value.padEnd(widths[index])).join(' | ');
    const separator = widths.map((width) => '-'.repeat(width)).join('-+-');
    const filter = Object.entries(result.filter)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');

    return [
      `${result.instId} pending ${side.toUpperCase()} orders`,
      `Filter: ${filter || 'none'}`,
      `Summary: ${result.summary.orderCount} orders | ${result.summary.totalAmount} ${result.quoteCurrency}`,
      '',
      formatRow(headers),
      separator,
      ...(rows.length > 0 ? rows.map(formatRow) : ['No matching orders']),
    ].join('\n');
  }

  @Get('orders-all-coins')
  async getOrdersTotalForAllCoins(
    @Query('side') side?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('step') step?: string,
    @Query('format') format: string = 'table',
  ) {
    if (side !== 'buy' && side !== 'sell') {
      throw new BadRequestException('side must be buy or sell');
    }

    const result = await this.okxService.getPendingOrdersTotalForAllCoins(side, {
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      step: step ? Number(step) : undefined,
    });

    if (format.toLowerCase() === 'json') {
      this.logger.log(
        JSON.stringify(result, null, 2),
        `Pending ${side} orders all coins JSON`,
      );
      return result;
    }

    const table = this.formatAllPendingOrdersAsTable(result);
    this.logger.log(table, `Pending ${side} orders all coins table`);
    return table;
  }

  private formatAllPendingOrdersAsTable(
    result: AllPendingOrdersTotal,
  ): string {
    const hasRanges = result.filter.step !== undefined;
    const sortedCoins = [...result.coins].sort((left, right) =>
      left.coin.localeCompare(right.coin),
    );
    const formatTable = (headers: string[], rows: string[][]) => {
      const widths = headers.map((header, index) =>
        Math.max(header.length, ...rows.map((row) => row[index].length)),
      );
      const formatRow = (row: string[]) =>
        row.map((value, index) => value.padEnd(widths[index])).join(' | ');
      const separator = widths.map((width) => '-'.repeat(width)).join('-+-');
      return [formatRow(headers), separator, ...rows.map(formatRow)].join('\n');
    };
    const summaryHeaders = [
      'COIN',
      'CURENT PRICE',
      'FROM PRICE',
      'TO PRICE',
      'TOTAL AMOUNT (USDT)',
    ];
    const summaryRows = sortedCoins.map((coin) => [
      coin.coin,
      coin.currentPrice === undefined ? '' : String(coin.currentPrice),
      coin.minPrice === undefined ? '' : String(coin.minPrice),
      coin.maxPrice === undefined ? '' : String(coin.maxPrice),
      String(coin.totalAmount),
    ]);
    const tables = [
      'TABLE SUMMARY',
      formatTable(summaryHeaders, summaryRows),
    ];

    if (hasRanges) {
      const detailHeaders = ['COIN', 'FROM PRICE', 'TO PRICE', 'AMOUNT (USDT)'];
      const detailRows = sortedCoins.flatMap((coin) =>
        (coin.ranges ?? []).map((range) => [
        coin.coin,
        String(range.fromPrice),
        String(range.toPrice),
        String(range.amount),
        ]),
      );
      tables.push('', 'TABLE DETAIL', formatTable(detailHeaders, detailRows));
    }

    return tables.join('\n');
  }

  @Post('buy-at-price/:coin')
  async buyAtPrice(
    @Param('coin') coin: string,
    @Query('testing') testing: string,
    @Query('removeExistingBuyOrders') removeExistingBuyOrders: string, // 'true' or 'false' remove existing buy orders before placing new ones
    @Query('autobuy') autobuy: string,
  ) {
    const results = [];
    const isTesting = testing !== 'false';
    await this.okxService.buyOneCoin(isTesting, removeExistingBuyOrders, coin, results, autobuy);
    return results;
  }

  @Post('buy-at-price-all-coins')
  async buyAtPriceForAllCoins(
    @Query('testing') testing: string,
    @Query('removeExistingBuyOrders') removeExistingBuyOrders: string, // 'true' or 'false' remove existing buy orders before placing new ones
    @Query('autobuy') autobuy: string,
  ) {
    this.logger.log(`Starting to place all orders for all coins, testing mode: ${testing}`);
    let coins = this.config.get<any>(`coinsForBuy`);
    if (!coins) {
      throw new Error(`No configuration found for coins: ${JSON.stringify(coins)}`);
    }
    coins = _.uniq(coins);
    this.logger.log(`Coins to process: ${JSON.stringify(coins)}`);
    const isTesting = testing !== 'false';
    const results = [];
    for await (const coin of coins) {
      this.logger.log(`Processing coin: ${coin.toUpperCase()}`);
      await this.okxService.buyOneCoin(isTesting, removeExistingBuyOrders, coin, results, autobuy);
    }
    return results;
  }

  @Post('buy-trigger-from-min-to-max/:coin')
  async buyTriggerFromMinToMax(
    @Param('coin') coin: string,
    @Query() query: Record<string, string>,
  ) {
    const isTesting = query.testing !== 'false';
    const minPrice = Number(query.minPrice);
    const maxPrice = Number(query.maxPrice);
    const numberOfOrders = query.numberOfOrders ?? query.numberOfSteps;
    const direction = query.direction ?? 'down';
    const results = [];

    if (direction !== 'up' && direction !== 'down') {
      throw new BadRequestException('direction must be up or down');
    }

    const currentPrice = await this.okxService.validateBuyTriggerPriceDirection(
      coin,
      minPrice,
      maxPrice,
      direction,
    );

    if (!isTesting && parseBool(query.removeExistingBuyOrders)) {
      const res = await this.okxService.cancelOpenConditionSpotOrdersForOneCoin(coin, 'buy');
      this.logger.log('Cancel existing buy orders:', JSON.stringify(res, null, 2));
      results.push({ coin, action: 'cancel_existing_buy_orders', result: res });
    }

    const res = await this.okxService.buyTriggerFromMinPriceToMaxPrice(
      coin,
      minPrice,
      maxPrice,
      isTesting,
      {
        numberOfOrders: numberOfOrders ? Number(numberOfOrders) : undefined,
        addStopLoss: parseBool(query.addStopLoss),
        direction,
        currentPrice,
      },
    );
    this.logger.log('Place trigger buy orders from min to max:', JSON.stringify(res, null, 2), coin);
    results.push({ coin, action: 'place_trigger_buy_orders_from_min_to_max', result: res });
    return results;
  }

  @Post('sell-at-price/:coin')
  async sellAtPrice(
    @Param('coin') coin: string,
    @Query('testing') testing: string,
    @Query('removeExistingSellOrders') removeExistingSellOrders: string, // 'true' or 'false' remove existing sell orders before placing new ones 
    @Query('addSellStopLoss') addSellStopLoss: string, // 'true' or 'false' add stop loss order
    @Query('addSellTakeProfit') addSellTakeProfit: string, // 'true' or 'false' add take profit order
    @Query('onlyForDown') onlyForDown: string, // 'true' or 'false' only add sell orders for down strategy
    @Query('justOneOrder') justOneOrder: string, // 'true' or 'false' only add one order for each type
  ) {
    const isTesting = testing !== 'false';
    const results = [];
    await this.okxService.sellOneCoin({ coin, isTesting, removeExistingSellOrders, addSellStopLoss, addSellTakeProfit, onlyForDown, justOneOrder, results });
    return results;
  }

  @Post('sell-all-at-price/:coin')
  async sellAllAtCurrentPrice(
    @Param('coin') coin: string,
    @Query('percentage') percentage: string,
    @Query('testing') testing?: string,
  ) {
    return this.okxService.sellAllAtCurrentPrice(
      coin,
      Number(percentage),
      testing !== 'false',
    );
  }

  @Post('sell-at-trigger-price/:coin')
  async sellAtTriggerPrice(
    @Param('coin') coin: string,
    @Query('price') price: string,
    @Query('percentage') percentage: string,
    @Query('testing') testing?: string,
  ) {
    return this.okxService.sellAtTriggerPrice(
      coin,
      Number(price),
      Number(percentage),
      testing !== 'false',
    );
  }

  @Post('sell-at-price-all-coins')
  async sellAtPriceAllCoins(
    @Query('testing') testing: string,
    @Query('removeExistingSellOrders') removeExistingSellOrders: string, // 'true' or 'false' remove existing sell orders before placing new ones 
    @Query('addSellStopLoss') addSellStopLoss: string, // 'true' or 'false' add stop loss order
    @Query('addSellTakeProfit') addSellTakeProfit: string, // 'true' or 'false' add take profit order
    @Query('onlyForDown') onlyForDown: string, // 'true' or 'false' only add sell orders for down strategy
    @Query('justOneOrder') justOneOrder: string, // 'true' or 'false' only add one order for each type
  ) {
    const isTesting = testing !== 'false';

    this.logger.log(`Starting to place all orders for all coins, testing mode: ${testing}`);
    return this.okxService.sellAtPriceAllCoins({
      isTesting,
      removeExistingSellOrders,
      addSellStopLoss,
      addSellTakeProfit,
      onlyForDown,
      justOneOrder,
    });
  }

  @Post('cancel-all-orders')
  async cancelAllOrders(
    @Query('side') side?: 'buy' | 'sell' | null,
  ) {
    return await this.okxService.cancelAllOpenConditionSpotOrders(side);
  }

  @Post('cancel-orders/:coin')
  async cancelOrdersForOneCoin(
    @Param('coin') coin: string,
    @Query('side') side?: 'buy' | 'sell' | null,
  ) {
    return await this.okxService.cancelOpenConditionSpotOrdersForOneCoin(coin, side);
  }

  @Delete('cancel-orders-one-coin/:coin')
  async cancelOrdersForOneCoinByPriceRange(
    @Param('coin') coin: string,
    @Query('side') side?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('testing') testing?: string,
  ) {
    if (side !== 'buy' && side !== 'sell') {
      throw new BadRequestException('side must be buy or sell');
    }

    return this.okxService.cancelPendingOrdersByPriceRange(
      coin,
      side,
      Number(minPrice),
      Number(maxPrice),
      testing !== 'false',
    );
  }

  // @Post('order-multiple/:coin')
  // placeMultipleOrders(@Param('coin') coin: string, @Query('testing') testing: string) {
  //   const isTesting = testing !== 'false';
  //   return this.okxService.placeMultipleBuyOrdersFromMinPriceToMaxPrice(coin, isTesting);
  // }

  // @Post('order-all-for-up')
  // async placeAllForUpOrders(@Query('testing') testing: string) {
  //   const isTesting = testing !== 'false';
  //   return this.okxService.placeBuyOrdersForAllCoinsForBuyFromMinPriceToMaxPriceForUp(isTesting);
  // }

  // @Post('order-for-up-one-coin/:coin')
  // async placeOrdersForUpOneCoin(@Param('coin') coin: string, @Query('testing') testing: string) {
  //   const isTesting = testing !== 'false';
  //   if (!isTesting) {
  //     await this.okxService.cancelAllTypeOfOpenOrdersForOneCoin(coin, 'SPOT');
  //   }
  //   return this.okxService.placeMultipleBuyOrdersFromMinPriceToMaxPriceForUp(coin, isTesting);
  // }

  // @Post('order-all-for-down')
  // async placeAllForDownOrders(@Query('testing') testing: string) {
  //   const isTesting = testing !== 'false';
  //   if (!isTesting) {
  //     await this.okxService.cancelAllTypeOfOpenOrders('SPOT', 'sell');
  //   }
  //   return this.okxService.placeAllSellOrdersForDown(isTesting);
  // }

  // @Post('order-for-down-one-coin/:coin')
  // async placeOrdersForDownOneCoin(@Param('coin') coin: string, @Query('testing') testing: string) {
  //   const isTesting = testing !== 'false';
  //   if (!isTesting) {
  //     await this.okxService.cancelAllTypeOfOpenOrdersForOneCoin(coin, 'SPOT', 'sell');
  //   }
  //   return this.okxService.placeMultipleSellOrdersForDown(coin, isTesting);
  // }


  // @Post('buy-rebound-one/:coin')
  // async buyRebound(
  //   @Param('coin') coin: string,
  //   @Query('sz') sz: string,
  //   @Query('low') low: string,
  //   @Query('high') high: string,
  //   @Query('testing') testing: string
  // ) {
  //   const isTesting = testing !== 'false';
  //   const instId = `${coin.toUpperCase()}-USDT`;
  //   const triggerPxLow = Number(low);
  //   const triggerPxHigh = Number(high);
  //   this.tradingOneService.start(instId, sz, triggerPxLow, triggerPxHigh, isTesting);    
  //   return { message: `Monitoring ${instId} for rebound strategy...` };
  // }

  // @Post('stop-one/:coin')
  // stop(@Param('coin') coin: string) {
  //   const instId = `${coin.toUpperCase()}-USDT`;
  //   this.tradingOneService.stop(instId);
  //   return { message: 'Stopped monitoring.' };
  // }

  // @Post('stop-all-one')
  // stopAll() {
  //   this.tradingOneService.stopAll;
  //   return { message: 'Stopped monitoring.' };
  // }

  // @Post('buy-rebound-multiple/:coin')
  // async buyReboundMultiple(
  //   @Param('coin') coin: string,
  //   @Query('testing') testing: string
  // ) {
  //   const isTesting = testing !== 'false';
  //   this.tradingMultipleService.start(coin, isTesting);    
  //   return { message: `Monitoring ${coin.toUpperCase()} for rebound strategy...` };
  // }

  // @Post('stop-multiple/:coin')
  // stopMultiple(@Param('coin') coin: string) {
  //   const instId = `${coin.toUpperCase()}-USDT`;
  //   this.tradingMultipleService.stop(instId);
  //   return { message: 'Stopped monitoring.' };
  // }

  // @Post('stop-all-multiple')
  // stopAllMultiple() {
  //   this.tradingMultipleService.stopAll;
  //   return { message: 'Stopped monitoring.' };
  // }
}

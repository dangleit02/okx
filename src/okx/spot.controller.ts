import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  AllPendingOrdersTotal,
  AllSpotBoughtCoins,
  OkxService,
  PendingAlgoOrderType,
  PendingOrdersSide,
  PendingOrdersTotalResponse,
} from './okx.service';
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
  ) {}

  private parseAlgoOrderType(value?: string): PendingAlgoOrderType {
    const ordType = value ?? 'all';
    if (
      ordType !== 'trigger' &&
      ordType !== 'conditional' &&
      ordType !== 'all'
    ) {
      throw new BadRequestException(
        'ordType must be trigger, conditional or all',
      );
    }
    return ordType;
  }

  @Get('balance')
  async getBalance(@Query('ccy') ccy?: string) {
    const result = await this.okxService.getAccountBalance(ccy);
    this.logger.log('Balance:', JSON.stringify(result, null, 2));
    return result;
  }

  @Get('spot-bought-coins')
  async getAllSpotBoughtCoins(@Query('format') format: string = 'table') {
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
      'NUMBER OF COIN',
      'AMOUNT (USDT)',
      'AVERAGE COST',
      'CURRENT PRICE',
      'PROFIT (USDT)',
    ];
    const rows = [...result.coins]
      .sort((left, right) => left.coin.localeCompare(right.coin))
      .map((coin) => [
        coin.coin,
        String(coin.numberOfCoins),
        String(coin.amountUsdt),
        String(coin.averageCost),
        `${coin.currentPrice} (${coin.profitPercentage}%)`,
        String(coin.profitUsdt),
      ]);
    const widths = headers.map((header, index) =>
      Math.max(header.length, ...rows.map((row) => row[index].length)),
    );
    const formatRow = (row: string[]) =>
      row.map((value, index) => value.padEnd(widths[index])).join(' | ');
    const separator = widths.map((width) => '-'.repeat(width)).join('-+-');

    return [formatRow(headers), separator, ...rows.map(formatRow)].join('\n');
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

    const result = await this.okxService.getPendingOrdersTotalForCoin(
      coin,
      side,
      {
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        step: step ? Number(step) : undefined,
      },
    );

    if (format.toLowerCase() === 'table') {
      const table = this.formatPendingOrdersAsTable(result, side);
      this.logger.log(
        table,
        `Pending ${side} orders table`,
        coin.toUpperCase(),
      );
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
    const headers = [
      'FROM PRICE',
      'TO PRICE',
      `AMOUNT (${result.quoteCurrency})`,
    ];
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

    const boughtCoinsPromise =
      format.toLowerCase() === 'json'
        ? undefined
        : this.okxService.getAllSpotBoughtCoins();
    const result = await this.okxService.getPendingOrdersTotalForAllCoins(
      side,
      {
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        step: step ? Number(step) : undefined,
      },
    );

    if (format.toLowerCase() === 'json') {
      this.logger.log(
        JSON.stringify(result, null, 2),
        `Pending ${side} orders all coins JSON`,
      );
      return result;
    }

    const boughtCoins = await boughtCoinsPromise;
    const totalBoughtUsdtByCoin = new Map(
      (boughtCoins?.coins ?? []).map((coin) => [
        coin.coin.toUpperCase(),
        coin.amountUsdt,
      ]),
    );
    const currentProfitPercentageByCoin = new Map(
      (boughtCoins?.coins ?? []).map((coin) => [
        coin.coin.toUpperCase(),
        coin.profitPercentage,
      ]),
    );
    const averageCostByCoin = new Map(
      (boughtCoins?.coins ?? []).map((coin) => [
        coin.coin.toUpperCase(),
        coin.averageCost,
      ]),
    );
    const table = this.formatAllPendingOrdersAsTable(
      result,
      totalBoughtUsdtByCoin,
      currentProfitPercentageByCoin,
      averageCostByCoin,
    );
    this.logger.log(table, `Pending ${side} orders all coins table`);
    return table;
  }

  private formatAllPendingOrdersAsTable(
    result: AllPendingOrdersTotal,
    totalBoughtUsdtByCoin: Map<string, number>,
    currentProfitPercentageByCoin: Map<string, number>,
    averageCostByCoin: Map<string, number>,
  ): string {
    const hasRanges = result.filter.step !== undefined;
    const sortedCoins = [...result.coins].sort(
      (left, right) =>
        left.coin.localeCompare(right.coin) ||
        (left.minPrice ?? Number.POSITIVE_INFINITY) -
          (right.minPrice ?? Number.POSITIVE_INFINITY) ||
        left.orderType.localeCompare(right.orderType),
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
    const formatProfitPercentage = (
      price: number | undefined,
      referencePrice: number | undefined,
    ) => {
      if (
        price === undefined ||
        referencePrice === undefined ||
        !Number.isFinite(price) ||
        !Number.isFinite(referencePrice) ||
        referencePrice <= 0
      ) {
        return '';
      }

      return String(
        Number((((price - referencePrice) / referencePrice) * 100).toFixed(2)),
      );
    };
    const formatPriceWithProfit = (
      price: number | undefined,
      profitPercentage: string | number | undefined,
    ) => {
      if (price === undefined) return '';
      if (profitPercentage === undefined || profitPercentage === '')
        return String(price);
      return `${price} (${profitPercentage}%)`;
    };
    const summaryHeaders = [
      'COIN',
      'ORDER TYPE',
      'CURRENT PRICE',
      'AVERAGE COST',
      'FROM PRICE',
      'TO PRICE',
      'ORDER COUNT',
      'TOTAL AMOUNT (USDT)',
      'TOTAL BOUGHT (USDT)',
      'ERROR',
    ];
    const summaryRows = sortedCoins.map((coin) => [
      coin.coin,
      coin.orderType.toUpperCase(),
      formatPriceWithProfit(
        coin.currentPrice,
        currentProfitPercentageByCoin.get(coin.coin.toUpperCase()),
      ),
      averageCostByCoin.has(coin.coin.toUpperCase())
        ? String(averageCostByCoin.get(coin.coin.toUpperCase()))
        : '',
      formatPriceWithProfit(
        coin.minPrice,
        formatProfitPercentage(
          coin.minPrice,
          averageCostByCoin.get(coin.coin.toUpperCase()),
        ),
      ),
      formatPriceWithProfit(
        coin.maxPrice,
        formatProfitPercentage(
          coin.maxPrice,
          averageCostByCoin.get(coin.coin.toUpperCase()),
        ),
      ),
      String(coin.orderCount),
      String(coin.totalAmount),
      String(totalBoughtUsdtByCoin.get(coin.coin.toUpperCase()) ?? 0),
      coin.error ?? '',
    ]);
    const tables = ['TABLE SUMMARY', formatTable(summaryHeaders, summaryRows)];

    if (hasRanges) {
      const detailHeaders = [
        'COIN',
        'ORDER TYPE',
        'FROM PRICE',
        'TO PRICE',
        'AMOUNT (USDT)',
      ];
      const detailItems = sortedCoins
        .flatMap((coin) =>
          (coin.ranges ?? []).map((range) => ({ coin, range })),
        )
        .sort(
          (left, right) =>
            left.coin.coin.localeCompare(right.coin.coin) ||
            left.range.fromPrice - right.range.fromPrice ||
            left.coin.orderType.localeCompare(right.coin.orderType) ||
            left.range.toPrice - right.range.toPrice,
        );
      const detailRows = detailItems.map(({ coin, range }) => {
        const profitReferencePrice =
          result.side === 'buy'
            ? coin.currentPrice
            : averageCostByCoin.get(coin.coin.toUpperCase());

        return [
          coin.coin,
          coin.orderType.toUpperCase(),
          formatPriceWithProfit(
            range.fromPrice,
            formatProfitPercentage(range.fromPrice, profitReferencePrice),
          ),
          formatPriceWithProfit(
            range.toPrice,
            formatProfitPercentage(range.toPrice, profitReferencePrice),
          ),
          String(range.amount),
        ];
      });
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
    await this.okxService.buyOneCoin(
      isTesting,
      removeExistingBuyOrders,
      coin,
      results,
      autobuy,
    );
    return results;
  }

  @Post('buy-at-price-all-coins')
  async buyAtPriceForAllCoins(
    @Query('testing') testing: string,
    @Query('removeExistingBuyOrders') removeExistingBuyOrders: string, // 'true' or 'false' remove existing buy orders before placing new ones
    @Query('autobuy') autobuy: string,
  ) {
    this.logger.log(
      `Starting to place all orders for all coins, testing mode: ${testing}`,
    );
    let coins = this.config.get<any>(`coinsForBuy`);
    if (!coins) {
      throw new Error(
        `No configuration found for coins: ${JSON.stringify(coins)}`,
      );
    }
    coins = _.uniq(coins);
    this.logger.log(`Coins to process: ${JSON.stringify(coins)}`);
    const isTesting = testing !== 'false';
    const results = [];
    for await (const coin of coins) {
      this.logger.log(`Processing coin: ${coin.toUpperCase()}`);
      await this.okxService.buyOneCoin(
        isTesting,
        removeExistingBuyOrders,
        coin,
        results,
        autobuy,
      );
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
      const res = await this.okxService.cancelPendingSpotOrdersForOneCoin(
        coin,
        'buy',
        'trigger',
        false,
      );
      this.logger.log(
        'Cancel existing buy orders:',
        JSON.stringify(res, null, 2),
      );
      results.push({ coin, action: 'cancel_existing_buy_orders', result: res });
    }

    const res = await this.okxService.buyTriggerFromMinPriceToMaxPrice(
      coin,
      minPrice,
      maxPrice,
      isTesting,
      {
        numberOfOrders: numberOfOrders ? Number(numberOfOrders) : undefined,
        buyWithoutCheckAvarageCost:
          query.buyWithoutCheckAvarageCost === undefined
            ? true
            : parseBool(query.buyWithoutCheckAvarageCost),
        direction,
        currentPrice,
      },
    );
    this.logger.log(
      'Place trigger buy orders from min to max:',
      JSON.stringify(res, null, 2),
      coin,
    );
    results.push({
      coin,
      action: 'place_trigger_buy_orders_from_min_to_max',
      result: res,
    });
    return results;
  }

  @Post('buy-near-current-price/:coin')
  async buyNearCurrentPrice(
    @Param('coin') coin: string,
    @Query('amountUsdt') amountUsdt?: string,
    @Query('testing') testing?: string,
  ) {
    return this.okxService.placeSpotBuyNearCurrentPrice(
      coin,
      amountUsdt === undefined ? undefined : Number(amountUsdt),
      testing !== 'false',
    );
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
    await this.okxService.sellOneCoin({
      coin,
      isTesting,
      removeExistingSellOrders,
      addSellStopLoss,
      addSellTakeProfit,
      onlyForDown,
      justOneOrder,
      results,
    });
    return results;
  }

  @Post('take-profit-at-trigger-price/:coin')
  async takeProfitAtTriggerPrice(
    @Param('coin') coin: string,
    @Query('price') price: string,
    @Query('percentage') percentage: string,
    @Query('testing') testing?: string,
  ) {
    return this.okxService.placeSpotTakeProfitAtTriggerPrice(
      coin,
      Number(price),
      Number(percentage),
      testing !== 'false',
    );
  }

  @Post('ensure-position-stop-loss/:coin')
  async ensurePositionStopLoss(
    @Param('coin') coin: string,
    @Query('testing') testing?: string,
  ) {
    return this.okxService.ensureSpotStopLoss(coin, testing !== 'false');
  }

  @Post('stop-loss-at-trigger-price/:coin')
  async stopLossAtTriggerPrice(
    @Param('coin') coin: string,
    @Query('price') price: string,
    @Query('percentage') percentage?: string,
    @Query('testing') testing?: string,
  ) {
    return this.okxService.placeSpotStopLossAtTriggerPrice(
      coin,
      Number(price),
      percentage ? Number(percentage) : 100,
      testing !== 'false',
    );
  }

  @Post('stop-loss-near-current-price/:coin')
  async stopLossNearCurrentPrice(
    @Param('coin') coin: string,
    @Query('percentage') percentage?: string,
    @Query('testing') testing?: string,
  ) {
    return this.okxService.placeSpotStopLossNearCurrentPrice(
      coin,
      percentage ? Number(percentage) : 100,
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

    this.logger.log(
      `Starting to place all orders for all coins, testing mode: ${testing}`,
    );
    return this.okxService.sellAtPriceAllCoins({
      isTesting,
      removeExistingSellOrders,
      addSellStopLoss,
      addSellTakeProfit,
      onlyForDown,
      justOneOrder,
    });
  }

  @Delete('cancel-all-orders')
  async cancelAllOrders(
    @Query('side') side?: 'buy' | 'sell' | null,
    @Query('ordType') ordType?: string,
    @Query('testing') testing?: string,
  ) {
    return this.okxService.cancelAllPendingSpotOrders(
      side,
      this.parseAlgoOrderType(ordType),
      testing !== 'false',
    );
  }

  @Delete('cancel-orders/:coin')
  async cancelOrdersForOneCoin(
    @Param('coin') coin: string,
    @Query('side') side?: 'buy' | 'sell' | null,
    @Query('ordType') ordType?: string,
    @Query('testing') testing?: string,
  ) {
    return this.okxService.cancelPendingSpotOrdersForOneCoin(
      coin,
      side,
      this.parseAlgoOrderType(ordType),
      testing !== 'false',
    );
  }

  @Post('clean-sell-orders/:coin')
  async cleanSellOrdersForOneCoin(
    @Param('coin') coin: string,
    @Query('testing') testing?: string,
  ) {
    return this.okxService.cleanSellOrdersForOneCoin(coin, testing !== 'false');
  }

  @Post('clean-sell-orders-all-coins')
  async cleanSellOrdersForAllCoins(@Query('testing') testing?: string) {
    return this.okxService.cleanSellOrdersForAllCoins(testing !== 'false');
  }

  @Delete('cancel-orders-one-coin/:coin')
  async cancelOrdersForOneCoinByPriceRange(
    @Param('coin') coin: string,
    @Query('side') side?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('ordType') ordType?: string,
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
      this.parseAlgoOrderType(ordType),
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

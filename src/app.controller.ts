import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { OkxService } from './okx.service';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from './common/logger.service';
import * as _ from 'lodash';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly okxService: OkxService,
    private config: ConfigService,
    private readonly logger: AppLogger,
  ) { }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('balance')
  async getBalance(@Query('ccy') ccy?: string) {
    const result = await this.okxService.getAccountBalance(ccy);
    this.logger.log('Balance:', JSON.stringify(result, null, 2));
    return result;
  }

  @Post('buy-at-price/:coin')
  async buyAtPrice(
    @Param('coin') coin: string,
    @Query('testing') testing: string,
    @Query('removeExistingBuyOrders') removeExistingBuyOrders: string, // 'true' or 'false' remove existing buy orders before placing new ones
    @Query('addBuySurprisePrice') addBuySurprisePrice: string, // 'true' or 'false' add surprise price order
    @Query('numberOfUSDT') numberOfUSDT: number, // number of USDT to use for this coin
    @Query('autobuy') autobuy: string,
  ) {
    const results = [];
    const isTesting = testing !== 'false';
    await this.okxService.buyOneCoin(isTesting, removeExistingBuyOrders, coin, results, addBuySurprisePrice, numberOfUSDT, autobuy);
    return results;
  }

  @Post('buy-at-price-all-coins')
  async buyAtPriceForAllCoins(
    @Query('testing') testing: string,
    @Query('removeExistingBuyOrders') removeExistingBuyOrders: string, // 'true' or 'false' remove existing buy orders before placing new ones
    @Query('addBuySurprisePrice') addBuySurprisePrice: string, // 'true' or 'false' add surprise price order
    @Query('numberOfUSDT') numberOfUSDT: number, // number of USDT to use for this coin
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
      this.logger.log(`Processing coin: ${coin}`);
      await this.okxService.buyOneCoin(isTesting, removeExistingBuyOrders, coin, results, addBuySurprisePrice, numberOfUSDT, autobuy);
    }
    return results;
  }

  @Post('sell-at-price/:coin')
  async sellAtPrice(
    @Param('coin') coin: string,
    @Query('testing') testing: string,
    @Query('removeExistingSellOrders') removeExistingSellOrders: string, // 'true' or 'false' remove existing sell orders before placing new ones 
    @Query('addSellStopLoss') addSellStopLoss: string, // 'true' or 'false' add stop loss order
    @Query('addSellSurprisePrice') addSellSurprisePrice: string, // 'true' or 'false' add surprise price order
    @Query('addSellTakeProfit') addSellTakeProfit: string, // 'true' or 'false' add take profit order
    @Query('onlyForDown') onlyForDown: string, // 'true' or 'false' only add sell orders for down strategy
    @Query('justOneOrder') justOneOrder: string, // 'true' or 'false' only add one order for each type
  ) {
    const results = [];
    const isTesting = testing !== 'false';
    await await this.okxService.sellOneCoin(isTesting, removeExistingSellOrders, coin, results, addSellSurprisePrice, addSellStopLoss, addSellTakeProfit, onlyForDown, justOneOrder);
    return results;
  }

  @Post('sell-at-price-all-coins')
  async sellAtPriceAllCoins(
    @Query('testing') testing: string,
    @Query('removeExistingSellOrders') removeExistingSellOrders: string, // 'true' or 'false' remove existing sell orders before placing new ones 
    @Query('addSellStopLoss') addSellStopLoss: string, // 'true' or 'false' add stop loss order
    @Query('addSellSurprisePrice') addSellSurprisePrice: string, // 'true' or 'false' add surprise price order
    @Query('addSellTakeProfit') addSellTakeProfit: string, // 'true' or 'false' add take profit order
    @Query('onlyForDown') onlyForDown: string, // 'true' or 'false' only add sell orders for down strategy
    @Query('justOneOrder') justOneOrder: string, // 'true' or 'false' only add one order for each type
  ) {
    const isTesting = testing !== 'false';

    this.logger.log(`Starting to place all orders for all coins, testing mode: ${testing}`);
    let coins = this.config.get<any>(`coinsForTakeProfit`);
    if (!coins) {
      throw new Error(`No configuration found for coins: ${JSON.stringify(coins)}`);
    }
    coins = _.uniq(coins);
    this.logger.log(`Coins to process: ${JSON.stringify(coins)}`);
    const results = [];
    for await (const coin of coins) {
      this.logger.log(`Processing coin: ${coin}`);
      await this.okxService.sellOneCoin(isTesting, removeExistingSellOrders, coin, results, addSellSurprisePrice, addSellStopLoss, addSellTakeProfit, onlyForDown, justOneOrder);
    }

    return results;
  }

  @Post('cancel-all-orders')
  async cancelAllOrders(
    @Query('side') side?: 'buy' | 'sell' | null,
  ) {
    return await this.okxService.cancelAllTypeOfOpenOrders(side);
  }

  @Post('cancel-orders/:coin')
  async cancelOrdersForOneCoin(
    @Param('coin') coin: string,
    @Query('side') side?: 'buy' | 'sell' | null,
  ) {
    return await this.okxService.cancelAllTypeOfOpenOrdersForOneCoin(coin, side);
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
  //   const instId = `${coin}-USDT`;
  //   const triggerPxLow = parseFloat(low);
  //   const triggerPxHigh = parseFloat(high);
  //   this.tradingOneService.start(instId, sz, triggerPxLow, triggerPxHigh, isTesting);    
  //   return { message: `Monitoring ${instId} for rebound strategy...` };
  // }

  // @Post('stop-one/:coin')
  // stop(@Param('coin') coin: string) {
  //   const instId = `${coin}-USDT`;
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
  //   return { message: `Monitoring ${coin} for rebound strategy...` };
  // }

  // @Post('stop-multiple/:coin')
  // stopMultiple(@Param('coin') coin: string) {
  //   const instId = `${coin}-USDT`;
  //   this.tradingMultipleService.stop(instId);
  //   return { message: 'Stopped monitoring.' };
  // }

  // @Post('stop-all-multiple')
  // stopAllMultiple() {
  //   this.tradingMultipleService.stopAll;
  //   return { message: 'Stopped monitoring.' };
  // }
}

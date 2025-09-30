import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { OkxService } from './okx.service';
import { OkxWsMultiTradingService } from './okx-ws-multi-trading.service';
import { OkxWsOneTradingService } from './okx-ws-one-trading.service';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from './common/logger.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly okxService: OkxService,
    private config: ConfigService,
    private readonly logger: AppLogger,
    // private readonly tradingOneService: OkxWsOneTradingService,
    // private readonly tradingMultipleService: OkxWsMultiTradingService,
  ) { }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('balance')
  async getBalance(@Query('ccy') ccy?: string) {
    const result = await this.okxService.getAccountBalance(ccy);
    console.log('Balance:', JSON.stringify(result, null, 2));
    return result;
  }

  @Post('buy-at-price/:coin')
  async buyAtPrice(
    @Param('coin') coin: string,
    @Query('testing') testing: string,
    @Query('removeExistingBuyOrders') removeExistingBuyOrders: string, // 'true' or 'false' remove existing buy orders before placing new ones
    @Query('addBuyWhenUp') addBuyWhenUp: string, // 'true' or 'false' add take profit order
    @Query('addBuySurprisePrice') addBuySurprisePrice: string, // 'true' or 'false' add surprise price order
  ) {
   const results = [];
    const isTesting = testing !== 'false';
    if (!isTesting) {
      if (removeExistingBuyOrders === 'true') {
        const res1 = await this.okxService.cancelAllTypeOfOpenOrdersForOneCoin(coin, 'SPOT', 'buy');
        console.log('Cancel existing buy orders:', JSON.stringify(res1, null, 2));
        results.push({ coin, action: 'cancel_existing_buy_orders', result: res1 });
      }
    }
    if (addBuyWhenUp === 'true') {
      const res2 = await this.okxService.placeMultipleBuyOrdersForUp(coin, isTesting);
      console.log('Place multiple buy orders for up:', JSON.stringify(res2, null, 2));
      results.push({ coin, action: 'place_multiple_buy_orders_for_up', result: res2 });
    }
    if (addBuySurprisePrice === 'true') {
      const res4 = await this.okxService.placeSurprisePriceBuyOrder(coin, isTesting);
      console.log('Place surprise price buy order:', JSON.stringify(res4, null, 2));
      results.push({ coin, action: 'place_surprise_price_buy_order', result: res4 });
    }
    return results;
  }

  @Post('buy-at-price-all-coins')
  async buyAtPriceForAllCoins(
    @Query('testing') testing: string,
    @Query('removeExistingBuyOrders') removeExistingBuyOrders: string, // 'true' or 'false' remove existing buy orders before placing new ones
    @Query('addBuyWhenUp') addBuyWhenUp: string, // 'true' or 'false' add take profit order
    @Query('addBuySurprisePrice') addBuySurprisePrice: string, // 'true' or 'false' add surprise price order
  ) {
    this.logger.log(`Starting to place all orders for all coins, testing mode: ${testing}`);
    const coins = this.config.get<any>(`coinsForBuy`);
    if (!coins) {
      throw new Error(`No configuration found for coins: ${JSON.stringify(coins)}`);
    }
    this.logger.log(`Coins to process: ${JSON.stringify(coins)}`);
    const isTesting = testing !== 'false';
    const results = [];
    for await (const coin of coins) {
      this.logger.log(`Processing coin: ${coin}`);
      if (!isTesting) {
        if (removeExistingBuyOrders === 'true') {
          const res1 = await this.okxService.cancelAllTypeOfOpenOrdersForOneCoin(coin, 'SPOT', 'buy');
          console.log('Cancel existing buy orders:', JSON.stringify(res1, null, 2));
          results.push({ coin, action: 'cancel_existing_buy_orders', result: res1 });
        }
      }
      if (addBuyWhenUp === 'true') {
        const res2 = await this.okxService.placeMultipleBuyOrdersForUp(coin, isTesting);
        console.log('Place multiple buy orders for up:', JSON.stringify(res2, null, 2));
        results.push({ coin, action: 'place_multiple_buy_orders_for_up', result: res2 });
      }
      if (addBuySurprisePrice === 'true') {
        const res4 = await this.okxService.placeSurprisePriceBuyOrder(coin, isTesting);
        console.log('Place surprise price buy order:', JSON.stringify(res4, null, 2));
        results.push({ coin, action: 'place_surprise_price_buy_order', result: res4 });
      }
    }
    return results;
  }

  @Post('sell-at-price/:coin')
  async saleAtPrice(
    @Param('coin') coin: string,
    @Query('testing') testing: string,
    @Query('removeExistingSellOrders') removeExistingSellOrders: string, // 'true' or 'false' remove existing sell orders before placing new ones 
    @Query('addSellWhenDown') addSellWhenDown: string, // 'true' or 'false' add take profit order
    @Query('addSellStopLoss') addSellStopLoss: string, // 'true' or 'false' add stop loss order
    @Query('addSellSurprisePrice') addSellSurprisePrice: string, // 'true' or 'false' add surprise price order
  ) {
    const results = [];
    const isTesting = testing !== 'false';
    if (!isTesting) {
      if (removeExistingSellOrders === 'true') {
        const res1 = await this.okxService.cancelAllTypeOfOpenOrdersForOneCoin(coin, 'SPOT', 'sell');
        console.log('Cancel existing sell orders:', JSON.stringify(res1, null, 2));
        results.push({ coin, action: 'cancel_existing_sell_orders', result: res1 });
      }
    }
    if (addSellWhenDown === 'true') {
      const res2 = await this.okxService.placeMultipleSellOrdersForDown(coin, isTesting);
      console.log('Place multiple sell orders for down:', JSON.stringify(res2, null, 2));
      results.push({ coin, action: 'place_multiple_sell_orders_for_down', result: res2 });
    }
    if (addSellSurprisePrice === 'true') {
      const res4 = await this.okxService.placeSurprisePriceSellOrder(coin, isTesting);
      console.log('Place surprise price sell order:', JSON.stringify(res4, null, 2));
      results.push({ coin, action: 'place_surprise_price_sell_order', result: res4 });
    }
    if (addSellStopLoss === 'true') {
      const res3 = await this.okxService.placeStopLossOrder(coin, isTesting);
      console.log('Place stop loss order:', JSON.stringify(res3, null, 2));
      results.push({ coin, action: 'place_stop_loss_order', result: res3 });
    }
    return results;
  }

  @Post('sell-at-price-all-coins')
  async saveAtPriceAllCoins(
    @Query('testing') testing: string,
    @Query('removeExistingSellOrders') removeExistingSellOrders: string, // 'true' or 'false' remove existing sell orders before placing new ones 
    @Query('addSellWhenDown') addSellWhenDown: string, // 'true' or 'false' add take profit order
    @Query('addSellStopLoss') addSellStopLoss: string, // 'true' or 'false' add stop loss order
    @Query('addSellSurprisePrice') addSellSurprisePrice: string, // 'true' or 'false' add surprise price order
  ) {
    const isTesting = testing !== 'false';

    this.logger.log(`Starting to place all orders for all coins, testing mode: ${testing}`);
    const coins = this.config.get<any>(`coinsForTakeProfit`);
    if (!coins) {
      throw new Error(`No configuration found for coins: ${JSON.stringify(coins)}`);
    }
    this.logger.log(`Coins to process: ${JSON.stringify(coins)}`);
    const results = [];
    for await (const coin of coins) {
      this.logger.log(`Processing coin: ${coin}`);
      if (!isTesting) {
        if (removeExistingSellOrders === 'true') {
          const res1 = await this.okxService.cancelAllTypeOfOpenOrdersForOneCoin(coin, 'SPOT', 'sell');
          console.log('Cancel existing sell orders:', JSON.stringify(res1, null, 2));
          results.push({ coin, action: 'cancel_existing_sell_orders', result: res1 });
        }
      }
      if (addSellWhenDown === 'true') {
        const res2 = await this.okxService.placeMultipleSellOrdersForDown(coin, isTesting);
        console.log('Place multiple sell orders for down:', JSON.stringify(res2, null, 2));
        results.push({ coin, action: 'place_multiple_sell_orders_for_down', result: res2 });
      }
      if (addSellSurprisePrice === 'true') {
        const res4 = await this.okxService.placeSurprisePriceSellOrder(coin, isTesting);
        console.log('Place surprise price sell order:', JSON.stringify(res4, null, 2));
        results.push({ coin, action: 'place_surprise_price_sell_order', result: res4 });
      }
      if (addSellStopLoss === 'true') {
        const res3 = await this.okxService.placeStopLossOrder(coin, isTesting);
        console.log('Place stop loss order:', JSON.stringify(res3, null, 2));
        results.push({ coin, action: 'place_stop_loss_order', result: res3 });
      }
    }

    return results;
  }

  @Post('order-multiple/:coin')
  placeMultipleOrders(@Param('coin') coin: string, @Query('testing') testing: string) {
    const isTesting = testing !== 'false';
    return this.okxService.placeMultipleBuyOrders(coin, isTesting);
  }

  @Post('cancel-all-orders')
  async cancelAllOrders(@Query('side') side?: 'buy' | 'sell' | null) {
    return await this.okxService.cancelAllTypeOfOpenOrders('SPOT', side);
  }

  @Post('cancel-orders/:coin')
  async cancelOrdersForOneCoin(@Param('coin') coin: string, @Query('side') side?: 'buy' | 'sell' | null) {
    return await this.okxService.cancelAllTypeOfOpenOrdersForOneCoin(coin, 'SPOT', side);
  }

  @Post('order-all-for-up')
  async placeAllForUpOrders(@Query('testing') testing: string) {
    const isTesting = testing !== 'false';
    return this.okxService.placeAllBuyOrdersForUp(isTesting);
  }

  @Post('order-for-up-one-coin/:coin')
  async placeOrdersForUpOneCoin(@Param('coin') coin: string, @Query('testing') testing: string) {
    const isTesting = testing !== 'false';
    if (!isTesting) {
      await this.okxService.cancelAllTypeOfOpenOrdersForOneCoin(coin, 'SPOT');
    }
    return this.okxService.placeMultipleBuyOrdersForUp(coin, isTesting);
  }

  @Post('order-all-for-down')
  async placeAllForDownOrders(@Query('testing') testing: string) {
    const isTesting = testing !== 'false';
    if (!isTesting) {
      await this.okxService.cancelAllTypeOfOpenOrders('SPOT', 'sell');
    }
    return this.okxService.placeAllSellOrdersForDown(isTesting);
  }

  @Post('order-for-down-one-coin/:coin')
  async placeOrdersForDownOneCoin(@Param('coin') coin: string, @Query('testing') testing: string) {
    const isTesting = testing !== 'false';
    if (!isTesting) {
      await this.okxService.cancelAllTypeOfOpenOrdersForOneCoin(coin, 'SPOT', 'sell');
    }
    return this.okxService.placeMultipleSellOrdersForDown(coin, isTesting);
  }


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

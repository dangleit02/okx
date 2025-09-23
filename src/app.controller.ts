import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { OkxService } from './okx.service';
import { OkxWsMultiTradingService } from './okx-ws-multi-trading.service';
import { OkxWsOneTradingService } from './okx-ws-one-trading.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly okxService: OkxService,
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

  @Post('order-multiple/:coin')
  placeMultipleOrders(@Param('coin') coin: string, @Query('testing') testing: string) {
    const isTesting = testing !== 'false';
    return this.okxService.placeMultipleBuyOrders(coin, isTesting);
  }

  @Post('cancel-all-orders')
  async cancelAllOrders(@Query('sdie') side?: 'buy' | 'sell' | null) {
    const res1 = await this.okxService.cancelAllOpenOrders('SPOT', side);
    const res2 = await this.okxService.cancelAllOpenConditionalOrders('SPOT', side);
    return { res1, res2 };
  }

  @Post('cancel-orders/:coin')
  async cancelOrdersForOneCoin(@Param('coin') coin: string, @Query('sdie') side?: 'buy' | 'sell' | null) {
    const res1 = await this.okxService.cancelOpenOrdersForOneCoin(coin, 'SPOT', side);
    const res2 = await this.okxService.cancelOpenConditionalOrdersForOneCoin(coin, 'SPOT', side);
    return { res1, res2 };
  }

  @Post('order-all-for-up')
  async placeAllForUpOrders( @Query('testing') testing: string) {
    const isTesting = testing !== 'false';
    return this.okxService.placeAllBuyOrdersForUp(isTesting);
  }

  @Post('order-for-up-one-coin/:coin')
  async placeOrdersForUpOneCoin(@Param('coin') coin: string, @Query('testing') testing: string) {
    const isTesting = testing !== 'false';
    return this.okxService.placeMultipleBuyOrdersForUp(coin, isTesting);
  }

  @Post('order-all-for-down')
  async placeAllForDownOrders( @Query('testing') testing: string) {
    const isTesting = testing !== 'false';
    return this.okxService.placeAllSellOrdersForDown(isTesting);
  }

  @Post('order-for-down-one-coin/:coin')
  async placeOrdersForDownOneCoin(@Param('coin') coin: string, @Query('testing') testing: string) {
    const isTesting = testing !== 'false';
    if (!isTesting) {
      await this.okxService.cancelOpenOrdersForOneCoin(coin, 'SPOT', 'sell');
      await this.okxService.cancelOpenConditionalOrdersForOneCoin(coin, 'SPOT', 'sell');
    }
    return this.okxService.placeMultipleSellOrdersForDown(coin, isTesting);
  }

  @Post('sale/order-one/:coin')
  placeOneOrder(@Param('coin') coin: string, @Query('testing') testing: string) {
    const isTesting = testing !== 'false';
    this.okxService.placeOneOrder(coin, 'sell', '5', '7.50', '7.45', isTesting)
      .then(console.log)
      .catch(console.error);
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

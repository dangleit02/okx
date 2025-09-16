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
  async getBalance() {
    const result = await this.okxService.getAccountBalance();
    console.log('Balance:', JSON.stringify(result, null, 2));
    return result;
  }

  @Post('order-multiple/:coin')
  placeMultipleOrders(@Param('coin') coin: string, @Query('testing') testing: string) {
    const isTesting = testing !== 'false';
    return this.okxService.placeMultipleOrders(coin, isTesting);
  }

  @Post('cancel-all-orders')
  async cancelAllOrders() {
    const res1 = await this.okxService.cancelAllOpenOrders('SPOT');
    const res2 = await this.okxService.cancelAllOpenConditionalOrders('SPOT');
    return { res1, res2 };
  }

  @Post('order-all-for-up')
  async placeAllOrders( @Query('testing') testing: string) {
    const isTesting = testing !== 'false';
    await this.okxService.cancelAllOpenOrders('SPOT');
    await this.okxService.cancelAllOpenConditionalOrders('SPOT');
    return this.okxService.placeAllOrdersForUp(isTesting);
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

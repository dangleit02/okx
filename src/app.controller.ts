import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { OkxService } from './okx.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService, private readonly okxService: OkxService) {}

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

  @Post('order-one/:coin')
  placeOneOrder(@Param('coin') coin: string) {
      this.okxService.placeOneOrder(coin, 'sell', '5', '7.50', '7.45')
        .then(console.log)
        .catch(console.error);
  }
}

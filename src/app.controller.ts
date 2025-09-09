import { Controller, Get, Param, Post } from '@nestjs/common';
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

  @Post('buy/:coin')
  placeOrder(@Param() coin: string) {
    return this.okxService.placeOrder(coin);
  }

  @Post('sell/:coin')
  placeOrderWithParam(@Param('coin') coin: string) {
      this.okxService.placeTriggerOrder('AXS', 'sell', '5', '7.50', '7.45')
        .then(console.log)
        .catch(console.error);
  }
}

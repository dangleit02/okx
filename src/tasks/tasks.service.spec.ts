jest.mock('../okx/okx.future.hedge.service', () => ({
  OkxFutureHedgeService: class {},
}));

import { TasksService } from './tasks.service';

describe('TasksService autoSellSpotForDown', () => {
  it('uses the shared all-coins sell flow', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'runSpotTaskForSell') return true;
        if (key === 'runSpotTaskHavingStopLoss') return true;
        return undefined;
      }),
    };
    const logger = { log: jest.fn() };
    const okxService = {
      sellAtPriceAllCoins: jest.fn().mockResolvedValue([
        { coin: 'BTC', action: 'place_auto_sell_order', result: [] },
      ]),
    };
    const service = new TasksService(
      config as any,
      logger as any,
      okxService as any,
      {} as any,
    );

    await service.autoSellSpotForDown();

    expect(okxService.sellAtPriceAllCoins).toHaveBeenCalledWith({
      isTesting: false,
      removeExistingSellOrders: 'false',
      addSellStopLoss: 'true',
      addSellTakeProfit: 'true',
      onlyForDown: 'false',
      justOneOrder: 'false',
    });
  });
});

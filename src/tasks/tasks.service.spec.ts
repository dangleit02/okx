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

  it('runs the shared sell-order cleanup flow in live mode', async () => {
    const config = {
      get: jest.fn((key: string) => key === 'runSpotTaskForClean'),
    };
    const logger = { log: jest.fn() };
    const okxService = {
      cleanSellOrdersForAllCoins: jest.fn().mockResolvedValue([
        { coin: 'BTC', result: { status: 'clean' } },
      ]),
      sellAtPriceAllCoins: jest.fn(),
    };
    const service = new TasksService(
      config as any,
      logger as any,
      okxService as any,
      {} as any,
    );

    await service.cleanSellOrdersDaily();

    expect(okxService.cleanSellOrdersForAllCoins).toHaveBeenCalledWith(false);
    expect(okxService.sellAtPriceAllCoins).not.toHaveBeenCalled();
  });
});

describe('TasksService future long/short refresh', () => {
  it('refreshes short trigger orders and opens only through the protected auto-trade flow', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'runSwapTaskForShort') return true;
        if (key === 'coinsForShort') return ['BTC', 'BTC'];
        return undefined;
      }),
    };
    const logger = { log: jest.fn() };
    const future = {
      cancelFutureOrdersForOneCoin: jest.fn().mockResolvedValue({ cancelled: [] }),
      ensurePositionStopLoss: jest.fn().mockResolvedValue({ status: 'submitted' }),
      tradeOneCoin: jest.fn().mockResolvedValue([]),
    };
    const service = new TasksService(
      config as any,
      logger as any,
      {} as any,
      future as any,
    );

    await service.refreshShortFutureOrders();

    expect(future.cancelFutureOrdersForOneCoin).toHaveBeenCalledWith('BTC', 'short', 'all');
    expect(future.ensurePositionStopLoss).toHaveBeenCalledWith('BTC', 'short', false);
    expect(future.tradeOneCoin).toHaveBeenCalledWith(expect.objectContaining({
      coin: 'BTC',
      direction: 'short',
      isTesting: false,
      removeExistingOrders: false,
      enableTakeProfit: true,
      partialCloseOnRetrace: true,
      autoTrade: true,
    }));
    expect(future.tradeOneCoin).toHaveBeenCalledTimes(1);
  });

  it('ensures stop-loss coverage before refreshing each long coin', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'runSwapTaskForLong') return true;
        if (key === 'coinsForLong') return ['ETH'];
        return undefined;
      }),
    };
    const logger = { log: jest.fn() };
    const future = {
      cancelFutureOrdersForOneCoin: jest.fn().mockResolvedValue({ cancelled: [] }),
      ensurePositionStopLoss: jest.fn().mockResolvedValue({ status: 'submitted' }),
      tradeOneCoin: jest.fn().mockResolvedValue([]),
    };
    const service = new TasksService(
      config as any,
      logger as any,
      {} as any,
      future as any,
    );

    await service.refreshLongFutureOrders();

    expect(future.cancelFutureOrdersForOneCoin).toHaveBeenCalledWith('ETH', 'long', 'all');
    expect(future.ensurePositionStopLoss).toHaveBeenCalledWith('ETH', 'long', false);
    expect(future.tradeOneCoin).toHaveBeenCalledTimes(1);
    expect(future.cancelFutureOrdersForOneCoin.mock.invocationCallOrder[0])
      .toBeLessThan(future.ensurePositionStopLoss.mock.invocationCallOrder[0]);
    expect(future.ensurePositionStopLoss.mock.invocationCallOrder[0])
      .toBeLessThan(future.tradeOneCoin.mock.invocationCallOrder[0]);
  });
});

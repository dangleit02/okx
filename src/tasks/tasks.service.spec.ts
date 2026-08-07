jest.mock('../okx/okx.future.hedge.service', () => ({
  OkxFutureHedgeService: class {},
}));
jest.mock('../okx/okx.future.oneway.service', () => ({
  OkxFutureOneWayService: class {},
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
      {} as any,
    );

    await service.cleanSellOrdersDaily();

    expect(okxService.cleanSellOrdersForAllCoins).toHaveBeenCalledWith(false);
    expect(okxService.sellAtPriceAllCoins).not.toHaveBeenCalled();
  });

  it('reports partial cleanup failures after continuing through the batch', async () => {
    const config = {
      get: jest.fn((key: string) => key === 'runSpotTaskForClean'),
    };
    const logger = { log: jest.fn() };
    const okxService = {
      cleanSellOrdersForAllCoins: jest.fn().mockResolvedValue([
        { coin: 'DOGE', result: { status: 'clean' } },
        { coin: 'ETC', result: { status: 'failed' } },
        { coin: 'XLM', result: { status: 'clean' } },
      ]),
    };
    const service = new TasksService(
      config as any,
      logger as any,
      okxService as any,
      {} as any,
      {} as any,
    );

    await service.cleanSellOrdersDaily();

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('completed with failures for ETC'),
    );
    expect(logger.log).not.toHaveBeenCalledWith(
      expect.stringContaining('Successfully cleaned sell orders'),
    );
  });

  it('waits for auto-sell to finish before starting cleanup', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'runSpotTaskForSell' || key === 'runSpotTaskForClean') return true;
        if (key === 'runSpotTaskHavingStopLoss') return false;
        return undefined;
      }),
    };
    let finishSell!: () => void;
    const sellInProgress = new Promise<any[]>((resolve) => {
      finishSell = () => resolve([]);
    });
    const okxService = {
      sellAtPriceAllCoins: jest.fn().mockReturnValue(sellInProgress),
      cleanSellOrdersForAllCoins: jest.fn().mockResolvedValue([]),
    };
    const service = new TasksService(
      config as any,
      { log: jest.fn() } as any,
      okxService as any,
      {} as any,
      {} as any,
    );

    const sellTask = service.autoSellSpotForDown();
    await Promise.resolve();
    const cleanTask = service.cleanSellOrdersDaily();
    await Promise.resolve();
    await Promise.resolve();

    expect(okxService.sellAtPriceAllCoins).toHaveBeenCalledTimes(1);
    expect(okxService.cleanSellOrdersForAllCoins).not.toHaveBeenCalled();

    finishSell();
    await Promise.all([sellTask, cleanTask]);
    expect(okxService.cleanSellOrdersForAllCoins).toHaveBeenCalledWith(false);
  });
});

describe('TasksService future long/short refresh', () => {
  it('refreshes short trigger orders and opens only through the protected auto-trade flow', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'runSwapTaskForShortHedge') return true;
        if (key === 'coinsForShort') return ['BTC', 'BTC'];
        return undefined;
      }),
    };
    const logger = { log: jest.fn() };
    const future = {
      cancelFutureOrdersForOneCoin: jest.fn().mockResolvedValue({ cancelled: [] }),
      cleanProtectiveCloseByPriceStepsOrdersForOneCoin: jest.fn().mockResolvedValue({ status: 'clean' }),
      reconcilePositionStopLoss: jest.fn().mockResolvedValue({ status: 'reconciled' }),
      tradeOneCoin: jest.fn().mockResolvedValue([]),
    };
    const service = new TasksService(
      config as any,
      logger as any,
      {} as any,
      future as any,
      {} as any,
    );

    await service.refreshShortFutureOrders();

    expect(future.cancelFutureOrdersForOneCoin).toHaveBeenCalledWith(
      'BTC',
      'short',
      'open',
      'trigger',
      false,
    );
    expect(future.cleanProtectiveCloseByPriceStepsOrdersForOneCoin).toHaveBeenCalledTimes(2);
    expect(future.cleanProtectiveCloseByPriceStepsOrdersForOneCoin).toHaveBeenCalledWith('BTC', 'short', false);
    expect(future.reconcilePositionStopLoss).toHaveBeenCalledWith('BTC', 'short', false);
    expect(future.tradeOneCoin).toHaveBeenCalledWith(expect.objectContaining({
      coin: 'BTC',
      direction: 'short',
      isTesting: false,
      removeExistingOrders: false,
      enableProtectiveClose: true,
      protectiveCloseOnly: true,
      autoTrade: true,
    }));
    expect(future.tradeOneCoin).toHaveBeenCalledTimes(1);
  });

  it('ensures stop-loss coverage before refreshing each long coin', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'runSwapTaskForLongHedge') return true;
        if (key === 'coinsForLong') return ['ETH'];
        return undefined;
      }),
    };
    const logger = { log: jest.fn() };
    const future = {
      cancelFutureOrdersForOneCoin: jest.fn().mockResolvedValue({ cancelled: [] }),
      cleanProtectiveCloseByPriceStepsOrdersForOneCoin: jest.fn().mockResolvedValue({ status: 'clean' }),
      reconcilePositionStopLoss: jest.fn().mockResolvedValue({ status: 'reconciled' }),
      tradeOneCoin: jest.fn().mockResolvedValue([]),
    };
    const service = new TasksService(
      config as any,
      logger as any,
      {} as any,
      future as any,
      {} as any,
    );

    await service.refreshLongFutureOrders();

    expect(future.cancelFutureOrdersForOneCoin).toHaveBeenCalledWith(
      'ETH',
      'long',
      'open',
      'trigger',
      false,
    );
    expect(future.reconcilePositionStopLoss).toHaveBeenCalledWith('ETH', 'long', false);
    expect(future.cleanProtectiveCloseByPriceStepsOrdersForOneCoin).toHaveBeenCalledTimes(2);
    expect(future.tradeOneCoin).toHaveBeenCalledTimes(1);
    expect(future.cancelFutureOrdersForOneCoin.mock.invocationCallOrder[0])
      .toBeLessThan(future.reconcilePositionStopLoss.mock.invocationCallOrder[0]);
    expect(future.reconcilePositionStopLoss.mock.invocationCallOrder[0])
      .toBeLessThan(future.tradeOneCoin.mock.invocationCallOrder[0]);
  });

  it('runs the one-way refresh through its separate config flag and service', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'runSwapTaskForShortOneWay') return true;
        if (key === 'coinsForShort') return ['BTC'];
        return undefined;
      }),
    };
    const logger = { log: jest.fn() };
    const oneway = {
      cancelFutureOrdersForOneCoin: jest.fn().mockResolvedValue({ cancelled: [] }),
      cleanProtectiveCloseByPriceStepsOrdersForOneCoin: jest.fn().mockResolvedValue({ status: 'clean' }),
      reconcilePositionStopLoss: jest.fn().mockResolvedValue({ status: 'reconciled' }),
      tradeOneCoin: jest.fn().mockResolvedValue([]),
    };
    const service = new TasksService(
      config as any,
      logger as any,
      {} as any,
      {} as any,
      oneway as any,
    );

    await service.refreshShortFutureOneWayOrders();

    expect(oneway.cancelFutureOrdersForOneCoin).toHaveBeenCalledWith(
      'BTC',
      'short',
      'open',
      'trigger',
      false,
    );
    expect(oneway.reconcilePositionStopLoss).toHaveBeenCalledWith('BTC', 'short', false);
    expect(oneway.cleanProtectiveCloseByPriceStepsOrdersForOneCoin).toHaveBeenCalledTimes(2);
    expect(oneway.tradeOneCoin).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'short',
      autoTrade: true,
      enableProtectiveClose: true,
    }));
  });

  it('polls stop-loss reconciliation for every enabled future mode and direction', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'runSwapTaskForLongHedge') return true;
        if (key === 'runSwapTaskForShortOneWay') return true;
        if (key === 'coinsForLong') return ['ETH'];
        if (key === 'coinsForShort') return ['BTC'];
        return false;
      }),
    };
    const logger = { log: jest.fn(), error: jest.fn() };
    const hedge = { reconcilePositionStopLoss: jest.fn().mockResolvedValue({ status: 'already_protected' }) };
    const oneway = { reconcilePositionStopLoss: jest.fn().mockResolvedValue({ status: 'already_protected' }) };
    const service = new TasksService(config as any, logger as any, {} as any, hedge as any, oneway as any);

    const results = await service.reconcileFutureStopLosses();

    expect(hedge.reconcilePositionStopLoss).toHaveBeenCalledWith('ETH', 'long', false);
    expect(oneway.reconcilePositionStopLoss).toHaveBeenCalledWith('BTC', 'short', false);
    expect(results).toHaveLength(2);
  });
});

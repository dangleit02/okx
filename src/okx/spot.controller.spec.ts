import { SpotController } from './spot.controller';
import { AllPendingOrdersTotal, AllSpotBoughtCoins, PendingBuyOrdersTotalResponse } from './okx.service';

describe('SpotController buy order total response format', () => {
  const response: PendingBuyOrdersTotalResponse = {
    coin: 'BTC',
    instId: 'BTC-USDT',
    quoteCurrency: 'USDT',
    side: 'buy',
    filter: {
      minPrice: 40000,
      maxPrice: 61000,
      step: 5,
    },
    summary: {
      orderCount: 2,
      pricedOrderCount: 2,
      unpricedOrderCount: 0,
      totalAmount: 1010,
    },
    ranges: [
      {
        fromPrice: 40000,
        toPrice: 45000,
        amount: 400,
      },
      {
        fromPrice: 60000,
        toPrice: 61000,
        amount: 610,
      },
    ],
  };
  const allCoinsResponse: AllPendingOrdersTotal = {
    side: 'buy',
    filter: {},
    quoteCurrency: 'USDT',
    coinCount: 2,
    orderCount: 3,
    pricedOrderCount: 3,
    unpricedOrderCount: 0,
    totalAmount: 1335,
    coins: [
      {
        coin: 'ADA',
        instId: 'ADA-USDT',
        quoteCurrency: 'USDT',
        currentPrice: 0.5,
        minPrice: 0.4,
        maxPrice: 0.45,
        orderCount: 2,
        pricedOrderCount: 2,
        unpricedOrderCount: 0,
        totalAmount: 425,
      },
      {
        coin: 'BTC',
        instId: 'BTC-USDT',
        quoteCurrency: 'USDT',
        currentPrice: 51000,
        minPrice: 45000,
        maxPrice: 50000,
        orderCount: 1,
        pricedOrderCount: 1,
        unpricedOrderCount: 0,
        totalAmount: 910,
      },
    ],
  };
  const boughtCoinsResponse: AllSpotBoughtCoins = {
    quoteCurrency: 'USDT',
    coinCount: 1,
    totalProfitUsdt: 100,
    coins: [
      {
        coin: 'BTC',
        amountUsdt: 5100,
        averageCost: 50000,
        currentPrice: 51000,
        profitPercentage: 2,
        profitUsdt: 100,
      },
    ],
  };

  let controller: SpotController;
  let logger: { log: jest.Mock };
  let okxService: {
    getPendingOrdersTotalForCoin: jest.Mock;
    getPendingOrdersTotalForAllCoins: jest.Mock;
    getAllSpotBoughtCoins: jest.Mock;
    validateBuyTriggerPriceDirection: jest.Mock;
    buyTriggerFromMinPriceToMaxPrice: jest.Mock;
    cancelOpenConditionSpotOrdersForOneCoin: jest.Mock;
    cancelPendingOrdersByPriceRange: jest.Mock;
    sellAllAtCurrentPrice: jest.Mock;
    sellAtTriggerPrice: jest.Mock;
    sellOneCoin: jest.Mock;
    sellAtPriceAllCoins: jest.Mock;
  };

  beforeEach(() => {
    logger = { log: jest.fn() };
    okxService = {
      getPendingOrdersTotalForCoin: jest.fn().mockImplementation(
        (_coin, side) => Promise.resolve({
          ...response,
          side,
          coin: side === 'sell' ? 'ETH' : 'BTC',
          instId: side === 'sell' ? 'ETH-USDT' : 'BTC-USDT',
        }),
      ),
      getPendingOrdersTotalForAllCoins: jest.fn().mockResolvedValue(allCoinsResponse),
      getAllSpotBoughtCoins: jest.fn().mockResolvedValue(boughtCoinsResponse),
      validateBuyTriggerPriceDirection: jest.fn().mockResolvedValue(50),
      buyTriggerFromMinPriceToMaxPrice: jest.fn().mockResolvedValue([]),
      cancelOpenConditionSpotOrdersForOneCoin: jest.fn().mockResolvedValue({ status: 'cancelled' }),
      cancelPendingOrdersByPriceRange: jest.fn().mockResolvedValue({
        status: 'preview',
      }),
      sellAllAtCurrentPrice: jest.fn().mockResolvedValue({ status: 'preview' }),
      sellAtTriggerPrice: jest.fn().mockResolvedValue({ status: 'preview' }),
      sellOneCoin: jest.fn().mockResolvedValue(undefined),
      sellAtPriceAllCoins: jest.fn().mockResolvedValue([]),
    };
    controller = new SpotController(
      okxService as any,
      {} as any,
      logger as any,
    );
  });

  it('returns bought spot coins as a table by default', async () => {
    const result = await controller.getAllSpotBoughtCoins();

    expect(result).toContain(
      'COIN | AMOUNT (USDT) | AVARAGE COST | CURRENT PRICE | PROFIT (%) | PROFIT (USDT)',
    );
    expect(result).toContain('BTC');
    expect(result).toContain('50000');
    expect(result).toContain('51000');
    expect(result).toContain('100');
  });

  it('defaults buy trigger direction to down and passes the validated current price', async () => {
    await controller.buyTriggerFromMinToMax('LTC', {
      testing: 'true',
      minPrice: '40',
      maxPrice: '41',
      numberOfOrders: '10',
      addStopLoss: 'false',
    });

    expect(okxService.validateBuyTriggerPriceDirection).toHaveBeenCalledWith(
      'LTC',
      40,
      41,
      'down',
    );
    expect(okxService.buyTriggerFromMinPriceToMaxPrice).toHaveBeenCalledWith(
      'LTC',
      40,
      41,
      true,
      {
        numberOfOrders: 10,
        addStopLoss: false,
        direction: 'down',
        currentPrice: 50,
      },
    );
  });

  it('returns a compact all-coins table by default', async () => {
    const result = await controller.getOrdersTotalForAllCoins('buy');

    expect(result).toContain('TABLE SUMMARY');
    expect(result).toContain(
      'COIN | CURENT PRICE | FROM PRICE | TO PRICE | TOTAL AMOUNT (USDT)',
    );
    expect(result).toContain('ADA  | 0.5');
    expect(result).toContain('BTC  | 51000');
    expect(result).not.toContain('Summary:');
    expect(okxService.getPendingOrdersTotalForAllCoins).toHaveBeenCalledWith(
      'buy',
      { minPrice: undefined, maxPrice: undefined, step: undefined },
    );
    expect(logger.log).toHaveBeenCalledWith(
      result,
      'Pending buy orders all coins table',
    );
  });

  it('keeps JSON available for all-coins when format=json', async () => {
    const result = await controller.getOrdersTotalForAllCoins(
      'buy',
      undefined,
      undefined,
      undefined,
      'json',
    );

    expect(result).toBe(allCoinsResponse);
    expect(logger.log).toHaveBeenCalledWith(
      JSON.stringify(allCoinsResponse, null, 2),
      'Pending buy orders all coins JSON',
    );
  });

  it('sorts coins alphabetically in the all-coins table', async () => {
    okxService.getPendingOrdersTotalForAllCoins.mockResolvedValueOnce({
      ...allCoinsResponse,
      coins: [...allCoinsResponse.coins].reverse(),
    });

    const result = await controller.getOrdersTotalForAllCoins('buy');
    const table = result as string;

    expect(table.indexOf('ADA')).toBeLessThan(table.indexOf('BTC'));
  });

  it('returns and logs an ASCII table when format=table', async () => {
    const result = await controller.getOrdersTotalForCoin(
      'BTC',
      'buy',
      '40000',
      '61000',
      '5',
      'table',
    );

    expect(result).toContain('BTC-USDT pending BUY orders');
    expect(result).toContain('FROM PRICE');
    expect(result).toContain('TO PRICE');
    expect(result).toContain('AMOUNT (USDT)');
    expect(result).toContain('40000');
    expect(result).toContain('61000');
    expect(logger.log).toHaveBeenCalledWith(
      result,
      'Pending buy orders table',
      'BTC',
    );
  });

  it('returns and pretty-logs JSON by default', async () => {
    const result = await controller.getOrdersTotalForCoin(
      'BTC',
      'buy',
      '40000',
      '61000',
      '5',
    );

    expect(result).toEqual(response);
    expect(logger.log).toHaveBeenCalledWith(
      JSON.stringify(response, null, 2),
      'Pending buy orders JSON',
      'BTC',
    );
  });

  it('returns a pending sell orders table grouped by price step', async () => {
    const result = await controller.getOrdersTotalForCoin(
      'eth',
      'sell',
      '2000',
      '3000',
      '10',
      'table',
    );

    expect(result).toContain('ETH-USDT pending SELL orders');
    expect(okxService.getPendingOrdersTotalForCoin).toHaveBeenCalledWith(
      'eth',
      'sell',
      { minPrice: 2000, maxPrice: 3000, step: 10 },
    );
    expect(logger.log).toHaveBeenCalledWith(
      result,
      'Pending sell orders table',
      'ETH',
    );
  });

  it('defaults deletion to preview mode', async () => {
    const result = await controller.cancelOrdersForOneCoinByPriceRange(
      'BTC',
      'buy',
      '40000',
      '50000',
    );

    expect(result).toEqual({ status: 'preview' });
    expect(okxService.cancelPendingOrdersByPriceRange).toHaveBeenCalledWith(
      'BTC',
      'buy',
      40000,
      50000,
      true,
    );
  });

  it('defaults current-price sell to preview mode and requires testing=false to submit', async () => {
    await expect(controller.sellAllAtCurrentPrice('btc', '25')).resolves.toEqual({
      status: 'preview',
    });
    expect(okxService.sellAllAtCurrentPrice).toHaveBeenLastCalledWith('btc', 25, true);

    await controller.sellAllAtCurrentPrice('btc', '25', 'false');
    expect(okxService.sellAllAtCurrentPrice).toHaveBeenLastCalledWith('btc', 25, false);
  });

  it('passes the requested trigger price and defaults to preview mode', async () => {
    await expect(
      controller.sellAtTriggerPrice('btc', '50000', '25'),
    ).resolves.toEqual({ status: 'preview' });
    expect(okxService.sellAtTriggerPrice).toHaveBeenCalledWith(
      'btc',
      50000,
      25,
      true,
    );
  });

  it('delegates all-coins selling to the shared service flow', async () => {
    await expect(
      controller.sellAtPriceAllCoins(
        'false',
        'true',
        'true',
        'true',
        'false',
        'false',
      ),
    ).resolves.toEqual([]);

    expect(okxService.sellAtPriceAllCoins).toHaveBeenCalledWith({
      isTesting: false,
      removeExistingSellOrders: 'true',
      addSellStopLoss: 'true',
      addSellTakeProfit: 'true',
      onlyForDown: 'false',
      justOneOrder: 'false',
    });
  });
});

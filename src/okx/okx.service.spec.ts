import { OkxService } from './okx.service';
import axios from 'axios';

describe('OkxService pending order totals', () => {
  let service: OkxService;

  beforeEach(() => {
    service = new OkxService({} as any, {} as any, {} as any);
  });

  it('splits the requested price range without counting boundary orders twice', async () => {
    jest
      .spyOn(service as any, 'getPendingTriggerSpotOrders')
      .mockResolvedValue([
        {
          algoId: '1',
          instId: 'BTC-USDT',
          side: 'buy',
          triggerPx: '40000',
          ordPx: '39900',
          sz: '0.01',
        },
        {
          algoId: '2',
          instId: 'BTC-USDT',
          side: 'buy',
          triggerPx: '45000',
          ordPx: '45000',
          sz: '0.01',
        },
        {
          algoId: '3',
          instId: 'BTC-USDT',
          side: 'buy',
          triggerPx: '50000',
          ordPx: '50000',
          sz: '0.01',
        },
        {
          algoId: '4',
          instId: 'BTC-USDT',
          side: 'buy',
          triggerPx: '55000',
          ordPx: '55000',
          sz: '0.01',
        },
        {
          algoId: '5',
          instId: 'BTC-USDT',
          side: 'buy',
          triggerPx: '61000',
          ordPx: '61000',
          sz: '0.01',
        },
        {
          algoId: '6',
          instId: 'BTC-USDT',
          side: 'sell',
          triggerPx: '42000',
          ordPx: '42000',
          sz: '1',
        },
      ]);

    const result = await service.getPendingOrdersTotalForCoin('btc', 'buy', {
      minPrice: 40000,
      maxPrice: 61000,
      step: 5,
    });

    expect(result.filter).toEqual({
      minPrice: 40000,
      maxPrice: 61000,
      step: 5,
    });
    expect(result.summary.orderCount).toBe(5);
    expect(result.summary.totalAmount).toBe(2509);
    expect(result.ranges).toEqual([
      expect.objectContaining({
        fromPrice: 40000,
        toPrice: 44200,
        amount: 399,
      }),
      expect.objectContaining({
        fromPrice: 44200,
        toPrice: 48400,
        amount: 450,
      }),
      expect.objectContaining({
        fromPrice: 48400,
        toPrice: 52600,
        amount: 500,
      }),
      expect.objectContaining({
        fromPrice: 52600,
        toPrice: 56800,
        amount: 550,
      }),
      expect.objectContaining({
        fromPrice: 56800,
        toPrice: 61000,
        amount: 610,
      }),
    ]);
    expect(
      result.ranges?.reduce((total, range) => total + range.amount, 0),
    ).toBe(result.summary.totalAmount);
  });

  it('derives minPrice and maxPrice from trigger orders on the requested side', async () => {
    jest
      .spyOn(service as any, 'getPendingTriggerSpotOrders')
      .mockResolvedValue([
        { instId: 'BTC-USDT', side: 'sell', triggerPx: '42000', ordPx: '42000', sz: '1' },
        { instId: 'BTC-USDT', side: 'sell', triggerPx: '62000', ordPx: '62000', sz: '1' },
        { instId: 'BTC-USDT', side: 'buy', triggerPx: '50000', ordPx: '50000', sz: '0.01' },
      ]);

    const result = await service.getPendingOrdersTotalForCoin('BTC', 'buy', { step: 2 });

    expect(result.filter).toEqual({ minPrice: 50000, maxPrice: 50000, step: 2 });
    expect(result.ranges).toEqual([
      { fromPrice: 50000, toPrice: 50000, amount: 500 },
    ]);
  });

  it('uses the buy trigger range regardless of existing sell trigger orders', async () => {
    jest
      .spyOn(service as any, 'getPendingTriggerSpotOrders')
      .mockResolvedValue([
        { instId: 'BTC-USDT', side: 'sell', triggerPx: '30000', ordPx: '30000', sz: '0.01' },
        { instId: 'BTC-USDT', side: 'sell', triggerPx: '35000', ordPx: '35000', sz: '0.01' },
        { instId: 'BTC-USDT', side: 'buy', triggerPx: '40000', ordPx: '40000', sz: '0.01' },
        { instId: 'BTC-USDT', side: 'buy', triggerPx: '50000', ordPx: '50000', sz: '0.01' },
      ]);

    const result = await service.getPendingOrdersTotalForCoin('BTC', 'buy', { step: 2 });

    expect(result.filter).toEqual({ minPrice: 40000, maxPrice: 50000, step: 2 });
    expect(result.ranges).toEqual([
      { fromPrice: 40000, toPrice: 45000, amount: 400 },
      { fromPrice: 45000, toPrice: 50000, amount: 500 },
    ]);
  });

  it('returns empty ranges when no trigger orders exist', async () => {
    jest
      .spyOn(service as any, 'getPendingTriggerSpotOrders')
      .mockResolvedValue([]);

    const result = await service.getPendingOrdersTotalForCoin('BTC', 'sell', { step: 5 });

    expect(result.summary.orderCount).toBe(0);
    expect(result.ranges).toEqual([]);
  });

  it('keeps decimal range boundaries stable', async () => {
    jest
      .spyOn(service as any, 'getPendingTriggerSpotOrders')
      .mockResolvedValue([]);

    const result = await service.getPendingOrdersTotalForCoin('ADA', 'buy', {
      minPrice: 0.1,
      maxPrice: 0.3,
      step: 2,
    });

    expect(
      result.ranges?.map(({ fromPrice, toPrice }) => ({
        fromPrice,
        toPrice,
      })),
    ).toEqual([
      { fromPrice: 0.1, toPrice: 0.2 },
      { fromPrice: 0.2, toPrice: 0.3 },
    ]);
  });

  it('summarizes only pending sell orders by trigger price step', async () => {
    jest
      .spyOn(service as any, 'getPendingTriggerSpotOrders')
      .mockResolvedValue([
        {
          algoId: '1',
          instId: 'ETH-USDT',
          side: 'sell',
          triggerPx: '2000',
          ordPx: '2010',
          sz: '0.5',
        },
        {
          algoId: '2',
          instId: 'ETH-USDT',
          side: 'sell',
          triggerPx: '2100',
          ordPx: '2110',
          sz: '0.25',
        },
        {
          algoId: '3',
          instId: 'ETH-USDT',
          side: 'sell',
          triggerPx: '2200',
          ordPx: '2210',
          sz: '0.1',
        },
        {
          algoId: '4',
          instId: 'ETH-USDT',
          side: 'buy',
          triggerPx: '2050',
          ordPx: '2050',
          sz: '10',
        },
      ]);

    const result = await service.getPendingOrdersTotalForCoin('eth', 'sell', {
      minPrice: 2000,
      maxPrice: 2200,
      step: 2,
    });

    expect(result.summary).toEqual({
      orderCount: 3,
      pricedOrderCount: 3,
      unpricedOrderCount: 0,
      totalAmount: 1753.5,
    });
    expect(result.ranges).toEqual([
      { fromPrice: 2000, toPrice: 2100, amount: 1005 },
      { fromPrice: 2100, toPrice: 2200, amount: 748.5 },
    ]);
  });

  it('summarizes all coins with min and max pending buy trigger prices', async () => {
    jest
      .spyOn(service as any, 'getPendingTriggerSpotOrders')
      .mockResolvedValue([
        {
          algoId: '1',
          instId: 'BTC-USDT',
          side: 'buy',
          triggerPx: '45000',
          ordPx: '45500',
          sz: '0.01',
        },
        {
          algoId: '2',
          instId: 'BTC-USDT',
          side: 'buy',
          triggerPx: '40000',
          ordPx: '40500',
          sz: '0.02',
        },
        {
          algoId: '3',
          instId: 'ADA-USDT',
          side: 'buy',
          triggerPx: '0.45',
          ordPx: '0.45',
          sz: '1000',
        },
        {
          algoId: '4',
          instId: 'ADA-USDT',
          side: 'sell',
          triggerPx: '0.5',
          ordPx: '0.5',
          sz: '1000',
        },
      ]);
    jest.spyOn(service as any, 'getSpotTickers').mockResolvedValue(new Map([
      ['ADA-USDT', 0.5],
      ['BTC-USDT', 50000],
    ]));

    const result = await service.getPendingOrdersTotalForAllCoins('buy');

    expect(result.side).toBe('buy');
    expect(result.coinCount).toBe(2);
    expect(result.totalAmount).toBe(1715);
    expect(result.coins).toEqual([
      expect.objectContaining({
        coin: 'ADA',
        currentPrice: 0.5,
        minPrice: 0.45,
        maxPrice: 0.45,
        totalAmount: 450,
      }),
      expect.objectContaining({
        coin: 'BTC',
        currentPrice: 50000,
        minPrice: 40000,
        maxPrice: 45000,
        totalAmount: 1265,
      }),
    ]);
  });
});

describe('OkxService bought spot coins', () => {
  it('calculates current profit for every positive non-USDT spot balance', async () => {
    const service = new OkxService({} as any, {} as any, {} as any);
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{
        details: [
          { ccy: 'BTC', cashBal: '0.1', openAvgPx: '50000' },
          { ccy: 'ETH', cashBal: '2', openAvgPx: '3000' },
          { ccy: 'USDT', cashBal: '1000', openAvgPx: '1' },
          { ccy: 'ADA', cashBal: '0', openAvgPx: '0.5' },
        ],
      }],
    });
    jest.spyOn(service as any, 'getSpotTickers').mockResolvedValue(new Map([
      ['BTC-USDT', 51000],
      ['ETH-USDT', 2700],
      ['ADA-USDT', 0.6],
    ]));

    const result = await service.getAllSpotBoughtCoins();

    expect(result).toEqual({
      quoteCurrency: 'USDT',
      coinCount: 2,
      totalProfitUsdt: -500,
      coins: [
        {
          coin: 'BTC',
          amountUsdt: 5100,
          averageCost: 50000,
          currentPrice: 51000,
          profitPercentage: 2,
          profitUsdt: 100,
        },
        {
          coin: 'ETH',
          amountUsdt: 5400,
          averageCost: 3000,
          currentPrice: 2700,
          profitPercentage: -10,
          profitUsdt: -600,
        },
      ],
    });
  });
});

describe('OkxService cancel pending spot trigger orders for one coin', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cancels every matching side without filtering by the current market price', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'okx.baseUrl') return 'https://www.okx.test';
        if (key === 'okx.secretKey') return 'secret';
        return 'value';
      }),
    };
    const service = new OkxService(config as any, { log: jest.fn() } as any, {} as any);
    jest
      .spyOn(service as any, 'getPendingTriggerSpotOrders')
      .mockResolvedValue([
        { algoId: '1', instId: 'XRP-USDT', side: 'buy', last: '0.1' },
        { algoId: '2', instId: 'XRP-USDT', side: 'buy', last: '0.2' },
        { algoId: '3', instId: 'XRP-USDT', side: 'sell', last: '10' },
      ]);
    const ticker = jest.spyOn(service as any, 'getTicker');
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        code: '0',
        data: [
          { algoId: '1', sCode: '0' },
          { algoId: '2', sCode: '0' },
        ],
      },
    });

    const result = await service.cancelOpenConditionSpotOrdersForOneCoin('xrp', 'buy');

    expect(ticker).not.toHaveBeenCalled();
    expect(axios.post).toHaveBeenCalledWith(
      'https://www.okx.test/api/v5/trade/cancel-algos',
      JSON.stringify([
        { algoId: '1', instId: 'XRP-USDT' },
        { algoId: '2', instId: 'XRP-USDT' },
      ]),
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(result).toEqual(expect.objectContaining({
      status: 'cancelled',
      matchedOrderCount: 2,
      cancelledOrderCount: 2,
      failedOrderCount: 0,
    }));
  });

  it('retries only algo orders rejected with rate-limit code 50011', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'okx.baseUrl') return 'https://www.okx.test';
        if (key === 'okx.secretKey') return 'secret';
        return 'value';
      }),
    };
    const service = new OkxService(config as any, { log: jest.fn() } as any, {} as any);
    jest
      .spyOn(service as any, 'getPendingTriggerSpotOrders')
      .mockResolvedValue([
        { algoId: '1', instId: 'ETC-USDT', side: 'sell' },
        { algoId: '2', instId: 'ETC-USDT', side: 'sell' },
      ]);
    const sleep = jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    const post = jest
      .spyOn(axios, 'post')
      .mockResolvedValueOnce({
        data: {
          code: '0',
          data: [
            { algoId: '1', sCode: '0', sMsg: '' },
            { algoId: '2', sCode: '50011', sMsg: 'Rate limit reached' },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          code: '0',
          data: [{ algoId: '2', sCode: '0', sMsg: '' }],
        },
      });

    const result = await service.cancelOpenConditionSpotOrdersForOneCoin('ETC', 'sell');

    expect(post).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(post.mock.calls[1][1]))).toEqual([
      { algoId: '2', instId: 'ETC-USDT' },
    ]);
    expect(sleep).toHaveBeenCalledWith(1100);
    expect(result).toEqual(expect.objectContaining({
      status: 'cancelled',
      matchedOrderCount: 2,
      cancelledOrderCount: 2,
      failedOrderCount: 0,
    }));
  });
});

describe('OkxService cancel pending buy orders by price range', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('previews only BUY orders inside the inclusive price range', async () => {
    const service = new OkxService({} as any, {} as any, {} as any);
    jest
      .spyOn(service as any, 'getPendingTriggerSpotOrders')
      .mockResolvedValue([
        {
          algoId: '1',
          instId: 'BTC-USDT',
          side: 'buy',
          triggerPx: '40000',
          ordPx: '39000',
          sz: '0.01',
        },
        {
          algoId: '2',
          instId: 'BTC-USDT',
          side: 'buy',
          triggerPx: '50000',
          ordPx: '51000',
          sz: '0.02',
        },
        {
          algoId: '3',
          instId: 'BTC-USDT',
          side: 'buy',
          triggerPx: '50001',
          ordPx: '45000',
          sz: '1',
        },
        {
          algoId: '4',
          instId: 'BTC-USDT',
          side: 'sell',
          triggerPx: '45000',
          ordPx: '45000',
          sz: '1',
        },
      ]);
    const post = jest.spyOn(axios, 'post');

    const result = await service.cancelPendingOrdersByPriceRange(
      'btc',
      'buy',
      40000,
      50000,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'preview',
        coin: 'BTC',
        testing: true,
        matchedOrderCount: 2,
        totalAmount: 1410,
      }),
    );
    expect(result.orders.map((order) => order.algoId)).toEqual(['1', '2']);
    expect(post).not.toHaveBeenCalled();

    const sellResult = await service.cancelPendingOrdersByPriceRange(
      'btc',
      'sell',
      40000,
      50000,
    );
    expect(sellResult).toEqual(expect.objectContaining({
      status: 'preview',
      side: 'sell',
      matchedOrderCount: 1,
    }));
    expect(sellResult.orders.map((order) => order.algoId)).toEqual(['4']);
  });

  it('cancels matching orders in throttled batches of 10 when testing=false', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'okx.baseUrl') return 'https://okx.test';
        if (key === 'okx.secretKey') return 'secret';
        return 'test';
      }),
    };
    const logger = { log: jest.fn() };
    const service = new OkxService(config as any, logger as any, {} as any);
    const orders = Array.from({ length: 21 }, (_, index) => ({
      algoId: String(index + 1),
      instId: 'BTC-USDT',
      side: 'buy',
      triggerPx: '45000',
      ordPx: '45000',
      sz: '0.01',
    }));
    jest
      .spyOn(service as any, 'getPendingTriggerSpotOrders')
      .mockResolvedValue(orders);
    const sleep = jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    const post = jest
      .spyOn(axios, 'post')
      .mockImplementation(async (_url, body) => {
        const requestedOrders = JSON.parse(String(body));
        return {
          data: {
            code: '0',
            data: requestedOrders.map((order: any) => ({
              algoId: order.algoId,
              sCode: '0',
            })),
          },
        } as any;
      });

    const result = await service.cancelPendingOrdersByPriceRange(
      'BTC',
      'buy',
      40000,
      50000,
      false,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'cancelled',
        testing: false,
        matchedOrderCount: 21,
        cancelledOrderCount: 21,
        failedOrderCount: 0,
      }),
    );
    expect(post).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(post.mock.calls[0][1]))).toHaveLength(10);
    expect(JSON.parse(String(post.mock.calls[1][1]))).toHaveLength(10);
    expect(JSON.parse(String(post.mock.calls[2][1]))).toHaveLength(1);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1100);
  });
});

describe('OkxService sell all at current price', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createService = () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'okx.baseUrl') return 'https://okx.test';
        if (key === 'okx.secretKey') return 'secret';
        if (key.startsWith('coin.')) {
          return { priceToFixed: 2, szToFixed: 8 };
        }
        return 'test';
      }),
    };
    const logger = { log: jest.fn() };
    return {
      service: new OkxService(config as any, logger as any, {} as any),
      logger,
    };
  };

  it('previews a trigger sell using the requested percentage of available balance', async () => {
    const { service } = createService();
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{ details: [{ ccy: 'BTC', availBal: '0.01234567' }] }],
    });
    jest.spyOn(service as any, 'getTicker').mockResolvedValue(60000);
    const placeOneOrder = jest.spyOn(service, 'placeOneOrder');

    const result = await service.sellAllAtCurrentPrice(' btc ', 25);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'preview',
        coin: 'BTC',
        percentage: 25,
        availableBalance: '0.01234567',
        sizeToSell: '0.00308641',
        currentPrice: 60000,
        estimatedValueUsdt: 185.1846,
        order: {
          data: undefined,
          body: {
            instId: 'BTC-USDT',
            tdMode: 'cash',
            side: 'sell',
            ordType: 'trigger',
            sz: '0.00308641',
            triggerPx: '60000.00',
            orderPx: '60000.00',
          },
        },
      }),
    );
    expect(placeOneOrder).toHaveBeenCalledWith(
      'BTC',
      'sell',
      '0.00308641',
      '60000.00',
      '60000.00',
      true,
    );
  });

  it('submits the trigger order only when testing is false', async () => {
    const { service, logger } = createService();
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{ details: [{ ccy: 'ETH', availBal: '1.25' }] }],
    });
    jest.spyOn(service as any, 'getTicker').mockResolvedValue(3000);
    const placeOneOrder = jest.spyOn(service, 'placeOneOrder').mockResolvedValue({
      data: { code: '0', data: [{ algoId: '123' }] },
      body: { ordType: 'trigger' },
    } as any);

    const result = await service.sellAllAtCurrentPrice('ETH', 100, false);

    expect(result.status).toBe('submitted');
    expect(placeOneOrder).toHaveBeenCalledWith(
      'ETH',
      'sell',
      '1.25000000',
      '3000.00',
      '3000.00',
      false,
    );
    expect(logger.log).toHaveBeenCalled();
  });

  it('does not request a ticker or place an order without available balance', async () => {
    const { service } = createService();
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{ details: [{ ccy: 'ADA', availBal: '0' }] }],
    });
    const ticker = jest.spyOn(service as any, 'getTicker');
    const placeOneOrder = jest.spyOn(service, 'placeOneOrder');

    await expect(service.sellAllAtCurrentPrice('ADA', 100, false)).resolves.toEqual({
      status: 'no_available_balance',
      coin: 'ADA',
      instId: 'ADA-USDT',
      testing: false,
      percentage: 100,
      availableBalance: '0',
    });
    expect(ticker).not.toHaveBeenCalled();
    expect(placeOneOrder).not.toHaveBeenCalled();
  });

  it('rejects an invalid percentage before reading the balance', async () => {
    const { service } = createService();
    const getBalance = jest.spyOn(service, 'getAccountBalance');

    await expect(service.sellAllAtCurrentPrice('BTC', 0)).rejects.toThrow(
      'Invalid percentage',
    );
    expect(getBalance).not.toHaveBeenCalled();
  });
});

describe('OkxService buy trigger range direction', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects a down range when minPrice or maxPrice exceeds currentPrice', async () => {
    const service = new OkxService({} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'getTicker').mockResolvedValue(43);

    await expect(
      service.validateBuyTriggerPriceDirection('LTC', 42, 44, 'down'),
    ).rejects.toThrow(
      'minPrice (42) and maxPrice (44) must not exceed currentPrice (43)',
    );
  });

  it('allows an up range without requesting currentPrice', async () => {
    const service = new OkxService({} as any, {} as any, {} as any);
    const ticker = jest.spyOn(service as any, 'getTicker');

    await expect(
      service.validateBuyTriggerPriceDirection('LTC', 44, 45, 'up'),
    ).resolves.toBeUndefined();
    expect(ticker).not.toHaveBeenCalled();
  });
});

describe('OkxService sell percentage at a requested trigger price', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createService = () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key.startsWith('coin.')) {
          return { priceToFixed: 2, szToFixed: 4 };
        }
        return 'test';
      }),
    };
    const logger = { log: jest.fn() };
    const service = new OkxService(config as any, logger as any, {} as any);
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{ details: [{ ccy: 'BTC', availBal: '1.23459' }] }],
    });
    jest.spyOn(service as any, 'getTicker').mockResolvedValue(60000);
    return { service, logger };
  };

  it('sets orderPx below triggerPx when the sell price is below current price', async () => {
    const { service } = createService();
    const placeOneOrder = jest.spyOn(service, 'placeOneOrder');

    const result = await service.sellAtTriggerPrice('BTC', 50000, 25);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'preview',
        currentPrice: 60000,
        percentage: 25,
        sizeToSell: '0.3086',
        triggerPrice: 50000,
        orderPrice: 49900,
        priceDirection: 'below_current_price',
      }),
    );
    expect(placeOneOrder).toHaveBeenCalledWith(
      'BTC',
      'sell',
      '0.3086',
      '50000.00',
      '49900.00',
      true,
    );
  });

  it('sets orderPx above triggerPx when the sell price is above current price', async () => {
    const { service } = createService();
    const placeOneOrder = jest.spyOn(service, 'placeOneOrder').mockResolvedValue({
      data: { code: '0', data: [{ algoId: '123' }] },
      body: { ordType: 'trigger' },
    } as any);

    const result = await service.sellAtTriggerPrice('BTC', 70000, 25, false);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'submitted',
        triggerPrice: 70000,
        orderPrice: 70140,
        priceDirection: 'above_current_price',
      }),
    );
    expect(placeOneOrder).toHaveBeenCalledWith(
      'BTC',
      'sell',
      '0.3086',
      '70000.00',
      '70140.00',
      false,
    );
  });

  it('rejects a missing or invalid requested price before reading the balance', async () => {
    const { service } = createService();

    await expect(service.sellAtTriggerPrice('BTC', Number.NaN, 25)).rejects.toThrow(
      'Invalid price',
    );
    expect(service.getAccountBalance).not.toHaveBeenCalled();
  });

  it('rejects a percentage outside the 0 to 100 range', async () => {
    const { service } = createService();

    await expect(service.sellAtTriggerPrice('BTC', 50000, 0)).rejects.toThrow(
      'Invalid percentage',
    );
    await expect(service.sellAtTriggerPrice('BTC', 50000, 101)).rejects.toThrow(
      'Invalid percentage',
    );
  });
});

describe('OkxService sell all configured bought coins', () => {
  const options = {
    isTesting: false,
    removeExistingSellOrders: 'false',
    addSellStopLoss: 'false',
    addSellTakeProfit: 'true',
    onlyForDown: 'false',
    justOneOrder: 'false',
  };

  const createService = () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'coinsSpotForTakeProfit' ? ['btc', 'ETH'] : undefined,
      ),
    };
    const logger = { log: jest.fn() };
    const service = new OkxService(config as any, logger as any, {} as any);
    return { service, logger };
  };

  it('only processes configured coins that have been bought', async () => {
    const { service } = createService();
    jest.spyOn(service, 'getAllSpotBoughtCoins').mockResolvedValue({
      quoteCurrency: 'USDT',
      coinCount: 1,
      totalProfitUsdt: 100,
      coins: [{
        coin: 'BTC',
        amountUsdt: 5100,
        averageCost: 50000,
        currentPrice: 51000,
        profitPercentage: 2,
        profitUsdt: 100,
      }],
    });
    const sellOneCoin = jest.spyOn(service, 'sellOneCoin').mockResolvedValue(undefined);

    await expect(service.sellAtPriceAllCoins(options)).resolves.toEqual([]);

    expect(sellOneCoin).toHaveBeenCalledTimes(1);
    expect(sellOneCoin).toHaveBeenCalledWith({
      coin: 'btc',
      ...options,
      results: [],
    });
  });

  it('does not cancel or place orders when no configured coin has been bought', async () => {
    const { service } = createService();
    jest.spyOn(service, 'getAllSpotBoughtCoins').mockResolvedValue({
      quoteCurrency: 'USDT',
      coinCount: 0,
      totalProfitUsdt: 0,
      coins: [],
    });
    const sellOneCoin = jest.spyOn(service, 'sellOneCoin');

    await expect(service.sellAtPriceAllCoins(options)).resolves.toEqual([]);

    expect(sellOneCoin).not.toHaveBeenCalled();
  });
});

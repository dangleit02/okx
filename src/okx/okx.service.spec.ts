import { OkxService } from './okx.service';
import axios from 'axios';

describe('OkxService pending order totals', () => {
  let service: OkxService;

  beforeEach(() => {
    service = new OkxService({} as any, {} as any, {} as any);
  });

  it('retries pending algo orders while the OKX trading bot engine is upgrading', async () => {
    const config = {
      get: jest.fn((key: string) => key === 'okx.baseUrl' ? 'https://www.okx.test' : 'value'),
    };
    const logger = { warn: jest.fn() };
    service = new OkxService(config as any, logger as any, {} as any);
    const sleep = jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    const get = jest.spyOn(axios, 'get')
      .mockResolvedValueOnce({
        data: { code: '51290', data: [], msg: 'Trading bot engine currently upgrading.' },
      })
      .mockResolvedValueOnce({ data: { code: '0', data: [] } });

    const result = await (service as any).getPendingSpotAlgoOrders('trigger');

    expect(result).toEqual([]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('OKX 51290'));
    get.mockRestore();
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
    jest.spyOn(service as any, 'getPendingConditionalSpotOrders').mockResolvedValue([]);

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

  it('groups all-coins detail by number of orders and uses each group actual min and max prices', async () => {
    jest
      .spyOn(service as any, 'getPendingTriggerSpotOrders')
      .mockResolvedValue([
        { instId: 'BTC-USDT', side: 'buy', triggerPx: '50000', ordPx: '50000', sz: '0.01' },
        { instId: 'BTC-USDT', side: 'buy', triggerPx: '40000', ordPx: '40000', sz: '0.01' },
        { instId: 'BTC-USDT', side: 'buy', triggerPx: '41000', ordPx: '41000', sz: '0.01' },
        { instId: 'BTC-USDT', side: 'buy', triggerPx: '49000', ordPx: '49000', sz: '0.01' },
        { instId: 'BTC-USDT', side: 'buy', triggerPx: '60000', ordPx: '60000', sz: '0.01' },
        { instId: 'BTC-USDT', side: 'sell', triggerPx: '45000', ordPx: '45000', sz: '1' },
      ]);
    jest.spyOn(service as any, 'getSpotTickers').mockResolvedValue(new Map([
      ['BTC-USDT', 51000],
    ]));
    jest.spyOn(service as any, 'getPendingConditionalSpotOrders').mockResolvedValue([]);

    const result = await service.getPendingOrdersTotalForAllCoins('buy', { step: 2 });

    expect(result.coins[0].ranges).toEqual([
      { fromPrice: 40000, toPrice: 41000, amount: 810 },
      { fromPrice: 49000, toPrice: 50000, amount: 990 },
      { fromPrice: 60000, toPrice: 60000, amount: 600 },
    ]);
  });

  it('includes conditional stop-loss orders as a separate all-coins order type', async () => {
    jest.spyOn(service as any, 'getPendingTriggerSpotOrders').mockResolvedValue([
      { instId: 'BTC-USDT', side: 'sell', triggerPx: '60000', ordPx: '60000', sz: '0.01' },
    ]);
    jest.spyOn(service as any, 'getPendingConditionalSpotOrders').mockResolvedValue([
      { instId: 'BTC-USDT', side: 'sell', slTriggerPx: '45000', slOrdPx: '-1', sz: '0.02' },
    ]);
    jest.spyOn(service as any, 'getSpotTickers').mockResolvedValue(new Map([
      ['BTC-USDT', 50000],
    ]));

    const result = await service.getPendingOrdersTotalForAllCoins('sell');

    expect(result.coinCount).toBe(1);
    expect(result.orderCount).toBe(2);
    expect(result.totalAmount).toBe(1500);
    expect(result.coins).toEqual([
      expect.objectContaining({
        coin: 'BTC',
        orderType: 'conditional',
        minPrice: 45000,
        maxPrice: 45000,
        orderCount: 1,
        totalAmount: 900,
      }),
      expect.objectContaining({
        coin: 'BTC',
        orderType: 'trigger',
        minPrice: 60000,
        maxPrice: 60000,
        orderCount: 1,
        totalAmount: 600,
      }),
    ]);
  });

  it('keeps successful coins and reports only failed coins in all-coins totals', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'coinsForBuy') return ['BTC', 'ETH'];
        if (key === 'coinsSpotForTakeProfit') return [];
        return undefined;
      }),
    };
    service = new OkxService(config as any, { warn: jest.fn() } as any, {} as any);
    jest.spyOn(service as any, 'getPendingTriggerSpotOrders')
      .mockImplementation(async (coin?: string) => {
        if (!coin) throw new Error('OKX 51290');
        if (coin === 'ETH') throw new Error('ETH unavailable');
        return [{ instId: 'BTC-USDT', side: 'buy', triggerPx: '40000', ordPx: '40000', sz: '0.01' }];
      });
    jest.spyOn(service as any, 'getPendingConditionalSpotOrders').mockResolvedValue([]);
    jest.spyOn(service as any, 'getSpotTickers').mockResolvedValue(new Map([
      ['BTC-USDT', 50000],
      ['ETH-USDT', 3000],
    ]));

    const result = await service.getPendingOrdersTotalForAllCoins('buy');

    expect(result.orderCount).toBe(1);
    expect(result.totalAmount).toBe(400);
    expect(result.coins).toEqual([
      expect.objectContaining({ coin: 'BTC', orderType: 'trigger', orderCount: 1 }),
      expect.objectContaining({
        coin: 'ETH',
        orderType: 'trigger',
        orderCount: 0,
        error: 'ETH unavailable',
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
          numberOfCoins: 0.1,
          amountUsdt: 5100,
          averageCost: 50000,
          currentPrice: 51000,
          profitPercentage: 2,
          profitUsdt: 100,
        },
        {
          coin: 'ETH',
          numberOfCoins: 2,
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

describe('OkxService cancel pending spot algo orders for one coin', () => {
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

    const result = await service.cancelPendingSpotOrdersForOneCoin('xrp', 'buy', 'trigger', false);

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

    const result = await service.cancelPendingSpotOrdersForOneCoin('ETC', 'sell', 'trigger', false);

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

  it('previews trigger and conditional orders together without cancelling', async () => {
    const service = new OkxService({} as any, { log: jest.fn() } as any, {} as any);
    jest.spyOn(service as any, 'getPendingTriggerSpotOrders').mockResolvedValue([
      { algoId: 'trigger-1', instId: 'BTC-USDT', ordType: 'trigger', side: 'sell', triggerPx: '110', ordPx: '-1', sz: '1' },
    ]);
    jest.spyOn(service as any, 'getPendingConditionalSpotOrders').mockResolvedValue([
      { algoId: 'sl-1', instId: 'BTC-USDT', ordType: 'conditional', side: 'sell', slTriggerPx: '90', slOrdPx: '-1', sz: '1' },
    ]);
    const post = jest.spyOn(axios, 'post');

    const result = await service.cancelPendingSpotOrdersForOneCoin('BTC', 'sell', 'all', true);

    expect(post).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      status: 'preview',
      ordType: 'all',
      testing: true,
      matchedOrderCount: 2,
    }));
    expect(result.orders.map((order: any) => [order.ordType, order.conditionType])).toEqual([
      ['trigger', undefined],
      ['conditional', 'stop_loss'],
    ]);
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

describe('OkxService clean excess sell orders', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createService = () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'okx.baseUrl') return 'https://www.okx.test';
        if (key === 'okx.secretKey') return 'secret';
        return 'value';
      }),
    };
    const logger = { log: jest.fn() };
    const service = new OkxService(config as any, logger as any, {} as any);
    jest.spyOn(service as any, 'getTicker').mockResolvedValue(100);
    jest.spyOn(service as any, 'getPendingTriggerSpotOrders').mockResolvedValue([
      { algoId: 'low', instId: 'ETC-USDT', side: 'sell', triggerPx: '70', ordPx: '69', sz: '1', cTime: '1785240000000' },
      { algoId: 'equal', instId: 'ETC-USDT', side: 'sell', triggerPx: '100', ordPx: '99', sz: '10' },
      { algoId: 'above', instId: 'ETC-USDT', side: 'sell', triggerPx: '110', ordPx: '109', sz: '10' },
      { algoId: 'high', instId: 'ETC-USDT', side: 'sell', triggerPx: '90', ordPx: '89', sz: '2', cTime: '1785243600000' },
      { algoId: 'buy', instId: 'ETC-USDT', side: 'buy', triggerPx: '60', ordPx: '59', sz: '10' },
      { algoId: 'middle', instId: 'ETC-USDT', side: 'sell', triggerPx: '80', ordPx: '79', sz: '3', cTime: '1785241800000' },
    ]);
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{ details: [{ ccy: 'ETC', cashBal: '4', availBal: '1', openAvgPx: '80' }] }],
    });
    return { service, logger };
  };

  it('keeps highest-priced sell orders within the bought amount in preview mode', async () => {
    const { service } = createService();
    const cancelAlgoOrders = jest.spyOn(service as any, 'cancelAlgoOrders');
    const conditionalStopLossOrders = jest.spyOn(service as any, 'getPendingConditionalSpotOrders');

    const result = await service.cleanSellOrdersForOneCoin('etc');

    expect(result).toEqual(expect.objectContaining({
      status: 'preview',
      currentPrice: 100,
      boughtCoinAmount: 4,
      eligibleOrderCount: 3,
      keptOrderCount: 1,
      keptSize: 2,
      cancelOrderCount: 2,
      cancelSize: 4,
    }));
    expect(result.keptOrders.map((order) => order.algoId)).toEqual(['high']);
    expect(result.ordersToCancel.map((order) => order.algoId)).toEqual([
      'low',
      'middle',
    ]);
    expect(result.keptOrders.map((order) => order.algoId)).not.toContain('equal');
    expect(result.keptOrders.map((order) => order.algoId)).not.toContain('above');
    expect(result.ordersToCancel.map((order) => order.algoId)).not.toContain('equal');
    expect(result.ordersToCancel.map((order) => order.algoId)).not.toContain('above');
    expect(cancelAlgoOrders).not.toHaveBeenCalled();
    expect(conditionalStopLossOrders).not.toHaveBeenCalled();
  });

  it('cancels sell orders from the lowest trigger price first', async () => {
    const { service, logger } = createService();
    const cancelAlgoOrders = jest.spyOn(service as any, 'cancelAlgoOrders').mockResolvedValue({
      responses: [{
        code: '0',
        data: [
          { algoId: 'low', sCode: '0' },
          { algoId: 'middle', sCode: '0' },
        ],
      }],
      cancelledOrderCount: 2,
      failedOrderCount: 0,
    });

    const result = await service.cleanSellOrdersForOneCoin('ETC', false);

    expect(cancelAlgoOrders).toHaveBeenCalledWith([
      { algoId: 'low', instId: 'ETC-USDT' },
      { algoId: 'middle', instId: 'ETC-USDT' },
    ]);
    expect(result).toEqual(expect.objectContaining({
      status: 'cleaned',
      cancelledOrderCount: 2,
      failedOrderCount: 0,
    }));
    const cleanupTableCall = logger.log.mock.calls.find(
      ([, context, coin]) => context === 'Sell order cleanup table' && coin === 'ETC_clean',
    );
    expect(cleanupTableCall).toBeDefined();
    expect(cleanupTableCall[0]).toContain(
      '\nSTATUS  | ALGO ID | CURRENT PRICE | CURRENT PROFIT (%) | CREATED AT          | CLEANED AT          | TRIGGER PRICE | ORDER PRICE | ORDER PROFIT (%)',
    );
    expect(cleanupTableCall[0]).toMatch(/CLEANED\s+\| low\s+\| 100\s+\| 25\s+\| 2026-07-28 19:00:00\s+\| \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s+\| 70\s+\| 69\s+\| -13\.75/);
    expect(cleanupTableCall[0]).toMatch(/CLEANED\s+\| middle\s+\| 100\s+\| 25\s+\| 2026-07-28 19:30:00\s+\| \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s+\| 80\s+\| 79\s+\| -1\.25/);
    expect(cleanupTableCall[0]).toMatch(/KEPT\s+\| high\s+\| 100\s+\| 25\s+\| 2026-07-28 20:00:00\s+\|\s+\| 90\s+\| 89\s+\| 11\.25/);
  });

  it('keeps an order whose rounded size is within half a coin size unit of the balance', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'coin.NEAR') return { szToFixed: 8 };
        return 'value';
      }),
    };
    const service = new OkxService(config as any, { log: jest.fn() } as any, {} as any);
    jest.spyOn(service as any, 'getTicker').mockResolvedValue(1.661);
    jest.spyOn(service as any, 'getPendingTriggerSpotOrders').mockResolvedValue([
      {
        algoId: 'near-rounded-size',
        instId: 'NEAR-USDT',
        side: 'sell',
        triggerPx: '1.565',
        ordPx: '1.562',
        sz: '6.68068324',
      },
    ]);
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{ details: [{ ccy: 'NEAR', cashBal: '6.6806832388' }] }],
    });

    const result = await service.cleanSellOrdersForOneCoin('near');

    expect(result).toEqual(expect.objectContaining({
      status: 'preview',
      boughtCoinAmount: 6.6806832388,
      keptOrderCount: 1,
      cancelOrderCount: 0,
    }));
    expect(result.keptOrders.map((order) => order.algoId)).toEqual([
      'near-rounded-size',
    ]);
  });
});

describe('OkxService place spot stop loss near current price', () => {
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

  it('previews a near-current conditional stop-loss using the requested balance percentage', async () => {
    const { service } = createService();
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{ details: [{ ccy: 'BTC', availBal: '0.01234567' }] }],
    });
    jest.spyOn(service as any, 'getTicker').mockResolvedValue(60000);
    const placeStopLoss = jest.spyOn(service, 'placeSpotConditionalStopLoss');

    const result = await service.placeSpotStopLossNearCurrentPrice(' btc ', 25);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'preview',
        coin: 'BTC',
        percentage: 25,
        availableBalance: '0.01234567',
        sizeToSell: '0.00308641',
        currentPrice: 60000,
        triggerPrice: 59880,
        orderPrice: -1,
        ordType: 'conditional',
        estimatedValueUsdt: 185.1846,
        order: {
          data: undefined,
          body: {
            instId: 'BTC-USDT',
            tdMode: 'cash',
            side: 'sell',
            ordType: 'conditional',
            sz: '0.00308641',
            slTriggerPx: '59880.00',
            slTriggerPxType: 'last',
            slOrdPx: '-1',
          },
        },
      }),
    );
    expect(placeStopLoss).toHaveBeenCalledWith(
      'BTC',
      '0.00308641',
      '59880.00',
      true,
    );
  });

  it('submits the conditional stop-loss only when testing is false', async () => {
    const { service, logger } = createService();
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{ details: [{ ccy: 'ETH', availBal: '1.25' }] }],
    });
    jest.spyOn(service as any, 'getTicker').mockResolvedValue(3000);
    const placeStopLoss = jest.spyOn(service, 'placeSpotConditionalStopLoss').mockResolvedValue({
      data: { code: '0', data: [{ algoId: '123' }] },
      body: { ordType: 'conditional' },
    } as any);

    const result = await service.placeSpotStopLossNearCurrentPrice('ETH', 100, false);

    expect(result.status).toBe('submitted');
    expect(placeStopLoss).toHaveBeenCalledWith(
      'ETH',
      '1.25000000',
      '2994.00',
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

    await expect(service.placeSpotStopLossNearCurrentPrice('ADA', 100, false)).resolves.toEqual({
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

    await expect(service.placeSpotStopLossNearCurrentPrice('BTC', 0)).rejects.toThrow(
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

  it('uses the API buyWithoutCheckAvarageCost option instead of the default', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'coin.LTC') {
          return { amountOfUsdtPerStep: 12, priceToFixed: 2, szToFixed: 4 };
        }
        const values = {
          maxUsdt: 4000,
          riskPerTrade: 0.02,
          stopLossBuyPriceRatio: 0.1,
        };
        return values[key];
      }),
    };
    const service = new OkxService(config as any, { log: jest.fn() } as any, {} as any);
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{ details: [{ availBal: '1', openAvgPx: '50' }] }],
    });
    const placeOneOrder = jest.spyOn(service, 'placeOneOrder');

    await service.buyTriggerFromMinPriceToMaxPrice('LTC', 100, 110, true, {
      numberOfOrders: 1,
      direction: 'up',
      buyWithoutCheckAvarageCost: false,
    });

    expect(placeOneOrder).not.toHaveBeenCalled();
  });

  it('does not create a stop-loss from the buy trigger range flow', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'coin.LTC') {
          return { amountOfUsdtPerStep: 12, priceToFixed: 2, szToFixed: 4 };
        }
        const values = {
          maxUsdt: 4000,
          riskPerTrade: 0.02,
          stopLossBuyPriceRatio: 0.1,
        };
        return values[key];
      }),
    };
    const service = new OkxService(config as any, { log: jest.fn() } as any, {} as any);
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{ details: [{ availBal: '0', openAvgPx: '0' }] }],
    });
    const placeBuy = jest.spyOn(service, 'placeOneOrder').mockResolvedValue({
      data: undefined,
      body: { side: 'buy' },
    } as any);
    const placeStopLoss = jest.spyOn(service, 'placeSpotConditionalStopLoss');

    const result = await service.buyTriggerFromMinPriceToMaxPrice('LTC', 100, 110, true, {
      numberOfOrders: 1,
      direction: 'down',
      currentPrice: 120,
    });

    expect(placeBuy).toHaveBeenCalledTimes(1);
    expect(placeStopLoss).not.toHaveBeenCalled();
    expect(result.map(({ type }) => type)).toEqual(['BUY']);
  });
});

describe('OkxService auto sell size and profit logging', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createService = () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'coin.ALGO' || key === 'coin.DOT') {
          return {
            szToFixed: key === 'coin.DOT' ? 6 : 4,
            priceToFixed: key === 'coin.DOT' ? 4 : 5,
            minClosePriceRatio: 0.05,
            maxClosePriceRatio: 0.06,
          };
        }
        const values = {
          maxUsdt: 4000,
          riskPerTrade: 0.02,
          amountOfUsdtPerStep: 12,
          minClosePriceRatio: 0.05,
          maxClosePriceRatio: 0.06,
          stopLossSellPriceRatio: 0.1,
        };
        return values[key];
      }),
    };
    const logger = { log: jest.fn(), error: jest.fn() };
    const service = new OkxService(config as any, logger as any, {} as any);
    jest.spyOn(service as any, 'fetchSpotInstrument').mockResolvedValue({
      instId: 'ALGO-USDT',
      lotSz: 0.0001,
      minSz: 0.0001,
    });
    jest.spyOn(service as any, 'getTicker').mockResolvedValue(0.08641);
    jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    return { service, logger };
  };

  it('does not submit a sell order whose size rounds to zero', async () => {
    const { service, logger } = createService();
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{ details: [{ availBal: '0.00001', openAvgPx: '0' }] }],
    });
    const placeOneOrder = jest.spyOn(service, 'placeOneOrder');

    await expect(
      service.autoSellFromMinPriceToStopLossPriceForDown('ALGO', true),
    ).resolves.toEqual([]);

    expect(placeOneOrder).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('is below minimum size 0.0001'),
      null,
      'ALGO',
    );
  });

  it('does not submit a DOT dust sell order below the instrument minimum size', async () => {
    const { service, logger } = createService();
    jest.spyOn(service as any, 'fetchSpotInstrument').mockResolvedValue({
      instId: 'DOT-USDT',
      lotSz: 0.000001,
      minSz: 0.01,
    });
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{ details: [{ availBal: '0.000001', openAvgPx: '0' }] }],
    });
    const placeOneOrder = jest.spyOn(service, 'placeOneOrder');

    await expect(
      service.autoSellFromMinPriceToStopLossPriceForDown('DOT', true),
    ).resolves.toEqual([]);

    expect(placeOneOrder).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('size 0.000001 is below minimum size 0.01'),
      null,
      'DOT',
    );
  });

  it('logs N/A profit when the average cost is unavailable', async () => {
    const { service, logger } = createService();
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{ details: [{ availBal: '1', openAvgPx: '0' }] }],
    });
    const placeOneOrder = jest.spyOn(service, 'placeOneOrder').mockResolvedValue({
      body: { triggerPx: '0.08053', orderPx: '0.08037' },
    } as any);

    await service.autoSellFromMinPriceToStopLossPriceForDown('ALGO', true);

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('profit: N/A'),
      null,
      'ALGO',
    );
    expect(logger.log.mock.calls.flat().join(' ')).not.toContain('Infinity');
    expect(placeOneOrder).toHaveBeenCalled();
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

  it('uses a conditional market stop-loss when the sell price is below current price', async () => {
    const { service } = createService();
    const placeStopLoss = jest.spyOn(service, 'placeSpotConditionalStopLoss');

    const result = await service.placeSpotStopLossAtTriggerPrice('BTC', 50000, 25);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'preview',
        currentPrice: 60000,
        percentage: 25,
        sizeToSell: '0.3086',
        triggerPrice: 50000,
        orderPrice: -1,
        ordType: 'conditional',
        conditionType: 'stop_loss',
        executionType: 'market',
        priceDirection: 'below_current_price',
      }),
    );
    expect(placeStopLoss).toHaveBeenCalledWith(
      'BTC',
      '0.3086',
      '50000.00',
      true,
    );
  });

  it('uses a conditional market take-profit when the sell price is above current price', async () => {
    const { service } = createService();
    const placeTakeProfit = jest.spyOn(service, 'placeSpotConditionalTakeProfit').mockResolvedValue({
      data: { code: '0', data: [{ algoId: '123' }] },
      body: {
        ordType: 'conditional',
        tpTriggerPx: '70000.00',
        tpOrdPx: '-1',
      },
    } as any);

    const result = await service.placeSpotTakeProfitAtTriggerPrice('BTC', 70000, 25, false);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'submitted',
        triggerPrice: 70000,
        orderPrice: -1,
        ordType: 'conditional',
        conditionType: 'take_profit',
        executionType: 'market',
        priceDirection: 'above_current_price',
      }),
    );
    expect(placeTakeProfit).toHaveBeenCalledWith(
      'BTC',
      '0.3086',
      '70000.00',
      false,
    );
  });

  it('builds a conditional take-profit payload with market execution', async () => {
    const { service } = createService();

    const result = await service.placeSpotConditionalTakeProfit(
      'BTC',
      '0.25',
      '70000.00',
      true,
    );

    expect(result.body).toEqual({
      instId: 'BTC-USDT',
      tdMode: 'cash',
      side: 'sell',
      ordType: 'conditional',
      sz: '0.25',
      tpTriggerPx: '70000.00',
      tpTriggerPxType: 'last',
      tpOrdPx: '-1',
    });
  });

  it('rejects a missing or invalid requested price before reading the balance', async () => {
    const { service } = createService();

    await expect(service.placeSpotTakeProfitAtTriggerPrice('BTC', Number.NaN, 25)).rejects.toThrow(
      'Invalid take-profit trigger price',
    );
    expect(service.getAccountBalance).not.toHaveBeenCalled();
  });

  it('rejects a percentage outside the 0 to 100 range', async () => {
    const { service } = createService();

    await expect(service.placeSpotTakeProfitAtTriggerPrice('BTC', 70000, 0)).rejects.toThrow(
      'Invalid percentage',
    );
    await expect(service.placeSpotTakeProfitAtTriggerPrice('BTC', 70000, 101)).rejects.toThrow(
      'Invalid percentage',
    );
  });
});

describe('OkxService conditional spot stop-loss coverage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createService = () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'coin.BTC') return { priceToFixed: 2, szToFixed: 4 };
        if (key === 'stopLossRatio') return 0.01;
        return 'test';
      }),
    };
    const logger = { log: jest.fn() };
    const emailService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const service = new OkxService(config as any, logger as any, emailService as any);
    jest.spyOn(service, 'getAccountBalance').mockResolvedValue({
      data: [{ details: [{ ccy: 'BTC', cashBal: '2', availBal: '2' }] }],
    });
    jest.spyOn(service as any, 'getTicker').mockResolvedValue(100);
    return { service, logger, emailService };
  };

  it('creates a conditional market global stop-loss only for the missing spot size', async () => {
    const { service } = createService();
    jest.spyOn(service as any, 'getPendingConditionalSpotOrders').mockResolvedValue([
      {
        instId: 'BTC-USDT',
        side: 'sell',
        sz: '0.5',
        slTriggerPx: '98',
        slOrdPx: '-1',
      },
    ]);
    const placeStopLoss = jest.spyOn(service, 'placeSpotConditionalStopLoss');

    const result: any = await service.ensureSpotStopLoss('BTC', true);

    expect(result).toEqual(expect.objectContaining({
      status: 'preview',
      positionSize: 2,
      protectedSize: 0.5,
      missingSize: 1.5,
      stopLossPrice: 99,
    }));
    expect(placeStopLoss).toHaveBeenCalledWith('BTC', '1.5000', '99.00', true);
    expect(result.order.body).toEqual(expect.objectContaining({
      ordType: 'conditional',
      side: 'sell',
      slTriggerPx: '99.00',
      slOrdPx: '-1',
    }));
  });

  it('does not create another global stop-loss when conditional coverage is sufficient', async () => {
    const { service } = createService();
    jest.spyOn(service as any, 'getPendingConditionalSpotOrders').mockResolvedValue([
      {
        instId: 'BTC-USDT',
        side: 'sell',
        sz: '2',
        slTriggerPx: '98',
        slOrdPx: '-1',
      },
    ]);
    const placeStopLoss = jest.spyOn(service, 'placeSpotConditionalStopLoss');

    await expect(service.ensureSpotStopLoss('BTC', true)).resolves.toEqual(
      expect.objectContaining({ status: 'already_protected', missingSize: 0 }),
    );
    expect(placeStopLoss).not.toHaveBeenCalled();
  });

  it('rejects a manual spot stop-loss above current price', async () => {
    const { service } = createService();

    await expect(
      service.placeSpotStopLossAtTriggerPrice('BTC', 110, 100, true),
    ).rejects.toThrow('must be below current price');
  });

  it('rejects a manual spot take-profit at or below current price', async () => {
    const { service } = createService();

    await expect(
      service.placeSpotTakeProfitAtTriggerPrice('BTC', 90, 100, true),
    ).rejects.toThrow('must be above current price');
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
        numberOfCoins: 0.1,
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

  it('cleans every configured bought coin through the one-coin cleanup flow', async () => {
    const { service } = createService();
    jest.spyOn(service, 'getAllSpotBoughtCoins').mockResolvedValue({
      quoteCurrency: 'USDT',
      coinCount: 2,
      totalProfitUsdt: 100,
      coins: [
        {
          coin: 'BTC',
          numberOfCoins: 0.1,
          amountUsdt: 5100,
          averageCost: 50000,
          currentPrice: 51000,
          profitPercentage: 2,
          profitUsdt: 100,
        },
        {
          coin: 'ETH',
          numberOfCoins: 1,
          amountUsdt: 3000,
          averageCost: 2900,
          currentPrice: 3000,
          profitPercentage: 3.45,
          profitUsdt: 100,
        },
      ],
    });
    const cleanOneCoin = jest
      .spyOn(service, 'cleanSellOrdersForOneCoin')
      .mockImplementation(async (coin) => ({ status: 'clean', coin }) as any);

    await expect(service.cleanSellOrdersForAllCoins(false)).resolves.toEqual([
      { coin: 'btc', result: { status: 'clean', coin: 'btc' } },
      { coin: 'ETH', result: { status: 'clean', coin: 'ETH' } },
    ]);
    expect(cleanOneCoin.mock.calls).toEqual([
      ['btc', false],
      ['ETH', false],
    ]);
  });
});

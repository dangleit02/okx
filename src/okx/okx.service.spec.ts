import { OkxService } from './okx.service';
import axios from 'axios';

describe('OkxService pending buy order totals', () => {
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

    const result = await service.getPendingBuyOrdersTotalForCoin('btc', {
      minPrice: 40000,
      maxPrice: 61000,
      priceStep: 5000,
    });

    expect(result.filter).toEqual({
      minPrice: 40000,
      maxPrice: 61000,
      priceStep: 5000,
    });
    expect(result.summary.orderCount).toBe(5);
    expect(result.summary.totalAmount).toBe(2509);
    expect(result.ranges).toEqual([
      expect.objectContaining({
        fromPrice: 40000,
        toPrice: 45000,
        amount: 399,
      }),
      expect.objectContaining({
        fromPrice: 45000,
        toPrice: 50000,
        amount: 450,
      }),
      expect.objectContaining({
        fromPrice: 50000,
        toPrice: 55000,
        amount: 500,
      }),
      expect.objectContaining({
        fromPrice: 55000,
        toPrice: 60000,
        amount: 550,
      }),
      expect.objectContaining({
        fromPrice: 60000,
        toPrice: 61000,
        amount: 610,
      }),
    ]);
    expect(
      result.ranges?.reduce((total, range) => total + range.amount, 0),
    ).toBe(result.summary.totalAmount);
  });

  it('requires minPrice and maxPrice when priceStep is provided', async () => {
    await expect(
      service.getPendingBuyOrdersTotalForCoin('BTC', { priceStep: 5000 }),
    ).rejects.toThrow(
      'minPrice and maxPrice are required when priceStep is provided',
    );
  });

  it('keeps decimal range boundaries stable', async () => {
    jest
      .spyOn(service as any, 'getPendingTriggerSpotOrders')
      .mockResolvedValue([]);

    const result = await service.getPendingBuyOrdersTotalForCoin('ADA', {
      minPrice: 0.1,
      maxPrice: 0.3,
      priceStep: 0.1,
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

    const result = await service.getPendingBuyOrdersTotalForAllCoins();

    expect(result.coinCount).toBe(2);
    expect(result.totalAmount).toBe(1715);
    expect(result.coins).toEqual([
      expect.objectContaining({
        coin: 'ADA',
        minPrice: 0.45,
        maxPrice: 0.45,
        totalAmount: 450,
      }),
      expect.objectContaining({
        coin: 'BTC',
        minPrice: 40000,
        maxPrice: 45000,
        totalAmount: 1265,
      }),
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

    const result = await service.cancelPendingBuyOrdersByPriceRange(
      'btc',
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
  });

  it('cancels matching orders in batches of 20 when testing=false', async () => {
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

    const result = await service.cancelPendingBuyOrdersByPriceRange(
      'BTC',
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
    expect(post).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(post.mock.calls[0][1]))).toHaveLength(20);
    expect(JSON.parse(String(post.mock.calls[1][1]))).toHaveLength(1);
  });
});

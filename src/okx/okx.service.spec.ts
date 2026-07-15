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

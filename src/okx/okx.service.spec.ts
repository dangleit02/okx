import { OkxService } from './okx.service';

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
          ordPx: '40000',
          sz: '0.01',
        },
        {
          algoId: '2',
          instId: 'BTC-USDT',
          side: 'buy',
          ordPx: '45000',
          sz: '0.01',
        },
        {
          algoId: '3',
          instId: 'BTC-USDT',
          side: 'buy',
          ordPx: '50000',
          sz: '0.01',
        },
        {
          algoId: '4',
          instId: 'BTC-USDT',
          side: 'buy',
          ordPx: '55000',
          sz: '0.01',
        },
        {
          algoId: '5',
          instId: 'BTC-USDT',
          side: 'buy',
          ordPx: '61000',
          sz: '0.01',
        },
        {
          algoId: '6',
          instId: 'BTC-USDT',
          side: 'sell',
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
    expect(result.summary.totalAmount).toBe(2510);
    expect(result.ranges).toEqual([
      expect.objectContaining({
        fromPrice: 40000,
        toPrice: 45000,
        amount: 400,
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
});

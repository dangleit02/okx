import { SpotController } from './spot.controller';
import { PendingBuyOrdersTotalResponse } from './okx.service';

describe('SpotController buy order total response format', () => {
  const response: PendingBuyOrdersTotalResponse = {
    coin: 'BTC',
    instId: 'BTC-USDT',
    quoteCurrency: 'USDT',
    filter: {
      minPrice: 40000,
      maxPrice: 61000,
      priceStep: 5000,
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

  let controller: SpotController;
  let logger: { log: jest.Mock };

  beforeEach(() => {
    logger = { log: jest.fn() };
    controller = new SpotController(
      {
        getPendingBuyOrdersTotalForCoin: jest.fn().mockResolvedValue(response),
      } as any,
      {} as any,
      logger as any,
    );
  });

  it('returns and logs an ASCII table when format=table', async () => {
    const result = await controller.getBuyOrdersTotalForCoin(
      'BTC',
      '40000',
      '61000',
      '5000',
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
    const result = await controller.getBuyOrdersTotalForCoin(
      'BTC',
      '40000',
      '61000',
      '5000',
    );

    expect(result).toBe(response);
    expect(logger.log).toHaveBeenCalledWith(
      JSON.stringify(response, null, 2),
      'Pending buy orders JSON',
      'BTC',
    );
  });
});

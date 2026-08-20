jest.mock('src/logger/logger.service', () => ({ AppLogger: class {} }), {
  virtual: true,
});
jest.mock('src/email/email.service', () => ({ EmailService: class {} }), {
  virtual: true,
});

import { OkxFutureBaseService } from './okx.future.base.service';
import axios from 'axios';
import {
  formatFutureOrdersAsTable,
  formatFuturePositionsAsTable,
} from './future-table';

class TestFutureService extends OkxFutureBaseService {
  constructor(
    config: any,
    logger: any,
    emailService: any,
    private readonly hedgeMode = true,
  ) {
    super(config, logger, emailService);
  }

  protected includePosSide(): boolean {
    return this.hedgeMode;
  }

  protected getPosSide(
    direction: 'long' | 'short',
  ): 'long' | 'short' | undefined {
    return this.hedgeMode ? direction : undefined;
  }
}

describe('OkxFutureBaseService protected entry and close orders', () => {
  const createService = (hedgeMode = true) => {
    const config = {
      get: jest.fn((key: string) => {
        const values = {
          amountOfUsdtPerStep: 12,
          minClosePriceRatio: 0.05,
          maxClosePriceRatio: 0.06,
          stopLossBuyPriceRatio: 0.1,
          futureLeverage: 3,
          'okx.baseUrl': 'https://example.invalid',
          'okx.secretKeyHEDGE': 'secret',
          'okx.apiKeyHEDGE': 'key',
          'okx.passphraseHEDGE': 'passphrase',
        };
        return values[key];
      }),
    };
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const emailService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const service = new TestFutureService(
      config,
      logger,
      emailService,
      hedgeMode,
    );
    jest.spyOn(service as any, 'fetchInstrument').mockResolvedValue({
      instId: 'BTC-USDT-SWAP',
      lotSz: 0.01,
      minSz: 0.01,
      tickSz: 0.1,
    });
    jest.spyOn(service as any, 'getTicker').mockResolvedValue(100);
    return { service, logger, emailService };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('includes trigger, conditional and stop-loss orders in all-coins statistics', async () => {
    const { service } = createService();
    jest.spyOn(service, 'getAllPendingTriggerOrders').mockResolvedValue([
      { algoId: '1', instId: 'BTC-USDT-SWAP', side: 'sell', posSide: 'long' },
      { algoId: '2', instId: 'BTC-USDT-SWAP', side: 'buy', posSide: 'long' },
    ]);
    jest.spyOn(service, 'getAllPendingConditionalOrders').mockResolvedValue([
      {
        algoId: '3',
        instId: 'BTC-USDT-SWAP',
        side: 'sell',
        posSide: 'long',
        slTriggerPx: '90',
        slOrdPx: '-1',
      },
      {
        algoId: '4',
        instId: 'ETH-USDT-SWAP',
        side: 'sell',
        posSide: 'long',
        tpTriggerPx: '120',
        tpOrdPx: '-1',
      },
    ]);

    const result = await service.getFutureOrdersForAllCoins('long', 'close');

    expect(result.orderCount).toBe(3);
    expect(result.orderTypeCounts).toEqual({
      trigger: 1,
      conditional: 2,
      stopLoss: 1,
    });
    expect(result.coins).toEqual([
      expect.objectContaining({
        coin: 'BTC',
        orderCount: 2,
        orderTypeCounts: { trigger: 1, conditional: 1, stopLoss: 1 },
        orders: expect.arrayContaining([
          expect.objectContaining({ algoId: '1', orderType: 'trigger' }),
          expect.objectContaining({ algoId: '3', orderType: 'stop_loss' }),
        ]),
      }),
      expect.objectContaining({
        coin: 'ETH',
        orderTypeCounts: { trigger: 0, conditional: 1, stopLoss: 0 },
        orders: [
          expect.objectContaining({ algoId: '4', orderType: 'conditional' }),
        ],
      }),
    ]);
  });

  it('formats future orders by coin and trigger price with percentages inside price columns', () => {
    const result = formatFutureOrdersAsTable({
      direction: 'long',
      intent: 'close',
      coins: [
        {
          coin: 'ETH',
          currentPrice: 200,
          orders: [
            {
              orderType: 'trigger',
              triggerPrice: 220,
              orderPrice: 219,
              sz: '2',
            },
          ],
        },
        {
          coin: 'BTC',
          currentPrice: 100,
          orders: [
            {
              orderType: 'conditional',
              triggerPrice: 110,
              orderPrice: -1,
              sz: '1',
            },
            { orderType: 'trigger', triggerPrice: 90, orderPrice: 89, sz: '1' },
          ],
        },
      ],
    });

    expect(result).toMatch(
      /^UPDATED AT: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\n/,
    );
    expect(result.indexOf('BTC')).toBeLessThan(result.indexOf('ETH'));
    expect(result).toContain('90 (-10%)');
    expect(result).toContain('110 (10%)');
    expect(result).toContain('MARKET');
    expect(result).not.toContain('PROFIT (%)');
  });

  it('formats future positions alphabetically with profit inside current price', () => {
    const result = formatFuturePositionsAsTable({
      positions: [
        {
          coin: 'ETH',
          direction: 'long',
          size: 2,
          averagePrice: 200,
          currentPrice: 190,
          unrealizedPnlRatio: -0.05,
          unrealizedPnl: -20,
        },
        {
          coin: 'BTC',
          direction: 'long',
          size: 1,
          averagePrice: 100,
          currentPrice: 110,
          unrealizedPnlRatio: 0.1,
          unrealizedPnl: 10,
        },
      ],
    });

    expect(result).toMatch(
      /^UPDATED AT: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\n/,
    );
    expect(result.indexOf('BTC')).toBeLessThan(result.indexOf('ETH'));
    expect(result).toContain('110 (10%)');
    expect(result).toContain('190 (-5%)');
    expect(result).not.toContain('PROFIT (%)');
  });

  it('retries pending algo orders while the OKX trading bot engine is upgrading', async () => {
    const { service, logger } = createService();
    const sleep = jest
      .spyOn(service as any, 'sleep')
      .mockResolvedValue(undefined);
    const get = jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({
        data: {
          code: '51290',
          data: [],
          msg: 'Trading bot engine currently upgrading.',
        },
      })
      .mockResolvedValueOnce({ data: { code: '0', data: [] } });

    const result = await service.getAllPendingTriggerOrders('SWAP');

    expect(result).toEqual([]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('OKX 51290'),
    );
  });

  it('rejects every entry order that does not have a stop loss', async () => {
    const { service } = createService();

    await expect(
      service.openPosition('BTC', 'long', '1', '100', '101', true),
    ).rejects.toThrow('A valid stopLossPx is required');
  });

  it('attaches a market stop loss to a pending long entry', async () => {
    const { service } = createService();

    const result = await service.openPosition(
      'BTC',
      'long',
      '1',
      '100',
      '101',
      true,
      '90',
    );

    expect(result.body).toEqual(
      expect.objectContaining({
        instId: 'BTC-USDT-SWAP',
        side: 'buy',
        posSide: 'long',
        ordType: 'trigger',
        attachAlgoOrds: [
          {
            slTriggerPx: '90',
            slTriggerPxType: 'last',
            slOrdPx: '-1',
          },
        ],
      }),
    );
    expect(result.body.reduceOnly).toBeUndefined();
  });

  it('rejects an HTTP 200 response containing an OKX open-order item error', async () => {
    const { service } = createService();
    jest.spyOn(service as any, 'setLeverage').mockResolvedValue({ code: '0' });
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        code: '1',
        data: [{ sCode: '51020', sMsg: 'Minimum order amount' }],
      },
    });

    await expect(
      service.openPosition('BTC', 'long', '1', '100', '101', false, '90'),
    ).rejects.toThrow('OKX rejected future open order');
  });

  it('rejects an HTTP 200 response containing an OKX close-order item error', async () => {
    const { service } = createService();
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        code: '1',
        data: [{ sCode: '51020', sMsg: 'Minimum order amount' }],
      },
    });

    await expect(
      service.closePartialPosition('BTC', 'long', '1', '90', '-1', false),
    ).rejects.toThrow('OKX rejected future close order');
  });

  it('previews a hedge long market entry 0.2% above current with an automatic stop loss', async () => {
    const { service } = createService(true);

    const result = await service.openNearCurrentPrice(' btc ', 'long');

    expect(result).toEqual(
      expect.objectContaining({
        status: 'preview',
        mode: 'hedge',
        coin: 'BTC',
        direction: 'long',
        amountUsdt: 12,
        currentPrice: 100,
        triggerPrice: 100.2,
        orderPrice: -1,
        stopLossPrice: 90,
        size: '0.11',
        executionType: 'market_on_trigger',
      }),
    );
    expect(result.order.body).toEqual(
      expect.objectContaining({
        side: 'buy',
        posSide: 'long',
        ordType: 'trigger',
        triggerPx: '100.2',
        orderPx: '-1',
        attachAlgoOrds: [
          {
            slTriggerPx: '90',
            slTriggerPxType: 'last',
            slOrdPx: '-1',
          },
        ],
      }),
    );
  });

  it('previews a one-way short market entry below current with an explicit stop loss', async () => {
    const { service } = createService(false);

    const result = await service.openNearCurrentPrice('BTC', 'short', {
      amountUsdt: 20,
      stopLossPrice: 110,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'preview',
        mode: 'oneway',
        direction: 'short',
        triggerPrice: 99.8,
        stopLossPrice: 110,
        orderPrice: -1,
      }),
    );
    expect(result.order.body).toEqual(
      expect.objectContaining({
        side: 'sell',
        triggerPx: '99.8',
        orderPx: '-1',
      }),
    );
    expect(result.order.body.posSide).toBeUndefined();
  });

  it('adds a valid stop loss to every short range entry', async () => {
    const { service } = createService();

    const results = await service.openTriggerRangeWithStopLoss(
      'BTC',
      'short',
      100,
      110,
      { numberOfOrders: 2, testing: true },
    );

    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.body.side).toBe('sell');
      expect(Number(result.body.attachAlgoOrds[0].slTriggerPx)).toBeGreaterThan(
        110,
      );
    }
  });

  it('places a reduce-only close order for a negative one-way short position', async () => {
    const { service } = createService(false);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [{ instId: 'BTC-USDT-SWAP', pos: '-2', avgPx: '100' }],
    });

    const result: any = await service.closePositionAtTriggerPrice(
      'BTC',
      'short',
      90,
      50,
      true,
    );

    expect(result.body).toEqual(
      expect.objectContaining({
        side: 'buy',
        sz: '1',
        reduceOnly: true,
      }),
    );
    expect(result.body.posSide).toBeUndefined();
    expect(result.body.orderPx).not.toBe('-1');
    expect(result.closeType).toBe('limit_on_trigger');
    expect(result.executionType).toBe('limit');
  });

  it('uses market execution for every long close price below current price', async () => {
    const { service } = createService();
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [
        { instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '2', avgPx: '100' },
      ],
    });

    const result: any = await service.placePositionStopLossAtTriggerPrice(
      'BTC',
      'long',
      90,
      100,
      true,
    );

    expect(result.body).toEqual(
      expect.objectContaining({
        side: 'sell',
        posSide: 'long',
        ordType: 'conditional',
        slTriggerPx: '90',
        slOrdPx: '-1',
      }),
    );
    expect(result.closeType).toBe('market_on_trigger');
    expect(result.executionType).toBe('market');
  });

  it('uses a limit order on trigger for every long close price above current price', async () => {
    const { service } = createService();
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [
        { instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '2', avgPx: '100' },
      ],
    });

    const result: any = await service.closePositionAtTriggerPrice(
      'BTC',
      'long',
      110,
      100,
      true,
    );

    expect(result).toEqual(
      expect.objectContaining({
        closeType: 'limit_on_trigger',
        executionType: 'limit',
        body: expect.objectContaining({
          side: 'sell',
          triggerPx: '110',
          orderPx: '109.8',
        }),
      }),
    );
  });

  it('uses market execution when the long close price equals current price', async () => {
    const { service } = createService();
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [
        { instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '2', avgPx: '90' },
      ],
    });

    const result: any = await service.closePositionAtTriggerPrice(
      'BTC',
      'long',
      100,
      100,
      true,
    );

    expect(result).toEqual(
      expect.objectContaining({
        closeType: 'market_on_trigger',
        executionType: 'market',
        body: expect.objectContaining({
          ordType: 'conditional',
          slOrdPx: '-1',
        }),
      }),
    );
  });

  it('uses market execution for every short close price above current price', async () => {
    const { service } = createService(false);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [{ instId: 'BTC-USDT-SWAP', pos: '-2', avgPx: '100' }],
    });

    const result: any = await service.placePositionStopLossAtTriggerPrice(
      'BTC',
      'short',
      110,
      100,
      true,
    );

    expect(result.body).toEqual(
      expect.objectContaining({
        side: 'buy',
        ordType: 'conditional',
        slTriggerPx: '110',
        slOrdPx: '-1',
        reduceOnly: true,
      }),
    );
    expect(result.closeType).toBe('market_on_trigger');
    expect(result.executionType).toBe('market');
  });

  it('rejects a dedicated stop-loss trigger placed on the take-profit side', async () => {
    const { service } = createService();

    await expect(
      service.placePositionStopLossAtTriggerPrice(
        'BTC',
        'long',
        110,
        100,
        true,
      ),
    ).rejects.toThrow('must be below current price');
  });

  it('places the near-current stop loss as a market order when triggered', async () => {
    const { service } = createService();
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [
        { instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '2', avgPx: '100' },
      ],
    });

    const result: any = await service.closePositionAtCurrentPrice(
      'BTC',
      'long',
      100,
      true,
    );

    expect(result).toEqual(
      expect.objectContaining({
        closeType: 'market_on_trigger',
        executionType: 'market',
        body: expect.objectContaining({
          ordType: 'conditional',
          slTriggerPx: '99.8',
          slOrdPx: '-1',
          sz: '2',
        }),
      }),
    );
  });

  it('uses market execution for a long protective close by price steps without requiring average price', async () => {
    const { service } = createService();
    (service as any).getTicker.mockResolvedValue(200);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [
        {
          instId: 'BTC-USDT-SWAP',
          posSide: 'long',
          pos: '100',
          availPos: '1',
          avgPx: '0',
        },
      ],
    });

    const result = await service.placeProtectiveCloseByPriceSteps(
      'BTC',
      'long',
      true,
      true,
      true,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        closeType: 'market_on_trigger',
        executionType: 'market',
        body: expect.objectContaining({
          triggerPx: '188.4',
          orderPx: '-1',
          sz: '5',
          reduceOnly: true,
        }),
      }),
    );
  });

  it('uses the configured current-price close range symmetrically for a short ladder', async () => {
    const { service } = createService();
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [
        { instId: 'BTC-USDT-SWAP', posSide: 'short', pos: '100', avgPx: '120' },
      ],
    });

    const result = await service.placeProtectiveCloseByPriceSteps(
      'BTC',
      'short',
      true,
      true,
      true,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        step: 'market_on_trigger_5.00%',
        closeType: 'market_on_trigger',
        executionType: 'market',
        body: expect.objectContaining({
          triggerPx: '104.8',
          orderPx: '-1',
          posSide: 'short',
        }),
      }),
    );
  });

  it('emails one open-range summary in live mode and does not email previews', async () => {
    const { service, logger, emailService } = createService();
    jest.spyOn(service, 'openPosition').mockResolvedValue({
      data: { code: '0' },
      body: {
        triggerPx: '99.8',
        orderPx: '100',
        sz: '1',
        attachAlgoOrds: [{ slTriggerPx: '90', slOrdPx: '-1' }],
      },
    } as any);

    await service.openTriggerRangeWithStopLoss('BTC', 'long', 100, 110, {
      numberOfOrders: 1,
      stopLossPrice: 90,
      testing: false,
    });

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      process.env.EMAIL_TO,
      '[FUTURE HEDGE] Open long range BTC',
      expect.objectContaining({
        coin: 'BTC',
        direction: 'long',
        orderCount: 1,
      }),
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('open range complete'),
      null,
      'BTC_long_hedge',
    );

    emailService.sendEmail.mockClear();
    await service.openTriggerRangeWithStopLoss('BTC', 'long', 100, 110, {
      numberOfOrders: 1,
      stopLossPrice: 90,
      testing: true,
    });
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('emails live market-on-trigger close details', async () => {
    const { service, emailService } = createService();
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [
        { instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '2', avgPx: '100' },
      ],
    });
    jest.spyOn(service, 'placePositionStopLoss').mockResolvedValue({
      data: { code: '0' },
      body: {
        ordType: 'conditional',
        slTriggerPx: '90',
        slOrdPx: '-1',
        sz: '2',
        posSide: 'long',
      },
    } as any);

    await service.closePositionAtTriggerPrice('BTC', 'long', 90, 100, false);

    expect(emailService.sendEmail).toHaveBeenCalledWith(
      process.env.EMAIL_TO,
      '[FUTURE HEDGE] Close long market_on_trigger BTC',
      expect.objectContaining({
        closeType: 'market_on_trigger',
        executionType: 'market',
        ordType: 'conditional',
      }),
    );
  });

  it('logs and emails a live cancellation only when matching orders exist', async () => {
    const { service, logger, emailService } = createService();
    jest.spyOn(service, 'getPendingTriggerOrdersForCoin').mockResolvedValue([
      {
        algoId: '1',
        instId: 'BTC-USDT-SWAP',
        posSide: 'long',
        side: 'buy',
        triggerPx: '100',
        ordPx: '101',
        sz: '1',
      },
    ]);
    jest
      .spyOn(service, 'cancelOrdersFromList')
      .mockResolvedValue([{ code: '0' }] as any);

    await service.cancelFutureOrdersForOneCoin(
      'BTC',
      'long',
      'open',
      'trigger',
      false,
    );

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('matched=1'),
      null,
      'BTC_long_hedge',
    );
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      process.env.EMAIL_TO,
      '[FUTURE HEDGE] Cancel long open orders BTC',
      expect.objectContaining({ matchedOrderCount: 1 }),
    );
  });

  it('previews trigger and conditional future cancellations together', async () => {
    const { service, emailService } = createService();
    jest.spyOn(service, 'getPendingTriggerOrdersForCoin').mockResolvedValue([
      {
        algoId: 'open-1',
        instId: 'BTC-USDT-SWAP',
        ordType: 'trigger',
        posSide: 'long',
        side: 'buy',
      },
    ]);
    jest
      .spyOn(service, 'getPendingConditionalOrdersForCoin')
      .mockResolvedValue([
        {
          algoId: 'close-1',
          instId: 'BTC-USDT-SWAP',
          ordType: 'conditional',
          posSide: 'long',
          side: 'sell',
          slTriggerPx: '90',
        },
      ]);
    const cancel = jest.spyOn(service, 'cancelOrdersFromList');

    const result = await service.cancelFutureOrdersForOneCoin(
      'BTC',
      'long',
      'all',
      'all',
      true,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'preview',
        ordType: 'all',
        testing: true,
        matchedOrderCount: 2,
        cancelled: [],
      }),
    );
    expect((result as any).orders.map((order: any) => order.ordType)).toEqual([
      'trigger',
      'conditional',
    ]);
    expect(cancel).not.toHaveBeenCalled();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('creates a market conditional stop loss for the unprotected long size in hedge mode', async () => {
    const { service } = createService(true);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [
        { instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '2', avgPx: '100' },
      ],
    });
    jest
      .spyOn(service, 'getPendingConditionalOrdersForCoin')
      .mockResolvedValue([
        {
          algoId: 'sl-1',
          instId: 'BTC-USDT-SWAP',
          posSide: 'long',
          side: 'sell',
          sz: '1.25',
          slTriggerPx: '90',
          slOrdPx: '-1',
        },
      ]);

    const result: any = await service.ensurePositionStopLoss(
      'BTC',
      'long',
      true,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'preview',
        positionSize: 2,
        protectedSize: 1.25,
        missingSize: 0.75,
        stopLossPrice: 90,
      }),
    );
    expect(result.order.body).toEqual(
      expect.objectContaining({
        side: 'sell',
        posSide: 'long',
        ordType: 'conditional',
        sz: '0.75',
        slTriggerPx: '90',
        slTriggerPxType: 'last',
        slOrdPx: '-1',
      }),
    );
    expect(result.order.body.reduceOnly).toBeUndefined();
  });

  it('does not create another stop loss when the position is fully protected', async () => {
    const { service } = createService(true);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [
        { instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '2', avgPx: '100' },
      ],
    });
    jest
      .spyOn(service, 'getPendingConditionalOrdersForCoin')
      .mockResolvedValue([
        {
          algoId: 'sl-1',
          instId: 'BTC-USDT-SWAP',
          posSide: 'long',
          side: 'sell',
          sz: '2',
          slTriggerPx: '90',
          slOrdPx: '-1',
        },
      ]);
    const placeStopLoss = jest.spyOn(service, 'placePositionStopLoss');

    const result: any = await service.ensurePositionStopLoss(
      'BTC',
      'long',
      true,
    );

    expect(result.status).toBe('already_protected');
    expect(result.missingSize).toBe(0);
    expect(placeStopLoss).not.toHaveBeenCalled();
  });

  it('creates a whole-position market conditional stop loss for a one-way short', async () => {
    const { service } = createService(false);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [{ instId: 'BTC-USDT-SWAP', pos: '-2', avgPx: '100' }],
    });
    jest
      .spyOn(service, 'getPendingConditionalOrdersForCoin')
      .mockResolvedValue([
        {
          algoId: 'sl-1',
          instId: 'BTC-USDT-SWAP',
          side: 'buy',
          sz: '0.5',
          slTriggerPx: '110',
          slOrdPx: '-1',
        },
      ]);

    const result: any = await service.ensurePositionStopLoss(
      'BTC',
      'short',
      true,
    );

    expect(result.order.body).toEqual(
      expect.objectContaining({
        side: 'buy',
        ordType: 'conditional',
        closeFraction: '1',
        slTriggerPx: '110',
        slOrdPx: '-1',
        reduceOnly: true,
      }),
    );
    expect(result.order.body.sz).toBeUndefined();
    expect(result.order.body.posSide).toBeUndefined();
  });

  it('emails the stop-loss coverage details after a live submission', async () => {
    const { service, logger, emailService } = createService(true);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [
        { instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '2', avgPx: '100' },
      ],
    });
    jest
      .spyOn(service, 'getPendingConditionalOrdersForCoin')
      .mockResolvedValue([]);
    jest.spyOn(service, 'placePositionStopLoss').mockResolvedValue({
      data: { code: '0' },
      body: { sz: '2', slTriggerPx: '90', slOrdPx: '-1' },
    } as any);

    await service.ensurePositionStopLoss('BTC', 'long', false);

    expect(emailService.sendEmail).toHaveBeenCalledWith(
      process.env.EMAIL_TO,
      '[FUTURE HEDGE] Reconcile long stop-loss BTC',
      expect.objectContaining({
        positionSize: 2,
        protectedSize: 0,
        missingSize: 2,
        stopLossPrice: 90,
      }),
    );
  });

  it('reconciles excess hedge stop-loss size and replaces only the missing remainder', async () => {
    const { service } = createService(true);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [
        { instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '1', avgPx: '100' },
      ],
    });
    jest
      .spyOn(service, 'getPendingConditionalOrdersForCoin')
      .mockResolvedValue([
        {
          algoId: 'near',
          instId: 'BTC-USDT-SWAP',
          posSide: 'long',
          side: 'sell',
          sz: '0.75',
          slTriggerPx: '95',
          slOrdPx: '-1',
        },
        {
          algoId: 'far',
          instId: 'BTC-USDT-SWAP',
          posSide: 'long',
          side: 'sell',
          sz: '0.75',
          slTriggerPx: '90',
          slOrdPx: '-1',
        },
      ]);

    const result: any = await service.reconcilePositionStopLoss(
      'BTC',
      'long',
      true,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'preview',
        positionSize: 1,
        protectedSize: 0.75,
        missingSize: 0.25,
        cancelOrderCount: 1,
        stopLossPrice: 95,
      }),
    );
    expect(result.cancellations).toEqual([
      expect.objectContaining({ preview: true, algoId: 'far' }),
    ]);
    expect(result.order.body).toEqual(
      expect.objectContaining({ sz: '0.25', posSide: 'long' }),
    );
  });

  it('cancels stale hedge stop losses when the position is closed', async () => {
    const { service } = createService(true);
    jest
      .spyOn(service as any, 'getOpenPosition')
      .mockResolvedValue({ data: [] });
    jest
      .spyOn(service, 'getPendingConditionalOrdersForCoin')
      .mockResolvedValue([
        {
          algoId: 'stale',
          instId: 'BTC-USDT-SWAP',
          posSide: 'long',
          side: 'sell',
          sz: '1',
          slTriggerPx: '90',
          slOrdPx: '-1',
        },
      ]);

    const result: any = await service.reconcilePositionStopLoss(
      'BTC',
      'long',
      true,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'preview',
        positionSize: 0,
        cancelOrderCount: 1,
      }),
    );
  });

  it('keeps one one-way whole-position stop loss and removes size-based stop losses', async () => {
    const { service } = createService(false);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [{ instId: 'BTC-USDT-SWAP', pos: '2', avgPx: '100' }],
    });
    jest
      .spyOn(service, 'getPendingConditionalOrdersForCoin')
      .mockResolvedValue([
        {
          algoId: 'whole',
          instId: 'BTC-USDT-SWAP',
          side: 'sell',
          closeFraction: '1',
          slTriggerPx: '90',
          slOrdPx: '-1',
        },
        {
          algoId: 'attached',
          instId: 'BTC-USDT-SWAP',
          side: 'sell',
          sz: '2',
          slTriggerPx: '85',
          slOrdPx: '-1',
        },
      ]);

    const result: any = await service.reconcilePositionStopLoss(
      'BTC',
      'long',
      true,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'preview',
        wholePositionStopLoss: true,
        keptOrderId: 'whole',
        cancelOrderCount: 1,
      }),
    );
    expect(result.cancellations).toEqual([
      expect.objectContaining({ algoId: 'attached' }),
    ]);
  });

  it('keeps two long close orders when one order alone is below the position USD', async () => {
    const { service } = createService(true);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [
        { instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '1', avgPx: '0' },
      ],
    });
    jest.spyOn(service, 'getPendingTriggerOrdersForCoin').mockResolvedValue([
      {
        algoId: 'near',
        instId: 'BTC-USDT-SWAP',
        posSide: 'long',
        side: 'sell',
        triggerPx: '90',
        ordPx: '-1',
        sz: '0.6',
      },
      {
        algoId: 'far',
        instId: 'BTC-USDT-SWAP',
        posSide: 'long',
        side: 'sell',
        triggerPx: '80',
        ordPx: '-1',
        sz: '0.6',
      },
      {
        algoId: 'take-profit',
        instId: 'BTC-USDT-SWAP',
        posSide: 'long',
        side: 'sell',
        triggerPx: '110',
        ordPx: '109',
        sz: '5',
      },
      {
        algoId: 'entry',
        instId: 'BTC-USDT-SWAP',
        posSide: 'long',
        side: 'buy',
        triggerPx: '95',
        ordPx: '96',
        sz: '5',
      },
    ]);
    jest
      .spyOn(service, 'getPendingConditionalOrdersForCoin')
      .mockResolvedValue([]);

    const result: any =
      await service.cleanProtectiveCloseByPriceStepsOrdersForOneCoin(
        'BTC',
        'long',
        true,
      );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'preview',
        positionSize: '1',
        protectiveCloseByPriceStepsOrderCount: 2,
        keptOrderCount: 2,
        cancelOrderCount: 0,
      }),
    );
    expect(result.keptOrders.map((order) => order.algoId)).toEqual([
      'near',
      'far',
    ]);
    expect(result.ordersToCancel).toEqual([]);
  });

  it('keeps the nearest short protective close and cleans the farther excess trigger in oneway mode', async () => {
    const { service } = createService(false);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [{ instId: 'BTC-USDT-SWAP', pos: '-1', avgPx: '0' }],
    });
    jest.spyOn(service, 'getPendingTriggerOrdersForCoin').mockResolvedValue([
      {
        algoId: 'near',
        instId: 'BTC-USDT-SWAP',
        side: 'buy',
        triggerPx: '110',
        ordPx: '-1',
        sz: '1',
      },
      {
        algoId: 'far',
        instId: 'BTC-USDT-SWAP',
        side: 'buy',
        triggerPx: '120',
        ordPx: '-1',
        sz: '0.6',
      },
      {
        algoId: 'take-profit',
        instId: 'BTC-USDT-SWAP',
        side: 'buy',
        triggerPx: '90',
        ordPx: '91',
        sz: '5',
      },
    ]);
    jest
      .spyOn(service, 'getPendingConditionalOrdersForCoin')
      .mockResolvedValue([]);

    const result: any =
      await service.cleanProtectiveCloseByPriceStepsOrdersForOneCoin(
        'BTC',
        'short',
        true,
      );

    expect(result.keptOrders.map((order) => order.algoId)).toEqual(['near']);
    expect(result.ordersToCancel.map((order) => order.algoId)).toEqual(['far']);
  });

  it('returns nothing_to_cancel when live futures cleanup has no excess close orders', async () => {
    const { service, logger, emailService } = createService(true);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [
        { instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '1', avgPx: '0' },
      ],
    });
    jest.spyOn(service, 'getPendingTriggerOrdersForCoin').mockResolvedValue([]);
    jest
      .spyOn(service, 'getPendingConditionalOrdersForCoin')
      .mockResolvedValue([]);
    const cancelOrders = jest.spyOn(service, 'cancelOrdersFromList');

    await expect(
      service.cleanProtectiveCloseByPriceStepsOrdersForOneCoin(
        'BTC',
        'long',
        false,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'nothing_to_cancel',
        cancelOrderCount: 0,
        cancelledOrderCount: 0,
      }),
    );
    expect(cancelOrders).not.toHaveBeenCalled();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
    const summaryCall = logger.log.mock.calls.find(
      ([, context]) => context === 'Future protective close cleanup summary',
    );
    expect(JSON.parse(summaryCall[0])).toEqual(
      expect.objectContaining({
        status: 'nothing_to_cancel',
        coin: 'BTC',
        keptOrderCount: 0,
        cancelOrderCount: 0,
        cancelledOrderIds: [],
        failedOrderIds: [],
      }),
    );
  });

  it('logs only a compact futures cleanup summary after cancellation', async () => {
    const { service, logger } = createService(true);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      code: '0',
      data: [],
    });
    jest.spyOn(service, 'getPendingTriggerOrdersForCoin').mockResolvedValue([
      {
        algoId: 'orphan-close',
        instId: 'NEAR-USDT-SWAP',
        posSide: 'long',
        side: 'sell',
        triggerPx: '10',
        ordPx: '-1',
        sz: '2',
      },
    ]);
    jest
      .spyOn(service, 'getPendingConditionalOrdersForCoin')
      .mockResolvedValue([]);
    jest.spyOn(service, 'cancelOrdersFromList').mockResolvedValue([
      {
        code: '0',
        data: [{ algoId: 'orphan-close', sCode: '0' }],
      },
    ]);

    await service.cleanProtectiveCloseByPriceStepsOrdersForOneCoin(
      'NEAR',
      'long',
      false,
    );

    const summaryCall = logger.log.mock.calls.find(
      ([, context]) => context === 'Future protective close cleanup summary',
    );
    expect(JSON.parse(summaryCall[0])).toEqual(
      expect.objectContaining({
        status: 'cleaned',
        coin: 'NEAR',
        cancelledOrderIds: ['orphan-close'],
        failedOrderIds: [],
      }),
    );
    expect(summaryCall[0]).not.toContain('responses');
    expect(summaryCall[0]).not.toContain('keptOrders');
    expect(summaryCall[0]).not.toContain('ordersToCancel');
  });

  it('cleans trigger and conditional close orders without ticker metadata when the position is gone', async () => {
    const { service } = createService(true);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      code: '0',
      data: [],
    });
    jest.spyOn(service, 'getPendingTriggerOrdersForCoin').mockResolvedValue([
      {
        algoId: 'trigger-close',
        instId: 'NEAR-USDT-SWAP',
        posSide: 'long',
        side: 'sell',
        triggerPx: '10',
        ordPx: '-1',
        sz: '2',
      },
      {
        algoId: 'entry',
        instId: 'NEAR-USDT-SWAP',
        posSide: 'long',
        side: 'buy',
        triggerPx: '5',
        ordPx: '-1',
        sz: '2',
      },
    ]);
    jest
      .spyOn(service, 'getPendingConditionalOrdersForCoin')
      .mockResolvedValue([
        {
          algoId: 'conditional-close',
          instId: 'NEAR-USDT-SWAP',
          posSide: 'long',
          side: 'sell',
          closeFraction: '1',
          slTriggerPx: '4',
          slOrdPx: '-1',
        },
      ]);

    const result: any =
      await service.cleanProtectiveCloseByPriceStepsOrdersForOneCoin(
        'NEAR',
        'long',
        true,
      );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'preview',
        currentPrice: null,
        positionSize: '0',
        orphanedCloseOrderCleanup: true,
        cancelOrderCount: 2,
      }),
    );
    expect(result.ordersToCancel.map((order) => order.algoId).sort()).toEqual([
      'conditional-close',
      'trigger-close',
    ]);
    expect((service as any).getTicker).not.toHaveBeenCalled();
    expect((service as any).fetchInstrument).not.toHaveBeenCalled();
  });

  it('discovers cleanup coins from config, open positions, and pending conditional close orders', async () => {
    const { service } = createService(true);
    jest.spyOn(service, 'getAllPendingTriggerOrders').mockResolvedValue([
      {
        algoId: 'entry',
        instId: 'SOL-USDT-SWAP',
        posSide: 'long',
        side: 'buy',
      },
    ]);
    jest.spyOn(service, 'getAllPendingConditionalOrders').mockResolvedValue([
      {
        algoId: 'orphan-close',
        instId: 'NEAR-USDT-SWAP',
        posSide: 'long',
        side: 'sell',
      },
    ]);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      code: '0',
      data: [
        {
          instId: 'ETH-USDT-SWAP',
          posSide: 'long',
          pos: '1',
        },
      ],
    });

    await expect(
      service.getProtectiveCloseCleanupCoins('long', ['btc']),
    ).resolves.toEqual(['BTC', 'ETH', 'NEAR']);
  });

  it('builds distinct hedge and oneway log filename keys', () => {
    const hedge = createService(true).service;
    const oneway = createService(false).service;

    expect((hedge as any).getFutureLogFileKey('long', 'btc')).toBe(
      'BTC_long_hedge',
    );
    expect((oneway as any).getFutureLogFileKey('short', 'btc')).toBe(
      'BTC_short_oneway',
    );
    expect((hedge as any).getFutureLogFileKey('long')).toBe('ALL_long_hedge');
  });
});

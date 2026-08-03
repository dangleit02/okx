jest.mock('src/logger/logger.service', () => ({ AppLogger: class {} }), { virtual: true });
jest.mock('src/email/email.service', () => ({ EmailService: class {} }), { virtual: true });

import { OkxFutureBaseService } from './okx.future.base.service';

class TestFutureService extends OkxFutureBaseService {
  constructor(config: any, logger: any, emailService: any, private readonly hedgeMode = true) {
    super(config, logger, emailService);
  }

  protected includePosSide(): boolean {
    return this.hedgeMode;
  }

  protected getPosSide(direction: 'long' | 'short'): 'long' | 'short' | undefined {
    return this.hedgeMode ? direction : undefined;
  }
}

describe('OkxFutureBaseService protected entry and close orders', () => {
  const createService = (hedgeMode = true) => {
    const config = {
      get: jest.fn((key: string) => {
        const values = {
          amountOfUsdtPerStep: 12,
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
    const service = new TestFutureService(config, logger, emailService, hedgeMode);
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

    expect(result.body).toEqual(expect.objectContaining({
      instId: 'BTC-USDT-SWAP',
      side: 'buy',
      posSide: 'long',
      ordType: 'trigger',
      attachAlgoOrds: [{
        slTriggerPx: '90',
        slTriggerPxType: 'last',
        slOrdPx: '-1',
      }],
    }));
    expect(result.body.reduceOnly).toBeUndefined();
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
      expect(Number(result.body.attachAlgoOrds[0].slTriggerPx)).toBeGreaterThan(110);
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

    expect(result.body).toEqual(expect.objectContaining({
      side: 'buy',
      sz: '1',
      reduceOnly: true,
    }));
    expect(result.body.posSide).toBeUndefined();
    expect(result.body.orderPx).not.toBe('-1');
    expect(result.closeType).toBe('take_profit');
    expect(result.executionType).toBe('limit');
  });

  it('uses market execution for a long stop loss below current price', async () => {
    const { service } = createService();
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [{ instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '2', avgPx: '100' }],
    });

    const result: any = await service.closePositionAtTriggerPrice(
      'BTC',
      'long',
      90,
      100,
      true,
    );

    expect(result.body).toEqual(expect.objectContaining({
      side: 'sell',
      posSide: 'long',
      orderPx: '-1',
      reduceOnly: true,
    }));
    expect(result.closeType).toBe('stop_loss');
    expect(result.executionType).toBe('market');
  });

  it('uses market execution for a short stop loss above current price', async () => {
    const { service } = createService(false);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [{ instId: 'BTC-USDT-SWAP', pos: '-2', avgPx: '100' }],
    });

    const result: any = await service.closePositionAtTriggerPrice(
      'BTC',
      'short',
      110,
      100,
      true,
    );

    expect(result.body).toEqual(expect.objectContaining({
      side: 'buy',
      orderPx: '-1',
      reduceOnly: true,
    }));
    expect(result.closeType).toBe('stop_loss');
    expect(result.executionType).toBe('market');
  });

  it('uses market execution for retrace close orders in the close ladder', async () => {
    const { service } = createService();
    (service as any).getTicker.mockResolvedValue(200);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [{ instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '100', avgPx: '100' }],
    });

    const result = await service.placeTakeProfitByClosePartialPosition(
      'BTC',
      'long',
      true,
      true,
      true,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      closeType: 'stop_loss',
      executionType: 'market',
      body: expect.objectContaining({ orderPx: '-1', reduceOnly: true }),
    }));
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
      expect.objectContaining({ coin: 'BTC', direction: 'long', orderCount: 1 }),
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

  it('emails live close details including stop-loss and market execution', async () => {
    const { service, emailService } = createService();
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [{ instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '2', avgPx: '100' }],
    });
    jest.spyOn(service, 'closePartialPosition').mockResolvedValue({
      data: { code: '0' },
      body: { triggerPx: '90', orderPx: '-1', sz: '2', reduceOnly: true },
    } as any);

    await service.closePositionAtTriggerPrice('BTC', 'long', 90, 100, false);

    expect(emailService.sendEmail).toHaveBeenCalledWith(
      process.env.EMAIL_TO,
      '[FUTURE HEDGE] Close long stop_loss BTC',
      expect.objectContaining({
        closeType: 'stop_loss',
        executionType: 'market',
        reduceOnly: true,
      }),
    );
  });

  it('logs and emails a live cancellation only when matching orders exist', async () => {
    const { service, logger, emailService } = createService();
    jest.spyOn(service, 'getPendingTriggerOrdersForCoin').mockResolvedValue([
      { algoId: '1', instId: 'BTC-USDT-SWAP', posSide: 'long', side: 'buy', triggerPx: '100', ordPx: '101', sz: '1' },
    ]);
    jest.spyOn(service, 'cancelOrdersFromList').mockResolvedValue([{ code: '0' }] as any);

    await service.cancelFutureOrdersForOneCoin('BTC', 'long', 'open');

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

  it('creates a market conditional stop loss for the unprotected long size in hedge mode', async () => {
    const { service } = createService(true);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [{ instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '2', avgPx: '100' }],
    });
    jest.spyOn(service, 'getPendingConditionalOrdersForCoin').mockResolvedValue([
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

    const result: any = await service.ensurePositionStopLoss('BTC', 'long', true);

    expect(result).toEqual(expect.objectContaining({
      status: 'preview',
      positionSize: 2,
      protectedSize: 1.25,
      missingSize: 0.75,
      stopLossPrice: 90,
    }));
    expect(result.order.body).toEqual(expect.objectContaining({
      side: 'sell',
      posSide: 'long',
      ordType: 'conditional',
      sz: '0.75',
      slTriggerPx: '90',
      slTriggerPxType: 'last',
      slOrdPx: '-1',
    }));
    expect(result.order.body.reduceOnly).toBeUndefined();
  });

  it('does not create another stop loss when the position is fully protected', async () => {
    const { service } = createService(true);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [{ instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '2', avgPx: '100' }],
    });
    jest.spyOn(service, 'getPendingConditionalOrdersForCoin').mockResolvedValue([
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

    const result: any = await service.ensurePositionStopLoss('BTC', 'long', true);

    expect(result.status).toBe('already_protected');
    expect(result.missingSize).toBe(0);
    expect(placeStopLoss).not.toHaveBeenCalled();
  });

  it('creates a reduce-only market conditional stop loss for a one-way short', async () => {
    const { service } = createService(false);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [{ instId: 'BTC-USDT-SWAP', pos: '-2', avgPx: '100' }],
    });
    jest.spyOn(service, 'getPendingConditionalOrdersForCoin').mockResolvedValue([
      {
        algoId: 'sl-1',
        instId: 'BTC-USDT-SWAP',
        side: 'buy',
        sz: '0.5',
        slTriggerPx: '110',
        slOrdPx: '-1',
      },
    ]);

    const result: any = await service.ensurePositionStopLoss('BTC', 'short', true);

    expect(result.order.body).toEqual(expect.objectContaining({
      side: 'buy',
      ordType: 'conditional',
      sz: '1.5',
      slTriggerPx: '110',
      slOrdPx: '-1',
      reduceOnly: true,
    }));
    expect(result.order.body.posSide).toBeUndefined();
  });

  it('emails the stop-loss coverage details after a live submission', async () => {
    const { service, emailService } = createService(true);
    jest.spyOn(service as any, 'getOpenPosition').mockResolvedValue({
      data: [{ instId: 'BTC-USDT-SWAP', posSide: 'long', pos: '2', avgPx: '100' }],
    });
    jest.spyOn(service, 'getPendingConditionalOrdersForCoin').mockResolvedValue([]);
    jest.spyOn(service, 'placePositionStopLoss').mockResolvedValue({
      data: { code: '0' },
      body: { sz: '2', slTriggerPx: '90', slOrdPx: '-1' },
    } as any);

    await service.ensurePositionStopLoss('BTC', 'long', false);

    expect(emailService.sendEmail).toHaveBeenCalledWith(
      process.env.EMAIL_TO,
      '[FUTURE HEDGE] Ensure long stop-loss BTC',
      expect.objectContaining({
        positionSize: 2,
        protectedSize: 0,
        missingSize: 2,
        stopLossPrice: 90,
      }),
    );
  });

  it('builds distinct hedge and oneway log filename keys', () => {
    const hedge = createService(true).service;
    const oneway = createService(false).service;

    expect((hedge as any).getFutureLogFileKey('long', 'btc')).toBe('BTC_long_hedge');
    expect((oneway as any).getFutureLogFileKey('short', 'btc')).toBe('BTC_short_oneway');
    expect((hedge as any).getFutureLogFileKey('long')).toBe('ALL_long_hedge');
  });
});

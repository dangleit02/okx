import { SpotController } from './spot.controller';
import {
  AllPendingOrdersTotal,
  AllSpotBoughtCoins,
  PendingBuyOrdersTotalResponse,
} from './okx.service';

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
        orderType: 'trigger',
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
        orderType: 'trigger',
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
        numberOfCoins: 0.1,
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
    buyOneCoin: jest.Mock;
    cancelPendingSpotOrdersForOneCoin: jest.Mock;
    cancelAllPendingSpotOrders: jest.Mock;
    cancelPendingOrdersByPriceRange: jest.Mock;
    placeSpotTakeProfitAtTriggerPrice: jest.Mock;
    ensureSpotStopLoss: jest.Mock;
    placeSpotStopLossAtTriggerPrice: jest.Mock;
    placeSpotStopLossNearCurrentPrice: jest.Mock;
    placeSpotBuyNearCurrentPrice: jest.Mock;
    sellOneCoin: jest.Mock;
    sellAtPriceAllCoins: jest.Mock;
    cleanSellOrdersForOneCoin: jest.Mock;
    cleanSellOrdersForAllCoins: jest.Mock;
  };

  beforeEach(() => {
    logger = { log: jest.fn() };
    okxService = {
      getPendingOrdersTotalForCoin: jest
        .fn()
        .mockImplementation((_coin, side) =>
          Promise.resolve({
            ...response,
            side,
            coin: side === 'sell' ? 'ETH' : 'BTC',
            instId: side === 'sell' ? 'ETH-USDT' : 'BTC-USDT',
          }),
        ),
      getPendingOrdersTotalForAllCoins: jest
        .fn()
        .mockResolvedValue(allCoinsResponse),
      getAllSpotBoughtCoins: jest.fn().mockResolvedValue(boughtCoinsResponse),
      validateBuyTriggerPriceDirection: jest.fn().mockResolvedValue(50),
      buyTriggerFromMinPriceToMaxPrice: jest.fn().mockResolvedValue([]),
      buyOneCoin: jest.fn().mockResolvedValue(undefined),
      cancelPendingSpotOrdersForOneCoin: jest
        .fn()
        .mockResolvedValue({ status: 'preview' }),
      cancelAllPendingSpotOrders: jest
        .fn()
        .mockResolvedValue({ status: 'preview' }),
      cancelPendingOrdersByPriceRange: jest.fn().mockResolvedValue({
        status: 'preview',
      }),
      placeSpotTakeProfitAtTriggerPrice: jest
        .fn()
        .mockResolvedValue({ status: 'preview' }),
      ensureSpotStopLoss: jest.fn().mockResolvedValue({ status: 'preview' }),
      placeSpotStopLossAtTriggerPrice: jest
        .fn()
        .mockResolvedValue({ status: 'preview' }),
      placeSpotStopLossNearCurrentPrice: jest
        .fn()
        .mockResolvedValue({ status: 'preview' }),
      placeSpotBuyNearCurrentPrice: jest
        .fn()
        .mockResolvedValue({ status: 'preview' }),
      sellOneCoin: jest.fn().mockResolvedValue(undefined),
      sellAtPriceAllCoins: jest.fn().mockResolvedValue([]),
      cleanSellOrdersForOneCoin: jest
        .fn()
        .mockResolvedValue({ status: 'preview' }),
      cleanSellOrdersForAllCoins: jest.fn().mockResolvedValue([]),
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
      'COIN | NUMBER OF COIN | AMOUNT (USDT) | AVERAGE COST | CURRENT PRICE | PROFIT (USDT)',
    );
    expect(result).toContain('BTC');
    expect(result).toContain('0.1');
    expect(result).toContain('50000');
    expect(result).toContain('51000 (2%)');
    expect(result).toContain('100');
  });

  it('sorts bought spot coins alphabetically', async () => {
    okxService.getAllSpotBoughtCoins.mockResolvedValueOnce({
      ...boughtCoinsResponse,
      coinCount: 2,
      coins: [
        {
          ...boughtCoinsResponse.coins[0],
          coin: 'ETH',
        },
        {
          ...boughtCoinsResponse.coins[0],
          coin: 'ADA',
        },
      ],
    });

    const result = (await controller.getAllSpotBoughtCoins()) as string;

    expect(result.indexOf('ADA')).toBeLessThan(result.indexOf('ETH'));
  });

  it('defaults buy trigger direction to down and passes the validated current price', async () => {
    await controller.buyTriggerFromMinToMax('LTC', {
      testing: 'true',
      minPrice: '40',
      maxPrice: '41',
      numberOfOrders: '10',
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
        buyWithoutCheckAvarageCost: true,
        direction: 'down',
        currentPrice: 50,
      },
    );
  });

  it('passes buyWithoutCheckAvarageCost from the buy trigger range query', async () => {
    await controller.buyTriggerFromMinToMax('LTC', {
      testing: 'true',
      minPrice: '40',
      maxPrice: '41',
      buyWithoutCheckAvarageCost: 'false',
    });

    expect(okxService.buyTriggerFromMinPriceToMaxPrice).toHaveBeenCalledWith(
      'LTC',
      40,
      41,
      true,
      expect.objectContaining({ buyWithoutCheckAvarageCost: false }),
    );
  });

  it('does not forward the removed addStopLoss query option', async () => {
    await controller.buyTriggerFromMinToMax('LTC', {
      testing: 'true',
      minPrice: '60',
      maxPrice: '70',
      direction: 'up',
      addStopLoss: 'true',
    });

    expect(okxService.buyTriggerFromMinPriceToMaxPrice).toHaveBeenCalledWith(
      'LTC',
      60,
      70,
      true,
      expect.not.objectContaining({ addStopLoss: expect.anything() }),
    );
  });

  it('returns a compact all-coins table by default', async () => {
    const result = await controller.getOrdersTotalForAllCoins('buy');

    expect(result).toContain('TABLE SUMMARY');
    expect(result).toMatch(
      /COIN \| ORDER TYPE \| CURRENT PRICE \| AVERAGE COST \| FROM PRICE\s+\| TO PRICE\s+\| ORDER COUNT \| TOTAL AMOUNT \(USDT\) \| TOTAL BOUGHT \(USDT\) \| ERROR/,
    );
    expect(result).toContain('ADA  | TRIGGER    | 0.5');
    expect(result).toContain('BTC  | TRIGGER    | 51000');
    expect(result).toMatch(
      /ADA\s+\| TRIGGER\s+\| 0\.5\s+\|\s+\| 0\.4\s+\| 0\.45\s+\|/,
    );
    expect(result).toMatch(
      /BTC\s+\| TRIGGER\s+\| 51000 \(2%\)\s+\| 50000\s+\| 45000 \(-10%\)\s+\| 50000 \(0%\)/,
    );
    expect(result).toMatch(/ADA\s+\|[^\n]+\| 2\s+\| 425\s+\| 0\s+\|\s*$/m);
    expect(result).toMatch(/BTC\s+\|[^\n]+\| 1\s+\| 910\s+\| 5100\s+\|\s*$/m);
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
    expect(okxService.getAllSpotBoughtCoins).not.toHaveBeenCalled();
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

  it('sorts all-coins table rows by coin and then from price', async () => {
    okxService.getPendingOrdersTotalForAllCoins.mockResolvedValueOnce({
      ...allCoinsResponse,
      side: 'sell',
      filter: { step: 1 },
      coinCount: 1,
      coins: [
        {
          ...allCoinsResponse.coins[1],
          orderType: 'conditional',
          minPrice: 0.1967,
          maxPrice: 0.1967,
          ranges: [{ fromPrice: 0.1967, toPrice: 0.1967, amount: 116.61 }],
        },
        {
          ...allCoinsResponse.coins[1],
          orderType: 'trigger',
          minPrice: 0.15,
          maxPrice: 0.2,
          ranges: [
            { fromPrice: 0.2, toPrice: 0.2, amount: 20 },
            { fromPrice: 0.15, toPrice: 0.15, amount: 15 },
          ],
        },
      ],
    });

    const table = (await controller.getOrdersTotalForAllCoins(
      'sell',
      undefined,
      undefined,
      '1',
    )) as string;
    const detailRows = table
      .split('TABLE DETAIL')[1]
      .split('\n')
      .filter((line) => line.startsWith('BTC'));

    expect(
      detailRows.map((line) => parseFloat(line.split('|')[2].trim())),
    ).toEqual([0.15, 0.1967, 0.2]);
  });

  it('shows buy detail profit relative to current price for each order-count step', async () => {
    okxService.getPendingOrdersTotalForAllCoins.mockResolvedValueOnce({
      ...allCoinsResponse,
      filter: { step: 2 },
      coins: [
        {
          ...allCoinsResponse.coins[1],
          ranges: [
            { fromPrice: 40000, toPrice: 41000, amount: 810 },
            { fromPrice: 49000, toPrice: 50000, amount: 990 },
          ],
        },
      ],
    });

    const result = await controller.getOrdersTotalForAllCoins(
      'buy',
      undefined,
      undefined,
      '2',
    );

    expect(result).toContain('TABLE DETAIL');
    expect(result).toMatch(
      /COIN \| ORDER TYPE \| FROM PRICE\s+\| TO PRICE\s+\| AMOUNT \(USDT\)/,
    );
    expect(result).toMatch(
      /BTC\s+\| TRIGGER\s+\| 40000 \(-21\.57%\)\s+\| 41000 \(-19\.61%\)\s+\| 810/,
    );
    expect(result).toMatch(
      /BTC\s+\| TRIGGER\s+\| 49000 \(-3\.92%\)\s+\| 50000 \(-1\.96%\)\s+\| 990/,
    );
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
      'all',
    );
  });

  it('defaults cancel APIs to previewing all algo order types', async () => {
    await controller.cancelOrdersForOneCoin('BTC', 'sell');
    expect(okxService.cancelPendingSpotOrdersForOneCoin).toHaveBeenCalledWith(
      'BTC',
      'sell',
      'all',
      true,
    );

    await controller.cancelAllOrders(undefined, 'conditional', 'false');
    expect(okxService.cancelAllPendingSpotOrders).toHaveBeenCalledWith(
      undefined,
      'conditional',
      false,
    );
  });

  it('passes the requested trigger price and defaults to preview mode', async () => {
    await expect(
      controller.takeProfitAtTriggerPrice('btc', '70000', '25'),
    ).resolves.toEqual({ status: 'preview' });
    expect(okxService.placeSpotTakeProfitAtTriggerPrice).toHaveBeenCalledWith(
      'btc',
      70000,
      25,
      true,
    );
  });

  it('exposes global, manual and near-current conditional spot stop-loss APIs', async () => {
    await controller.ensurePositionStopLoss('btc');
    expect(okxService.ensureSpotStopLoss).toHaveBeenCalledWith('btc', true);

    await controller.stopLossAtTriggerPrice('btc', '50000', '25', 'false');
    expect(okxService.placeSpotStopLossAtTriggerPrice).toHaveBeenCalledWith(
      'btc',
      50000,
      25,
      false,
    );

    await controller.stopLossNearCurrentPrice('btc');
    expect(okxService.placeSpotStopLossNearCurrentPrice).toHaveBeenCalledWith(
      'btc',
      100,
      true,
    );

    await controller.stopLossNearCurrentPrice('eth', '25', 'false');
    expect(okxService.placeSpotStopLossNearCurrentPrice).toHaveBeenCalledWith(
      'eth',
      25,
      false,
    );
  });

  it('exposes the near-current trigger market buy API in preview mode by default', async () => {
    await expect(controller.buyNearCurrentPrice('btc', '25')).resolves.toEqual({
      status: 'preview',
    });
    expect(okxService.placeSpotBuyNearCurrentPrice).toHaveBeenCalledWith(
      'btc',
      25,
      true,
    );

    await controller.buyNearCurrentPrice('eth', undefined, 'false');
    expect(okxService.placeSpotBuyNearCurrentPrice).toHaveBeenCalledWith(
      'eth',
      undefined,
      false,
    );
  });

  it('exposes the single-coin ladder strategy as auto-buy without an autobuy flag', async () => {
    await expect(controller.autoBuy('btc', undefined, 'true')).resolves.toEqual(
      [],
    );
    expect(okxService.buyOneCoin).toHaveBeenCalledWith(
      true,
      'true',
      'btc',
      [],
      'true',
    );

    await controller.autoBuy('eth', 'false', 'false');
    expect(okxService.buyOneCoin).toHaveBeenCalledWith(
      false,
      'false',
      'eth',
      [],
      'true',
    );
  });

  it('exposes the single-coin sell strategy as auto-sell', async () => {
    await expect(
      controller.autoSell(
        'btc',
        undefined,
        'true',
        'false',
        'true',
        'false',
        'true',
      ),
    ).resolves.toEqual([]);
    expect(okxService.sellOneCoin).toHaveBeenCalledWith({
      coin: 'btc',
      isTesting: true,
      removeExistingSellOrders: 'true',
      addSellStopLoss: 'false',
      addSellTakeProfit: 'true',
      onlyForDown: 'false',
      justOneOrder: 'true',
      results: [],
    });
  });

  it('delegates all-coins selling to the shared service flow', async () => {
    await expect(
      controller.autoSellAllCoins(
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

  it('previews sell-order cleanup unless testing=false is provided', async () => {
    await expect(controller.cleanSellOrdersForOneCoin('ETC')).resolves.toEqual({
      status: 'preview',
    });
    expect(okxService.cleanSellOrdersForOneCoin).toHaveBeenLastCalledWith(
      'ETC',
      true,
    );

    await controller.cleanSellOrdersForOneCoin('ETC', 'false');
    expect(okxService.cleanSellOrdersForOneCoin).toHaveBeenLastCalledWith(
      'ETC',
      false,
    );
  });

  it('uses the shared daily-task flow to clean all coins', async () => {
    await expect(controller.cleanSellOrdersForAllCoins()).resolves.toEqual([]);
    expect(okxService.cleanSellOrdersForAllCoins).toHaveBeenLastCalledWith(
      true,
    );

    await controller.cleanSellOrdersForAllCoins('false');
    expect(okxService.cleanSellOrdersForAllCoins).toHaveBeenLastCalledWith(
      false,
    );
  });
});

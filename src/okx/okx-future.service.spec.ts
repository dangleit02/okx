jest.mock('src/logger/logger.service', () => ({ AppLogger: class {} }), {
  virtual: true,
});

import axios from 'axios';
import { OkxFutureService } from './okx-future.service';

describe('OkxFutureService legacy futures sizing', () => {
  const createService = () => {
    const values: Record<string, any> = {
      maxUsdt: 1000,
      riskPerTrade: 0.02,
      amountOfUsdtPerStep: 12,
      minBuyPriceRatio: 0.01,
      maxBuyPriceRatio: 0.02,
      stopLossBuyPriceRatio: 0.1,
      'okx.baseUrl': 'https://okx.test',
      'okx.secretKey': 'secret',
      'okx.apiKey': 'key',
      'okx.passphrase': 'passphrase',
      'coin.BTC': { priceToFixed: 1, szToFixed: 7 },
    };
    const config = { get: jest.fn((key: string) => values[key]) };
    const logger = { log: jest.fn(), error: jest.fn() };
    const service = new OkxFutureService(config as any, logger as any);
    jest.spyOn(service as any, 'fetchInstrument').mockResolvedValue({
      instId: 'BTC-USDT-SWAP',
      ctVal: 0.01,
      lotSz: 0.01,
      minSz: 0.01,
      tickSz: 0.1,
    });
    jest.spyOn(service as any, 'getTicker').mockResolvedValue(100);
    jest.spyOn(service, 'getOpenPosition').mockResolvedValue({
      code: '0',
      data: [],
    });
    return { service, logger };
  };

  afterEach(() => jest.restoreAllMocks());

  it('converts USDT notional to contracts using ctVal', async () => {
    const { service } = createService();
    const openPosition = jest.spyOn(service, 'openPosition').mockResolvedValue({
      data: undefined,
      body: {},
    });

    await service.tradeOneCoin({
      coin: 'BTC',
      direction: 'long',
      isTesting: true,
      autoTrade: true,
    });

    const [coin, direction, rawSize, , orderPrice] = openPosition.mock.calls[0];
    expect(coin).toBe('BTC');
    expect(direction).toBe('long');
    expect(Number(rawSize)).toBeCloseTo(12 / (Number(orderPrice) * 0.01), 5);
  });

  it('formats size by lot size and rejects an OKX item error', async () => {
    const { service } = createService();
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        code: '1',
        data: [{ sCode: '51020', sMsg: 'Minimum order amount' }],
      },
    });

    await expect(
      service.openPosition('BTC', 'long', '0.099', '101', '102', false, '90'),
    ).rejects.toThrow('OKX rejected legacy future open order');

    const body = (axios.post as jest.Mock).mock.calls[0][1];
    expect(body.sz).toBe('0.09');
  });

  it('subtracts the total short position even when no contracts are available', async () => {
    const { service, logger } = createService();
    jest.spyOn(service, 'getOpenPosition').mockResolvedValue({
      code: '0',
      data: [
        {
          instId: 'BTC-USDT-SWAP',
          posSide: 'short',
          pos: '-100',
          availPos: '0',
          avgPx: '100',
        },
      ],
    } as any);
    const openPosition = jest.spyOn(service, 'openPosition').mockResolvedValue({
      data: undefined,
      body: {},
    });

    await service.tradeOneCoin({
      coin: 'BTC',
      direction: 'short',
      isTesting: true,
      autoTrade: true,
    });

    expect(openPosition).toHaveBeenCalled();
    const sizingLog = logger.log.mock.calls
      .flat()
      .map(String)
      .find((message) => message.includes('sizeToOpen:'));
    const sizeToOpen = Number(sizingLog?.match(/sizeToOpen: ([\d.]+)/)?.[1]);
    expect(sizeToOpen).toBeCloseTo(66.6666666667, 8);
  });
});

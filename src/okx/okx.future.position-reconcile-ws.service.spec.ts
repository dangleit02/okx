jest.mock('./okx.future.hedge.service', () => ({
  OkxFutureHedgeService: class {},
}));
jest.mock('./okx.future.oneway.service', () => ({
  OkxFutureOneWayService: class {},
}));

import { OkxFuturePositionReconcileWsService } from './okx.future.position-reconcile-ws.service';

describe('OkxFuturePositionReconcileWsService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces one-way position updates and reconciles the latest direction', async () => {
    jest.useFakeTimers();
    const config = {
      get: jest.fn((key: string) => key === 'runSwapTaskForLongOneWay'),
    };
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const hedge = { reconcilePositionStopLoss: jest.fn() };
    const oneway = { reconcilePositionStopLoss: jest.fn().mockResolvedValue({ status: 'already_protected' }) };
    const service = new OkxFuturePositionReconcileWsService(
      config as any,
      logger as any,
      hedge as any,
      oneway as any,
    );

    (service as any).handlePosition({ instId: 'BTC-USDT-SWAP', posSide: 'net', pos: '2' });
    (service as any).handlePosition({ instId: 'BTC-USDT-SWAP', posSide: 'net', pos: '1' });

    expect(oneway.reconcilePositionStopLoss).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(300);
    expect(oneway.reconcilePositionStopLoss).toHaveBeenCalledTimes(1);
    expect(oneway.reconcilePositionStopLoss).toHaveBeenCalledWith('BTC', 'long', false);
    service.onModuleDestroy();
  });

  it('reconciles the remembered one-way direction when position size becomes zero', async () => {
    jest.useFakeTimers();
    const config = {
      get: jest.fn((key: string) => key === 'runSwapTaskForShortOneWay'),
    };
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const oneway = { reconcilePositionStopLoss: jest.fn().mockResolvedValue({ status: 'reconciled' }) };
    const service = new OkxFuturePositionReconcileWsService(
      config as any,
      logger as any,
      {} as any,
      oneway as any,
    );

    (service as any).handlePosition({ instId: 'ETH-USDT-SWAP', posSide: 'net', pos: '-2' });
    (service as any).handlePosition({ instId: 'ETH-USDT-SWAP', posSide: 'net', pos: '0' });
    await jest.advanceTimersByTimeAsync(300);

    expect(oneway.reconcilePositionStopLoss).toHaveBeenCalledTimes(1);
    expect(oneway.reconcilePositionStopLoss).toHaveBeenCalledWith('ETH', 'short', false);
    service.onModuleDestroy();
  });

  it('routes hedge position events by posSide', async () => {
    jest.useFakeTimers();
    const config = {
      get: jest.fn((key: string) => key === 'runSwapTaskForLongHedge'),
    };
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const hedge = { reconcilePositionStopLoss: jest.fn().mockResolvedValue({ status: 'reconciled' }) };
    const service = new OkxFuturePositionReconcileWsService(
      config as any,
      logger as any,
      hedge as any,
      {} as any,
    );

    (service as any).handlePosition({ instId: 'SOL-USDT-SWAP', posSide: 'long', pos: '3' });
    await jest.advanceTimersByTimeAsync(300);

    expect(hedge.reconcilePositionStopLoss).toHaveBeenCalledWith('SOL', 'long', false);
    service.onModuleDestroy();
  });
});

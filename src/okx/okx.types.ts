export type OkxOrderSide = 'buy' | 'sell';
export type OkxAlgoOrderType = 'trigger' | 'conditional';
export type OkxPositionSide = 'long' | 'short' | 'net';

export interface OkxApiResponse<T> {
  code?: string;
  data?: T[];
  msg?: string;
}

export interface OkxBalanceDetail {
  ccy: string;
  availBal?: string;
  cashBal?: string;
  eq?: string;
  frozenBal?: string;
  openAvgPx?: string;
  spotUpl?: string;
  spotUplRatio?: string;
  totalPnl?: string;
}

export interface OkxAccountBalanceData {
  details?: OkxBalanceDetail[];
  totalEq?: string;
}

export type OkxAccountBalanceResponse = OkxApiResponse<OkxAccountBalanceData>;

export interface OkxTicker {
  instId?: string;
  last?: string;
}

export interface OkxInstrument {
  instId: string;
  lotSz: string | number;
  minSz: string | number;
  tickSz?: string | number;
  ctVal?: string | number;
}

export interface OkxAlgoOrder {
  algoId?: string;
  algoClOrdId?: string;
  instId?: string;
  ordType?: OkxAlgoOrderType;
  side?: OkxOrderSide;
  posSide?: OkxPositionSide;
  sz?: string;
  triggerPx?: string;
  orderPx?: string;
  ordPx?: string;
  tpTriggerPx?: string;
  tpOrdPx?: string;
  slTriggerPx?: string;
  slOrdPx?: string;
  closeFraction?: string;
  cTime?: string;
  reduceOnly?: boolean | string;
}

export interface OkxCancelItem {
  algoId?: string;
  algoClOrdId?: string;
  clOrdId?: string;
  sCode?: string;
  sMsg?: string;
  tag?: string;
}

export type OkxCancelResponse = OkxApiResponse<OkxCancelItem>;

export interface OkxCancelBatchResult {
  responses: OkxCancelResponse[];
  cancelledOrderCount: number;
  failedOrderCount: number;
}

export interface OkxPosition {
  instId?: string;
  pos?: string;
  availPos?: string;
  posSide?: OkxPositionSide;
  avgPx?: string;
  markPx?: string;
  last?: string;
  upl?: string;
  uplRatio?: string;
}

export interface SellOrderCleanupOrder {
  algoId: string;
  instId: string;
  createdAt: string;
  triggerPrice: number;
  orderPrice: number;
  size: string;
  orderType: OkxAlgoOrderType;
  conditionType?: 'stop_loss' | 'take_profit' | 'unknown';
}

export interface SellOrderCleanupResult {
  status: 'preview' | 'nothing_to_cancel' | 'cleaned' | 'partially_cleaned';
  coin: string;
  instId: string;
  testing: boolean;
  currentPrice: number;
  sellableBalance: string;
  totalBalance: string;
  cleanupScope: 'all_sell_orders_no_balance' | 'excess_trigger_sell_orders';
  conditionalOrderCount: number;
  eligibleOrderCount: number;
  keptOrderCount: number;
  keptSize: string;
  cancelOrderCount: number;
  cancelSize: string;
  keptOrders: SellOrderCleanupOrder[];
  ordersToCancel: SellOrderCleanupOrder[];
  cancelledOrderCount?: number;
  failedOrderCount?: number;
  responses?: OkxCancelResponse[];
}

export interface TradeOneCoinParams {
  coin?: string;
  direction: 'short' | 'long';
  isTesting?: boolean;
  removeExistingOrders?: boolean;
  enableTakeProfit: boolean;
  partialCloseOnRetrace?: boolean;
  justOnePartialOrder?: boolean;
  autoTrade?: boolean;
}
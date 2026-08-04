export interface TradeOneCoinParams {
  coin?: string;
  direction: 'short' | 'long';
  isTesting?: boolean;
  removeExistingOrders?: boolean;
  enableProtectiveClose?: boolean;
  /** @deprecated Use enableProtectiveClose. */
  enableTakeProfit?: boolean;
  protectiveCloseOnly?: boolean;
  /** @deprecated Use protectiveCloseOnly. */
  partialCloseOnRetrace?: boolean;
  justOnePartialOrder?: boolean;
  autoTrade?: boolean;
}

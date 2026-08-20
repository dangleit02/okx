import * as moment from 'moment';

const formatStatisticsTimestamp = () =>
  `UPDATED AT: ${moment().format('YYYY-MM-DD HH:mm:ss')}`;

const formatTable = (headers: string[], rows: string[][]) => {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );
  const formatRow = (row: string[]) =>
    row.map((value, index) => value.padEnd(widths[index])).join(' | ');
  const separator = widths.map((width) => '-'.repeat(width)).join('-+-');
  return [formatRow(headers), separator, ...rows.map(formatRow)].join('\n');
};

const formatPercentage = (price?: number, referencePrice?: number) => {
  if (
    price === undefined ||
    referencePrice === undefined ||
    !Number.isFinite(price) ||
    !Number.isFinite(referencePrice) ||
    referencePrice <= 0
  )
    return '';
  return String(
    Number((((price - referencePrice) / referencePrice) * 100).toFixed(2)),
  );
};

const formatPriceWithPercentage = (
  price?: number,
  percentage?: string | number,
) => {
  if (price === undefined || !Number.isFinite(price)) return '';
  if (percentage === undefined || percentage === '') return String(price);
  return `${price} (${percentage}%)`;
};

const formatOrderPrice = (price?: number) => {
  if (price === -1) return 'MARKET';
  return price === undefined ? '' : String(price);
};

export const formatFutureOrdersAsTable = (result: any): string => {
  const detailItems = (result.coins ?? [])
    .flatMap((coin: any) =>
      (coin.orders ?? []).map((order: any) => ({ coin, order })),
    )
    .sort(
      (left: any, right: any) =>
        left.coin.coin.localeCompare(right.coin.coin) ||
        (left.order.triggerPrice ?? Number.POSITIVE_INFINITY) -
          (right.order.triggerPrice ?? Number.POSITIVE_INFINITY) ||
        String(left.order.orderType).localeCompare(
          String(right.order.orderType),
        ),
    );

  const groups = new Map<
    string,
    { coin: any; orderType: string; orders: any[] }
  >();
  for (const item of detailItems) {
    const orderType = String(
      item.order.orderType ?? item.order.ordType ?? '',
    ).toUpperCase();
    const key = `${item.coin.coin}|${orderType}`;
    if (!groups.has(key))
      groups.set(key, { coin: item.coin, orderType, orders: [] });
    groups.get(key)!.orders.push(item.order);
  }
  const summaryItems = Array.from(groups.values()).sort((left, right) => {
    const leftFrom = Math.min(
      ...left.orders.map(
        (order) => order.triggerPrice ?? Number.POSITIVE_INFINITY,
      ),
    );
    const rightFrom = Math.min(
      ...right.orders.map(
        (order) => order.triggerPrice ?? Number.POSITIVE_INFINITY,
      ),
    );
    return (
      left.coin.coin.localeCompare(right.coin.coin) ||
      leftFrom - rightFrom ||
      left.orderType.localeCompare(right.orderType)
    );
  });
  const summaryRows = summaryItems.map(({ coin, orderType, orders }) => {
    const prices = orders
      .map((order) => order.triggerPrice)
      .filter((price) => price !== undefined && Number.isFinite(price));
    const fromPrice = prices.length ? Math.min(...prices) : undefined;
    const toPrice = prices.length ? Math.max(...prices) : undefined;
    return [
      coin.coin,
      orderType,
      result.direction.toUpperCase(),
      result.intent.toUpperCase(),
      String(coin.currentPrice ?? ''),
      formatPriceWithPercentage(
        fromPrice,
        formatPercentage(fromPrice, coin.currentPrice),
      ),
      formatPriceWithPercentage(
        toPrice,
        formatPercentage(toPrice, coin.currentPrice),
      ),
      String(orders.length),
    ];
  });
  const detailRows = detailItems.map(({ coin, order }: any) => [
    coin.coin,
    String(order.orderType ?? order.ordType ?? '').toUpperCase(),
    formatPriceWithPercentage(
      order.triggerPrice,
      formatPercentage(order.triggerPrice, coin.currentPrice),
    ),
    formatOrderPrice(order.orderPrice),
    String(order.sz ?? ''),
  ]);

  return [
    formatStatisticsTimestamp(),
    'TABLE SUMMARY',
    formatTable(
      [
        'COIN',
        'ORDER TYPE',
        'DIRECTION',
        'INTENT',
        'CURRENT PRICE',
        'FROM PRICE',
        'TO PRICE',
        'ORDER COUNT',
      ],
      summaryRows,
    ),
    '',
    'TABLE DETAIL',
    formatTable(
      ['COIN', 'ORDER TYPE', 'TRIGGER PRICE', 'ORDER PRICE', 'SIZE'],
      detailRows,
    ),
  ].join('\n');
};

export const formatFuturePositionsAsTable = (result: any): string => {
  const rows = [...(result.positions ?? [])]
    .sort(
      (left, right) =>
        left.coin.localeCompare(right.coin) ||
        left.direction.localeCompare(right.direction),
    )
    .map((position) => [
      position.coin,
      position.direction.toUpperCase(),
      String(position.size),
      String(position.averagePrice),
      formatPriceWithPercentage(
        position.currentPrice,
        Number((position.unrealizedPnlRatio * 100).toFixed(2)),
      ),
      String(position.unrealizedPnl),
    ]);

  return [
    formatStatisticsTimestamp(),
    formatTable(
      [
        'COIN',
        'DIRECTION',
        'SIZE',
        'AVERAGE PRICE',
        'CURRENT PRICE',
        'UNREALIZED PNL (USDT)',
      ],
      rows,
    ),
  ].join('\n');
};

import { inferMarketFromSymbol } from './stock';

/** 根据证券市场返回公司行动的默认记账币种。 */
export const currencyForSymbol = (symbol) => {
  const market = inferMarketFromSymbol(symbol);
  if (market === 'HK') return 'HKD';
  if (market === 'US') return 'USD';
  return 'CNY';
};

/** 将证券搜索接口的建议结果转换为下拉选择组件所需格式。 */
export const toStockOptions = (suggestions = []) => suggestions.map((stock) => ({
  value: stock.symbol,
  label: `${stock.symbol} ${stock.name}`,
  name: stock.name,
  currency: currencyForSymbol(stock.symbol)
}));

import dayjs from 'dayjs';

export const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const getTrendColor = (value) => {
  if (value === null || value === undefined) return '#8c8c8c';
  return Number(value) >= 0 ? '#cf1322' : '#3f8600';
};

export const formatDate = (date, template = 'YYYY-MM-DD HH:mm') => {
  if (!date) return '--';
  const d = typeof date === 'object' && date.format
    ? date
    : dayjs(date);
  return d.format(template);
};

export const getCurrencySymbol = (currency) => {
  const map = { CNY: '¥', HKD: 'HK$', USD: '$' };
  return map[currency] || '¥';
};

export const getCurrencyCode = (market) => {
  const map = { HK: 'HKD', US: 'USD', CN: 'CNY', SH: 'CNY', SZ: 'CNY' };
  return map[market] || 'CNY';
};

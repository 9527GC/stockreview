import request from '../utils/request';

// Authentication
export const login = (data) => {
  return request({
    url: '/api/auth/login',
    method: 'POST',
    data
  });
};

// Assets
export const getAssetsSummary = () => {
  return request({
    url: '/api/assets/summary',
    method: 'GET'
  });
};

export const getProfitCurve = (params) => {
  return request({
    url: '/api/assets/profit-curve',
    method: 'GET',
    params
  });
};

export const getProfitCalendar = (params) => {
  return request({
    url: '/api/assets/profit-calendar',
    method: 'GET',
    params
  });
};

// Trades & Holdings
export const getHoldings = () => {
  return request({
    url: '/api/trades/holdings',
    method: 'GET'
  });
};

export const getTradeReviews = (params) => {
  return request({
    url: '/api/trades/reviews',
    method: 'GET',
    params
  });
};

export const getHistoryHoldings = (params) => {
  return request({
    url: '/api/trades/history-holdings',
    method: 'GET',
    params
  });
};

export const addTrade = (data) => {
  return request({
    url: '/api/trades',
    method: 'POST',
    data
  });
};

export const updateTrade = (id, data) => {
  return request({
    url: `/api/trades/${id}`,
    method: 'PUT',
    data
  });
};

// Transfers
export const getTransfers = (params) => {
  return request({
    url: '/api/transfers',
    method: 'GET',
    params
  });
};

export const addTransfer = (data) => {
  return request({
    url: '/api/transfers',
    method: 'POST',
    data
  });
};

// Delete Operations
export const deleteTradeBySymbol = (symbol) => {
  const encoded = encodeURIComponent(symbol);
  return request({
    url: `/api/trades/holdings/${encoded}`,
    method: 'DELETE'
  });
};

export const deleteTradeById = (id) => {
  return request({
    url: `/api/trades/reviews/${id}`,
    method: 'DELETE'
  });
};

// Market
export const searchStock = (keyword) => {
  return request({
    url: '/api/market/search',
    method: 'GET',
    params: { keyword }
  });
};

export const getMarketOverview = ({ silent = false, params = {} } = {}) => {
  return request({
    url: '/api/market/overview',
    method: 'GET',
    silent,
    params
  });
};

export const getRealTimeQuote = (symbol) => {
  return request({
    url: '/api/market/quote',
    method: 'GET',
    params: { symbol }
  });
};

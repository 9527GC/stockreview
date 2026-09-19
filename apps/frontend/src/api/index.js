import request from '../utils/request';
import { appConfig } from '@/config/env';

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

export const getCurrentHoldingTrades = (symbol) => {
  const encoded = encodeURIComponent(symbol);
  return request({
    url: `/api/trades/holdings/${encoded}/trades`,
    method: 'GET'
  });
};

export const getHistoryHoldings = (params) => {
  return request({
    url: '/api/trades/history-holdings',
    method: 'GET',
    params
  });
};

export const getHistoryHoldingGroups = (symbol) => {
  const encoded = encodeURIComponent(symbol);
  return request({
    url: `/api/trades/history-holdings/${encoded}/groups`,
    method: 'GET'
  });
};

export const batchGetHistoryHoldingGroups = (symbols) => {
  return request({
    url: '/api/trades/history-holdings/groups/batch',
    method: 'POST',
    data: { symbols }
  });
};

export const addTrade = (data) => {
  return request({
    url: '/api/trades',
    method: 'POST',
    data
  });
};

export const getCommissionPreference = () => {
  return request({
    url: '/api/trades/commission-preference',
    method: 'GET'
  });
};

export const updateCommissionPreference = (data) => {
  return request({
    url: '/api/trades/commission-preference',
    method: 'PUT',
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

// User Profile
export const getProfile = () => {
  return request({
    url: '/api/users/me',
    method: 'GET'
  });
};

export const updateProfile = (data) => {
  return request({
    url: '/api/users/me',
    method: 'PUT',
    data
  });
};

export const changePassword = (data) => {
  return request({
    url: '/api/users/password',
    method: 'PUT',
    data
  });
};

export const getWechatBindUrl = () => {
  return request({
    url: '/api/users/wechat/bind-url',
    method: 'POST'
  });
};

export const createMiniappBindCode = () => {
  return request({
    url: '/api/users/wechat/miniapp-bind-code',
    method: 'POST'
  });
};

export const getMiniappBindStatus = (token) => {
  return request({
    url: '/api/users/wechat/miniapp-bind-status',
    method: 'GET',
    params: { token },
    silent: true
  });
};

export const bindMiniappWechat = (data) => {
  return request({
    url: '/api/users/wechat/miniapp-bind',
    method: 'POST',
    data,
    silent: true
  });
};

export const unbindWechat = () => {
  return request({
    url: '/api/users/wechat/bind',
    method: 'DELETE'
  });
};

export const uploadAvatar = (filePath) => {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token');
    const baseUrl = appConfig.apiBaseUrl || '';
    uni.uploadFile({
      url: `${baseUrl}/api/users/avatar`,
      filePath,
      name: 'avatar',
      header: {
        Authorization: token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        let data;
        try {
          data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        } catch (e) {
          data = res.data;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(data);
        }
      },
      fail: reject
    });
  });
};

export const createMiniappLoginCode = () => request({ url: '/api/auth/wechat/miniapp-login/create', method: 'POST', silent: true });
export const getMiniappLoginStatus = (token) => request({ url: '/api/auth/wechat/miniapp-login/status', method: 'GET', params: { token }, silent: true });

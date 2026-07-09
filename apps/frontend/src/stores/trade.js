import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import dayjs from 'dayjs';
import {
  getAssetsSummary,
  getHoldings,
  getTradeReviews,
  getTransfers,
  addTransfer,
  addTrade as apiAddTrade,
  updateTrade as apiUpdateTrade,
  deleteTradeBySymbol,
  deleteTradeById,
  getMarketOverview,
  getRealTimeQuote,
  getCommissionPreference,
  updateCommissionPreference,
  getHistoryHoldingGroups,
  batchGetHistoryHoldingGroups
} from '@/api/index';
import { normalizeSymbol, buildSymbolAliases } from '@/utils/stock';

export const useTradeStore = defineStore('trade', () => {
  const trades = ref([]);
  const totalPrincipal = ref(250000); // 初始默认本金 (CNY)
  const transferRecords = ref([]); // 转账记录
  const transferRecordsRequestFailed = ref(false);
  const holdingsList = ref([]); // 持仓列表
  const historyHoldingGroupsBySymbol = ref({}); // 各股票历史清仓分组（按清仓周期分组）
  const assetsSummary = ref(null); // 资产概览
  const loading = ref(false);
  const refreshing = ref(false); // 交易变更后的后台刷新状态
  const marketOverview = ref(null); // 大盘行情
  const commissionPreference = ref({
    CN: { mode: 'rate', rate: 5, amount: 0 },
    HK: { mode: 'rate', rate: 5, amount: 0 },
    US: { mode: 'rate', rate: 5, amount: 0 }
  }); // 按市场保存的手续费偏好

  const hasAssetsSummary = computed(() => {
    return !!(assetsSummary.value && assetsSummary.value.totalAssets !== null && assetsSummary.value.totalAssets !== undefined);
  });

  const lastTradeReviewsParams = ref({ page: 1, pageSize: 100 });
  const tradeReviewsPagination = ref({
    current: 1,
    pageSize: 100,
    total: 0
  });

  const extractListFromResponse = (res) => {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.list)) return res.list;
    if (res.data && Array.isArray(res.data.list)) return res.data.list;
    if (res.data && Array.isArray(res.data)) return res.data;
    return [];
  };

  const extractTradeReviewsTotal = (res, fallback = 0) => {
    if (typeof res?.total === 'number') return res.total;
    if (typeof res?.count === 'number') return res.count;
    if (typeof res?.data?.total === 'number') return res.data.total;
    if (typeof res?.data?.count === 'number') return res.data.count;
    return fallback;
  };

  const normalizeTradeRecord = (t) => {
    if (!t) return null;
    const symbol = t.symbol || t.stockSymbol || t.code || t.ticker || t.stockCode;
    const date = t.date;
    const timestamp = t.timestamp !== null && t.timestamp !== undefined
      ? Number(t.timestamp)
      : (date ? dayjs(date).valueOf() : undefined);
    const review = t.review || t.reviewResult || t.reviewData || {};
    const isSystemCompliant =
      t.isSystemCompliant ??
      t.is_system_compliant ??
      t.systemCompliant ??
      review.isSystemCompliant ??
      review.is_system_compliant ??
      review.systemCompliant;
    const cognitiveBias =
      t.cognitiveBias ??
      t.cognitive_bias ??
      t.bias ??
      review.cognitiveBias ??
      review.cognitive_bias ??
      review.bias;
    const improvementMeasures =
      t.improvementMeasures ??
      t.improvement_measures ??
      t.improvement ??
      review.improvementMeasures ??
      review.improvement_measures ??
      review.improvement;

    return {
      ...t,
      symbol: symbol ? normalizeSymbol(symbol) : symbol,
      stockName: t.stockName || t.name || t.stock || t.stock_name,
      isSystemCompliant,
      cognitiveBias,
      improvementMeasures,
      timestamp
    };
  };

  const setTradesFromResponse = (tradesRes, pagination = {}) => {
    const rawList = extractListFromResponse(tradesRes);
    const mapped = rawList.map(normalizeTradeRecord).filter(Boolean);
    trades.value = mapped;
    tradeReviewsPagination.value = {
      current: Number(pagination.current || pagination.page || 1),
      pageSize: Number(pagination.pageSize || 100),
      total: extractTradeReviewsTotal(tradesRes, mapped.length)
    };
  };

  const refreshAfterTradeMutation = async (overrides = {}) => {
    const params = { page: 1, pageSize: 100, include: 'marketOverview', ...lastTradeReviewsParams.value, ...overrides };
    if (params.symbol) params.symbol = normalizeSymbol(params.symbol);

    const [assetsRes, holdingsRes, tradesRes] = await Promise.all([
      getAssetsSummary().catch(() => null),
      getHoldings().catch(() => ({ list: [] })),
      getTradeReviews(params).catch(() => ({ list: [] }))
    ]);

    // 仅当拿到有效响应时才覆盖已有数据，避免一次刷新失败把页面刷成空白
    if (assetsRes) assetsSummary.value = assetsRes;
    if (holdingsRes) holdingsList.value = (holdingsRes?.list || []).filter(h => !!h?.symbol);
    if (tradesRes) {
      setTradesFromResponse(tradesRes, { current: params.page, pageSize: params.pageSize });

      if (Number(params.page) > 1 && trades.value.length === 0 && tradeReviewsPagination.value.total > 0) {
        const fallbackParams = { ...params, page: Number(params.page) - 1 };
        const fallbackTradesRes = await getTradeReviews(fallbackParams).catch(() => ({ list: [] }));
        setTradesFromResponse(fallbackTradesRes, { current: fallbackParams.page, pageSize: fallbackParams.pageSize });
        lastTradeReviewsParams.value = { ...fallbackParams };
      }
    }

    // 刷新当前持仓对应的历史清仓分组，用于跨周期累计收益计算
    await loadHistoryHoldingGroupsByHoldings();

    saveTrades();
  };

  // 后台刷新调度器：多个连续刷新合并为一次，避免抖动
  let refreshTask = null;
  let refreshPending = false;
  let pendingOverrides = {};

  const runRefreshAfterTradeMutation = (overrides = {}) => {
    if (refreshTask) {
      refreshPending = true;
      pendingOverrides = { ...pendingOverrides, ...overrides };
      return;
    }

    refreshing.value = true;
    refreshTask = refreshAfterTradeMutation(overrides)
      .finally(() => {
        refreshing.value = false;
        refreshTask = null;

        if (refreshPending) {
          refreshPending = false;
          const nextOverrides = pendingOverrides;
          pendingOverrides = {};
          runRefreshAfterTradeMutation(nextOverrides);
        }
      });
  };

  // 将 timestamp id 解析为 MongoDB id，避免为了一次映射触发全量刷新
  const resolveTimestampId = async (timestampId) => {
    if (isMongoObjectId(timestampId)) return timestampId;
    if (!looksLikeTimestampId(timestampId)) return timestampId;

    try {
      const res = await getTradeReviews({ page: 1, pageSize: 100 });
      const list = extractListFromResponse(res);
      const matched = list.map(normalizeTradeRecord).find(t => String(t?.timestamp) === String(timestampId));
      return matched?.id || timestampId;
    } catch (err) {
      console.error('Failed to resolve timestamp id:', err);
      return timestampId;
    }
  };

  const isMongoObjectId = (value) => {
    if (value === null || value === undefined) return false;
    return /^[a-f\d]{24}$/i.test(String(value));
  };

  const looksLikeTimestampId = (value) => {
    if (value === null || value === undefined) return false;
    return /^\d{13}$/.test(String(value));
  };

  // 汇率定义 (示例汇率，实际应用中可接入 API)
  const exchangeRates = {
    CNY: 1,
    HKD: 0.91, // 1 港元 ≈ 0.91 人民币
    USD: 7.23  // 1 美元 ≈ 7.23 人民币
  };

  // 计算板块/市场标签逻辑
  const getMarketTag = (symbol, market) => {
    if (!symbol) return null;
    const upper = String(symbol).toUpperCase();
    if (market === 'HK' || upper.endsWith('.HK')) return { text: 'HK', color: '#fa8c16' }; // 港股 橘黄色
    if (market === 'US' || upper.endsWith('.US')) return { text: 'US', color: '#1890ff' }; // 美股 蓝色

    // 沪深市场逻辑（按后缀判断）
    if (upper.endsWith('.SH')) {
      const code = upper.replace('.SH', '');
      if (code.startsWith('688')) return { text: '科', color: '#f5222d' }; // 科创板
      if (/^5|^51|^56|^58/.test(code)) return { text: '基', color: '#f5222d' }; // 基金
      return { text: 'SH', color: '#f5222d' }; // 沪市主板
    }
    if (upper.endsWith('.SZ')) {
      const code = upper.replace('.SZ', '');
      if (/^300|^301/.test(code)) return { text: '创', color: '#f5222d' }; // 创业板
      if (/^15|^16/.test(code)) return { text: '基', color: '#f5222d' }; // 基金
      return { text: 'SZ', color: '#f5222d' }; // 深市主板/中小板
    }
    if (upper.endsWith('.BJ')) {
      return { text: '北', color: '#f5222d' }; // 北交所
    }

    // 如果 symbol 不带前缀，尝试根据数字规律兜底
    const pureCode = upper.replace(/\.[A-Z]+$/, '');
    if (/^688/.test(pureCode)) return { text: '科', color: '#f5222d' };
    if (/^300|^301/.test(pureCode)) return { text: '创', color: '#f5222d' };
    if (/^6/.test(pureCode)) return { text: 'SH', color: '#f5222d' };
    if (/^0|^3/.test(pureCode)) return { text: 'SZ', color: '#f5222d' };
    if (/^[48]/.test(pureCode)) return { text: '北', color: '#f5222d' };

    return { text: market || 'A', color: '#f5222d' };
  };

  // 加载指定股票的历史清仓分组，优先使用批量接口一次性拉取
  const loadHistoryHoldingGroups = async (symbols) => {
    const uniqueSymbols = Array.from(new Set((symbols || []).map(s => normalizeSymbol(s)).filter(Boolean)));
    if (uniqueSymbols.length === 0) return;

    const applyResults = (results) => {
      const next = { ...historyHoldingGroupsBySymbol.value };
      results.forEach(({ symbol, groups }) => {
        const key = normalizeSymbol(symbol);
        if (key) next[key] = Array.isArray(groups) ? groups : [];
      });
      historyHoldingGroupsBySymbol.value = next;
    };

    try {
      const res = await batchGetHistoryHoldingGroups(uniqueSymbols);
      const list = Array.isArray(res?.list) ? res.list : [];
      applyResults(list);
    } catch (err) {
      // 批量接口失败时回退到单个接口，避免功能完全不可用
      console.error('Failed to load history holding groups via batch API:', err);
      const results = await Promise.all(
        uniqueSymbols.map(async (symbol) => {
          try {
            const res = await getHistoryHoldingGroups(symbol);
            const groups = Array.isArray(res?.list) ? res.list : [];
            return { symbol, groups };
          } catch (e) {
            console.error(`Failed to load history holding groups for ${symbol}:`, e);
            return { symbol, groups: [] };
          }
        })
      );
      applyResults(results);
    }
  };

  // 基于当前持仓列表加载对应的历史清仓分组
  const loadHistoryHoldingGroupsByHoldings = async () => {
    const symbols = (holdingsList.value || []).map(h => h.symbol);
    await loadHistoryHoldingGroups(symbols);
  };
  const reviews = computed(() => {
    if (!trades.value || trades.value.length === 0) return [];
    
    return [...trades.value].sort((a, b) => b.timestamp - a.timestamp).map(t => {
      const marketInfo = getMarketTag(t.symbol, t.market);
      return {
        ...t,
        marketTag: marketInfo?.text,
        marketTagColor: marketInfo?.color
      };
    });
  });

  // Load trades from storage and API
  const loadTrades = async (params = {}) => {
    loading.value = true;
    try {
      transferRecordsRequestFailed.value = false;
      assetsSummary.value = null;

      const normalizedParams = { page: 1, pageSize: 100, include: 'marketOverview', ...params };
      if (normalizedParams.symbol) normalizedParams.symbol = normalizeSymbol(normalizedParams.symbol);
      lastTradeReviewsParams.value = { ...normalizedParams };

      // 1. Fetch from API
      let tradesRequestFailed = false;
      const [assetsRes, holdingsRes, tradesRes, transfersRes] = await Promise.all([
        getAssetsSummary().catch(() => null),
        getHoldings().catch(() => ({ list: [] })),
        getTradeReviews(normalizedParams).catch(() => {
          tradesRequestFailed = true;
          return { list: [] };
        }),
        getTransfers({ page: 1, pageSize: 100 }).catch(() => {
          transferRecordsRequestFailed.value = true;
          return { list: [] };
        })
      ]);

      if (assetsRes) assetsSummary.value = assetsRes;
      if (holdingsRes) holdingsList.value = (holdingsRes.list || []).filter(h => !!h.symbol);
      if (tradesRes) setTradesFromResponse(tradesRes, { current: normalizedParams.page, pageSize: normalizedParams.pageSize });
      if (transfersRes) transferRecords.value = transfersRes.list || [];

      // 2. 仅在 API 请求真实失败时才回退本地缓存
      if (tradesRequestFailed && trades.value.length === 0) {
        const storedTrades = uni.getStorageSync('stock_review_trades');
        if (storedTrades) {
          trades.value = JSON.parse(storedTrades).filter(t => !!t.symbol);
          tradeReviewsPagination.value = {
            current: Number(normalizedParams.page || 1),
            pageSize: Number(normalizedParams.pageSize || 100),
            total: trades.value.length
          };
        }
      }
      if (transferRecordsRequestFailed.value) {
        transferRecords.value = [];
      }

      const storedPrincipal = uni.getStorageSync('stock_review_principal');
      if (storedPrincipal) totalPrincipal.value = Number(storedPrincipal);

      // 加载当前持仓对应的历史清仓分组，用于跨周期累计收益计算
      await loadHistoryHoldingGroupsByHoldings();

    } catch (e) {
      console.error('Failed to load trades from API', e);
    } finally {
      loading.value = false;
    }
  };

  // Save trades to storage
  const saveTrades = () => {
    try {
      uni.setStorageSync('stock_review_trades', JSON.stringify(trades.value));
      uni.setStorageSync('stock_review_transfers', JSON.stringify(transferRecords.value));
      uni.setStorageSync('stock_review_principal', totalPrincipal.value.toString());
    } catch (e) {
      console.error('Failed to save trades', e);
    }
  };

  // Add a transfer record
  const addTransferRecord = async (record) => {
    try {
      // Call API
      await addTransfer({
        ...record,
        date: typeof record.date === 'string' ? record.date : dayjs(record.date).format('YYYY-MM-DD HH:mm:ss')
      });
      
      // Update local state
      transferRecords.value.push({
        id: Date.now().toString(),
        timestamp: Date.now(),
        date: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        ...record
      });
      
      // Force refresh summary to reflect balance changes
      assetsSummary.value = null; 
      
      saveTrades();
    } catch (err) {
      console.error('Failed to add transfer:', err);
      throw err;
    }
  };

  // Add a new trade
  const addTrade = async (trade) => {
    try {
      // Call API
      const res = await apiAddTrade({
        ...trade,
        date: typeof trade.date === 'string' ? trade.date : dayjs(trade.date).format('YYYY-MM-DD HH:mm:ss')
      });

      // 后台刷新，不阻塞调用方
      runRefreshAfterTradeMutation();
      return res;
    } catch (err) {
      console.error('Failed to add trade:', err);
      throw err;
    }
  };

  // Update a trade
  const updateTrade = async (id, updates) => {
    try {
      // 将 timestamp id 解析为 MongoDB id，避免触发全量刷新
      const targetId = await resolveTimestampId(id);

      const res = await apiUpdateTrade(targetId, updates);
      // 后台刷新，不阻塞调用方
      runRefreshAfterTradeMutation();
      return res;
    } catch (err) {
      console.error('Failed to update trade:', err);
      throw err;
    }
  };

  // Delete a holding (removes all trades related to this symbol)
  const deleteHolding = async (symbol) => {
    // If symbol is null or empty, we might be trying to clean up "orphan" records
    const targetSymbol = symbol ? normalizeSymbol(symbol) : '';

    try {
      // 1. 同步删除后端数据 (仅当 symbol 有值时)
      if (targetSymbol) {
        const res = await deleteTradeBySymbol(targetSymbol);

        // 后台刷新，不阻塞调用方
        runRefreshAfterTradeMutation({ symbol: lastTradeReviewsParams.value?.symbol });
        return res;
      }

      // 2. 如果没有传 symbol，清理掉所有 symbol 为空的异常记录
      trades.value = trades.value.filter(t => !!t.symbol);

      // 3. 强制重置资产概览状态
      assetsSummary.value = null;

      // 4. 保存本地备份
      saveTrades();

      // 5. 如果数据全空，清理本地缓存
      if (trades.value.length === 0 && transferRecords.value.length === 0) {
        uni.removeStorageSync('stock_review_trades');
        uni.removeStorageSync('stock_review_transfers');
        uni.removeStorageSync('stock_review_assets_summary');
      }

      return null;
    } catch (err) {
      console.error('Failed to delete holding:', err);
      throw err;
    }
  };

  // 计算指定股票跨清仓周期的累计已实现收益
  const calculateHistoricalRealizedProfit = (symbol) => {
    const normalized = normalizeSymbol(symbol);
    const groups = historyHoldingGroupsBySymbol.value[normalized] || [];
    return groups.reduce((sum, g) => sum + Number(g.realizedProfit || 0), 0);
  };

  // Get Holdings (Calculated from trades or from API)
  const holdings = computed(() => {
    // If we have API data, use it
    if (holdingsList.value && holdingsList.value.length > 0) {
      return holdingsList.value.map(h => {
        const normalizedSymbol = normalizeSymbol(h.symbol);
        const marketInfo = getMarketTag(h.symbol, h.marketTag || h.market);
        const rate = exchangeRates[h.currency || 'CNY'] || 1;

        const hasMarketValue = h.marketValue !== null && h.marketValue !== undefined;
        const hasCurrentPrice = h.currentPrice !== null && h.currentPrice !== undefined;
        const marketValue = hasMarketValue
          ? Number(h.marketValue)
          : (hasCurrentPrice ? Number(h.currentPrice) * Number(h.quantity || 0) : null);

        const marketValueCNY = h.marketValueCNY !== undefined && h.marketValueCNY !== null
          ? Number(h.marketValueCNY)
          : (marketValue !== null ? marketValue * rate : null);

        const totalCost = (h.avgCost !== null && h.avgCost !== undefined && h.quantity !== null && h.quantity !== undefined)
          ? Number(h.avgCost) * Number(h.quantity)
          : null;

        const lastTradeDateTimestamp = h.lastTradeDate
          ? dayjs(h.lastTradeDate).valueOf()
          : (trades.value || [])
              .filter(t => normalizeSymbol(t.symbol) === normalizedSymbol)
              .reduce((max, t) => {
                const ts = t.timestamp || (t.date ? dayjs(t.date).valueOf() : 0);
                return ts > max ? ts : max;
              }, 0) || null;

        const unrealizedProfit = h.unrealizedProfit !== null && h.unrealizedProfit !== undefined
          ? Number(h.unrealizedProfit)
          : (
              marketValue !== null && totalCost !== null
                ? marketValue - totalCost
                : null
            );

        // 跨清仓周期累计收益 = 历史各清仓周期已实现收益 + 当前持仓盈亏
        const historicalRealizedProfit = calculateHistoricalRealizedProfit(normalizedSymbol);
        const cumulativeProfit = (unrealizedProfit !== null ? unrealizedProfit : 0) + historicalRealizedProfit;

        // Handle profitRate format (API might return 5 for 5%, we want 0.05)
        let profitRate = h.profitRate !== null && h.profitRate !== undefined ? Number(h.profitRate) : null;
        if (profitRate !== null && (profitRate > 1 || profitRate < -1)) {
          profitRate = profitRate / 100;
        }

        // 当累计收益按跨周期重新计算后，盈亏率也按同一口径重新计算以保证一致
        if (totalCost !== null && totalCost > 0) {
          profitRate = cumulativeProfit / totalCost;
        }

        // Calculate dailyProfitRate if missing
        let dailyProfitRate = h.dailyProfitRate;
        if (dailyProfitRate !== null && dailyProfitRate !== undefined) {
          dailyProfitRate = Number(dailyProfitRate);
          if (dailyProfitRate > 1 || dailyProfitRate < -1) dailyProfitRate = dailyProfitRate / 100;
        } else if (dailyProfitRate === undefined && h.dailyProfit !== null && h.dailyProfit !== undefined && marketValue !== null) {
          // approx: dailyProfit / (prevMarketValue)
          const prevValue = marketValue - Number(h.dailyProfit);
          dailyProfitRate = prevValue !== 0 ? Number(h.dailyProfit) / prevValue : 0;
        }

        return {
          ...h,
          name: h.name || h.symbol,
          stockName: h.name || h.symbol,
          marketValue,
          marketValueCNY,
          unrealizedProfit,
          profitRate: profitRate !== null ? profitRate : null,
          dailyProfitRate,
          realizedProfit: h.realizedProfit !== null && h.realizedProfit !== undefined ? Number(h.realizedProfit) : null,
          cumulativeProfit,
          positionRatio: h.positionRatio,
          positionPercent: h.positionPercent,
          marketTag: marketInfo?.text,
          marketTagColor: marketInfo?.color,
          lastTradeDate: lastTradeDateTimestamp || null
        };
      });
    }

    const map = {};

    trades.value.forEach(trade => {
      if (!trade.symbol) return;

      if (!map[trade.symbol]) {
        map[trade.symbol] = {
          symbol: trade.symbol,
          name: trade.stockName || trade.name || trade.symbol,
          quantity: 0,
          totalCost: 0,
          currentPrice: trade.price, // Default to last trade price if no update
          market: trade.market
        };
      }

      const item = map[trade.symbol];
      const qty = Number(trade.quantity);
      const price = Number(trade.price);
      const fee = Number(trade.commission || 0);

      if (item.cumulativeProfit == null) item.cumulativeProfit = 0;

      if (trade.type === 'BUY') {
        const cost = (qty * price) + fee;
        item.quantity += qty;
        item.totalCost += cost;
      } else if (trade.type === 'SELL') {
        const revenue = (qty * price) - fee;
        // 计算本次卖出的对应成本（移动平均法）
        const costPerShare = item.totalCost / item.quantity;
        const soldCost = qty * costPerShare;

        // 卖出实现的盈亏累加到累计盈亏
        item.cumulativeProfit += (revenue - soldCost);

        item.quantity -= qty;
        item.totalCost -= soldCost;

        if (item.quantity <= 0) {
          item.totalCost = 0;
        }
      }

      // Update last known price
      item.currentPrice = price;
    });

    return Object.values(map).filter(h => h.quantity > 0).map(h => {
      const normalizedSymbol = normalizeSymbol(h.symbol);
      const unrealizedProfit = (h.quantity * h.currentPrice) - h.totalCost;
      // 跨清仓周期累计收益：优先使用历史分组计算，无分组时回退到 trades 累计
      const historicalGroups = historyHoldingGroupsBySymbol.value[normalizedSymbol] || [];
      const historicalRealizedProfit = historicalGroups.reduce((sum, g) => sum + Number(g.realizedProfit || 0), 0);
      const cumulativeProfit = historicalGroups.length > 0
        ? historicalRealizedProfit + unrealizedProfit
        : (h.cumulativeProfit || 0) + unrealizedProfit;

      let dailyProfit = h.dailyProfit || 0;
      let dailyProfitRate = h.dailyProfitRate || 0;

      // 计算板块/市场标签逻辑
      const marketInfo = getMarketTag(h.symbol, h.market);

      return {
        ...h,
        avgCost: h.quantity > 0 ? h.totalCost / h.quantity : 0,
        marketValue: h.quantity * h.currentPrice,
        unrealizedProfit,
        cumulativeProfit,
        profitRate: h.totalCost > 0 ? cumulativeProfit / h.totalCost : 0,
        dailyProfit,
        dailyProfitRate,
        marketTag: marketInfo?.text,
        marketTagColor: marketInfo?.color
      };
    });
  });

  // Delete a single trade record
  const deleteTrade = async (id) => {
    if (!id) return;
    try {
      // 将 timestamp id 解析为 MongoDB id，避免触发全量刷新
      const targetId = await resolveTimestampId(id);

      await deleteTradeById(targetId);

      // 后台刷新，不阻塞调用方
      runRefreshAfterTradeMutation();
    } catch (err) {
      console.error('Failed to delete trade:', err);
      throw err;
    }
  };

  // Total Assets
  const totalAssets = computed(() => {
    if (assetsSummary.value) return assetsSummary.value.totalAssets;
    return currentPrincipal.value + totalProfit.value;
  });

  // Current Principal (Original + Transfers)
  const currentPrincipal = computed(() => {
    if (assetsSummary.value) return assetsSummary.value.currentPrincipal;
    const transferTotalCNY = transferRecords.value.reduce((sum, record) => {
      const rate = exchangeRates[record.currency || 'CNY'] || 1;
      const amountCNY = record.amount * rate;
      return sum + (record.type === 'IN' ? amountCNY : -amountCNY);
    }, 0);
    return totalPrincipal.value + transferTotalCNY;
  });
  
  // Total Profit
  const totalProfit = computed(() => {
      if (assetsSummary.value) return assetsSummary.value.totalProfit;
      return holdings.value.reduce((sum, h) => sum + (h.cumulativeProfit || 0), 0);
  });

  // Holdings Market Value
  const holdingsMarketValue = computed(() => {
    if (assetsSummary.value) return assetsSummary.value.holdingsMarketValue;
    return holdings.value.reduce((sum, h) => sum + (h.marketValueCNY ?? h.marketValue ?? 0), 0);
  });

  // Cash
  const cash = computed(() => {
    if (assetsSummary.value) return assetsSummary.value.cash;
    return totalAssets.value - holdingsMarketValue.value;
  });

  // Total Daily Profit
  const totalDailyProfit = computed(() => {
    if (assetsSummary.value) return assetsSummary.value.totalDailyProfit;
    return holdings.value.reduce((sum, h) => sum + (h.dailyProfit || 0), 0);
  });

  // Total Holdings Count
  const totalHoldingsCount = computed(() => {
    if (assetsSummary.value) return assetsSummary.value.totalHoldingsCount;
    return holdings.value.length;
  });

  // Get History Holdings (Cleared positions)
  const historyHoldings = computed(() => {
    const map = {};
    
    // Calculate from trades
    trades.value.forEach(trade => {
      if (!trade.symbol) return;
      
      if (!map[trade.symbol]) {
        map[trade.symbol] = {
          symbol: trade.symbol,
          name: trade.stockName || trade.name || trade.symbol,
          quantity: 0,
          totalCost: 0,
          cumulativeProfit: 0,
          totalInvestment: 0, // Used for profit rate calculation
          trades: []
        };
      }
      
      const item = map[trade.symbol];
      item.trades.push(trade);
      
      const qty = Number(trade.quantity);
      const price = Number(trade.price);
      const fee = Number(trade.commission || 0);
      
      if (trade.type === 'BUY') {
        const cost = (qty * price) + fee;
        item.quantity += qty;
        item.totalCost += cost;
        item.totalInvestment += cost;
      } else if (trade.type === 'SELL') {
        const revenue = (qty * price) - fee;
        const costPerShare = item.quantity > 0 ? item.totalCost / item.quantity : 0;
        const soldCost = qty * costPerShare;
        
        item.cumulativeProfit += (revenue - soldCost);
        item.quantity -= qty;
        item.totalCost -= soldCost;
        
        if (item.quantity <= 0) {
          item.totalCost = 0;
        }
      }
    });

    return Object.values(map)
      .filter(h => h.quantity <= 0)
      .map(h => ({
        ...h,
        profitRate: h.totalInvestment > 0 ? h.cumulativeProfit / h.totalInvestment : 0,
        trades: h.trades.sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())
      }))
      .sort((a, b) => b.cumulativeProfit - a.cumulativeProfit);
  });

  // Fetch Market Overview
  const fetchMarketOverview = async ({ date } = {}) => {
    try {
      const params = date ? { date } : {};
      const res = await getMarketOverview({ silent: true, params });
      if (res && Array.isArray(res.list)) {
        marketOverview.value = res.list;
      } else if (res && Array.isArray(res.data)) {
        marketOverview.value = res.data;
      } else if (res?.data && Array.isArray(res.data.list)) {
        marketOverview.value = res.data.list;
      }
    } catch (e) {
      marketOverview.value = [];
    }
  };

  // Fetch Real-Time Quote for a single stock
  const fetchRealTimeQuote = async (symbol) => {
    try {
      const res = await getRealTimeQuote(symbol);
      return res;
    } catch (e) {
      console.error(`Failed to fetch quote for ${symbol}`, e);
      return null;
    }
  };

  // Fetch commission preference by market
  const fetchCommissionPreference = async () => {
    try {
      const res = await getCommissionPreference();
      if (res) {
        commissionPreference.value = {
          CN: res.CN || commissionPreference.value.CN,
          HK: res.HK || commissionPreference.value.HK,
          US: res.US || commissionPreference.value.US
        };
      }
      return commissionPreference.value;
    } catch (e) {
      console.error('Failed to fetch commission preference:', e);
      return commissionPreference.value;
    }
  };

  // Save commission preference for a market
  const saveCommissionPreference = async (market, payload) => {
    try {
      const res = await updateCommissionPreference({ market, ...payload });
      if (res) {
        commissionPreference.value[market] = {
          mode: res.mode || payload.mode,
          rate: res.rate ?? payload.rate ?? 5,
          amount: res.amount ?? payload.amount ?? 0,
          updatedAt: res.updatedAt || new Date().toISOString()
        };
      }
      return res;
    } catch (e) {
      console.error('Failed to save commission preference:', e);
      throw e;
    }
  };

  let pollingInterval = null;

  const startPolling = () => {
    if (pollingInterval) return;
    
    // Poll every 180 seconds to align with backend market overview cache TTL (3 min)
    pollingInterval = setInterval(() => {
      loadTrades(lastTradeReviewsParams.value);
      fetchMarketOverview();
    }, 180000);
  };

  const stopPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  };

  return {
    trades,
    reviews,
    totalPrincipal,
    currentPrincipal,
    transferRecords,
    transferRecordsRequestFailed,
    tradeReviewsPagination,
    loadTrades,
    saveTrades,
    addTrade,
    updateTrade,
    deleteTrade,
    deleteHolding,
    addTransferRecord,
    holdings,
    historyHoldings,
    hasAssetsSummary,
    totalAssets,
    totalProfit,
    totalDailyProfit,
    cash,
    holdingsMarketValue,
    totalHoldingsCount,
    loading,
    refreshing,
    marketOverview,
    commissionPreference,
    fetchCommissionPreference,
    saveCommissionPreference,
    fetchMarketOverview,
    fetchRealTimeQuote,
    startPolling,
    stopPolling
  };
});

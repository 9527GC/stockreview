const { matchesStock } = require('@stock-review/stock-search');
const { compareTradeSettlement } = require('../utils/tradeSettlementOrder');
const mongoose = require('mongoose');
const { Trade, Holding } = require('../models/Trade');
const CompanyAction = require('../models/CompanyAction');
const { CorporateAction } = require('../models/CorporateAction');
const { getCurrencyForMarket } = require('../utils/marketCurrency');
const { portfolioEvents } = require('../utils/portfolioEvents');
const { applyCorporateActions } = require('../utils/corporateActions');
const { Asset } = require('../models/Asset');
const User = require('../models/User');
const Transfer = require('../models/Transfer');
const { getRates } = require('../utils/currency');
const { getQuotes, buildTradeMarketSnapshot, normalizeMarketOverviewSnapshot, inferSnapshotStatus } = require('../utils/marketData');
const { getDayRangeInOffset, parseDateInOffset } = require('../utils/datetime');
const { calculateCashAndPrincipalCNY } = require('../utils/ledger');
const { round2, calculateDailyProfitFromPosition } = require('../utils/pnl');
const { normalizeSymbol, buildSymbolAliases } = require('../utils/symbol');
const { calculateDilutedPerformance, calculateDilutedProfits, calculatePositionZeroGroups } = require('../utils/cost');
const { compareByDateAndId, getImpactingActions, addActionsToHoldingGroups } = require('../utils/companyActions');
const { upsertTodayDailyProfit } = require('../utils/dailyProfitBackfill');
const { sanitizeHtml } = require('../utils/sanitizeHtml');
const { getDateStringInOffset, getQuoteDateKeyInOffset } = require('../utils/dailyProfit');
const messages = require('../utils/errorMessages');
const dirtyDataManager = require('../services/dirtyDataManager');

/**
 * 触发脏数据后台重算。
 * 生产环境立即返回响应，由后台异步执行；测试环境等待重算完成，确保测试断言可靠。
 */
const scheduleRecalc = async (userId, tradeDateStr) => {
  await dirtyDataManager.markDirtyFromDate(userId, tradeDateStr);
  const recalcPromise = dirtyDataManager.asyncRecalculate(userId);
  if (process.env.NODE_ENV === 'test') {
    await recalcPromise;
  } else {
    recalcPromise.catch(err => {
      console.error('[Trade] Error starting async recalculation:', err);
    });
  }
};

const marketFromTrade = (trade) => {
  const ex = String(trade?.market || '').toUpperCase();
  const sym = String(trade?.symbol || '').toUpperCase();
  if (ex === 'SH' || ex === 'SZ' || sym.endsWith('.SH') || sym.endsWith('.SZ')) return 'CN';
  if (ex === 'HK' || sym.endsWith('.HK')) return 'HK';
  if (ex === 'US' || sym.endsWith('.US')) return 'US';
  return ex || null;
};

const inferExchangeFromSymbol = (symbol) => {
  const sym = String(symbol || '').toUpperCase();
  if (sym.endsWith('.SH')) return 'SH';
  if (sym.endsWith('.SZ')) return 'SZ';
  if (sym.endsWith('.HK')) return 'HK';
  if (sym.endsWith('.US')) return 'US';
  return 'SH';
};

const inferCurrencyFromSymbol = (symbol, market, currency) => {
  const expected = getCurrencyForMarket({ symbol, market });
  if (currency && currency !== expected) throw new RangeError('Trade currency conflicts with symbol currency ' + expected);
  return expected;
};

/**
 * 根据 feeMode 计算最终手续费
 * @param {Object} params
 * @param {number} params.price 成交价
 * @param {number} params.quantity 数量
 * @param {string|null} params.feeMode 'rate' | 'amount' | null
 * @param {number} params.feeRate 费率，单位：‱
 * @param {number} params.feeAmount 固定费用金额
 * @param {number} params.commission 回退使用的手续费金额
 */
const calculateCommission = ({ price, quantity, feeMode, feeRate, feeAmount, commission }) => {
  const mode = ['rate', 'amount'].includes(feeMode) ? feeMode : null;
  const rate = Number(feeRate) || 0;
  const amount = Number(feeAmount) || 0;
  const tradeAmount = Number(price) * Number(quantity);

  if (mode === 'rate') {
    return tradeAmount * rate / 10000;
  } else if (mode === 'amount') {
    return amount;
  }
  return Number(commission) || 0;
};

/**
 * 校验编辑某条交易的数量后，全账本是否会出现超卖
 * @returns {Promise<{valid: boolean, message?: string}>}
 */
const validateTradeEditQuantity = async ({ userId, editedTradeId, updates }) => {
  const [trades, actions] = await Promise.all([
    Trade.find({ userId }).lean(), CorporateAction.find({ userId, date: { $lte: new Date() } }).lean()
  ]);
  const candidate = trades.filter(t => !updates.remove || String(t._id) !== String(editedTradeId))
    .map(t => String(t._id) === String(editedTradeId) ? { ...t, ...updates } : t);
  if (updates.append) candidate.push(updates.append);
  try {
    calculateDilutedPerformance({ trades: candidate, actions, strict: true });
    return { valid: true };
  } catch (error) { return { valid: false, message: error.message }; }
};

const rebuildAssetFromLedger = async (userId) => {
  const [rates, transfers, tradesAsc, existingHoldings, actions] = await Promise.all([
    getRates(),
    Transfer.find({ userId }),
    Trade.find({ userId }).sort({ date: 1, settlementOrder: 1, _id: 1 }),
    Holding.find({ userId }),
    CorporateAction.find({ userId, date: { $lte: new Date() } }).lean()
  ]);

  const { cashCNY, principalCNY } = calculateCashAndPrincipalCNY({ transfers, trades: tradesAsc, rates, actions });

  const existingBySymbol = new Map(existingHoldings.map(h => [normalizeSymbol(h.symbol), h]));
  const performanceBySymbol = calculateDilutedPerformance({ trades: tradesAsc, rates, actions });

  const targetBySymbol = new Map();
  performanceBySymbol.forEach((perf) => {
    if (perf.quantity <= 0) return;
    const old = existingBySymbol.get(perf.symbol);
    targetBySymbol.set(perf.symbol, {
      userId,
      symbol: perf.symbol,
      name: perf.name || old?.name || perf.symbol,
      quantity: perf.quantity,
      avgCost: round2(perf.avgCost),
      lastPrice: old?.lastPrice ?? null,
      lastPriceAt: old?.lastPriceAt ?? null,
      currency: perf.currency || old?.currency || 'CNY',
      marketTag: old?.marketTag || null
    });
  });

  // 增量更新：存在的 update，新增的 insert，清仓的 delete
  const bulkOps = [];
  existingBySymbol.forEach((old, symbol) => {
    if (!targetBySymbol.has(symbol)) {
      bulkOps.push({ deleteOne: { filter: { _id: old._id } } });
    }
  });
  targetBySymbol.forEach((target, symbol) => {
    const old = existingBySymbol.get(symbol);
    if (old) {
      const changed =
        old.quantity !== target.quantity ||
        old.avgCost !== target.avgCost ||
        old.currency !== target.currency ||
        old.name !== target.name ||
        old.marketTag !== target.marketTag;
      if (changed) {
        bulkOps.push({
          updateOne: {
            filter: { _id: old._id },
            update: {
              $set: {
                quantity: target.quantity,
                avgCost: target.avgCost,
                currency: target.currency,
                name: target.name,
                marketTag: target.marketTag
              }
            }
          }
        });
      }
    } else {
      bulkOps.push({ insertOne: { document: target } });
    }
  });

  if (bulkOps.length > 0) {
    await Holding.bulkWrite(bulkOps, { ordered: false });
  }

  const holdings = await Holding.find({ userId });

  const symbols = holdings.map(h => h.symbol);
  const quotes = await getQuotes(symbols);

  const priceUpdates = [];
  let holdingsMarketValue = 0;
  holdings.forEach(h => {
    let currentPrice = null;
    const quote = quotes[h.symbol] || Object.values(quotes).find(q => q.symbol === h.symbol);

    const closePrice = quote?.preClose && quote.preClose > 0 ? quote.preClose : null;
    if (closePrice !== null && h.lastPrice !== closePrice) {
      priceUpdates.push({
        updateOne: {
          filter: { _id: h._id },
          update: { $set: { lastPrice: closePrice, lastPriceAt: new Date() } }
        }
      });
    }

    if (quote && quote.price > 0) {
      currentPrice = quote.price;
    } else if (h.lastPrice && h.lastPrice > 0) {
      currentPrice = h.lastPrice;
    }

    const marketValue = currentPrice !== null ? h.quantity * currentPrice : 0;
    const rate = rates[h.currency] || 1;
    holdingsMarketValue += marketValue * rate;
  });

  if (priceUpdates.length > 0) {
    await Holding.bulkWrite(priceUpdates, { ordered: false });
  }

  let asset = await Asset.findOne({ userId });
  if (!asset) asset = new Asset({ userId });

  asset.cash = cashCNY;
  asset.currentPrincipal = principalCNY;
  asset.holdingsMarketValue = round2(holdingsMarketValue);
  asset.totalAssets = round2(asset.cash + asset.holdingsMarketValue);
  asset.totalHoldingsCount = holdings.length;
  await asset.save();
};

const buildTradePerformanceBySymbol = ({ trades, rates, actions = [] }) => {
  return calculateDilutedPerformance({ trades, rates, actions });
};

const getTradeSnapshotView = (trade) => {
  const snapshot = normalizeMarketOverviewSnapshot(trade?.marketOverviewSnapshot || trade?.marketOverview);
  const snapshotStatus = trade?.snapshotStatus || inferSnapshotStatus(snapshot);
  const snapshotSource = snapshot?.snapshotSource || trade?.snapshotSource || null;
  const snapshotTime = snapshot?.snapshotTime || (trade?.snapshotTime instanceof Date ? trade.snapshotTime.toISOString() : trade?.snapshotTime || null);
  const normalizedSnapshot = snapshot
    ? { ...snapshot, snapshotSource, snapshotTime }
    : null;

  return {
    marketOverview: normalizedSnapshot,
    marketOverviewSnapshot: normalizedSnapshot,
    snapshotStatus: normalizedSnapshot ? inferSnapshotStatus(normalizedSnapshot) : 'missing',
    snapshotSource,
    snapshotTime
  };
};

exports.getHoldings = async (req, res) => {
  try {
    const userId = req.user._id;
    const [holdings, asset, RATES, tradesAsc, actions] = await Promise.all([
      Holding.find({ userId }),
      Asset.findOne({ userId }),
      getRates(),
      Trade.find({ userId }).sort({ date: 1, settlementOrder: 1, _id: 1 }),
      CorporateAction.find({ userId, date: { $lte: new Date() } }).lean()
    ]);
    const cashCNY = asset?.cash || 0;
    const performanceBySymbol = buildTradePerformanceBySymbol({ trades: tradesAsc, rates: RATES, actions });

    // 计算每只股票最近一次交易时间，用于前端默认排序
    const lastTradeDateBySymbol = new Map();
    (tradesAsc || []).forEach(t => {
      lastTradeDateBySymbol.set(normalizeSymbol(t.symbol), t.date);
    });

    // 获取实时行情
    const symbols = holdings.map(h => h.symbol);
    const quotes = await getQuotes(symbols);

    // 预建行情 Map：支持原始 symbol、normalized symbol 及所有别名
    const quoteMap = new Map();
    Object.entries(quotes).forEach(([key, quote]) => {
      quoteMap.set(key, quote);
      const normalized = normalizeSymbol(key);
      if (normalized !== key) quoteMap.set(normalized, quote);
      buildSymbolAliases(key).forEach(alias => {
        if (!quoteMap.has(alias)) quoteMap.set(alias, quote);
      });
    });

    const { start: today, end: tomorrow } = getDayRangeInOffset(480);
    const todayDateKey = getDateStringInOffset(480);

    const tradeSymbols = new Set();
    holdings.forEach(h => buildSymbolAliases(h.symbol).forEach(a => tradeSymbols.add(a)));

    const todayTrades = tradesAsc.filter(t => t.date >= today && t.date < tomorrow && tradeSymbols.has(t.symbol));

    // 预建今日交易 Map：key 为 normalized symbol 及别名
    const todayTradesBySymbol = new Map();
    todayTrades.forEach(t => {
      const keys = new Set([t.symbol, normalizeSymbol(t.symbol), ...buildSymbolAliases(t.symbol)]);
      keys.forEach(k => {
        if (!todayTradesBySymbol.has(k)) todayTradesBySymbol.set(k, []);
        todayTradesBySymbol.get(k).push(t);
      });
    });

    const priceUpdates = [];

    const items = holdings.map(h => {
      let currentPrice;
      let profitRate;
      let profitAmount = null;
      let dailyProfit = null;

      const quote = quoteMap.get(h.symbol);
      const closePrice = quote?.preClose && quote.preClose > 0 ? quote.preClose : null;
      if (closePrice !== null && h.lastPrice !== closePrice) {
        priceUpdates.push({
          updateOne: {
            filter: { _id: h._id },
            update: { $set: { lastPrice: closePrice, lastPriceAt: new Date() } }
          }
        });
      }

      if (quote && quote.price > 0) {
        currentPrice = quote.price;

        const tradesForSymbol = todayTradesBySymbol.get(h.symbol) || [];
        const quoteDateKey = getQuoteDateKeyInOffset(quote, h.symbol, 480);

        if (tradesForSymbol.length > 0 || quoteDateKey === todayDateKey) {
          dailyProfit = calculateDailyProfitFromPosition({
            posToday: h.quantity,
            quote,
            todayTrades: tradesForSymbol
          });
        }
      } else {
        currentPrice = closePrice !== null ? closePrice : (h.lastPrice && h.lastPrice > 0 ? h.lastPrice : null);
      }

      if (currentPrice !== null && h.avgCost > 0) {
        profitAmount = (currentPrice - h.avgCost) * h.quantity;
      }

      const marketValue = currentPrice !== null ? h.quantity * currentPrice : null;
      const rate = RATES[h.currency] || 1;
      const marketValueCNY = marketValue !== null ? marketValue * rate : null;
      const perf = performanceBySymbol.get(normalizeSymbol(h.symbol));
      const {
        unrealizedProfit,
        cumulativeProfit,
        realizedProfit
      } = calculateDilutedProfits({
        currentPrice,
        quantity: h.quantity,
        avgCost: h.avgCost,
        rate
      });
      const totalInvestmentCNY = (perf?.totalBuyCost || 0) * rate;
      profitRate = cumulativeProfit !== null
        ? parseFloat((totalInvestmentCNY > 0 ? (cumulativeProfit / totalInvestmentCNY) : 0).toFixed(4))
        : null;

      return {
        symbol: h.symbol,
        name: h.name,
        quantity: h.quantity,
        avgCost: h.avgCost,
        currentPrice,
        marketValue,
        marketValueCNY,
        currency: h.currency,
        profitRate,
        profitAmount,
        unrealizedProfit,
        realizedProfit,
        cumulativeProfit,
        dailyProfit,
        marketTag: h.marketTag,
        lastTradeDate: lastTradeDateBySymbol.get(normalizeSymbol(h.symbol)) || null
      };
    });

    if (priceUpdates.length > 0) {
      await Holding.bulkWrite(priceUpdates, { ordered: false });
    }

    const holdingsMarketValueCNY = items.reduce((sum, it) => sum + (it.marketValueCNY || 0), 0);
    const totalAssetsCNY = cashCNY + holdingsMarketValueCNY;

    const list = items.map(it => {
      let positionRatio = 0;
      let positionPercent = 0;

      if (it.marketValueCNY !== null && totalAssetsCNY > 0) {
        positionRatio = it.marketValueCNY / totalAssetsCNY;
        positionPercent = parseFloat((positionRatio * 100).toFixed(2));
      }

      return {
        ...it,
        positionRatio: parseFloat(positionRatio.toFixed(6)),
        positionPercent
      };
    });

    res.json({ list });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * 获取当前持仓批次的交易记录（从最近一次持仓归零之后到当前的交易）。
 * 若当前无持仓，返回空数组。
 */
exports.getCurrentHoldingTrades = async (req, res) => {
  try {
    const { symbol } = req.params;
    const userId = req.user._id;

    if (!symbol) {
      return res.status(400).json({ message: 'Symbol is required' });
    }

    const normalizedSymbol = normalizeSymbol(symbol);
    const aliases = buildSymbolAliases(normalizedSymbol);
    const symbolSet = Array.from(new Set([normalizedSymbol, ...aliases]));

    console.log('[getCurrentHoldingTrades]', {
      symbol,
      normalizedSymbol,
      symbolSet,
      userId: String(userId)
    });

    const [trades, companyActions, corporateActions] = await Promise.all([
      Trade.find({ userId, symbol: { $in: symbolSet } }).sort({ date: 1, settlementOrder: 1, _id: 1 }).lean(),
      CompanyAction.find({ userId, symbol: { $in: symbolSet } }).sort({ date: 1, settlementOrder: 1, _id: 1 }).lean(),
      CorporateAction.find({ userId, symbol: { $in: symbolSet }, date: { $lte: new Date() } }).lean()
    ]);

    console.log('[getCurrentHoldingTrades] matched trades count:', trades.length);

    let runningQty = 0;
    let currentBatchStartIndex = -1;

    const sortedTrades = [...trades].sort(compareTradeSettlement);

    for (const { record: t, kind } of portfolioEvents(sortedTrades, corporateActions)) {
      if (kind === 'action') {
        const holding = { quantity: runningQty, avgCost: 0 };
        applyCorporateActions(new Map([[normalizedSymbol, holding]]), [t]);
        runningQty = holding.quantity;
        continue;
      }
      const i = sortedTrades.indexOf(t);
      runningQty += (Number(t.quantity) || 0) * (t.type === 'BUY' ? 1 : -1);
      runningQty = Math.max(0, runningQty);
      if (runningQty === 0) currentBatchStartIndex = -1;
      else if (currentBatchStartIndex === -1) currentBatchStartIndex = i;
    }

    const currentBatchTrades = currentBatchStartIndex === -1 ? [] : sortedTrades.slice(currentBatchStartIndex);
    const batchStartDate = currentBatchTrades[0]?.date ? new Date(currentBatchTrades[0].date) : null;
    const visibleActions = getImpactingActions({ trades, actions: companyActions })
      .filter(action => !batchStartDate || new Date(action.date) >= batchStartDate);

    console.log('[getCurrentHoldingTrades] current batch count:', currentBatchTrades.length, 'actions:', visibleActions.length, 'runningQty:', runningQty);

    const tradeList = currentBatchTrades.map(t => {
      const snapshotView = getTradeSnapshotView(t);
      return {
        id: t._id,
        symbol: t.symbol,
        name: t.name,
        stockName: t.name,
        date: t.date,
        type: t.type,
        price: t.price,
        quantity: t.quantity,
        commission: t.commission,
        currency: t.currency,
        market: marketFromTrade(t),
        exchange: t.market,
        mood: t.mood,
        logic: t.logic ?? null,
        isSystemCompliant: t.isSystemCompliant ?? null,
        cognitiveBias: t.cognitiveBias ?? null,
        improvementMeasures: t.improvementMeasures ?? null,
        marketOverview: snapshotView.marketOverview,
        marketOverviewSnapshot: snapshotView.marketOverviewSnapshot,
        snapshotStatus: snapshotView.snapshotStatus,
        snapshotSource: snapshotView.snapshotSource,
        snapshotTime: snapshotView.snapshotTime,
        news: t.news ?? null
      };
    });

    const actionList = visibleActions;

    const list = [...tradeList, ...actionList].sort((a, b) => compareByDateAndId(b, a));

    res.json({ list, total: list.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getReviews = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const { symbol, sort, date, startDate, endDate, include, type, reviewStatus } = req.query;
    const query = { userId: req.user._id };
    if (symbol) {
      const candidates = await Trade.find({ userId: req.user._id }).select('symbol name').lean();
      query.symbol = { $in: [...new Set(candidates.filter(item => matchesStock(item, symbol)).map(item => item.symbol))] };
    }
    if (type) query.type = String(type).trim().toUpperCase();

    const normalizedReviewStatus = String(reviewStatus || '').trim().toLowerCase();
    if (normalizedReviewStatus === 'reviewed') {
      query.$or = [
        { isSystemCompliant: { $nin: [null, ''] } },
        { cognitiveBias: { $nin: [null, ''] } },
        { improvementMeasures: { $nin: [null, ''] } }
      ];
    } else if (normalizedReviewStatus === 'pending') {
      query.$and = [
        { isSystemCompliant: { $in: [null, ''] } },
        { cognitiveBias: { $in: [null, ''] } },
        { improvementMeasures: { $in: [null, ''] } }
      ];
    }

    if (date) {
      const d = String(date).slice(0, 10);
      const start = parseDateInOffset(`${d} 00:00:00`, 480);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      query.date = { $gte: start, $lt: end };
    } else if (startDate || endDate) {
      const dateRange = {};
      if (startDate) {
        const s = String(startDate).slice(0, 10);
        dateRange.$gte = parseDateInOffset(`${s} 00:00:00`, 480);
      }
      if (endDate) {
        const e = String(endDate).slice(0, 10);
        dateRange.$lte = parseDateInOffset(`${e} 23:59:59`, 480);
      }
      query.date = dateRange;
    }

    const sortOpt = String(sort || 'date_desc');
    const sortSpec = sortOpt === 'date_asc'
      ? { date: 1, _id: 1 }
      : { date: -1, _id: -1 };

    const includeRaw = include === undefined ? '' : String(include);
    const includeSet = new Set(
      includeRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    );

    const trades = await Trade.find(query)
      .sort(sortSpec)
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize));

    const total = await Trade.countDocuments(query);

    res.json({
      list: trades.map(t => {
        const snapshotView = getTradeSnapshotView(t);
        return {
          id: t._id,
          symbol: t.symbol,
          name: t.name,
          stockName: t.name,
          date: t.date,
          type: t.type,
          price: t.price,
          quantity: t.quantity,
          commission: t.commission,
          currency: t.currency,
          market: marketFromTrade(t),
          exchange: t.market,
          mood: t.mood,
          logic: t.logic ?? null,
          isSystemCompliant: t.isSystemCompliant ?? null,
          cognitiveBias: t.cognitiveBias ?? null,
          improvementMeasures: t.improvementMeasures ?? null,
          marketOverview: includeSet.has('marketOverview') ? snapshotView.marketOverview : undefined,
          marketOverviewSnapshot: includeSet.has('marketOverview') ? snapshotView.marketOverviewSnapshot : undefined,
          snapshotStatus: includeSet.has('marketOverview') ? snapshotView.snapshotStatus : undefined,
          snapshotSource: includeSet.has('marketOverview') ? snapshotView.snapshotSource : undefined,
          snapshotTime: includeSet.has('marketOverview') ? snapshotView.snapshotTime : undefined,
          news: includeSet.has('news') ? (t.news ?? null) : undefined
        };
      }),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getReviewById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid trade id' });
    }
    const trade = await Trade.findOne({ _id: id, userId: req.user._id });
    if (!trade) return res.status(404).json({ message: messages.TRADE_NOT_FOUND });
    const snapshotView = getTradeSnapshotView(trade);
    res.json({
      id: trade._id,
      symbol: trade.symbol,
      name: trade.name,
      stockName: trade.name,
      date: trade.date,
      type: trade.type,
      price: trade.price,
      quantity: trade.quantity,
      commission: trade.commission,
      currency: trade.currency,
      market: marketFromTrade(trade),
      exchange: trade.market,
      mood: trade.mood,
      logic: trade.logic ?? null,
      isSystemCompliant: trade.isSystemCompliant ?? null,
      cognitiveBias: trade.cognitiveBias ?? null,
      improvementMeasures: trade.improvementMeasures ?? null,
      marketOverview: snapshotView.marketOverview,
      marketOverviewSnapshot: snapshotView.marketOverviewSnapshot,
      snapshotStatus: snapshotView.snapshotStatus,
      snapshotSource: snapshotView.snapshotSource,
      snapshotTime: snapshotView.snapshotTime,
      news: trade.news ?? null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getHistoryHoldings = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, pageSize = 20, sort = '-lastTradeDate', keyword = '' } = req.query;

    const [rates, trades] = await Promise.all([
      getRates(),
      Trade.find({ userId }).sort({ date: 1, settlementOrder: 1, _id: 1 })
    ]);

    const bySymbol = new Map();
    for (const trade of trades) {
      const symbol = normalizeSymbol(trade.symbol);
      if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
      bySymbol.get(symbol).push(trade);
    }
    const actions = await CorporateAction.find({ userId, date: { $lte: new Date() } }).lean();
    const closed = [...bySymbol].flatMap(([symbol, records]) => calculatePositionZeroGroups({
      trades: records, rates, actions: actions.filter(action => normalizeSymbol(action.symbol) === symbol)
    }).map(group => ({ symbol, name: records[0].name, cycleId: group.groupId,
      realizedProfitCNY: group.realizedProfit, closedTotalBuyCost: group.totalBuyCost,
      currency: 'CNY', lastTradeDate: group.endDate, tradesCount: group.tradesCount })));

    const sortStr = String(sort || '-lastTradeDate');
    const desc = sortStr.startsWith('-');
    const key = desc ? sortStr.slice(1) : sortStr;
    const getKey = (x) => {
      const rate = rates[x.currency] || 1;
      const totalBuyCost = x.closedTotalBuyCost || x.totalBuyCost || 0;
      const totalBuyCostCNY = totalBuyCost * rate;
      if (key === 'cumulativeProfit') return x.realizedProfitCNY;
      if (key === 'profitRate') {
        return totalBuyCostCNY > 0 ? x.realizedProfitCNY / totalBuyCostCNY : 0;
      }
      if (key === 'tradesCount') return x.tradesCount;
      if (key === 'lastTradeDate') return x.lastTradeDate ? new Date(x.lastTradeDate).getTime() : 0;
      return x.lastTradeDate ? new Date(x.lastTradeDate).getTime() : 0;
    };

    const search = String(keyword || '').trim().toLowerCase();
    const matched = closed.filter(item => matchesStock(item, search));
    matched.sort((a, b) => {
      const av = getKey(a);
      const bv = getKey(b);
      if (av === bv) {
        const ad = a.lastTradeDate ? new Date(a.lastTradeDate).getTime() : 0;
        const bd = b.lastTradeDate ? new Date(b.lastTradeDate).getTime() : 0;
        if (ad === bd) return a.symbol.localeCompare(b.symbol);
        return bd - ad;
      }
      return desc ? (bv - av) : (av - bv);
    });

    const total = matched.length;
    const p = Math.max(1, parseInt(page));
    const ps = Math.max(1, parseInt(pageSize));
    const slice = matched.slice((p - 1) * ps, (p - 1) * ps + ps);

    res.json({
      list: slice.map(x => {
        const rate = rates[x.currency] || 1;
        const totalBuyCost = x.closedTotalBuyCost || x.totalBuyCost || 0;
        const totalBuyCostCNY = totalBuyCost * rate;
        const profitRate = totalBuyCostCNY > 0 ? x.realizedProfitCNY / totalBuyCostCNY : 0;
        return {
          cycleId: x.cycleId,
          symbol: x.symbol,
          name: x.name,
          cumulativeProfit: round2(x.realizedProfitCNY),
          profitRate: parseFloat(profitRate.toFixed(4)),
          lastTradeDate: x.lastTradeDate,
          tradesCount: x.tradesCount
        };
      }),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getHistoryHoldingGroups = async (req, res) => {
  try {
    const { symbol } = req.params;
    const userId = req.user._id;

    if (!symbol) {
      return res.status(400).json({ message: 'Symbol is required' });
    }

    const normalizedSymbol = normalizeSymbol(symbol);
    const aliases = buildSymbolAliases(normalizedSymbol);
    const symbolSet = Array.from(new Set([normalizedSymbol, ...aliases]));

    const [rates, trades, actions, corporateActions] = await Promise.all([
      getRates(),
      Trade.find({ userId, symbol: { $in: symbolSet } }).sort({ date: 1, settlementOrder: 1, _id: 1 }).lean(),
      CompanyAction.find({ userId, symbol: { $in: symbolSet } }).sort({ date: 1, settlementOrder: 1, _id: 1 }).lean(),
      CorporateAction.find({ userId, symbol: { $in: symbolSet }, date: { $lte: new Date() } }).lean()
    ]);

    const groups = addActionsToHoldingGroups({
      groups: calculatePositionZeroGroups({ trades, rates, actions: corporateActions }),
      trades,
      actions
    });

    res.json({ list: groups });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.batchGetHistoryHoldingGroups = async (req, res) => {
  try {
    const { symbols } = req.body;
    const userId = req.user._id;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ message: 'symbols 数组不能为空' });
    }

    const normalizedSymbols = Array.from(new Set(
      symbols.map(s => normalizeSymbol(s)).filter(Boolean)
    ));
    if (normalizedSymbols.length === 0) {
      return res.status(400).json({ message: 'symbols 中无有效股票代码' });
    }

    const allSymbols = Array.from(new Set(
      normalizedSymbols.flatMap(s => {
        const aliases = buildSymbolAliases(s);
        return [s, ...aliases];
      })
    ));

    const [rates, trades, actions] = await Promise.all([
      getRates(),
      Trade.find({ userId, symbol: { $in: allSymbols } }).sort({ date: 1, settlementOrder: 1, _id: 1 }).lean(),
      CompanyAction.find({ userId, symbol: { $in: allSymbols } }).sort({ date: 1, settlementOrder: 1, _id: 1 }).lean()
    ]);

    const tradesBySymbol = new Map();
    const actionsBySymbol = new Map();
    trades.forEach((t) => {
      const key = normalizeSymbol(t.symbol);
      if (!tradesBySymbol.has(key)) {
        tradesBySymbol.set(key, []);
      }
      tradesBySymbol.get(key).push(t);
    });
    actions.forEach((action) => {
      const key = normalizeSymbol(action.symbol);
      if (!actionsBySymbol.has(key)) {
        actionsBySymbol.set(key, []);
      }
      actionsBySymbol.get(key).push(action);
    });

    const corporateActions = await CorporateAction.find({ userId, date: { $lte: new Date() } }).lean();
    const list = normalizedSymbols.map((symbol) => {
      const symbolTrades = tradesBySymbol.get(symbol) || [];
      const symbolActions = actionsBySymbol.get(symbol) || [];
      const groups = addActionsToHoldingGroups({
        groups: calculatePositionZeroGroups({ trades: symbolTrades, rates, actions: corporateActions.filter(action => normalizeSymbol(action.symbol) === symbol) }),
        trades: symbolTrades,
        actions: symbolActions
      });
      return { symbol, groups };
    });

    res.json({ list });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteHolding = async (req, res) => {
  try {
    const { symbol } = req.params;
    const userId = req.user._id;

    const aliases = buildSymbolAliases(symbol);
    const normalized = normalizeSymbol(symbol);
    const holding = await Holding.findOne({ userId, symbol: { $in: Array.from(new Set([symbol, normalized, ...aliases])) } });
    if (!holding) {
      return res.status(404).json({ message: messages.HOLDING_NOT_FOUND_OR_UNAUTHORIZED });
    }

    const symbolSet = Array.from(new Set([holding.symbol, normalized, ...aliases, ...buildSymbolAliases(holding.symbol)]));

    const earliestTrade = await Trade.findOne({ userId, symbol: { $in: symbolSet } }).sort({ date: 1 });
    const earliestDateStr = earliestTrade?.date?.toISOString().slice(0, 10);

    const tradeDeleteResult = await Trade.deleteMany({ userId, symbol: { $in: symbolSet } });
    await Holding.deleteOne({ _id: holding._id });

    await rebuildAssetFromLedger(userId);
    await upsertTodayDailyProfit(userId);

    if (earliestDateStr) {
      // 删除持仓会影响从最早交易日到今天的所有历史收益，标记脏数据后由后台异步重算
      await scheduleRecalc(userId, earliestDateStr);
    }

    res.json({
      message: 'Holding and related trades deleted successfully',
      symbol,
      deletedTradesCount: tradeDeleteResult?.deletedCount || 0
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addTrade = async (req, res) => {
  try {
    let { symbol, name, date, type, price, quantity, logic, currency, market, commission, feeMode, feeRate, feeAmount, mood, marketOverview, news, isSystemCompliant, cognitiveBias, improvementMeasures } = req.body;
    symbol = normalizeSymbol(symbol);
    date = parseDateInOffset(date, 480);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return res.status(400).json({ message: 'Invalid date' });
    }
    // 交易日期不能选择未来时间
    if (date > new Date()) {
      return res.status(400).json({ message: '交易日期不能选择未来时间' });
    }

    // 必填字段校验
    if (!symbol) {
      return res.status(400).json({ message: 'Symbol is required' });
    }
    type = String(type || '').toUpperCase();
    if (!['BUY', 'SELL'].includes(type)) {
      return res.status(400).json({ message: 'Type must be BUY or SELL' });
    }
    price = Number(price);
    quantity = Number(quantity);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: 'Price must be a positive number' });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ message: 'Quantity must be a positive number' });
    }

    // 根据 feeMode 计算最终手续费，优先信任 feeMode/feeRate/feeAmount，回退到 commission
    feeMode = ['rate', 'amount'].includes(feeMode) ? feeMode : null;
    feeRate = Number(feeRate) || 0;
    commission = calculateCommission({ price, quantity, feeMode, feeRate, feeAmount, commission });
    if (!Number.isFinite(commission) || commission < 0) {
      return res.status(400).json({ message: 'Commission must be non-negative' });
    }

    // 根据 symbol/market 推断币种，避免港股/美股误存为 CNY
    currency = inferCurrencyFromSymbol(symbol, market, currency);
    mood = mood ? String(mood).trim().toUpperCase() : 'NEUTRAL';
    news = news === undefined ? null : sanitizeHtml(news);
    if (marketOverview !== undefined && marketOverview !== null && typeof marketOverview !== 'object') {
      return res.status(400).json({ message: 'Invalid marketOverview' });
    }
    const tradeMarket = market || inferExchangeFromSymbol(symbol);

    // 优先使用前端交易弹框里实际展示的大盘快照；无效时再由后端按交易日期补抓
    let snapshotFields;
    if (marketOverview && typeof marketOverview === 'object' && Object.keys(marketOverview).length > 0) {
      const normalized = normalizeMarketOverviewSnapshot(marketOverview);
      if (normalized) {
        if (Array.isArray(marketOverview.images) && marketOverview.images.length > 0) {
          normalized.images = marketOverview.images;
        }
        snapshotFields = {
          marketOverviewSnapshot: normalized,
          marketOverview: normalized,
          snapshotStatus: inferSnapshotStatus(normalized),
          snapshotSource: 'client-trade-modal',
          snapshotTime: new Date()
        };
      }
    }
    if (!snapshotFields) {
      snapshotFields = await buildTradeMarketSnapshot({
        symbol,
        market: tradeMarket,
        date
      });
    }

    // 如果未提供 name，尝试自动获取
    if (!name) {
      const quotes = await getQuotes(symbol);
      const quote = quotes[symbol] || Object.values(quotes).find(q => q.symbol === symbol);
      if (quote && quote.name) {
        name = quote.name;
      } else {
        name = symbol; // 兜底使用 symbol
      }
    }

    // 查询当前持仓（卖出需要校验）
    let holding = await Holding.findOne({ userId: req.user._id, symbol });

    if (type === 'SELL') {
      if (!holding || holding.quantity <= 0) {
        return res.status(400).json({ message: 'No holdings available for this symbol' });
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ message: 'Quantity must be greater than 0' });
      }
      if (quantity > holding.quantity) {
        return res.status(400).json({ message: 'Sell quantity exceeds holding quantity' });
      }
    }

    // 创建交易记录
    const trade = new Trade({
      userId: req.user._id,
      symbol,
      name,
      date,
      type,
      price,
      quantity,
      logic,
      commission,
      feeMode,
      feeRate: feeMode === 'rate' ? feeRate : null,
      feeAmount: feeMode === 'amount' ? (Number(feeAmount) || 0) : null,
      currency: currency || 'CNY',
      market: tradeMarket,
      mood,
      marketOverview: snapshotFields.marketOverview,
      marketOverviewSnapshot: snapshotFields.marketOverviewSnapshot,
      snapshotStatus: snapshotFields.snapshotStatus,
      snapshotSource: snapshotFields.snapshotSource,
      snapshotTime: snapshotFields.snapshotTime,
      news,
      isSystemCompliant: isSystemCompliant === undefined ? null : String(isSystemCompliant).trim() || null,
      cognitiveBias: cognitiveBias === undefined ? null : String(cognitiveBias).trim() || null,
      improvementMeasures: improvementMeasures === undefined ? null : String(improvementMeasures).trim() || null
    });
    const validation = await validateTradeEditQuantity({ userId: req.user._id, updates: { append: trade.toObject() } });
    if (!validation.valid) return res.status(400).json({ message: validation.message });
    await trade.save();

    // 基于全量账本重建资产与持仓，避免手动更新与重建结果不一致
    await rebuildAssetFromLedger(req.user._id);
    await upsertTodayDailyProfit(req.user._id);

    // 标记脏数据：从交易日期开始由后台异步重新计算
    const tradeDateStr = getDateStringInOffset(480, trade.date);
    await scheduleRecalc(req.user._id, tradeDateStr);

    // 更新用户手续费偏好（按市场记录最近一次的 mode 和数值）
    const feeMarket = marketFromTrade({ market: tradeMarket, symbol });
    if (feeMarket && feeMode) {
      User.findByIdAndUpdate(req.user._id, {
        [`commissionPreference.${feeMarket}.mode`]: feeMode,
        [`commissionPreference.${feeMarket}.rate`]: feeMode === 'rate' ? feeRate : 5,
        [`commissionPreference.${feeMarket}.amount`]: feeMode === 'amount' ? feeAmount : 0,
        [`commissionPreference.${feeMarket}.updatedAt`]: new Date()
      }).catch(err => {
        console.error('[Trade] Failed to update commission preference:', err);
      });
    }

    res.status(201).json(trade);
  } catch (error) {
    if (error?.name === 'ValidationError' || error instanceof RangeError) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.updateTrade = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid trade id' });
    }

    const trade = await Trade.findOne({ _id: id, userId: req.user._id });
    if (!trade) {
      return res.status(404).json({ message: messages.TRADE_NOT_FOUND });
    }

    const rawUpdates = { ...req.body };

    // 1. Protected fields: type, symbol, market, date cannot be modified
    const protectedFields = [
      { key: 'type', label: 'trade type' },
      { key: 'symbol', label: 'symbol' },
      { key: 'market', label: 'market' },
      { key: 'date', label: 'trade date' }
    ];

    for (const { key, label } of protectedFields) {
      if (rawUpdates[key] !== undefined) {
        if (key === 'date') {
          return res.status(400).json({ message: messages.FIELD_NOT_ALLOWED(label) });
        }
        const newValue = key === 'symbol'
          ? normalizeSymbol(rawUpdates[key])
          : String(rawUpdates[key] || '').toUpperCase();
        const oldValue = key === 'symbol'
          ? normalizeSymbol(trade[key])
          : String(trade[key] || '').toUpperCase();
        if (newValue !== oldValue) {
          return res.status(400).json({ message: messages.FIELD_NOT_ALLOWED(label) });
        }
      }
    }

    // 2. 只允许修改白名单字段
    const allowedFields = ['price', 'quantity', 'commission', 'feeMode', 'feeRate', 'feeAmount', 'news', 'mood', 'logic', 'isSystemCompliant', 'cognitiveBias', 'improvementMeasures'];
    const updates = {};
    for (const key of allowedFields) {
      if (rawUpdates[key] !== undefined) {
        updates[key] = rawUpdates[key];
      }
    }

    // 3. 清洗字段
    if (updates.mood !== undefined) {
      updates.mood = String(updates.mood).trim().toUpperCase();
    }
    if (updates.news !== undefined) {
      updates.news = updates.news === null ? null : sanitizeHtml(updates.news);
    }
    ['isSystemCompliant', 'cognitiveBias', 'improvementMeasures'].forEach((field) => {
      if (updates[field] !== undefined) {
        updates[field] = updates[field] === null ? null : String(updates[field]).trim() || null;
      }
    });

    // 4. 数量基础校验
    if (updates.quantity !== undefined) {
      updates.quantity = Number(updates.quantity);
      if (!Number.isFinite(updates.quantity) || updates.quantity <= 0) {
        return res.status(400).json({ message: 'Quantity must be a positive number' });
      }
    }
    if (updates.price !== undefined) {
      updates.price = Number(updates.price);
      if (!Number.isFinite(updates.price) || updates.price <= 0) {
        return res.status(400).json({ message: 'Price must be a positive number' });
      }
    }

    // 5. 重新计算手续费
    const hasCommissionRelatedChange = [
      'price', 'quantity', 'commission', 'feeMode', 'feeRate', 'feeAmount'
    ].some(key => updates[key] !== undefined);

    if (hasCommissionRelatedChange) {
      const feeMode = ['rate', 'amount'].includes(updates.feeMode)
        ? updates.feeMode
        : (trade.feeMode || null);
      const feeRate = updates.feeRate !== undefined ? Number(updates.feeRate) || 0 : (trade.feeRate || 0);
      const feeAmount = updates.feeAmount !== undefined
        ? Number(updates.feeAmount) || 0
        : (trade.feeAmount ?? trade.commission ?? 0);

      updates.commission = calculateCommission({
        price: updates.price ?? trade.price,
        quantity: updates.quantity ?? trade.quantity,
        feeMode,
        feeRate,
        feeAmount,
        commission: updates.commission ?? trade.commission
      });

      // 保存 feeMode/feeRate/feeAmount 便于下次编辑回灌
      if (updates.feeMode !== undefined) updates.feeMode = feeMode;
      if (updates.feeRate !== undefined) updates.feeRate = feeMode === 'rate' ? feeRate : null;
      if (updates.feeAmount !== undefined || feeMode === 'amount') {
        updates.feeAmount = feeMode === 'amount' ? feeAmount : null;
      }
    }

    // 6. 数量修改时校验全账本是否出现超卖
    if (updates.quantity !== undefined) {
      const { valid, message: validateMsg } = await validateTradeEditQuantity({
        userId: req.user._id,
        editedTradeId: trade._id,
        updates
      });
      if (!valid) {
        return res.status(400).json({ message: validateMsg });
      }
    }

    // 7. 应用更新并保存
    Object.assign(trade, updates);
    if (!trade.mood) trade.mood = 'NEUTRAL';
    await trade.save();

    // 8. 重建资产与回填收益
    await rebuildAssetFromLedger(req.user._id);
    await upsertTodayDailyProfit(req.user._id);

    const tradeDateStr = getDateStringInOffset(480, trade.date);
    await scheduleRecalc(req.user._id, tradeDateStr);

    res.json(trade);
  } catch (error) {
    if (error?.name === 'ValidationError' || error instanceof RangeError) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.getCommissionPreference = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const pref = user.commissionPreference || {};
    const markets = ['CN', 'HK', 'US'];
    const result = {};
    for (const m of markets) {
      const p = pref.get ? pref.get(m) : pref[m];
      result[m] = p || { mode: 'rate', rate: 5, amount: 0, updatedAt: null };
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateCommissionPreference = async (req, res) => {
  try {
    const { market, mode, rate, amount } = req.body;
    if (!['CN', 'HK', 'US'].includes(market)) {
      return res.status(400).json({ message: 'Market must be CN, HK or US' });
    }
    if (!['rate', 'amount'].includes(mode)) {
      return res.status(400).json({ message: 'Mode must be rate or amount' });
    }
    const numRate = Number(rate);
    const numAmount = Number(amount);
    if (mode === 'rate' && (!Number.isFinite(numRate) || numRate < 0)) {
      return res.status(400).json({ message: 'Rate must be non-negative' });
    }
    if (mode === 'amount' && (!Number.isFinite(numAmount) || numAmount < 0)) {
      return res.status(400).json({ message: 'Amount must be non-negative' });
    }

    const update = {
      [`commissionPreference.${market}.mode`]: mode,
      [`commissionPreference.${market}.rate`]: mode === 'rate' ? numRate : 5,
      [`commissionPreference.${market}.amount`]: mode === 'amount' ? numAmount : 0,
      [`commissionPreference.${market}.updatedAt`]: new Date()
    };
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).lean();
    const p = user.commissionPreference || {};
    const saved = p.get ? p.get(market) : p[market];
    res.json(saved || { mode, rate: numRate, amount: numAmount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteTradeById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid trade id' });
    }
    const trade = await Trade.findOne({ _id: id, userId: req.user._id });

    if (!trade) {
      return res.status(404).json({ message: messages.TRADE_NOT_FOUND });
    }

    const validation = await validateTradeEditQuantity({ userId: req.user._id, editedTradeId: id, updates: { remove: true } });
    if (!validation.valid) return res.status(400).json({ message: validation.message });
    await trade.deleteOne();
    await rebuildAssetFromLedger(req.user._id);
    await upsertTodayDailyProfit(req.user._id);

    // 标记脏数据：从交易日期开始由后台异步重新计算
    const tradeDateStr = getDateStringInOffset(480, trade.date);
    await scheduleRecalc(req.user._id, tradeDateStr);

    res.json({ message: 'Trade deleted successfully', id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports.rebuildAssetFromLedger = rebuildAssetFromLedger;

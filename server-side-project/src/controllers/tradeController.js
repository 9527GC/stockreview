const mongoose = require('mongoose');
const { Trade, Holding } = require('../models/Trade');
const { Asset } = require('../models/Asset');
const User = require('../models/User');
const Transfer = require('../models/Transfer');
const { getRates } = require('../utils/currency');
const { getQuotes, buildTradeMarketSnapshot, normalizeMarketOverviewSnapshot, inferSnapshotStatus } = require('../utils/marketData');
const { getDayRangeInOffset, parseDateInOffset } = require('../utils/datetime');
const { calculateCashAndPrincipalCNY } = require('../utils/ledger');
const { round2, calculateDailyProfitFromPosition } = require('../utils/pnl');
const { normalizeSymbol, buildSymbolAliases } = require('../utils/symbol');
const { backfillDailyProfit, upsertTodayDailyProfit } = require('../utils/dailyProfitBackfill');
const { sanitizeHtml } = require('../utils/sanitizeHtml');
const { refreshAssetMarketValue } = require('../utils/assetSnapshot');
const { getDateStringInOffset, getQuoteDateKeyInOffset } = require('../utils/dailyProfit');
const dirtyDataManager = require('../services/dirtyDataManager');

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

const inferCurrencyFromSymbol = (symbol, market, fallbackCurrency) => {
  const sym = String(symbol || '').toUpperCase();
  const mkt = String(market || '').toUpperCase();
  if (fallbackCurrency && fallbackCurrency !== 'CNY') return fallbackCurrency;
  if (sym.endsWith('.HK') || mkt === 'HK') return 'HKD';
  if (sym.endsWith('.US') || mkt === 'US') return 'USD';
  if (sym.endsWith('.SH') || sym.endsWith('.SZ') || mkt === 'SH' || mkt === 'SZ' || mkt === 'CN') return 'CNY';
  return fallbackCurrency || 'CNY';
};

// 重新计算用户总资产（现金 + 持仓市值）
const recalculateAssets = async (userId) => refreshAssetMarketValue(userId);

const rebuildAssetFromLedger = async (userId) => {
  const [rates, transfers, tradesAsc, existingHoldings] = await Promise.all([
    getRates(),
    Transfer.find({ userId }),
    Trade.find({ userId }).sort({ date: 1 }),
    Holding.find({ userId })
  ]);

  const { cashCNY, principalCNY } = calculateCashAndPrincipalCNY({ transfers, trades: tradesAsc, rates });

  const existingBySymbol = new Map(existingHoldings.map(h => [normalizeSymbol(h.symbol), h]));

  const rebuilt = new Map();
  const ensure = (symbol) => {
    const key = normalizeSymbol(symbol);
    if (!rebuilt.has(key)) {
      const old = existingBySymbol.get(key);
      rebuilt.set(key, {
        userId,
        symbol: key,
        name: old?.name || key,
        quantity: 0,
        avgCost: 0,
        lastPrice: old?.lastPrice ?? null,
        lastPriceAt: old?.lastPriceAt ?? null,
        currency: old?.currency || 'CNY',
        marketTag: old?.marketTag
      });
    }
    return rebuilt.get(key);
  };

  (tradesAsc || []).forEach(t => {
    const holding = ensure(t.symbol);
    holding.name = t.name || holding.name;
    holding.currency = t.currency || holding.currency;
    if (t.market) holding.marketTag = t.market;

    const qty = Number(t.quantity) || 0;
    const price = Number(t.price) || 0;
    const commission = Number(t.commission) || 0;

    if (t.type === 'BUY') {
      const totalCost = holding.quantity * holding.avgCost + qty * price + commission;
      const totalQty = holding.quantity + qty;
      holding.quantity = totalQty;
      holding.avgCost = totalQty > 0 ? totalCost / totalQty : 0;
    } else if (t.type === 'SELL') {
      holding.quantity = Math.max(0, holding.quantity - qty);
      if (holding.quantity === 0) {
        rebuilt.delete(normalizeSymbol(t.symbol));
      }
    }
  });

  await Holding.deleteMany({ userId });
  const rebuiltHoldings = Array.from(rebuilt.values()).filter(h => h.quantity > 0);
  if (rebuiltHoldings.length > 0) {
    await Holding.insertMany(rebuiltHoldings);
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

const buildTradePerformanceBySymbol = ({ trades, rates }) => {
  const bySymbol = new Map();
  const ensure = (symbol) => {
    const key = normalizeSymbol(symbol);
    if (!bySymbol.has(key)) {
      bySymbol.set(key, {
        symbol: key,
        name: key,
        quantity: 0,
        avgCostCNY: 0,
        totalInvestmentCNY: 0,
        realizedProfitCNY: 0,
        lastTradeDate: null,
        tradesCount: 0
      });
    }
    return bySymbol.get(key);
  };

  (trades || []).forEach((t) => {
    const agg = ensure(t.symbol);
    agg.tradesCount += 1;
    if (t.name) agg.name = t.name;
    agg.lastTradeDate = t.date;

    const currency = t.currency || 'CNY';
    const rate = rates[currency] || 1;
    const qty = Number(t.quantity) || 0;
    const price = Number(t.price) || 0;
    const commission = Number(t.commission) || 0;

    if (t.type === 'BUY') {
      const buyCostCNY = (price * qty * rate) + (commission * rate);
      agg.totalInvestmentCNY += buyCostCNY;
      const newQty = agg.quantity + qty;
      agg.avgCostCNY = newQty > 0
        ? ((agg.quantity * agg.avgCostCNY) + buyCostCNY) / newQty
        : 0;
      agg.quantity = newQty;
      return;
    }

    if (t.type === 'SELL') {
      const sellQty = Math.min(qty, agg.quantity);
      const sellRatio = qty > 0 ? (sellQty / qty) : 0;
      const sellProceedCNY = (price * sellQty * rate) - ((commission * rate) * sellRatio);
      const costBasisCNY = agg.avgCostCNY * sellQty;
      agg.realizedProfitCNY += sellProceedCNY - costBasisCNY;
      agg.quantity = Math.max(0, agg.quantity - sellQty);
      if (agg.quantity === 0) agg.avgCostCNY = 0;
    }
  });

  return bySymbol;
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
    const [holdings, asset, RATES, tradesAsc] = await Promise.all([
      Holding.find({ userId }),
      Asset.findOne({ userId }),
      getRates(),
      Trade.find({ userId }).sort({ date: 1, _id: 1 })
    ]);
    const cashCNY = asset?.cash || 0;
    const performanceBySymbol = buildTradePerformanceBySymbol({ trades: tradesAsc, rates: RATES });
    
    // 获取实时行情
    const symbols = holdings.map(h => h.symbol);
    const quotes = await getQuotes(symbols);

    const { start: today, end: tomorrow } = getDayRangeInOffset(480);
    const todayDateKey = getDateStringInOffset(480);

    const tradeSymbols = new Set();
    holdings.forEach(h => buildSymbolAliases(h.symbol).forEach(a => tradeSymbols.add(a)));
    
    const todayTrades = tradesAsc.filter(t => t.date >= today && t.date < tomorrow && tradeSymbols.has(t.symbol));

    const priceUpdates = [];

    const items = holdings.map(h => {
      let currentPrice;
      let profitRate;
      let profitAmount = null;
      let dailyProfit = null;

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

        const aliases = new Set([h.symbol, normalizeSymbol(h.symbol), ...buildSymbolAliases(h.symbol)]);
        const tradesForSymbol = todayTrades.filter(t => aliases.has(t.symbol));
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
      const realizedProfit = round2(perf?.realizedProfitCNY || 0);
      const unrealizedProfit = profitAmount !== null ? round2(profitAmount * rate) : null;
      const cumulativeProfit = unrealizedProfit !== null ? round2(realizedProfit + unrealizedProfit) : null;
      const totalInvestmentCNY = perf?.totalInvestmentCNY || 0;
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
        marketTag: h.marketTag
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

exports.getReviews = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const { symbol, sort, date, include, type } = req.query;
    const query = { userId: req.user._id };
    if (symbol) query.symbol = symbol;
    if (type) query.type = String(type).trim().toUpperCase();

    if (date) {
      const d = String(date).slice(0, 10);
      const start = parseDateInOffset(`${d} 00:00:00`, 480);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      query.date = { $gte: start, $lt: end };
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
    if (!trade) return res.status(404).json({ message: '交易记录未找到' });
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
    const { page = 1, pageSize = 20, sort = '-lastTradeDate' } = req.query;

    const [rates, trades] = await Promise.all([
      getRates(),
      Trade.find({ userId }).sort({ date: 1, _id: 1 })
    ]);

    const closed = Array.from(buildTradePerformanceBySymbol({ trades, rates }).values())
      .filter(x => x.tradesCount > 0 && x.quantity <= 0);

    const sortStr = String(sort || '-lastTradeDate');
    const desc = sortStr.startsWith('-');
    const key = desc ? sortStr.slice(1) : sortStr;
    const getKey = (x) => {
      if (key === 'cumulativeProfit') return x.realizedProfitCNY;
      if (key === 'profitRate') {
        return x.totalInvestmentCNY > 0 ? x.realizedProfitCNY / x.totalInvestmentCNY : 0;
      }
      if (key === 'tradesCount') return x.tradesCount;
      if (key === 'lastTradeDate') return x.lastTradeDate ? new Date(x.lastTradeDate).getTime() : 0;
      return x.lastTradeDate ? new Date(x.lastTradeDate).getTime() : 0;
    };

    closed.sort((a, b) => {
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

    const total = closed.length;
    const p = Math.max(1, parseInt(page));
    const ps = Math.max(1, parseInt(pageSize));
    const slice = closed.slice((p - 1) * ps, (p - 1) * ps + ps);

    res.json({
      list: slice.map(x => {
        const profitRate = x.totalInvestmentCNY > 0 ? x.realizedProfitCNY / x.totalInvestmentCNY : 0;
        return {
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

exports.deleteHolding = async (req, res) => {
  try {
    const { symbol } = req.params;
    const userId = req.user._id;

    const aliases = buildSymbolAliases(symbol);
    const normalized = normalizeSymbol(symbol);
    const holding = await Holding.findOne({ userId, symbol: { $in: Array.from(new Set([symbol, normalized, ...aliases])) } });
    if (!holding) {
      return res.status(404).json({ message: '持仓未找到或无权删除' });
    }

    const symbolSet = Array.from(new Set([holding.symbol, normalized, ...aliases, ...buildSymbolAliases(holding.symbol)]));
    
    const earliestTrade = await Trade.findOne({ userId, symbol: { $in: symbolSet } }).sort({ date: 1 });
    const earliestDateStr = earliestTrade?.date?.toISOString().slice(0, 10);
    
    const tradeDeleteResult = await Trade.deleteMany({ userId, symbol: { $in: symbolSet } });
    await Holding.deleteOne({ _id: holding._id });

    await rebuildAssetFromLedger(userId);
    await upsertTodayDailyProfit(userId);
    
    if (earliestDateStr) {
      await backfillDailyProfit(userId, earliestDateStr);
    }
    
    res.json({
      message: '持仓及历史交易删除成功',
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
    feeAmount = Number(feeAmount) || 0;
    const tradeAmount = price * quantity;
    if (feeMode === 'rate') {
      commission = tradeAmount * feeRate / 10000;
    } else if (feeMode === 'amount') {
      commission = feeAmount;
    } else {
      commission = Number(commission) || 0;
    }
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
    await trade.save();

    // 更新持仓
    
    // 更新现金余额
    let asset = await Asset.findOne({ userId: req.user._id });
    if (!asset) asset = new Asset({ userId: req.user._id });
    
    // 获取实时汇率
    const RATES = await getRates();
    const tradeRate = RATES[currency] || 1;
    const tradeAmountCNY = price * quantity * tradeRate;
    const commissionCNY = commission * tradeRate; // 手续费也按该币种汇率折算

    if (type === 'BUY') {
      // 买入扣款：本金 + 手续费
      asset.cash = (asset.cash || 0) - tradeAmountCNY - commissionCNY;
      
      if (holding) {
        // 加权平均成本 = (旧数量*旧成本 + 新数量*新价格 + 手续费) / (旧数量 + 新数量)
        // 注意：通常持仓成本应包含买入手续费
        const totalCost = holding.quantity * holding.avgCost + quantity * price + commission;
        const totalQty = holding.quantity + quantity;
        holding.avgCost = totalQty > 0 ? totalCost / totalQty : 0;
        holding.quantity = totalQty;
      } else {
        holding = new Holding({
          userId: req.user._id,
          symbol,
          name,
          quantity,
          avgCost: (price * quantity + commission) / quantity, // 初始成本包含手续费
          currency: currency || 'CNY',
          marketTag: market || 'SH'
        });
      }
      await holding.save();
    } else if (type === 'SELL') {
      // 卖出回款：市值 - 手续费
      asset.cash = (asset.cash || 0) + tradeAmountCNY - commissionCNY;

      if (holding) {
        holding.quantity = Math.max(0, holding.quantity - quantity);
        if (holding.quantity === 0) {
          await Holding.findByIdAndDelete(holding._id);
        } else {
          await holding.save();
        }
      }
    }
    
    await asset.save(); // 保存现金变动

    await recalculateAssets(req.user._id); // 重新计算总资产（基于新现金和新持仓）
    await upsertTodayDailyProfit(req.user._id);
    
    // 标记脏数据：从交易日期开始重新计算
    const tradeDateStr = trade.date.toISOString().slice(0, 10);
    dirtyDataManager.markDirtyFromDate(req.user._id, tradeDateStr).catch(err => {
      console.error('[Trade] Error marking dirty data:', err);
    });
    
    await backfillDailyProfit(req.user._id, tradeDateStr);

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
    if (error?.name === 'ValidationError') {
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
    const updates = { ...req.body };
    if (updates.mood === undefined || updates.mood === null || updates.mood === '') {
      delete updates.mood;
    } else {
      updates.mood = String(updates.mood).trim().toUpperCase();
    }

    if (updates.news !== undefined) {
      updates.news = updates.news === null ? null : sanitizeHtml(updates.news);
    }

    if (updates.marketOverview !== undefined && updates.marketOverview !== null && typeof updates.marketOverview !== 'object') {
      return res.status(400).json({ message: 'Invalid marketOverview' });
    }
    if (updates.date !== undefined) {
      updates.date = parseDateInOffset(updates.date, 480);
      if (!(updates.date instanceof Date) || Number.isNaN(updates.date.getTime())) {
        return res.status(400).json({ message: 'Invalid date' });
      }
    }
    if (updates.symbol !== undefined) {
      updates.symbol = normalizeSymbol(updates.symbol);
    }
    const shouldRefreshSnapshot = updates.refreshMarketSnapshot === true
      || updates.date !== undefined
      || updates.market !== undefined
      || updates.symbol !== undefined;
    delete updates.refreshMarketSnapshot;
    delete updates.marketOverview;
    delete updates.marketOverviewSnapshot;
    delete updates.snapshotStatus;
    delete updates.snapshotSource;
    delete updates.snapshotTime;
    const trade = await Trade.findOne({ _id: id, userId: req.user._id });

    if (!trade) {
      return res.status(404).json({ message: '交易记录未找到' });
    }

    // 根据 symbol/market 推断币种（必须在查询到 trade 之后）
    if (updates.symbol !== undefined || updates.market !== undefined || updates.currency !== undefined) {
      updates.currency = inferCurrencyFromSymbol(
        updates.symbol ?? trade.symbol,
        updates.market ?? trade.market,
        updates.currency ?? trade.currency
      );
    }

    // 简单实现：仅更新交易记录，提示需手动调整持仓
    // 复杂实现需要回滚旧交易对持仓的影响，再应用新交易（暂略，防止逻辑过于复杂出错）
    Object.assign(trade, updates);
    if (shouldRefreshSnapshot) {
      const snapshotFields = await buildTradeMarketSnapshot({
        symbol: trade.symbol,
        market: trade.market,
        date: trade.date
      });
      Object.assign(trade, snapshotFields);
    }
    if (!trade.mood) trade.mood = 'NEUTRAL';
    await trade.save();

    await rebuildAssetFromLedger(req.user._id);
    await upsertTodayDailyProfit(req.user._id);
    
    // 标记脏数据：从交易日期开始重新计算
    const tradeDateStr = trade.date.toISOString().slice(0, 10);
    dirtyDataManager.markDirtyFromDate(req.user._id, tradeDateStr).catch(err => {
      console.error('[Trade] Error marking dirty data:', err);
    });
    
    await backfillDailyProfit(req.user._id, tradeDateStr);
    
    res.json(trade);
  } catch (error) {
    if (error?.name === 'ValidationError') {
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
    const trade = await Trade.findOneAndDelete({ _id: id, userId: req.user._id });

    if (!trade) {
      return res.status(404).json({ message: '交易记录未找到' });
    }
    
    await rebuildAssetFromLedger(req.user._id);
    await upsertTodayDailyProfit(req.user._id);
    
    // 标记脏数据：从交易日期开始重新计算
    const tradeDateStr = trade.date.toISOString().slice(0, 10);
    dirtyDataManager.markDirtyFromDate(req.user._id, tradeDateStr).catch(err => {
      console.error('[Trade] Error marking dirty data:', err);
    });
    
    await backfillDailyProfit(req.user._id, tradeDateStr);

    res.json({ message: '交易删除成功', id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

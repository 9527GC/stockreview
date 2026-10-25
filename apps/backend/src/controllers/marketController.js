const { getQuotes, getMarketOverview } = require('../utils/marketData');
const { normalizeSymbol } = require('../utils/symbol');
const { searchStock } = require('../services/stockSearchService');
const messages = require('../utils/errorMessages');

const MAX_KEYWORD_LENGTH = 80;
const KEYWORD_RE = /^[a-zA-Z0-9一-龥.\- ]+$/;

exports.search = async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    if (!keyword) {
      return res.status(400).json({ message: messages.KEYWORD_REQUIRED });
    }
    if (keyword.length > MAX_KEYWORD_LENGTH) {
      return res.status(400).json({ message: messages.KEYWORD_TOO_LONG });
    }
    if (!KEYWORD_RE.test(keyword)) {
      return res.status(400).json({ message: messages.KEYWORD_INVALID_CHARACTERS });
    }

    const { suggestions, source } = await searchStock(keyword, { userId: req.user?._id });

    res.set('X-Search-Source', source);
    res.json({ suggestions, source });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getOverview = async (req, res) => {
  try {
    const { date, forceRefresh } = req.query;
    console.log(`[MarketController] GET /api/market/overview date=${date || 'today'} forceRefresh=${forceRefresh || 'false'}`);
    const data = await getMarketOverview({ date, forceRefresh: forceRefresh === 'true' });
    const cnItem = data.find((item) => item.market === 'CN');
    const hasBreadth = cnItem && cnItem.upCount !== null && cnItem.volume !== null;
    console.log(`[MarketController] GET /api/market/overview returned ${data.length} items, CN breadth=${hasBreadth}, first item keys=${Object.keys(cnItem || {}).join(',')}`);
    res.json({ list: data });
  } catch (error) {
    console.error('[MarketController] GET /api/market/overview failed:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getQuote = async (req, res) => {
  try {
    if (req.query.symbols !== undefined) {
      if (typeof req.query.symbols !== 'string') return res.status(400).json({ message: '证券代码列表格式错误' });
      const symbols = [...new Set(req.query.symbols.split(',').map(s => s.trim()).filter(Boolean))];
      if (!symbols.length || symbols.length > 100) return res.status(400).json({ message: '每次需查询 1 至 100 只证券' });
      return res.json(await getQuotes(symbols.map(normalizeSymbol)));
    }
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ message: 'Symbol is required' });

    const normalized = normalizeSymbol(symbol);
    const quotes = await getQuotes(normalized);
    // 尝试匹配返回的数据，支持原始symbol或新浪code
    let quote = quotes[normalized] || Object.values(quotes)[0];

    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    res.json(quote);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

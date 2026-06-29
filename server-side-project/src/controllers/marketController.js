const { getQuotes, getMarketOverview } = require('../utils/marketData');
const { normalizeSymbol } = require('../utils/symbol');
const { searchStock } = require('../services/stockSearchService');

exports.search = async (req, res) => {
  try {
    const { keyword } = req.query;
    const { suggestions, source } = await searchStock(keyword);

    res.set('X-Search-Source', source);
    res.json({ suggestions, source });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getOverview = async (req, res) => {
  try {
    const { date } = req.query;
    const data = await getMarketOverview({ date });
    res.json({ list: data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getQuote = async (req, res) => {
  try {
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

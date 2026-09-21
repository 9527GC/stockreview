const CompanyAction = require('../models/CompanyAction');
const { normalizeSymbol, buildSymbolAliases } = require('../utils/symbol');

exports.list = async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.query.symbol || '');
    if (!symbol) return res.status(400).json({ message: 'Symbol is required' });
    const symbols = [symbol, ...buildSymbolAliases(symbol)];
    const list = await CompanyAction.find({ userId: req.user._id, symbol: { $in: symbols } }).sort({ date: 1, _id: 1 }).lean();
    res.json({ list });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
exports.create = async (req, res) => {
  try {
    const { symbol, name, date, type, description, quantityChange, cashAmount, currency, market } = req.body;
    if (!symbol || !name || !date || !description) return res.status(400).json({ message: '股票、日期和说明不能为空' });
    const action = await CompanyAction.create({ userId: req.user._id, symbol: normalizeSymbol(symbol), name, date, type, description, quantityChange: Number(quantityChange) || 0, cashAmount: Number(cashAmount) || 0, currency, market });
    res.status(201).json(action);
  } catch (e) { res.status(500).json({ message: e.message }); }
};
exports.update = async (req, res) => {
  try { const a = await CompanyAction.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, req.body, { new: true, runValidators: true }); if (!a) return res.status(404).json({ message: '公司行动不存在' }); res.json(a); } catch (e) { res.status(500).json({ message: e.message }); }
};
exports.remove = async (req, res) => { try { const r = await CompanyAction.deleteOne({ _id: req.params.id, userId: req.user._id }); if (!r.deletedCount) return res.status(404).json({ message: '公司行动不存在' }); res.json({ success: true }); } catch (e) { res.status(500).json({ message: e.message }); } };

const { CorporateAction, ACTION_TYPES } = require('../models/CorporateAction');
const { normalizeSymbol } = require('../utils/symbol');
const { parseDateInOffset } = require('../utils/datetime');
const { rebuildAssetFromLedger } = require('./tradeController');
const dirtyDataManager = require('../services/dirtyDataManager');

const validate = (body) => {
  const type = String(body.type || '').toUpperCase();
  if (!ACTION_TYPES.includes(type)) return { error: '不支持的公司行动类型' };
  const symbol = normalizeSymbol(body.symbol);
  if (!symbol || !String(body.name || '').trim()) return { error: '证券代码和名称不能为空' };
  const date = parseDateInOffset(body.date, 480);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return { error: '生效日期无效' };
  const cashAmount = Number(body.cashAmount || 0);
  const quantityChange = Number(body.quantityChange || 0);
  const ratioNumerator = body.ratioNumerator === '' || body.ratioNumerator == null ? null : Number(body.ratioNumerator);
  const ratioDenominator = body.ratioDenominator === '' || body.ratioDenominator == null ? null : Number(body.ratioDenominator);
  if (!Number.isFinite(cashAmount) || cashAmount < 0 || !Number.isFinite(quantityChange)) return { error: '金额或份额无效' };
  if (['SPLIT', 'REVERSE_SPLIT'].includes(type) && (!(ratioNumerator > 0) || !(ratioDenominator > 0))) return { error: '拆分比例必须为正数' };
  if (type === 'CASH_DIVIDEND' && cashAmount <= 0) return { error: '现金分红金额必须大于 0' };
  if (type === 'RIGHTS_ISSUE' && (quantityChange <= 0 || cashAmount <= 0)) return { error: '配股必须填写正的份额和现金支出' };
  return { value: { symbol, name: String(body.name).trim(), type, date, currency: body.currency || 'CNY', cashAmount, quantityChange, ratioNumerator, ratioDenominator, sourceId: String(body.sourceId || '').trim(), sourceFile: body.sourceFile || null, remark: body.remark || null } };
};

const recalc = async (userId, date) => {
  await rebuildAssetFromLedger(userId);
  await dirtyDataManager.markDirtyFromDate(userId, date.toISOString().slice(0, 10));
  const run = dirtyDataManager.asyncRecalculate(userId);
  if (process.env.NODE_ENV === 'test') await run; else run.catch(console.error);
};

exports.list = async (req, res) => {
  const list = await CorporateAction.find({ userId: req.user._id }).sort({ date: -1, _id: -1 }).lean();
  res.json({ list });
};
exports.create = async (req, res) => {
  try {
    const parsed = validate(req.body); if (parsed.error) return res.status(400).json({ message: parsed.error });
    if (!parsed.value.sourceId) return res.status(400).json({ message: '来源标识不能为空，用于防止重复导入' });
    const action = await CorporateAction.create({ userId: req.user._id, ...parsed.value });
    await recalc(req.user._id, action.date); res.status(201).json(action);
  } catch (error) { res.status(error?.code === 11000 ? 409 : 500).json({ message: error?.code === 11000 ? '该来源公司行动已导入' : error.message }); }
};
exports.update = async (req, res) => {
  try { const parsed = validate(req.body); if (parsed.error) return res.status(400).json({ message: parsed.error });
    const previous = await CorporateAction.findOne({ _id: req.params.id, userId: req.user._id });
    if (!previous) return res.status(404).json({ message: '公司行动不存在' });
    const action = await CorporateAction.findByIdAndUpdate(previous._id, parsed.value, { new: true, runValidators: true });
    const firstAffectedDate = previous.date < action.date ? previous.date : action.date;
    await recalc(req.user._id, firstAffectedDate);
    res.json(action);
  } catch (error) { res.status(error?.code === 11000 ? 409 : 500).json({ message: error?.code === 11000 ? '该来源公司行动已导入' : error.message }); }
};
exports.remove = async (req, res) => { try { const action = await CorporateAction.findOneAndDelete({ _id: req.params.id, userId: req.user._id }); if (!action) return res.status(404).json({ message: '公司行动不存在' }); await recalc(req.user._id, action.date); res.json({ id: action._id }); } catch (error) { res.status(500).json({ message: error.message }); } };

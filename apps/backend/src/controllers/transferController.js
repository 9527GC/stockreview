const Transfer = require('../models/Transfer');
const { Trade } = require('../models/Trade');
const { Asset } = require('../models/Asset');
const { getRates } = require('../utils/currency');
const { BEIJING_OFFSET_MINUTES, getDateStringInOffset, parseDateInOffset } = require('../utils/datetime');
const { buildLedger } = require('../utils/ledger');
const { sumCashBalancesCNY, toMoney, toCNY } = require('../utils/money');
const { upsertTodayDailyProfit } = require('../utils/dailyProfitBackfill');
const dirtyDataManager = require('../services/dirtyDataManager');

const SUPPORTED_CURRENCIES = new Set(['CNY', 'HKD', 'USD']);

const scheduleRecalc = async (userId, affectedDate) => {
  await dirtyDataManager.markDirtyFromDate(userId, affectedDate);
  const recalcPromise = dirtyDataManager.asyncRecalculate(userId);
  if (process.env.NODE_ENV === 'test') {
    await recalcPromise;
    return;
  }
  recalcPromise.catch((error) => console.error('[Transfer] Error starting async recalculation:', error));
};


const rebuildCashAssetFromLedger = async (userId, rates) => {
  const [transfers, trades] = await Promise.all([
    Transfer.find({ userId }).sort({ date: 1, _id: 1 }),
    Trade.find({ userId }).sort({ date: 1, _id: 1 })
  ]);
  const ledger = buildLedger({ transfers, trades });
  const cash = sumCashBalancesCNY(ledger.cashBalances, rates);
  let asset = await Asset.findOne({ userId });
  if (!asset) asset = new Asset({ userId });
  asset.cashBalances = ledger.cashBalances;
  asset.cash = cash;
  asset.currentPrincipal = ledger.principalCNY;
  asset.totalAssets = toMoney(cash + Number(asset.holdingsMarketValue || 0));
  await asset.save();
  return asset;
};

exports.getTransfers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const query = { userId: req.user._id };
    const [transfers, total] = await Promise.all([
      Transfer.find(query).sort({ date: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      Transfer.countDocuments(query)
    ]);
    res.json({
      list: transfers.map(t => ({
        id: t._id, type: t.type, amount: t.amount, currency: t.currency,
        fxRateToCNY: t.fxRateToCNY, amountCNY: t.amountCNY, date: t.date, remark: t.remark
      })), total
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.addTransfer = async (req, res) => {
  try {
    let { type, amount, currency, date, remark } = req.body;
    type = String(type || '').toUpperCase();
    if (!['IN', 'OUT'].includes(type)) return res.status(400).json({ message: 'Type must be IN or OUT' });
    amount = Number(amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Amount must be a positive number' });
    date = parseDateInOffset(date || new Date(), BEIJING_OFFSET_MINUTES);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return res.status(400).json({ message: 'Invalid date' });
    currency = String(currency || 'CNY').trim().toUpperCase();
    if (!SUPPORTED_CURRENCIES.has(currency)) return res.status(400).json({ message: `Unsupported currency: ${currency}` });

    const rates = await getRates();
    const fxRateToCNY = Number(rates[currency]);
    if (!Number.isFinite(fxRateToCNY) || fxRateToCNY <= 0) return res.status(400).json({ message: `Invalid exchange rate for ${currency}` });

    if (type === 'OUT') {
      const [existingTransfers, trades] = await Promise.all([
        Transfer.find({ userId: req.user._id }).sort({ date: 1, _id: 1 }),
        Trade.find({ userId: req.user._id }).sort({ date: 1, _id: 1 })
      ]);
      const available = buildLedger({ transfers: existingTransfers, trades }).cashBalances[currency];
      if (amount > available) return res.status(400).json({ message: 'Insufficient cash' });
    }

    const transfer = await Transfer.create({
      userId: req.user._id, type, amount: toMoney(amount), currency, date, remark,
      fxRateToCNY: toMoney(fxRateToCNY), amountCNY: toCNY(amount, fxRateToCNY)
    });
    await rebuildCashAssetFromLedger(req.user._id, rates);
    await upsertTodayDailyProfit(req.user._id);
    await scheduleRecalc(req.user._id, getDateStringInOffset(BEIJING_OFFSET_MINUTES, transfer.date));
    res.status(201).json(transfer);
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.rebuildCashAssetFromLedger = rebuildCashAssetFromLedger;

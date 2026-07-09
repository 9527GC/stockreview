const Transfer = require('../models/Transfer');

const { Asset } = require('../models/Asset');
const { getRates } = require('../utils/currency');
const { parseDateInOffset } = require('../utils/datetime');
const { upsertTodayDailyProfit } = require('../utils/dailyProfitBackfill');

exports.getTransfers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const query = { userId: req.user._id };

    const [transfers, total] = await Promise.all([
      Transfer.find(query)
        .sort({ date: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      Transfer.countDocuments(query)
    ]);

    res.json({
      list: transfers.map(t => ({
        id: t._id,
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        date: t.date,
        remark: t.remark
      })),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addTransfer = async (req, res) => {
  try {
    let { type, amount, currency, date, remark } = req.body;

    type = String(type || '').toUpperCase();
    if (!['IN', 'OUT'].includes(type)) {
      return res.status(400).json({ message: 'Type must be IN or OUT' });
    }

    amount = Number(amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be a positive number' });
    }

    date = parseDateInOffset(date || new Date(), 480);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return res.status(400).json({ message: 'Invalid date' });
    }

    currency = currency || 'CNY';
    const RATES = await getRates();
    const rate = RATES[currency] || 1;
    const amountInCNY = amount * rate;

    // 原子化更新资产：IN 直接增加，OUT 使用 $gte 条件防止透支
    if (type === 'IN') {
      await Asset.findOneAndUpdate(
        { userId: req.user._id },
        { $inc: { cash: amountInCNY, currentPrincipal: amountInCNY } },
        { upsert: true, new: true }
      );
    } else {
      const updated = await Asset.findOneAndUpdate(
        { userId: req.user._id, cash: { $gte: amountInCNY } },
        { $inc: { cash: -amountInCNY, currentPrincipal: -amountInCNY } },
        { new: true }
      );
      if (!updated) {
        return res.status(400).json({ message: 'Insufficient cash' });
      }
    }

    const transfer = new Transfer({
      userId: req.user._id,
      type,
      amount,
      currency,
      date,
      remark
    });
    await transfer.save();

    // 重新计算总资产（现金 + 持仓市值），保持 totalAssets 同步
    const asset = await Asset.findOne({ userId: req.user._id });
    if (asset) {
      asset.totalAssets = (asset.cash || 0) + (asset.holdingsMarketValue || 0);
      await asset.save();
    }

    await upsertTodayDailyProfit(req.user._id);

    res.status(201).json(transfer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

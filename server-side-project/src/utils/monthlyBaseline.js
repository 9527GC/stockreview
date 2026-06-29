const Transfer = require('../models/Transfer');
const { Trade } = require('../models/Trade');
const DailyProfit = require('../models/DailyProfit');
const { getRates } = require('./currency');
const { calculateCashAndPrincipalCNY } = require('./ledger');
const { round2 } = require('./pnl');
const { parseDateInOffset } = require('./datetime');

/**
 * 计算某月月初的资产/本金基线
 * @param {string} userId
 * @param {string} startStr - 月初日期 YYYY-MM-DD
 * @param {number} offsetMinutes - 时区偏移，默认北京时间
 */
const getMonthStartBaseline = async (userId, startStr, offsetMinutes = 480) => {
  const monthStartDate = parseDateInOffset(`${startStr} 00:00:00`, offsetMinutes);

  const [rates, transfers, trades, previousDailyProfit] = await Promise.all([
    getRates(),
    Transfer.find({ userId, date: { $lt: monthStartDate } }),
    Trade.find({ userId, date: { $lt: monthStartDate } }).sort({ date: 1, _id: 1 }),
    DailyProfit.findOne({ userId, date: { $lt: startStr } }).sort({ date: -1 })
  ]);

  const { principalCNY } = calculateCashAndPrincipalCNY({ transfers, trades, rates });
  const monthStartPrincipal = round2(principalCNY);

  let monthStartAssets = null;
  if (previousDailyProfit) {
    const cumulativeReturn = Number(previousDailyProfit.cumulativeReturn) || 0;
    monthStartAssets = round2(monthStartPrincipal * (1 + cumulativeReturn / 100));
  }

  return { monthStartPrincipal, monthStartAssets };
};

module.exports = { getMonthStartBaseline };

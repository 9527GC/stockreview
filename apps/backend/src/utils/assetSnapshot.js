const { Holding } = require('../models/Trade');
const { Asset } = require('../models/Asset');
const { getRates } = require('./currency');
const { getQuotes } = require('./marketData');
const { round2 } = require('./pnl');

const refreshAssetMarketValue = async (userId) => {
  const holdings = await Holding.find({ userId });
  const symbols = holdings.map(h => h.symbol);

  const [rates, quotes] = await Promise.all([
    getRates(),
    getQuotes(symbols)
  ]);

  const priceUpdates = [];
  let holdingsMarketValue = 0;

  holdings.forEach((holding) => {
    let currentPrice = null;
    const quote = quotes[holding.symbol] || Object.values(quotes).find(q => q.symbol === holding.symbol);

    const closePrice = quote?.preClose && quote.preClose > 0 ? quote.preClose : null;
    if (closePrice !== null && holding.lastPrice !== closePrice) {
      priceUpdates.push({
        updateOne: {
          filter: { _id: holding._id },
          update: { $set: { lastPrice: closePrice, lastPriceAt: new Date() } }
        }
      });
    }

    if (quote && quote.price > 0) {
      currentPrice = quote.price;
    } else if (holding.lastPrice && holding.lastPrice > 0) {
      currentPrice = holding.lastPrice;
    }

    const marketValue = currentPrice !== null ? holding.quantity * currentPrice : 0;
    const rate = rates[holding.currency] || 1;
    holdingsMarketValue += marketValue * rate;
  });

  if (priceUpdates.length > 0) {
    await Holding.bulkWrite(priceUpdates, { ordered: false });
  }

  let asset = await Asset.findOne({ userId });
  if (!asset) {
    asset = new Asset({ userId, cash: 0, currentPrincipal: 0 });
  }

  asset.holdingsMarketValue = round2(holdingsMarketValue);
  asset.totalAssets = round2((asset.cash || 0) + asset.holdingsMarketValue);
  asset.totalHoldingsCount = holdings.length;
  await asset.save();

  return asset;
};

module.exports = { refreshAssetMarketValue };

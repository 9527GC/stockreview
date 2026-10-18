const { Holding, Trade } = require('../models/Trade');
const Transfer = require('../models/Transfer');
const { Asset } = require('../models/Asset');
const { getRates } = require('./currency');
const { getQuotes, getQuoteLastClose } = require('./marketData');
const { buildLedger } = require('./ledger');
const { valuatePortfolio } = require('./portfolioValuation');

const findQuote = (quotes, symbol) => quotes[symbol]
  || Object.values(quotes).find((quote) => quote?.symbol === symbol)
  || null;

const buildFallbackPrices = (holdings) => holdings.reduce((prices, holding) => {
  prices[holding.symbol] = {
    price: holding.lastPrice,
    date: holding.lastPriceDate || null
  };
  return prices;
}, {});

const refreshAssetMarketValue = async (userId) => {
  const [holdings, transfers, trades, rates] = await Promise.all([
    Holding.find({ userId }),
    Transfer.find({ userId }).sort({ date: 1, _id: 1 }),
    Trade.find({ userId }).sort({ date: 1, _id: 1 }),
    getRates()
  ]);
  const quotes = await getQuotes(holdings.map((holding) => holding.symbol));
  const valuation = valuatePortfolio({
    cashBalances: buildLedger({ transfers, trades }).cashBalances,
    holdings,
    quotes,
    rates,
    fallbackPrices: buildFallbackPrices(holdings)
  });

  const priceUpdates = holdings.flatMap((holding) => {
    const lastClose = getQuoteLastClose(findQuote(quotes, holding.symbol));
    if (!lastClose) return [];

    const lastPriceDate = lastClose.date;
    if (holding.lastPrice === lastClose.price && holding.lastPriceDate === lastPriceDate) return [];

    return [{
      updateOne: {
        filter: { _id: holding._id },
        update: {
          $set: {
            lastPrice: lastClose.price,
            lastPriceAt: new Date(),
            lastPriceDate
          }
        }
      }
    }];
  });

  if (priceUpdates.length > 0) {
    await Holding.bulkWrite(priceUpdates, { ordered: false });
  }

  let asset = await Asset.findOne({ userId });
  if (!asset) asset = new Asset({ userId });

  const ledger = buildLedger({ transfers, trades });
  asset.cashBalances = valuation.cashByCurrency;
  asset.cash = valuation.cashCNY;
  asset.currentPrincipal = ledger.principalCNY;
  asset.holdingsMarketValue = valuation.holdingsMarketValueCNY;
  asset.totalAssets = valuation.totalAssetsCNY;
  asset.valuationQuality = valuation.quality;
  asset.totalHoldingsCount = holdings.length;
  await asset.save();

  return asset;
};

module.exports = { refreshAssetMarketValue };

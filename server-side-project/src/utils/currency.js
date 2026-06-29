const https = require('https');

// 简单的内存缓存
let ratesCache = null;
let lastUpdate = 0;
const CACHE_TTL = 3600 * 1000; // 缓存1小时

const getRates = () => {
  return new Promise((resolve) => {
    // 检查缓存是否有效
    if (ratesCache && (Date.now() - lastUpdate < CACHE_TTL)) {
      return resolve(ratesCache);
    }

    // Frankfurter API 已迁移到 .dev 域名
    const url = 'https://api.frankfurter.dev/v1/latest?from=CNY&to=USD,HKD';

    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (!result || !result.rates) {
            throw new Error('Invalid API response');
          }

          // 我们需要的是: 1 USD = ? CNY (即汇率反算)
          // result.rates.USD 是 1 CNY = X USD
          // 所以 1 USD = 1 / result.rates.USD (CNY)
          const newRates = {
            'CNY': 1,
            'USD': 1 / result.rates.USD,
            'HKD': 1 / result.rates.HKD
          };

          ratesCache = newRates;
          lastUpdate = Date.now();
          console.log('Exchange rates updated (1 Unit = ? CNY):', newRates);
          resolve(newRates);
        } catch (e) {
          console.error('Failed to parse exchange rates:', e);
          resolve(ratesCache || { 'CNY': 1, 'USD': 7.2, 'HKD': 0.92 }); // 兜底汇率
        }
      });
    }).on('error', (e) => {
      console.error('Failed to fetch exchange rates:', e);
      resolve(ratesCache || { 'CNY': 1, 'USD': 7.2, 'HKD': 0.92 });
    });
  });
};

module.exports = { getRates };
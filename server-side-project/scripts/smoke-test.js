const http = require('http');

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;

const request = (method, path, data, token) => new Promise((resolve, reject) => {
  const options = {
    hostname: 'localhost',
    port: PORT,
    path,
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  if (token) options.headers.Authorization = `Bearer ${token}`;

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        resolve({ status: res.statusCode, body: JSON.parse(body) });
      } catch {
        resolve({ status: res.statusCode, body });
      }
    });
  });

  req.on('error', reject);
  if (data) req.write(JSON.stringify(data));
  req.end();
});

async function main() {
  const results = [];
  const uniqueSuffix = Date.now().toString(36);
  const newUsername = `smoke_user_${uniqueSuffix}`;

  // 1. 错误登录
  results.push({ case: 'invalid login', ...(await request('POST', '/api/auth/login', { username: 'smoke_user', password: 'wrong' })) });

  // 2. 正确登录
  const loginRes = await request('POST', '/api/auth/login', { username: 'smoke_user', password: 'smoke_pass' });
  results.push({ case: 'valid login', status: loginRes.status, body: { token: loginRes.body.token ? 'present' : 'missing' } });
  const token = loginRes.body.token;

  // 3. 注册新用户
  const registerRes = await request('POST', '/api/auth/register', { username: newUsername, password: 'smoke_pass2', nickname: 'Smoke2' });
  results.push({ case: 'register', status: registerRes.status, body: registerRes.body });

  // 4. 未鉴权
  results.push({ case: 'unauthorized', ...(await request('GET', '/api/assets/summary')) });

  // 5. 资产摘要
  results.push({ case: 'assets summary', ...(await request('GET', '/api/assets/summary', null, token)) });

  // 6. 持仓
  results.push({ case: 'holdings', ...(await request('GET', '/api/trades/holdings', null, token)) });

  // 7. 复盘列表
  results.push({ case: 'reviews', ...(await request('GET', '/api/trades/reviews?page=1&pageSize=5', null, token)) });

  // 8. 非法交易
  results.push({ case: 'invalid trade', ...(await request('POST', '/api/trades', {}, token)) });

  // 9. 非法转账
  results.push({ case: 'invalid transfer', ...(await request('POST', '/api/transfers', { type: 'invalid' }, token)) });

  // 10. 不存在的路由
  results.push({ case: 'not found', ...(await request('GET', '/api/nonexistent', null, token)) });

  // 11. 转入
  results.push({ case: 'transfer IN', ...(await request('POST', '/api/transfers', { type: 'IN', amount: 100000, currency: 'CNY' }, token)) });

  // 12. 买入港股（验证币种）
  const buyRes = await request('POST', '/api/trades', {
    symbol: '00700.HK',
    name: '腾讯控股',
    date: new Date().toISOString(),
    type: 'BUY',
    price: 500,
    quantity: 100,
    currency: 'HKD',
    market: 'HK'
  }, token);
  results.push({ case: 'buy HK', status: buyRes.status, body: buyRes.body });

  // 13. 持仓币种检查
  const holdingsRes = await request('GET', '/api/trades/holdings', null, token);
  const hkHolding = holdingsRes.body?.list?.find(h => h.symbol === '00700.HK');
  results.push({
    case: 'holding currency HKD',
    status: holdingsRes.status,
    body: { currency: hkHolding?.currency, hasCurrencyHKD: hkHolding?.currency === 'HKD' }
  });

  // 14. 卖出全部
  const sellRes = await request('POST', '/api/trades', {
    symbol: '00700.HK',
    name: '腾讯控股',
    date: new Date().toISOString(),
    type: 'SELL',
    price: 550,
    quantity: 100,
    currency: 'HKD',
    market: 'HK'
  }, token);
  results.push({ case: 'sell HK', status: sellRes.status, body: sellRes.body });

  // 15. 历史持仓收益率
  const historyRes = await request('GET', '/api/trades/history-holdings', null, token);
  const hkHistory = historyRes.body?.list?.find(h => h.symbol === '00700.HK');
  results.push({
    case: 'history holding profitRate',
    status: historyRes.status,
    body: { profitRate: hkHistory?.profitRate, nonZero: hkHistory?.profitRate !== 0 }
  });

  // 16. 搜索关键字校验
  results.push({ case: 'market search validation', ...(await request('GET', '/api/market/search?keyword=' + encodeURIComponent('<script>'), token)) });

  // 17. 大盘概览 A 股全市场指标
  const overviewRes = await request('GET', '/api/market/overview', null, token);
  const cnIndex = overviewRes.body?.list?.find(item => item.market === 'CN');
  const hasCnBreadth = cnIndex && cnIndex.upCount !== null && cnIndex.volume !== null;
  results.push({
    case: 'market overview CN breadth',
    status: overviewRes.status,
    body: {
      items: overviewRes.body?.list?.length,
      hasCnBreadth,
      upCount: cnIndex?.upCount,
      volume: cnIndex?.volume
    }
  });

  // 18. 登出
  results.push({ case: 'logout', ...(await request('POST', '/api/auth/logout', {}, token)) });

  // 19. 登出后 token 失效
  results.push({ case: 'token revoked', ...(await request('GET', '/api/assets/summary', null, token)) });

  const failed = results.filter(r => {
    if (r.case === 'invalid login') return r.status !== 401;
    if (r.case === 'valid login') return r.status !== 200;
    if (r.case === 'register') return r.status !== 201;
    if (r.case === 'unauthorized') return r.status !== 401;
    if (r.case === 'assets summary') return r.status !== 200;
    if (r.case === 'holdings') return r.status !== 200;
    if (r.case === 'reviews') return r.status !== 200;
    if (r.case === 'invalid trade') return r.status !== 400;
    if (r.case === 'invalid transfer') return r.status !== 400;
    if (r.case === 'not found') return r.status !== 404;
    if (r.case === 'transfer IN') return r.status !== 201;
    if (r.case === 'buy HK') return r.status !== 201;
    if (r.case === 'holding currency HKD') return !r.body.hasCurrencyHKD;
    if (r.case === 'sell HK') return r.status !== 201;
    if (r.case === 'history holding profitRate') return !r.body.nonZero;
    if (r.case === 'market search validation') return r.status !== 400;
    if (r.case === 'market overview CN breadth') return r.status !== 200 || !r.body.hasCnBreadth;
    if (r.case === 'logout') return r.status !== 200;
    if (r.case === 'token revoked') return r.status !== 401;
    return false;
  });

  console.log(JSON.stringify({ results, failed: failed.length }, null, 2));
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

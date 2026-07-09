const http = require('http');

const PORT = Number(process.env.API_PORT) || 8080;

const requestJson = (method, path, token, body) => new Promise((resolve, reject) => {
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  const req = http.request({
    host: '127.0.0.1',
    port: PORT,
    path,
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data ? { 'Content-Length': data.length } : {})
    }
  }, (res) => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const json = text ? JSON.parse(text) : null;
      resolve({ status: res.statusCode, json });
    });
  });
  req.on('error', reject);
  if (data) req.write(data);
  req.end();
});

const run = async () => {
  const login = await requestJson('POST', '/api/auth/login', null, { username: 'testuser', password: 'password123' });
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
  const token = login.json.token;

  await requestJson('POST', '/api/transfers', token, { type: 'IN', amount: 100000, currency: 'CNY', date: '2026-03-21' });

  await requestJson('POST', '/api/trades', token, { symbol: '600519.SH', type: 'BUY', price: 1000, quantity: 1, date: '2026-03-21', currency: 'CNY', market: 'SH', commission: 1 });
  await requestJson('POST', '/api/trades', token, { symbol: '600519.SH', type: 'SELL', price: 1100, quantity: 1, date: '2026-03-22', currency: 'CNY', market: 'SH', commission: 1 });

  await requestJson('POST', '/api/trades', token, { symbol: '000001.SZ', type: 'BUY', price: 10, quantity: 100, date: '2026-03-21', currency: 'CNY', market: 'SZ', commission: 0 });
  await requestJson('POST', '/api/trades', token, { symbol: '000001.SZ', type: 'SELL', price: 9, quantity: 100, date: '2026-03-23', currency: 'CNY', market: 'SZ', commission: 0 });

  const res = await requestJson('GET', '/api/trades/history-holdings?page=1&pageSize=20&sort=-lastTradeDate', token);
  if (res.status !== 200) throw new Error(`history-holdings failed: ${res.status}`);
  if (!Array.isArray(res.json.list)) throw new Error('invalid response list');
  if (res.json.total < 2) throw new Error('expected >=2 closed symbols');

  const symbols = res.json.list.map(x => x.symbol);
  if (!symbols.includes('600519.SH')) throw new Error('missing 600519.SH');
  if (!symbols.includes('000001.SZ')) throw new Error('missing 000001.SZ');

  const detail = await requestJson('GET', '/api/trades/reviews?symbol=600519.SH&page=1&pageSize=50', token);
  if (detail.status !== 200) throw new Error(`reviews failed: ${detail.status}`);
  if ((detail.json.total || 0) < 2) throw new Error('expected >=2 trades for 600519.SH');

  console.log('verify_history_holdings ok');
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});


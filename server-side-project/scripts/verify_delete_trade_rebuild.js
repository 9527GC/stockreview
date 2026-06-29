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

  await requestJson('POST', '/api/transfers', token, { type: 'IN', amount: 1000, currency: 'CNY', date: '2026-03-21' });
  await requestJson('POST', '/api/trades', token, { symbol: '600519.SH', type: 'BUY', price: 1000, quantity: 1, date: '2026-03-21', currency: 'CNY', market: 'SH', commission: 0 });

  const reviews1 = await requestJson('GET', '/api/trades/reviews?symbol=600519.SH&page=1&pageSize=50', token);
  if (reviews1.status !== 200) throw new Error(`reviews failed: ${reviews1.status}`);
  const tradeId = reviews1.json.list?.[0]?.id;
  if (!tradeId) throw new Error('no trade id found');

  const del = await requestJson('DELETE', `/api/trades/reviews/${tradeId}`, token);
  if (del.status !== 200) throw new Error(`delete failed: ${del.status}`);

  const holdings = await requestJson('GET', '/api/trades/holdings', token);
  if (holdings.status !== 200) throw new Error(`holdings failed: ${holdings.status}`);
  const hasSymbol = (holdings.json.list || []).some(h => h.symbol === '600519.SH');
  if (hasSymbol) throw new Error('holding should be rebuilt/removed after deleting only buy trade');

  const summary = await requestJson('GET', '/api/assets/summary', token);
  if (summary.status !== 200) throw new Error(`summary failed: ${summary.status}`);

  console.log('verify_delete_trade_rebuild ok');
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

const http = require('http');

const requestJson = (method, path, token, body) => new Promise((resolve, reject) => {
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  const req = http.request({
    host: '127.0.0.1',
    port: 8080,
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

  await requestJson('POST', '/api/transfers', token, { type: 'IN', amount: 10000, currency: 'CNY', date: '2026-03-21' });
  await requestJson('POST', '/api/trades', token, { symbol: '600519.SH', type: 'BUY', price: 1000, quantity: 1, date: '2026-03-21', currency: 'CNY', market: 'SH', commission: 0 });

  const summary = await requestJson('GET', '/api/assets/summary', token);
  if (summary.status !== 200) throw new Error(`summary failed: ${summary.status}`);

  const curve = await requestJson('GET', '/api/assets/profit-curve?range=month', token);
  if (curve.status !== 200) throw new Error(`curve failed: ${curve.status}`);
  if (!Array.isArray(curve.json.data) || curve.json.data.length === 0) {
    throw new Error('profit-curve should have at least one record');
  }

  const calendar = await requestJson('GET', '/api/assets/profit-calendar', token);
  if (calendar.status !== 200) throw new Error(`calendar failed: ${calendar.status}`);
  const keys = Object.keys(calendar.json.dailyProfits || {});
  if (keys.length === 0) throw new Error('profit-calendar should have at least one day');

  console.log('verify_profit_history ok');
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

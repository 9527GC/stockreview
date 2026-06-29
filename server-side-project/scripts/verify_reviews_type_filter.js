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

const ensureAllType = (list, expected, label) => {
  if (!Array.isArray(list) || list.length === 0) throw new Error(`${label}: empty list`);
  if (!list.every(item => item.type === expected)) {
    throw new Error(`${label}: expected all ${expected}, got ${list.map(x => x.type).join(',')}`);
  }
};

const run = async () => {
  const login = await requestJson('POST', '/api/auth/login', null, { username: 'testuser', password: 'password123' });
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
  const token = login.json.token;

  await requestJson('POST', '/api/transfers', token, { type: 'IN', amount: 100000, currency: 'CNY', date: '2025-05-01' });

  const trades = [
    { symbol: '600519.SH', type: 'BUY', date: '2025-05-03', price: 1000, quantity: 1 },
    { symbol: '600519.SH', type: 'SELL', date: '2025-05-03', price: 1010, quantity: 1 },
    { symbol: '000001.SZ', type: 'BUY', date: '2025-05-03', price: 10, quantity: 100 },
    { symbol: '000001.SZ', type: 'SELL', date: '2025-05-04', price: 11, quantity: 100 }
  ];

  for (let i = 0; i < 12; i += 1) {
    trades.push({ symbol: '300750.SZ', type: 'BUY', date: '2025-05-05', price: 200 + i, quantity: 1 });
  }

  for (const trade of trades) {
    const created = await requestJson('POST', '/api/trades', token, {
      ...trade,
      currency: 'CNY',
      market: trade.symbol.endsWith('.SZ') ? 'SZ' : 'SH',
      commission: 0
    });
    if (created.status !== 201) throw new Error(`create trade failed: ${created.status}`);
  }

  const buyOnly = await requestJson('GET', '/api/trades/reviews?type=BUY&page=1&pageSize=50', token);
  if (buyOnly.status !== 200) throw new Error(`buyOnly failed: ${buyOnly.status}`);
  ensureAllType(buyOnly.json.list, 'BUY', 'buyOnly');

  const sellOnly = await requestJson('GET', '/api/trades/reviews?type=SELL&page=1&pageSize=50', token);
  if (sellOnly.status !== 200) throw new Error(`sellOnly failed: ${sellOnly.status}`);
  ensureAllType(sellOnly.json.list, 'SELL', 'sellOnly');

  const symbolType = await requestJson('GET', '/api/trades/reviews?symbol=600519.SH&type=BUY&page=1&pageSize=50', token);
  if (symbolType.status !== 200) throw new Error(`symbolType failed: ${symbolType.status}`);
  ensureAllType(symbolType.json.list, 'BUY', 'symbolType');
  if (!symbolType.json.list.every(item => item.symbol === '600519.SH')) throw new Error('symbolType: symbol filter failed');

  const dateType = await requestJson('GET', '/api/trades/reviews?date=2025-05-03&type=BUY&page=1&pageSize=50', token);
  if (dateType.status !== 200) throw new Error(`dateType failed: ${dateType.status}`);
  ensureAllType(dateType.json.list, 'BUY', 'dateType');
  if (dateType.json.total !== 2) throw new Error(`dateType: expected total 2, got ${dateType.json.total}`);

  const comboPage1 = await requestJson('GET', '/api/trades/reviews?symbol=300750.SZ&date=2025-05-05&type=BUY&page=1&pageSize=10', token);
  const comboPage2 = await requestJson('GET', '/api/trades/reviews?symbol=300750.SZ&date=2025-05-05&type=BUY&page=2&pageSize=10', token);
  if (comboPage1.status !== 200 || comboPage2.status !== 200) throw new Error('combo paging failed');
  ensureAllType(comboPage1.json.list, 'BUY', 'comboPage1');
  ensureAllType(comboPage2.json.list, 'BUY', 'comboPage2');
  if (comboPage1.json.total !== 12 || comboPage2.json.total !== 12) throw new Error(`combo total failed: ${comboPage1.json.total}/${comboPage2.json.total}`);
  if (comboPage1.json.list.length !== 10) throw new Error(`combo page1 size failed: ${comboPage1.json.list.length}`);
  if (comboPage2.json.list.length !== 2) throw new Error(`combo page2 size failed: ${comboPage2.json.list.length}`);
  if (!comboPage2.json.list.every(item => item.symbol === '300750.SZ')) {
    throw new Error('combo page2 combined filters failed');
  }

  console.log('verify_reviews_type_filter ok');
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

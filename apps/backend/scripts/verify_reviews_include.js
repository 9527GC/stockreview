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

  await requestJson('POST', '/api/transfers', token, { type: 'IN', amount: 10000, currency: 'CNY', date: '2026-03-21' });
  const create = await requestJson('POST', '/api/trades', token, {
    symbol: '600519.SH',
    type: 'BUY',
    price: 1000,
    quantity: 1,
    date: '2026-03-21',
    currency: 'CNY',
    market: 'SH',
    commission: 0,
    mood: 'calm',
    news: "<script>alert(1)</script><p>ok</p>",
    marketOverview: { index: 3050.12, volume: 9800000000, volumeChangeRatio: -450000000 }
  });
  if (create.status !== 201) throw new Error(`create trade failed: ${create.status}`);

  const listFull = await requestJson('GET', '/api/trades/reviews?page=1&pageSize=10', token);
  if (listFull.status !== 200) throw new Error(`reviews failed: ${listFull.status}`);
  const item = listFull.json.list?.[0];
  if (!item || !item.symbol) throw new Error('missing symbol');
  if (item.mood !== 'CALM') throw new Error('mood should be uppercased');
  if (!('marketOverview' in item)) throw new Error('missing marketOverview');
  if (!('news' in item)) throw new Error('missing news');
  if (String(item.news || '').includes('<script')) throw new Error('news not sanitized');

  const listLight = await requestJson('GET', '/api/trades/reviews?page=1&pageSize=10&include=', token);
  if (listLight.status !== 200) throw new Error(`reviews include empty failed: ${listLight.status}`);
  const item2 = listLight.json.list?.[0];
  if (!item2) throw new Error('missing item2');
  if ('marketOverview' in item2) throw new Error('marketOverview should be omitted when include empty');
  if ('news' in item2) throw new Error('news should be omitted when include empty');

  const detail = await requestJson('GET', `/api/trades/reviews/${item.id}`, token);
  if (detail.status !== 200) throw new Error(`detail failed: ${detail.status}`);
  if (!('marketOverview' in detail.json)) throw new Error('detail missing marketOverview');

  console.log('verify_reviews_include ok');
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});


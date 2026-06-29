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

const ensureBenchmarkLooksValid = (payload, label) => {
  if (!payload || !Array.isArray(payload.data)) throw new Error(`${label}: invalid payload`);
  const values = payload.data.map(item => item.benchmark).filter(v => v !== null && v !== undefined);
  if (values.length === 0) throw new Error(`${label}: all benchmark values are null`);
  if (values.every(v => Number(v) === 0)) throw new Error(`${label}: benchmark still all zero`);
};

const run = async () => {
  const login = await requestJson('POST', '/api/auth/login', null, { username: 'testuser', password: 'password123' });
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
  const token = login.json.token;

  for (const range of ['month', 'quarter', 'year', 'all']) {
    const res = await requestJson('GET', `/api/assets/profit-curve?range=${range}`, token);
    if (res.status !== 200) throw new Error(`${range}: request failed ${res.status}`);
    ensureBenchmarkLooksValid(res.json, range);
  }

  console.log('verify_profit_curve_benchmark ok');
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

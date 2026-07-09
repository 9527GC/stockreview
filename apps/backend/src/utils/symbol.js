const normalizeSymbol = (symbol) => {
  const s = String(symbol || '').trim();
  if (!s) return '';

  const upper = s.toUpperCase();

  const mSuffix = upper.match(/^(\d+)\.(SH|SZ|HK|US)$/);
  if (mSuffix) return `${mSuffix[1]}.${mSuffix[2]}`;

  const mPrefix = upper.match(/^(SH|SZ|HK)(\d{5,6})$/);
  if (mPrefix) return `${mPrefix[2]}.${mPrefix[1]}`;

  const mUS1 = upper.match(/^US\.([A-Z.]+)$/);
  if (mUS1) return `${mUS1[1]}.US`;

  const mUS2 = upper.match(/^([A-Z.]+)\.US$/);
  if (mUS2) return `${mUS2[1]}.US`;

  if (/^[A-Z.]+$/.test(upper) && !upper.includes('.')) {
    return `${upper}.US`;
  }

  return upper;
};

const buildSymbolAliases = (symbol) => {
  const raw = String(symbol || '').trim();
  const norm = normalizeSymbol(raw);

  const set = new Set();
  if (raw) set.add(raw);
  if (raw) set.add(raw.toUpperCase());
  if (norm) set.add(norm);

  const m = norm.match(/^(\d+)\.(SH|SZ|HK|US)$/);
  if (m) {
    const code = m[1];
    const market = m[2];
    if (market === 'SH' || market === 'SZ' || market === 'HK') {
      set.add(`${market}${code}`);
      set.add(`${market.toLowerCase()}${code}`);
      set.add(`${code}.${market.toLowerCase()}`);
      set.add(code); // 兼容纯数字代码入库的情况（如 600519）
    } else if (market === 'US') {
      set.add(code);
      set.add(code.toLowerCase());
      set.add(`US.${code}`);
      set.add(`us.${code.toLowerCase()}`);
    }
  }

  return Array.from(set);
};

module.exports = { normalizeSymbol, buildSymbolAliases };


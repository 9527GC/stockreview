export const normalizeSymbol = (input) => {
  if (input === null || input === undefined) return input;
  const raw = String(input).trim();
  if (!raw) return raw;
  const upper = raw.toUpperCase();

  if (/^\d{6}\.(SH|SZ|BJ)$/.test(upper)) return upper;
  if (/^\d{5}\.HK$/.test(upper)) return upper;
  if (/^[A-Z]{1,8}\.US$/.test(upper)) return upper;

  if (/^(SH|SZ|BJ)\d{6}$/.test(upper)) {
    const market = upper.slice(0, 2);
    const code = upper.slice(2);
    return `${code}.${market}`;
  }

  if (/^\d{6}$/.test(upper)) {
    if (upper.startsWith('6')) return `${upper}.SH`;
    if (upper.startsWith('0') || upper.startsWith('3')) return `${upper}.SZ`;
    if (upper.startsWith('8') || upper.startsWith('4')) return `${upper}.BJ`;
    return `${upper}.SH`;
  }

  if (/^\d{1,5}$/.test(upper)) {
    return `${upper.padStart(5, '0')}.HK`;
  }

  if (/^[A-Z]{1,8}$/.test(upper)) {
    return `${upper}.US`;
  }

  return upper;
};

export const inferMarketFromSymbol = (symbol) => {
  const s = String(symbol || '').toUpperCase();
  if (s.endsWith('.SH') || s.endsWith('.SZ') || s.endsWith('.BJ')) return 'CN';
  if (s.endsWith('.HK')) return 'HK';
  if (s.endsWith('.US')) return 'US';
  return 'CN';
};

export const buildSymbolAliases = (symbol) => {
  const normalized = normalizeSymbol(symbol);
  if (!normalized || typeof normalized !== 'string') return [];
  const parts = normalized.split('.');
  const code = parts[0];
  const suffix = parts[1] || '';
  const aliases = [normalized];
  if (suffix) aliases.push(`${suffix}${code}`);
  aliases.push(code);
  return aliases;
};

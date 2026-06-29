const { normalizeSymbol, buildSymbolAliases } = require('../src/utils/symbol');

const assertEq = (a, b, msg) => {
  if (a !== b) {
    console.error(`${msg}: expected ${b}, got ${a}`);
    process.exit(1);
  }
};

assertEq(normalizeSymbol('SH600519'), '600519.SH', 'normalize SH prefix');
assertEq(normalizeSymbol('600519.SH'), '600519.SH', 'normalize SH suffix');
assertEq(normalizeSymbol('AAPL'), 'AAPL.US', 'normalize US');

const aliases = new Set(buildSymbolAliases('SH600519'));
if (!aliases.has('600519.SH') || !aliases.has('SH600519')) {
  console.error('aliases missing expected forms');
  process.exit(1);
}

console.log('verify_symbol ok');


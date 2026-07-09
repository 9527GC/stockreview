/**
 * 统一后端错误提示消息（英文）
 */
module.exports = {
  // Auth
  INVALID_CREDENTIALS: 'Invalid credentials',
  USER_NOT_FOUND: 'User not found',
  USERNAME_PASSWORD_REQUIRED: 'Username and password are required',
  USERNAME_TOO_SHORT: 'Username must be at least 3 characters',
  PASSWORD_TOO_SHORT: 'Password must be at least 6 characters',
  USERNAME_EXISTS: 'Username already exists',
  OLD_NEW_PASSWORD_REQUIRED: 'Old password and new password are required',
  INCORRECT_OLD_PASSWORD: 'Incorrect old password',
  TOKEN_REQUIRED: 'Token is required',
  TOKEN_EXPIRED: 'Token expired',
  TOKEN_INVALID: 'Invalid token',
  TOKEN_REVOKED: 'Token revoked',
  AUTH_REQUIRED: 'Authentication required',

  // Trade
  TRADE_NOT_FOUND: 'Trade not found',
  HOLDING_NOT_FOUND_OR_UNAUTHORIZED: 'Holding not found or unauthorized',
  FIELD_NOT_ALLOWED: (label) => `Modification of ${label} is not allowed`,
  INVALID_TRADE_ID: 'Invalid trade id',
  INVALID_DATE: 'Invalid date',
  SYMBOL_REQUIRED: 'Symbol is required',
  TYPE_MUST_BE_BUY_OR_SELL: 'Type must be BUY or SELL',
  TYPE_MUST_BE_IN_OR_OUT: 'Type must be IN or OUT',
  PRICE_MUST_BE_POSITIVE: 'Price must be a positive number',
  QUANTITY_MUST_BE_POSITIVE: 'Quantity must be a positive number',
  COMMISSION_MUST_BE_NON_NEGATIVE: 'Commission must be non-negative',
  NO_HOLDINGS_FOR_SYMBOL: 'No holdings available for this symbol',
  SELL_QUANTITY_EXCEEDS_HOLDING: 'Sell quantity exceeds holding quantity',
  QUANTITY_EXCEEDS_HOLDING_AT_DATE: (name, symbol, date, max) =>
    `Sell quantity exceeds holding: ${name || symbol} at ${date} max available ${max}`,

  // Transfer
  INSUFFICIENT_CASH: 'Insufficient cash',
  AMOUNT_MUST_BE_POSITIVE: 'Amount must be a positive number',

  // Market
  KEYWORD_REQUIRED: 'Keyword is required',
  KEYWORD_TOO_LONG: 'Keyword too long',
  KEYWORD_INVALID_CHARACTERS: 'Invalid keyword characters',

  // Generic
  INTERNAL_SERVER_ERROR: 'Internal server error',
  CORS_NOT_ALLOWED: 'CORS policy: origin not allowed'
};

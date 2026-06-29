const sanitizeHtmlLib = require('sanitize-html');

const sanitizeHtml = (input) => {
  if (input === null || input === undefined) return null;
  return sanitizeHtmlLib(String(input), {
    allowedTags: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'span'],
    allowedAttributes: {
      a: ['href', 'target']
    }
  });
};

module.exports = { sanitizeHtml };

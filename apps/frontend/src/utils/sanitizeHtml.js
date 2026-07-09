/**
 * 前端 HTML 消毒工具
 * 由于 uni-app 需要兼容 H5/小程序，使用轻量级白名单正则实现，
 * 避免依赖 Node 流相关的 sanitize-html。
 */

const ALLOWED_TAGS = ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'span', 'img'];
const ALLOWED_ATTRIBUTES = {
  a: ['href', 'target'],
  img: ['src', 'alt'],
  span: ['style']
};

const escapeHtml = (text) => {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const sanitizeAttribute = (name, value) => {
  const lowerName = name.toLowerCase();
  if (lowerName.startsWith('on')) return ''; // 过滤事件处理器
  if (/^javascript:/i.test(value)) return ''; // 过滤 javascript: 协议
  return `${lowerName}="${escapeHtml(value)}"`;
};

const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)\/?>/g;

export const sanitizeHtml = (input) => {
  if (input == null) return '';
  const html = String(input);

  return html.replace(tagPattern, (match, tagName, attrs) => {
    const lowerTag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.includes(lowerTag)) return '';

    const isClosing = match.startsWith('</');
    if (isClosing) return `</${lowerTag}>`;

    const isSelfClosing = match.endsWith('/>') || ['br', 'img'].includes(lowerTag);

    // 解析属性
    const allowed = ALLOWED_ATTRIBUTES[lowerTag] || [];
    const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_:\-.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=>]+))/g;
    const sanitizedAttrs = [];
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      const name = attrMatch[1];
      const value = attrMatch[3] || attrMatch[4] || attrMatch[5] || '';
      if (allowed.includes(name.toLowerCase())) {
        const sanitized = sanitizeAttribute(name, value);
        if (sanitized) sanitizedAttrs.push(sanitized);
      }
    }

    if (isSelfClosing) {
      return `<${lowerTag}${sanitizedAttrs.length ? ' ' + sanitizedAttrs.join(' ') : ''} />`;
    }
    return `<${lowerTag}${sanitizedAttrs.length ? ' ' + sanitizedAttrs.join(' ') : ''}>`;
  });
};

export default sanitizeHtml;

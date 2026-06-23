/**
 * Format a number as Kenyan Shillings
 * e.g. 1500 → "1,500"
 */
const formatPrice = (amount) =>
  Number(amount || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

/**
 * Truncate a string to maxLen characters, appending "…" if cut
 */
const truncate = (str, maxLen) => {
  if (!str) return '';
  const s = String(str);
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
};

/**
 * Normalise any Kenyan phone number to 254XXXXXXXXX
 * Handles: 07xx, 01xx, +2547xx, 2547xx
 */
const sanitizePhone = (phone) => {
  let p = String(phone).replace(/[\s\-().]/g, '').replace(/[^0-9+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0'))  p = '254' + p.slice(1);
  if (!p.startsWith('254')) p = '254' + p;
  return p;
};

/**
 * Simple promise-based sleep
 */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Capitalise first letter of each word
 */
const titleCase = (str) =>
  String(str || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Return a friendly relative time string
 */
const timeAgo = (dateStr) => {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) !== 1 ? 's' : ''} ago`;
};

module.exports = { formatPrice, truncate, sanitizePhone, sleep, titleCase, timeAgo };

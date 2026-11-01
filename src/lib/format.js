// Sizes as people read them, e.g. "3.2 MB". Kept free of Electrobun so it can be unit tested.

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

// 1536 -> "1.5 KB", 10485760 -> "10 MB": one decimal below 10, none above.
function formatBytes(bytes) {
  let value = Math.max(0, bytes || 0);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const text = unit === 0 || value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
  return `${text} ${UNITS[unit]}`;
}

module.exports = { formatBytes };

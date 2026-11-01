// Sizes and times as people read them, e.g. "3.2 MB" and "2 min". Kept free of Electron so it
// can be unit tested.

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

// Seconds -> "2 s", "5 min", "1 h 20 min" (rounded up to a second, then to a minute).
function formatDuration(seconds) {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s} s`;
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

module.exports = { formatBytes, formatDuration };

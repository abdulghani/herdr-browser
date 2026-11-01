// Turning what the user types or presses into something to act on. Kept free of Electron so it
// can be unit tested.

const HOME_URL = 'https://www.google.com';
const SEARCH_URL = 'https://www.google.com/search?q=';

// Address bar text -> URL: a URL with a scheme as is, something that looks like a host gets
// http(s)://, anything else is searched for.
function normalizeUrl(input) {
  const text = input.trim();
  if (!text) return HOME_URL;
  // A scheme, but not a host with a port like localhost:3000.
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text)) return text;
  if (/^localhost(:\d+)?(\/|$)/.test(text) || /^[\d.]+(:\d+)?(\/|$)/.test(text)) return `http://${text}`;
  if (!/\s/.test(text) && /\.[a-z]{2,}(:\d+)?(\/|$)/i.test(text)) return `https://${text}`;
  return SEARCH_URL + encodeURIComponent(text);
}

// A key press -> the name used in the key tables, e.g. "cmd+shift+t". Modifiers always come in
// the order ctrl, alt, cmd, shift.
const KEY_NAMES = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ' ': 'space',
  Tab: 'tab',
  '+': '=',
  _: '-',
  '{': '[',
  '}': ']',
};

function chordOf(input) {
  const key = input.code === 'Space' ? 'space' : KEY_NAMES[input.key] || input.key.toLowerCase();
  if (input.key === '?') return '?';
  const mods = [];
  if (input.control) mods.push('ctrl');
  if (input.alt) mods.push('alt');
  if (input.meta) mods.push('cmd');
  if (input.shift) mods.push('shift');
  return [...mods, key].join('+');
}

module.exports = { HOME_URL, SEARCH_URL, normalizeUrl, chordOf };

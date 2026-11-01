// A key press -> the name used in the key tables, e.g. "cmd+shift+t". Modifiers always come in
// the order ctrl, alt, cmd, shift. Kept free of Electrobun so it can be unit tested.
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

module.exports = { chordOf };

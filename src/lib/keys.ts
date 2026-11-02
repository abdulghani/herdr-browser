// A key press -> the name used in the key tables, e.g. "cmd+shift+t". Modifiers always come in
// the order ctrl, alt, cmd, shift. Kept free of Electron so it can be unit tested.
const KEY_NAMES: Record<string, string> = {
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

// The fields of a key press it reads (Electron's Input has them all).
export interface KeyPress {
  key: string;
  code: string;
  control?: boolean;
  alt?: boolean;
  meta?: boolean;
  shift?: boolean;
}

export function chordOf(input: KeyPress): string {
  const key = input.code === 'Space' ? 'space' : KEY_NAMES[input.key] || input.key.toLowerCase();
  if (input.key === '?') return '?';
  const mods = [];
  if (input.control) mods.push('ctrl');
  if (input.alt) mods.push('alt');
  if (input.meta) mods.push('cmd');
  if (input.shift) mods.push('shift');
  return [...mods, key].join('+');
}

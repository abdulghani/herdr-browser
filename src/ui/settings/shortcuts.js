// The keys listed on the Shortcuts tab: [action, keys elsewhere, keys on macOS (when different)].
const SHORTCUTS = [
  ['New tab', 'Ctrl+T', 'Cmd+T'],
  ['Close tab', 'Ctrl+W'],
  ['Reopen closed tab', null, 'Cmd+Shift+T'],
  ['New workspace', 'Ctrl+Shift+T'],
  ['Next / previous tab', 'Alt+→ / Alt+←, Ctrl+Tab'],
  ['Jump to tab', 'Alt+1–9', 'Cmd+1–9'],
  ['Next / previous workspace', 'Alt+↓ / Alt+↑'],
  ['Jump to workspace', 'Ctrl+1–9'],
  ['Move tab / workspace', 'Alt+Shift+arrows'],
  ['Address bar', 'Ctrl+L', 'Cmd+L'],
  ['Find in page', 'Ctrl+F', 'Cmd+F'],
  ['Downloads', 'Ctrl+J', 'Cmd+Option+L'],
  ['Back / forward', 'Ctrl+[ / Ctrl+]'],
  ['Reload', 'Ctrl+R'],
  ['Collapse sidebar', 'Ctrl+B'],
  ['Developer tools', 'Ctrl+Shift+I', 'Cmd+Shift+J'],
  ['Settings', 'Ctrl+,', 'Cmd+,'],
  ['Rename tab / workspace', 'Prefix R / Prefix Shift+R'],
  ['Show key help', 'Prefix ?'],
];

// [[action, keys]] for a platform ('darwin', 'linux', ...).
export function shortcutsFor(platform) {
  const mac = platform === 'darwin';
  return SHORTCUTS.map(([action, other, macKeys]) => [action, mac ? macKeys || other : other]).filter(([, keys]) => keys);
}

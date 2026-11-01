// Small text helpers for the browser UI.

export const tabLabel = (tab) => tab.customName || tab.title || tab.url;

// "claims migration" -> "CM", "research" -> "RE"
export function initials(name) {
  const words = name
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (!words.length) return '?';
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

// The tooltip of a workspace: its name, how many tabs, and their titles.
export const workspaceTitle = (ws) => `${ws.name} (${ws.tabs.length} tabs)\n${ws.tabs.map((t) => `  ${tabLabel(t)}`).join('\n')}`;

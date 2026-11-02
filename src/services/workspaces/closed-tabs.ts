// Reopening closed tabs and workspaces (Cmd+Shift+T, like Chrome).
import { BLANK_URL } from '../../lib/url';
import type { Ctx, Tab, TabHistory } from '../../types';

// What is kept of a closed tab: its fields and back/forward history.
export type TabSnapshot = Pick<Tab, 'url' | 'title' | 'favicon' | 'customName'> & { history?: TabHistory };

// A closed tab (where it was) or a whole closed workspace.
export type ClosedEntry =
  | { kind: 'tab'; wsId: string; wsName: string; index: number; tab: TabSnapshot }
  | { kind: 'workspace'; index: number; ws: { name: string; activeTab: number; tabs: TabSnapshot[] } };

const MAX_CLOSED = 25;

export function createClosedTabs(ctx: Ctx) {
  const closedStack: ClosedEntry[] = []; // oldest first; saved with the session so it survives a restart

  // What is saved of a tab, in the session and here.
  const snapshot = (tab: Tab): TabSnapshot => {
    const { url, title, favicon, customName } = tab;
    return { url, title, favicon, customName, history: ctx.views.historyOf(tab.id) };
  };

  // A blank tab that never went anywhere isn't worth reopening.
  const isEmptyTab = (snap: TabSnapshot) => snap.url === BLANK_URL && !((snap.history?.entries.length ?? 0) > 1);

  function remember(entry: ClosedEntry) {
    const tabs = entry.kind === 'tab' ? [entry.tab] : entry.ws.tabs;
    if (tabs.every(isEmptyTab)) return;
    closedStack.push(entry);
    if (closedStack.length > MAX_CLOSED) closedStack.shift();
  }

  // The list saved with the session, and loading it back.
  const list = () => closedStack;
  function restore(saved: unknown) {
    if (Array.isArray(saved)) closedStack.push(...saved.slice(-MAX_CLOSED));
  }

  function tabFromSnapshot({ history, ...fields }: TabSnapshot): Tab {
    const tab: Tab = { ...ctx.workspaces.newTab(fields.url), ...fields };
    if (history) ctx.sleeping.keepHistory(tab.id, history);
    return tab;
  }

  function reopenTab(entry: Extract<ClosedEntry, { kind: 'tab' }>) {
    const { state, workspaces } = ctx;
    // Back into its workspace if that's still open (ids change across restarts, so fall back to the name).
    const ws =
      state.workspaces.find((w) => w.id === entry.wsId) || state.workspaces.find((w) => w.name === entry.wsName) || workspaces.activeWs();
    const index = Math.min(entry.index, ws.tabs.length);
    ws.tabs.splice(index, 0, tabFromSnapshot(entry.tab));
    state.activeWs = state.workspaces.indexOf(ws);
    ws.activeTab = index;
  }

  function reopenWorkspace(entry: Extract<ClosedEntry, { kind: 'workspace' }>) {
    const { state } = ctx;
    const ws = { ...ctx.workspaces.newWorkspace(entry.ws.name), tabs: entry.ws.tabs.map(tabFromSnapshot) };
    ws.activeTab = Math.min(entry.ws.activeTab || 0, ws.tabs.length - 1);
    const index = Math.min(entry.index, state.workspaces.length);
    state.workspaces.splice(index, 0, ws);
    state.activeWs = index;
  }

  function reopen() {
    const entry = closedStack.pop();
    if (!entry) return;
    if (entry.kind === 'tab') reopenTab(entry);
    else reopenWorkspace(entry);
    ctx.views.showActive();
  }

  return { snapshot, remember, list, restore, reopen };
}

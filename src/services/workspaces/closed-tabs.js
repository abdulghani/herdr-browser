// Reopening closed tabs and workspaces (Cmd+Shift+T, like Chrome).
const { BLANK_URL } = require('../../lib/url');

const MAX_CLOSED = 25;

function createClosedTabs(ctx) {
  const closedStack = []; // oldest first; saved with the session so it survives a restart

  // What is saved of a tab, in the session and here.
  const snapshot = (tab) => {
    const { url, title, favicon, customName } = tab;
    return { url, title, favicon, customName, history: ctx.views.historyOf(tab.id) };
  };

  // A blank tab that never went anywhere isn't worth reopening.
  const isEmptyTab = (snap) => snap.url === BLANK_URL && !(snap.history?.entries.length > 1);

  function remember(entry) {
    const tabs = entry.kind === 'tab' ? [entry.tab] : entry.ws.tabs;
    if (tabs.every(isEmptyTab)) return;
    closedStack.push(entry);
    if (closedStack.length > MAX_CLOSED) closedStack.shift();
  }

  // The list saved with the session, and loading it back.
  const list = () => closedStack;
  function restore(saved) {
    if (Array.isArray(saved)) closedStack.push(...saved.slice(-MAX_CLOSED));
  }

  function tabFromSnapshot({ history, ...fields }) {
    const tab = { ...ctx.workspaces.newTab(fields.url), ...fields };
    if (history) ctx.sleeping.keepHistory(tab.id, history);
    return tab;
  }

  function reopenTab(entry) {
    const { state, workspaces } = ctx;
    // Back into its workspace if that's still open (ids change across restarts, so fall back to the name).
    const ws =
      state.workspaces.find((w) => w.id === entry.wsId) || state.workspaces.find((w) => w.name === entry.wsName) || workspaces.activeWs();
    const index = Math.min(entry.index, ws.tabs.length);
    ws.tabs.splice(index, 0, tabFromSnapshot(entry.tab));
    state.activeWs = state.workspaces.indexOf(ws);
    ws.activeTab = index;
  }

  function reopenWorkspace(entry) {
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

module.exports = { createClosedTabs };

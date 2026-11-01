// Workspaces (sidebar entries, vertical) and their tabs (tab strip entries, horizontal): the
// state the browser UI draws, and the actions that change it.
const { BLANK_URL, SETTINGS_URL } = require('../../lib/url');

function createWorkspaces(ctx) {
  let nextId = 1;
  const newId = (prefix) => `${prefix}${nextId++}`;

  const newTab = (url = BLANK_URL) => ({ id: newId('t'), url, title: 'New Tab', favicon: null });
  const newWorkspace = (name) => ({
    id: newId('w'),
    name: name || `workspace ${ctx.state ? ctx.state.workspaces.length + 1 : 1}`,
    tabs: [newTab()],
    activeTab: 0,
  });

  const activeWs = () => ctx.state.workspaces[ctx.state.activeWs];
  const activeTab = () => activeWs().tabs[activeWs().activeTab];

  function findTab(tabId) {
    for (const ws of ctx.state.workspaces) {
      const idx = ws.tabs.findIndex((t) => t.id === tabId);
      if (idx !== -1) return { ws, tab: ws.tabs[idx], idx };
    }
    return null;
  }

  // Send the state to the browser UI and save the session soon.
  function broadcast() {
    const { win } = ctx;
    if (!win || win.isDestroyed()) return;
    const tab = activeTab();
    const wc = ctx.views.get(tab.id)?.webContents;
    win.webContents.send('state', {
      ...ctx.state,
      prefixArmed: ctx.keyboard.prefixArmed(),
      awake: ctx.views.awake(),
      find: ctx.find.get(tab.id) || null,
      nav: {
        canGoBack: wc ? wc.navigationHistory.canGoBack() : false,
        canGoForward: wc ? wc.navigationHistory.canGoForward() : false,
        loading: wc ? wc.isLoading() : false,
      },
    });
    win.setTitle(`${tab.title} — ${activeWs().name}`);
    ctx.session.saveSoon();
  }

  // ---------- tabs ----------

  function openTab(url = BLANK_URL, ws = activeWs(), index = ws.tabs.length) {
    const tab = newTab(url);
    ws.tabs.splice(index, 0, tab);
    ctx.state.activeWs = ctx.state.workspaces.indexOf(ws);
    ws.activeTab = index;
    ctx.views.showActive();
    if (url === BLANK_URL) focusAddressBar();
    return tab;
  }

  function closeTab(tabId = activeTab().id) {
    const found = findTab(tabId);
    if (!found) return;
    const { ws, idx } = found;
    // Closing the last tab closes the workspace, like herdr.
    if (ws.tabs.length === 1) return closeWorkspace(ws.id);
    ctx.closedTabs.remember({ kind: 'tab', wsId: ws.id, wsName: ws.name, index: idx, tab: ctx.closedTabs.snapshot(found.tab) });
    ctx.views.discard(tabId);
    ws.tabs.splice(idx, 1);
    if (ws.activeTab >= idx) ws.activeTab = Math.max(0, ws.activeTab - 1);
    if (idx === 0) ws.activeTab = 0;
    ctx.views.showActive();
  }

  function selectTab(index) {
    const ws = activeWs();
    if (index < 0 || index >= ws.tabs.length) return;
    ws.activeTab = index;
    ctx.views.showActive();
  }

  // Select a tab in any workspace.
  function selectTabById(tabId) {
    const found = findTab(tabId);
    if (!found) return;
    ctx.state.activeWs = ctx.state.workspaces.indexOf(found.ws);
    found.ws.activeTab = found.idx;
    ctx.views.showActive();
  }

  const cycleTab = (delta) => {
    const ws = activeWs();
    selectTab((ws.activeTab + delta + ws.tabs.length) % ws.tabs.length);
  };

  function moveTab(delta) {
    const ws = activeWs();
    const from = ws.activeTab;
    const to = from + delta;
    if (to < 0 || to >= ws.tabs.length) return;
    [ws.tabs[from], ws.tabs[to]] = [ws.tabs[to], ws.tabs[from]];
    ws.activeTab = to;
    broadcast();
  }

  // Drag & drop: reorder tabs, or drop a tab onto another workspace to move it there.
  function moveTabTo({ tabId, wsId, index }) {
    const found = findTab(tabId);
    const target = ctx.state.workspaces.find((w) => w.id === wsId);
    if (!found || !target) return;
    const wasActive = activeTab().id === tabId;
    found.ws.tabs.splice(found.idx, 1);
    if (target === found.ws && index > found.idx) index--;
    index = Math.min(Math.max(index ?? target.tabs.length, 0), target.tabs.length);
    target.tabs.splice(index, 0, found.tab);
    if (!found.ws.tabs.length) found.ws.tabs.push(newTab());
    found.ws.activeTab = Math.min(found.ws.activeTab, found.ws.tabs.length - 1);
    if (wasActive || target !== found.ws) {
      ctx.state.activeWs = ctx.state.workspaces.indexOf(target);
      target.activeTab = target.tabs.indexOf(found.tab);
    }
    ctx.views.showActive();
  }

  function renameTab({ id, name }) {
    const found = findTab(id);
    if (found) found.tab.customName = name.trim() || undefined;
    broadcast();
  }

  // ---------- workspaces ----------

  function requestRename(kind, id) {
    ctx.win.webContents.focus();
    ctx.win.webContents.send('rename', { kind, id });
  }

  function addWorkspace() {
    const ws = newWorkspace();
    ctx.state.workspaces.push(ws);
    ctx.state.activeWs = ctx.state.workspaces.length - 1;
    // Hold off loading the page until the name is entered; a loading page steals focus from the input.
    ctx.views.hideShown();
    broadcast();
    requestRename('workspace', ws.id);
  }

  function closeWorkspace(wsId = activeWs().id) {
    const { state } = ctx;
    const idx = state.workspaces.findIndex((w) => w.id === wsId);
    if (idx === -1) return;
    const ws = state.workspaces[idx];
    ctx.closedTabs.remember({
      kind: 'workspace',
      index: idx,
      ws: { name: ws.name, activeTab: ws.activeTab, tabs: ws.tabs.map(ctx.closedTabs.snapshot) },
    });
    for (const t of ws.tabs) ctx.views.discard(t.id);
    state.workspaces.splice(idx, 1);
    if (!state.workspaces.length) state.workspaces.push(newWorkspace('main'));
    if (state.activeWs >= idx) state.activeWs = Math.max(0, state.activeWs - 1);
    ctx.views.showActive();
  }

  function selectWorkspace(index) {
    if (index < 0 || index >= ctx.state.workspaces.length) return;
    ctx.state.activeWs = index;
    ctx.views.showActive();
  }

  const cycleWorkspace = (delta) =>
    selectWorkspace((ctx.state.activeWs + delta + ctx.state.workspaces.length) % ctx.state.workspaces.length);

  function moveWorkspace(delta) {
    const from = ctx.state.activeWs;
    const to = from + delta;
    if (to < 0 || to >= ctx.state.workspaces.length) return;
    const list = ctx.state.workspaces;
    [list[from], list[to]] = [list[to], list[from]];
    ctx.state.activeWs = to;
    broadcast();
  }

  // Drag & drop in the sidebar.
  function moveWorkspaceTo({ wsId, index }) {
    const { state } = ctx;
    const from = state.workspaces.findIndex((w) => w.id === wsId);
    if (from === -1) return;
    const current = activeWs();
    const [ws] = state.workspaces.splice(from, 1);
    if (index > from) index--;
    state.workspaces.splice(Math.min(index, state.workspaces.length), 0, ws);
    state.activeWs = state.workspaces.indexOf(current);
    broadcast();
  }

  function renameWorkspace({ id, name }) {
    const ws = ctx.state.workspaces.find((w) => w.id === id);
    if (ws && name.trim()) ws.name = name.trim();
    broadcast();
  }

  // ---------- window ----------

  function toggleSidebar() {
    ctx.state.sidebarCollapsed = !ctx.state.sidebarCollapsed;
    ctx.views.layout();
    broadcast();
  }

  // Settings open in a tab; if one is already open anywhere, switch to it.
  function openSettings() {
    const found = ctx.state.workspaces.flatMap((ws) => ws.tabs).find((t) => t.url.startsWith('herdr://settings'));
    if (found) return selectTabById(found.id);
    openTab(SETTINGS_URL, activeWs(), activeWs().activeTab + 1);
  }

  function focusAddressBar() {
    ctx.win.webContents.focus();
    ctx.win.webContents.send('focus-address');
  }

  return {
    newId,
    newTab,
    newWorkspace,
    activeWs,
    activeTab,
    findTab,
    broadcast,
    openTab,
    closeTab,
    selectTab,
    selectTabById,
    cycleTab,
    moveTab,
    moveTabTo,
    renameTab,
    requestRename,
    addWorkspace,
    closeWorkspace,
    selectWorkspace,
    cycleWorkspace,
    moveWorkspace,
    moveWorkspaceTo,
    renameWorkspace,
    toggleSidebar,
    openSettings,
    focusAddressBar,
  };
}

module.exports = { createWorkspaces };

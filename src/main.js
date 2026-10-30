// Herdr Browser: herdr's layout applied to a Chromium browser.
// herdr workspace -> sidebar entry (vertical), herdr tab -> tab strip entry (horizontal).
const { app, BrowserWindow, WebContentsView, ipcMain, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const SIDEBAR_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 52; // icon rail, must match styles.css
const CHROME_HEIGHT = 76; // tab strip + toolbar, must match styles.css
const HOME_URL = 'https://www.google.com';
const SEARCH_URL = 'https://www.google.com/search?q=';

app.setName('Herdr Browser');
// Drop the "Electron/x" and app tokens so sites treat us as plain Chrome.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/, '')
  .replace(/\sherdr-browser\/\S+/i, '')
  .replace(/\sHerdr Browser\/\S+/i, '');

const sessionFile = () => path.join(app.getPath('userData'), 'session.json');

let win;
let state;
let nextId = 1;
const views = new Map(); // tabId -> WebContentsView
let shownTabId = null;
let prefixArmed = false;
let prefixTimer = null;
let saveTimer = null;

// ---------- state ----------

const newTab = (url = HOME_URL) => ({ id: `t${nextId++}`, url, title: 'New Tab', favicon: null });
const newWorkspace = (name) => {
  const ws = { id: `w${nextId++}`, name: name || `workspace ${state ? state.workspaces.length + 1 : 1}`, tabs: [newTab()], activeTab: 0 };
  return ws;
};

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(sessionFile(), 'utf8'));
    if (!saved.workspaces?.length) throw new Error('empty');
    for (const ws of saved.workspaces) {
      ws.id = `w${nextId++}`;
      for (const t of ws.tabs) Object.assign(t, { id: `t${nextId++}` });
      if (!ws.tabs.length) ws.tabs.push(newTab());
      ws.activeTab = Math.min(Math.max(ws.activeTab || 0, 0), ws.tabs.length - 1);
    }
    saved.activeWs = Math.min(Math.max(saved.activeWs || 0, 0), saved.workspaces.length - 1);
    return saved;
  } catch {
    return { workspaces: [newWorkspace('main')], activeWs: 0 };
  }
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 500);
}

function saveNow() {
  clearTimeout(saveTimer);
  const data = {
    version: 1,
    activeWs: state.activeWs,
    sidebarCollapsed: !!state.sidebarCollapsed,
    workspaces: state.workspaces.map((ws) => ({
      name: ws.name,
      activeTab: ws.activeTab,
      tabs: ws.tabs.map(({ url, title, favicon, customName }) => ({ url, title, favicon, customName })),
    })),
  };
  try {
    fs.writeFileSync(sessionFile(), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('session save failed', err);
  }
}

const activeWs = () => state.workspaces[state.activeWs];
const activeTab = () => activeWs().tabs[activeWs().activeTab];

function findTab(tabId) {
  for (const ws of state.workspaces) {
    const idx = ws.tabs.findIndex((t) => t.id === tabId);
    if (idx !== -1) return { ws, tab: ws.tabs[idx], idx };
  }
  return null;
}

function broadcast() {
  if (!win || win.isDestroyed()) return;
  const tab = activeTab();
  const wc = views.get(tab.id)?.webContents;
  win.webContents.send('state', {
    ...state,
    prefixArmed,
    nav: {
      canGoBack: wc ? wc.navigationHistory.canGoBack() : false,
      canGoForward: wc ? wc.navigationHistory.canGoForward() : false,
      loading: wc ? wc.isLoading() : false,
    },
  });
  win.setTitle(`${tab.title} — ${activeWs().name}`);
  saveSoon();
}

// ---------- tab views ----------

function contentBounds() {
  const [w, h] = win.getContentSize();
  const left = state.sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
  return { x: left, y: CHROME_HEIGHT, width: Math.max(0, w - left), height: Math.max(0, h - CHROME_HEIGHT) };
}

function createView(tab) {
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  const wc = view.webContents;
  views.set(tab.id, view);

  const update = (fields) => {
    const found = findTab(tab.id);
    if (!found) return;
    Object.assign(found.tab, fields);
    broadcast();
  };

  wc.on('page-title-updated', (_e, title) => update({ title }));
  wc.on('page-favicon-updated', (_e, favicons) => update({ favicon: favicons[0] || null }));
  wc.on('did-navigate', (_e, url) => update({ url }));
  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => isMainFrame && update({ url }));
  wc.on('did-start-loading', () => broadcast());
  wc.on('did-stop-loading', () => broadcast());
  wc.on('before-input-event', (event, input) => handleKey(event, input));
  wc.setWindowOpenHandler(({ url }) => {
    // Popups and target=_blank open as a new tab in the same workspace.
    const found = findTab(tab.id);
    if (found) openTab(url, found.ws, found.idx + 1);
    return { action: 'deny' };
  });
  wc.on('context-menu', (_e, params) => showContextMenu(wc, params, tab.id));

  wc.loadURL(tab.url).catch(() => {});
  return view;
}

function showActiveView() {
  const tab = activeTab();
  if (shownTabId && shownTabId !== tab.id) {
    const old = views.get(shownTabId);
    if (old) win.contentView.removeChildView(old);
  }
  // Views are created lazily, so restoring a big session doesn't load every page at once.
  const view = views.get(tab.id) || createView(tab);
  win.contentView.addChildView(view);
  view.setBounds(contentBounds());
  shownTabId = tab.id;
  view.webContents.focus();
  broadcast();
}

function destroyView(tabId) {
  const view = views.get(tabId);
  if (!view) return;
  if (shownTabId === tabId) {
    win.contentView.removeChildView(view);
    shownTabId = null;
  }
  view.webContents.close();
  views.delete(tabId);
}

// ---------- actions ----------

function normalizeUrl(input) {
  const text = input.trim();
  if (!text) return HOME_URL;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
  if (/^localhost(:\d+)?(\/|$)/.test(text) || /^[\d.]+(:\d+)?(\/|$)/.test(text)) return `http://${text}`;
  if (!/\s/.test(text) && /\.[a-z]{2,}(:\d+)?(\/|$)/i.test(text)) return `https://${text}`;
  return SEARCH_URL + encodeURIComponent(text);
}

function openTab(url = HOME_URL, ws = activeWs(), index = ws.tabs.length) {
  const tab = newTab(url);
  ws.tabs.splice(index, 0, tab);
  state.activeWs = state.workspaces.indexOf(ws);
  ws.activeTab = index;
  showActiveView();
  return tab;
}

function closeTab(tabId = activeTab().id) {
  const found = findTab(tabId);
  if (!found) return;
  const { ws, idx } = found;
  destroyView(tabId);
  ws.tabs.splice(idx, 1);
  if (!ws.tabs.length) {
    // Closing the last tab closes the workspace, like herdr.
    closeWorkspace(ws.id);
    return;
  }
  if (ws.activeTab >= idx) ws.activeTab = Math.max(0, ws.activeTab - 1);
  if (idx === 0) ws.activeTab = 0;
  showActiveView();
}

function selectTab(index) {
  const ws = activeWs();
  if (index < 0 || index >= ws.tabs.length) return;
  ws.activeTab = index;
  showActiveView();
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

function requestRename(kind, id) {
  win.webContents.focus();
  win.webContents.send('rename', { kind, id });
}

function newWorkspaceAction() {
  const ws = newWorkspace();
  state.workspaces.push(ws);
  state.activeWs = state.workspaces.length - 1;
  // Hold off loading the page until the name is entered; a loading page steals focus from the input.
  const shown = views.get(shownTabId);
  if (shown) win.contentView.removeChildView(shown);
  shownTabId = null;
  broadcast();
  requestRename('workspace', ws.id);
}

function closeWorkspace(wsId = activeWs().id) {
  const idx = state.workspaces.findIndex((w) => w.id === wsId);
  if (idx === -1) return;
  for (const t of state.workspaces[idx].tabs) destroyView(t.id);
  state.workspaces.splice(idx, 1);
  if (!state.workspaces.length) state.workspaces.push(newWorkspace('main'));
  if (state.activeWs >= idx) state.activeWs = Math.max(0, state.activeWs - 1);
  showActiveView();
}

function selectWorkspace(index) {
  if (index < 0 || index >= state.workspaces.length) return;
  state.activeWs = index;
  showActiveView();
}

const cycleWorkspace = (delta) =>
  selectWorkspace((state.activeWs + delta + state.workspaces.length) % state.workspaces.length);

function moveWorkspace(delta) {
  const from = state.activeWs;
  const to = from + delta;
  if (to < 0 || to >= state.workspaces.length) return;
  const list = state.workspaces;
  [list[from], list[to]] = [list[to], list[from]];
  state.activeWs = to;
  broadcast();
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  const view = views.get(shownTabId);
  if (view) view.setBounds(contentBounds());
  broadcast();
}

const activeWc = () => views.get(activeTab().id)?.webContents;

function focusAddressBar() {
  win.webContents.focus();
  win.webContents.send('focus-address');
}

function showContextMenu(wc, params, tabId) {
  const items = [];
  if (params.linkURL) {
    items.push({ label: 'Open Link in New Tab', click: () => openTab(params.linkURL, findTab(tabId)?.ws) });
    items.push({ label: 'Copy Link Address', click: () => require('electron').clipboard.writeText(params.linkURL) });
    items.push({ type: 'separator' });
  }
  if (params.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' });
  else if (params.selectionText) items.push({ role: 'copy' }, { type: 'separator' });
  items.push(
    { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
    { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
    { label: 'Reload', click: () => wc.reload() },
    { type: 'separator' },
    { label: 'Inspect', click: () => wc.inspectElement(params.x, params.y) },
  );
  Menu.buildFromTemplate(items).popup({ window: win });
}

// ---------- keybindings (mirrors ~/.config/herdr/config.toml) ----------

const PREFIX_ACTIONS = {
  c: () => openTab(),
  k: () => closeTab(),
  r: () => requestRename('tab', activeTab().id),
  n: () => cycleTab(1),
  p: () => cycleTab(-1),
  b: () => toggleSidebar(),
  'shift+c': () => newWorkspaceAction(),
  'shift+k': () => closeWorkspace(),
  'shift+r': () => requestRename('workspace', activeWs().id),
  'shift+n': () => cycleWorkspace(1),
  'shift+p': () => cycleWorkspace(-1),
  '?': () => win.webContents.send('toggle-help'),
};

const DIRECT_ACTIONS = {
  'alt+up': () => cycleWorkspace(-1),
  'alt+down': () => cycleWorkspace(1),
  'alt+left': () => cycleTab(-1),
  'alt+right': () => cycleTab(1),
  'alt+shift+left': () => moveTab(-1),
  'alt+shift+right': () => moveTab(1),
  'alt+shift+up': () => moveWorkspace(-1),
  'alt+shift+down': () => moveWorkspace(1),
  'ctrl+t': () => openTab(),
  'ctrl+w': () => closeTab(),
  'ctrl+shift+t': () => newWorkspaceAction(),
  'ctrl+tab': () => cycleTab(1),
  'ctrl+shift+tab': () => cycleTab(-1),
  'ctrl+l': () => focusAddressBar(),
  'alt+d': () => focusAddressBar(),
  'ctrl+r': () => activeWc()?.reload(),
  f5: () => activeWc()?.reload(),
  'ctrl+shift+r': () => activeWc()?.reloadIgnoringCache(),
  'ctrl+[': () => activeWc()?.navigationHistory.goBack(),
  'ctrl+]': () => activeWc()?.navigationHistory.goForward(),
  'ctrl+b': () => toggleSidebar(),
  f12: () => activeWc()?.toggleDevTools(),
  'ctrl+shift+i': () => activeWc()?.toggleDevTools(),
  'ctrl+=': () => zoom(0.5),
  'ctrl+shift+=': () => zoom(0.5),
  'ctrl+-': () => zoom(-0.5),
  'ctrl+0': () => activeWc()?.setZoomLevel(0),
};

function zoom(delta) {
  const wc = activeWc();
  if (wc) wc.setZoomLevel(wc.getZoomLevel() + delta);
}

const KEY_NAMES = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'space', Tab: 'tab', '+': '=', _: '-', '{': '[', '}': ']' };

function chordOf(input) {
  let key = input.code === 'Space' ? 'space' : KEY_NAMES[input.key] || input.key.toLowerCase();
  if (input.key === '?') return '?';
  const mods = [];
  if (input.control) mods.push('ctrl');
  if (input.alt) mods.push('alt');
  if (input.shift) mods.push('shift');
  return [...mods, key].join('+');
}

function setPrefix(armed) {
  prefixArmed = armed;
  clearTimeout(prefixTimer);
  if (armed) prefixTimer = setTimeout(() => setPrefix(false), 2000);
  broadcast();
}

function handleKey(event, input) {
  if (input.type !== 'keyDown') return;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(input.key)) return;
  const chord = chordOf(input);

  if (prefixArmed) {
    event.preventDefault();
    setPrefix(false);
    if (PREFIX_ACTIONS[chord]) return PREFIX_ACTIONS[chord]();
    const digit = chord.match(/^(\d)$/);
    if (digit) return selectTab(Number(digit[1]) - 1);
    const shiftDigit = input.code.match(/^Digit(\d)$/);
    if (shiftDigit && input.shift) selectWorkspace(Number(shiftDigit[1]) - 1);
    return;
  }

  if (chord === 'ctrl+space') {
    event.preventDefault();
    setPrefix(true);
    return;
  }

  const altDigit = chord.match(/^alt\+(\d)$/);
  if (altDigit) {
    event.preventDefault();
    return selectTab(Number(altDigit[1]) - 1);
  }
  const ctrlDigit = chord.match(/^ctrl\+([1-9])$/);
  if (ctrlDigit) {
    event.preventDefault();
    return selectWorkspace(Number(ctrlDigit[1]) - 1);
  }

  const action = DIRECT_ACTIONS[chord];
  if (action) {
    event.preventDefault();
    action();
  }
}

// ---------- IPC from the chrome UI ----------

const COMMANDS = {
  navigate: (text) => {
    const tab = activeTab();
    tab.url = normalizeUrl(text);
    (views.get(tab.id) || createView(tab)).webContents.loadURL(tab.url).catch(() => {});
    views.get(tab.id).webContents.focus();
    broadcast();
  },
  back: () => activeWc()?.navigationHistory.goBack(),
  forward: () => activeWc()?.navigationHistory.goForward(),
  reload: () => activeWc()?.reload(),
  stop: () => activeWc()?.stop(),
  newTab: () => openTab(),
  closeTab: (tabId) => closeTab(tabId),
  selectTab: (tabId) => {
    const found = findTab(tabId);
    if (!found) return;
    state.activeWs = state.workspaces.indexOf(found.ws);
    found.ws.activeTab = found.idx;
    showActiveView();
  },
  newWorkspace: () => newWorkspaceAction(),
  closeWorkspace: (wsId) => closeWorkspace(wsId),
  selectWorkspace: (wsId) => selectWorkspace(state.workspaces.findIndex((w) => w.id === wsId)),
  renameWorkspace: ({ id, name }) => {
    const ws = state.workspaces.find((w) => w.id === id);
    if (ws && name.trim()) ws.name = name.trim();
    broadcast();
  },
  renameTab: ({ id, name }) => {
    const found = findTab(id);
    if (found) found.tab.customName = name.trim() || undefined;
    broadcast();
  },
  // Drag & drop: reorder tabs, or drop a tab onto another workspace to move it there.
  moveTabTo: ({ tabId, wsId, index }) => {
    const found = findTab(tabId);
    const target = state.workspaces.find((w) => w.id === wsId);
    if (!found || !target) return;
    const wasActive = activeTab().id === tabId;
    found.ws.tabs.splice(found.idx, 1);
    if (target === found.ws && index > found.idx) index--;
    index = Math.min(Math.max(index ?? target.tabs.length, 0), target.tabs.length);
    target.tabs.splice(index, 0, found.tab);
    if (!found.ws.tabs.length) found.ws.tabs.push(newTab());
    found.ws.activeTab = Math.min(found.ws.activeTab, found.ws.tabs.length - 1);
    if (wasActive || target !== found.ws) {
      state.activeWs = state.workspaces.indexOf(target);
      target.activeTab = target.tabs.indexOf(found.tab);
    }
    showActiveView();
  },
  moveWorkspaceTo: ({ wsId, index }) => {
    const from = state.workspaces.findIndex((w) => w.id === wsId);
    if (from === -1) return;
    const current = activeWs();
    const [ws] = state.workspaces.splice(from, 1);
    if (index > from) index--;
    state.workspaces.splice(Math.min(index, state.workspaces.length), 0, ws);
    state.activeWs = state.workspaces.indexOf(current);
    broadcast();
  },
  toggleSidebar: () => toggleSidebar(),
  focusContent: () => (shownTabId === activeTab().id ? activeWc()?.focus() : showActiveView()),
};

ipcMain.on('cmd', (_e, name, arg) => COMMANDS[name]?.(arg));
ipcMain.on('ready', () => broadcast());

// ---------- app lifecycle ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.webContents.on('before-input-event', (event, input) => handleKey(event, input));
  win.on('resize', () => views.get(shownTabId)?.setBounds(contentBounds()));
  win.on('close', saveNow);
  win.webContents.once('did-finish-load', () => {
    const urls = urlsFromArgv(process.argv);
    if (urls.length) urls.forEach((url) => openTab(url));
    else showActiveView();
  });
}

// URLs or files passed on the command line (e.g. when set as the default browser).
function urlsFromArgv(argv) {
  return argv
    .slice(app.isPackaged ? 1 : 2)
    .filter((arg) => arg && !arg.startsWith('-') && arg !== '.')
    .map((arg) => (fs.existsSync(arg) ? `file://${path.resolve(arg)}` : normalizeUrl(arg)));
}

// One instance owns the session file; launching again hands its URLs to the running window.
if (!app.requestSingleInstanceLock()) app.quit();

app.on('second-instance', (_e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  urlsFromArgv(argv).forEach((url) => openTab(url));
});

app.whenReady().then(() => {
  state = loadState();
  // Grant the everyday permissions; refuse the rest (no prompt UI yet).
  const allowed = new Set(['notifications', 'media', 'fullscreen', 'clipboard-sanitized-write', 'pointerLock']);
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)));
  createWindow();
});

app.on('window-all-closed', () => app.quit());

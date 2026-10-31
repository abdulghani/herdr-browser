// Herdr Browser: herdr's layout applied to a Chromium browser.
// herdr workspace -> sidebar entry (vertical), herdr tab -> tab strip entry (horizontal).
const { app, BrowserWindow, WebContentsView, ipcMain, session, Menu, clipboard } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createHistory } = require('./suggest');

const SIDEBAR_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 52; // icon rail, must match styles.css
const CHROME_HEIGHT = 76; // tab strip + toolbar, must match styles.css
const NOTICE_HEIGHT = 36; // per-tab notice bar under the toolbar, must match styles.css
const FIND_HEIGHT = 36; // per-tab find bar under the notice bar, must match styles.css
const HOME_URL = 'https://www.google.com';
const BLANK_URL = 'about:blank'; // new tabs start here, with the address bar focused
const BLANK_BG = '#0b0d10'; // --bg in styles.css, so a blank tab isn't a white flash
const SEARCH_URL = 'https://www.google.com/search?q=';
// Background tabs not looked at for this long are unloaded to free memory (like Chrome's
// Memory Saver) and reload, with their back/forward history, when selected again.
const SLEEP_AFTER_MS = 10 * 60 * 1000;

app.setName('Herdr Browser');
// A separate profile (and its own single-instance lock), e.g. for development.
if (process.env.HERDR_BROWSER_PROFILE) app.setPath('userData', path.resolve(process.env.HERDR_BROWSER_PROFILE));
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
let browsingHistory; // for address bar suggestions

// ---------- state ----------

const newTab = (url = BLANK_URL) => ({ id: `t${nextId++}`, url, title: 'New Tab', favicon: null });
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
      for (const t of ws.tabs) {
        t.id = `t${nextId++}`;
        // Back/forward history comes back when the tab is first shown (see createView).
        if (t.history) sleptHistory.set(t.id, t.history);
        delete t.history;
      }
      if (!ws.tabs.length) ws.tabs.push(newTab());
      ws.activeTab = Math.min(Math.max(ws.activeTab || 0, 0), ws.tabs.length - 1);
    }
    saved.activeWs = Math.min(Math.max(saved.activeWs || 0, 0), saved.workspaces.length - 1);
    if (Array.isArray(saved.closed)) closedStack.push(...saved.closed.slice(-MAX_CLOSED));
    delete saved.closed;
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
      tabs: ws.tabs.map(tabSnapshot),
    })),
    closed: closedStack,
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
    awake: [...views.keys()],
    find: finds.get(tab.id) || null,
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
  const tab = activeTab();
  const top = CHROME_HEIGHT + (tab.notice ? NOTICE_HEIGHT : 0) + (finds.has(tab.id) ? FIND_HEIGHT : 0);
  // A blank tab's page is hidden so the address bar suggestions (part of the window UI) can show there.
  if (tab.url === BLANK_URL) return { x: left, y: top, width: 0, height: 0 };
  return { x: left, y: top, width: Math.max(0, w - left), height: Math.max(0, h - top) };
}

const layoutView = () => views.get(shownTabId)?.setBounds(contentBounds());

function createView(tab) {
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, 'page-preload.js') },
  });
  const wc = view.webContents;
  views.set(tab.id, view);

  const update = (fields) => {
    const found = findTab(tab.id);
    if (!found) return;
    Object.assign(found.tab, fields);
    broadcast();
  };

  wc.on('page-title-updated', (_e, title) => {
    update({ title: title === BLANK_URL ? 'New Tab' : title });
    browsingHistory.update(wc.getURL(), { title });
  });
  // Pages with no background of their own paint over the view's color, so only darken blank tabs.
  const paintBackground = (url) => view.setBackgroundColor(url === BLANK_URL ? BLANK_BG : '#ffffff');
  paintBackground(tab.url);
  wc.on('did-start-navigation', (details) => details.isMainFrame && paintBackground(details.url));
  wc.on('page-favicon-updated', (_e, favicons) => {
    update({ favicon: favicons[0] || null });
    browsingHistory.update(wc.getURL(), { favicon: favicons[0] });
  });
  wc.on('did-navigate', (_e, url) => {
    mediaTabs.delete(tab.id);
    browsingHistory.visit(url, wc.getTitle());
    update({ url });
    if (tab.id === shownTabId) layoutView(); // to or from a blank page
    setNotice(tab.id, null);
  });
  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => isMainFrame && update({ url }));
  wc.on('found-in-page', (_e, result) => {
    const find = finds.get(tab.id);
    if (!find || !result.finalUpdate) return;
    Object.assign(find, { active: result.activeMatchOrdinal, total: result.matches });
    broadcast();
  });
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

  const history = sleptHistory.get(tab.id);
  sleptHistory.delete(tab.id);
  (history?.entries.length ? wc.navigationHistory.restore(history) : wc.loadURL(tab.url)).catch(() => {});
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
  hiddenSince.delete(tabId);
  mediaTabs.delete(tabId);
  finds.delete(tabId);
}

// ---------- tab sleeping ----------

const hiddenSince = new Map(); // tabId -> when its loaded view was last hidden
const sleptHistory = new Map(); // tabId -> back/forward history to restore on wake
const mediaTabs = new Set(); // tabs that asked for camera/mic on their current page

function tabIdOf(wc) {
  for (const [tabId, view] of views) if (view.webContents === wc) return tabId;
  return null;
}

// Tabs in a call, playing sound, or still loading stay awake.
function canSleep(tabId) {
  const wc = views.get(tabId).webContents;
  return !mediaTabs.has(tabId) && !wc.isCurrentlyAudible() && !wc.isLoading() && !wc.isCrashed();
}

function sleepTab(tabId) {
  const nav = views.get(tabId).webContents.navigationHistory;
  sleptHistory.set(tabId, { entries: nav.getAllEntries(), index: nav.getActiveIndex() });
  destroyView(tabId);
}

function sleepIdleTabs() {
  const now = Date.now();
  let slept = false;
  for (const tabId of [...views.keys()]) {
    if (tabId === shownTabId) {
      hiddenSince.delete(tabId);
    } else if (!hiddenSince.has(tabId)) {
      hiddenSince.set(tabId, now);
    } else if (now - hiddenSince.get(tabId) >= SLEEP_AFTER_MS && canSleep(tabId)) {
      sleepTab(tabId);
      slept = true;
    }
  }
  if (slept) broadcast();
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

function openTab(url = BLANK_URL, ws = activeWs(), index = ws.tabs.length) {
  const tab = newTab(url);
  ws.tabs.splice(index, 0, tab);
  state.activeWs = state.workspaces.indexOf(ws);
  ws.activeTab = index;
  showActiveView();
  if (url === BLANK_URL) focusAddressBar();
  return tab;
}

function closeTab(tabId = activeTab().id) {
  const found = findTab(tabId);
  if (!found) return;
  const { ws, idx } = found;
  // Closing the last tab closes the workspace, like herdr.
  if (ws.tabs.length === 1) return closeWorkspace(ws.id);
  rememberClosed({ kind: 'tab', wsId: ws.id, wsName: ws.name, index: idx, tab: tabSnapshot(found.tab) });
  destroyView(tabId);
  sleptHistory.delete(tabId);
  ws.tabs.splice(idx, 1);
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
  const ws = state.workspaces[idx];
  rememberClosed({ kind: 'workspace', index: idx, ws: { name: ws.name, activeTab: ws.activeTab, tabs: ws.tabs.map(tabSnapshot) } });
  for (const t of ws.tabs) {
    destroyView(t.id);
    sleptHistory.delete(t.id);
  }
  state.workspaces.splice(idx, 1);
  if (!state.workspaces.length) state.workspaces.push(newWorkspace('main'));
  if (state.activeWs >= idx) state.activeWs = Math.max(0, state.activeWs - 1);
  showActiveView();
}

// ---------- reopen closed tabs/workspaces (Cmd+Shift+T, like Chrome) ----------

const MAX_CLOSED = 25;
const closedStack = []; // oldest first; saved with the session so it survives a restart

function tabHistory(tabId) {
  const nav = views.get(tabId)?.webContents.navigationHistory;
  if (!nav?.length()) return sleptHistory.get(tabId);
  return { entries: nav.getAllEntries(), index: nav.getActiveIndex() };
}

const tabSnapshot = (tab) => {
  const { url, title, favicon, customName } = tab;
  return { url, title, favicon, customName, history: tabHistory(tab.id) };
};

// A blank tab that never went anywhere isn't worth reopening.
const isEmptyTab = (snap) => snap.url === BLANK_URL && !(snap.history?.entries.length > 1);

function rememberClosed(entry) {
  const tabs = entry.kind === 'tab' ? [entry.tab] : entry.ws.tabs;
  if (tabs.every(isEmptyTab)) return;
  closedStack.push(entry);
  if (closedStack.length > MAX_CLOSED) closedStack.shift();
}

function tabFromSnapshot({ history, ...fields }) {
  const tab = { ...newTab(fields.url), ...fields };
  if (history) sleptHistory.set(tab.id, history);
  return tab;
}

function reopenClosed() {
  const entry = closedStack.pop();
  if (!entry) return;
  if (entry.kind === 'tab') {
    // Back into its workspace if that's still open (ids change across restarts, so fall back to the name).
    const ws =
      state.workspaces.find((w) => w.id === entry.wsId) || state.workspaces.find((w) => w.name === entry.wsName) || activeWs();
    const index = Math.min(entry.index, ws.tabs.length);
    ws.tabs.splice(index, 0, tabFromSnapshot(entry.tab));
    state.activeWs = state.workspaces.indexOf(ws);
    ws.activeTab = index;
  } else {
    const ws = { ...newWorkspace(entry.ws.name), tabs: entry.ws.tabs.map(tabFromSnapshot) };
    ws.activeTab = Math.min(entry.ws.activeTab || 0, ws.tabs.length - 1);
    const index = Math.min(entry.index, state.workspaces.length);
    state.workspaces.splice(index, 0, ws);
    state.activeWs = index;
  }
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
  layoutView();
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
    items.push({ label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) });
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

// ---------- find in page ----------

const finds = new Map(); // tabId -> { text, active, total } while its find bar is open

function openFind() {
  const tab = activeTab();
  if (!finds.has(tab.id)) {
    finds.set(tab.id, { text: '', active: 0, total: 0 });
    layoutView();
    broadcast();
  }
  win.webContents.focus();
  win.webContents.send('focus-find');
}

function find(text, { forward = true, findNext = false } = {}) {
  const tab = activeTab();
  const entry = finds.get(tab.id);
  const wc = views.get(tab.id)?.webContents;
  if (!entry || !wc) return;
  entry.text = text;
  if (text) {
    wc.findInPage(text, { forward, findNext });
  } else {
    wc.stopFindInPage('clearSelection');
    Object.assign(entry, { active: 0, total: 0 });
    broadcast();
  }
}

function findAgain(forward) {
  const text = finds.get(activeTab().id)?.text;
  if (text) find(text, { forward, findNext: true });
  else openFind();
}

function closeFind() {
  const tab = activeTab();
  if (!finds.delete(tab.id)) return;
  views.get(tab.id)?.webContents.stopFindInPage('keepSelection');
  layoutView();
  broadcast();
  activeWc()?.focus();
}

// ---------- notices ----------

function setNotice(tabId, notice) {
  const found = findTab(tabId);
  if (!found || (!found.tab.notice && !notice)) return;
  found.tab.notice = notice || undefined;
  if (tabId === shownTabId) layoutView();
  broadcast();
}

// Passkeys need a real browser (Google Password Manager, iCloud Keychain, phone QR codes), so hand the page over.
const EXTERNAL_BROWSERS = {
  linux: [
    { name: 'Chrome', bin: 'google-chrome-stable' },
    { name: 'Chrome', bin: 'google-chrome' },
    { name: 'Chromium', bin: 'chromium' },
    { name: 'Chromium', bin: 'chromium-browser' },
  ],
  // Safari ships with macOS, so there is always a fallback.
  darwin: [
    { name: 'Chrome', app: 'Google Chrome' },
    { name: 'Brave', app: 'Brave Browser' },
    { name: 'Edge', app: 'Microsoft Edge' },
    { name: 'Chromium', app: 'Chromium' },
    { name: 'Safari', app: 'Safari' },
  ],
};
let externalBrowserCache;

function externalBrowser() {
  if (externalBrowserCache === undefined) {
    const candidates = EXTERNAL_BROWSERS[process.platform] || [];
    const dirs =
      process.platform === 'darwin'
        ? ['/Applications', path.join(app.getPath('home'), 'Applications'), '/System/Volumes/Preboot/Cryptexes/App/System/Applications']
        : (process.env.PATH || '').split(path.delimiter);
    externalBrowserCache =
      candidates.find(({ bin, app: name }) =>
        dirs.some((dir) => fs.existsSync(path.join(dir, bin || `${name}.app`))),
      ) || null;
  }
  return externalBrowserCache;
}

function openInBrowser(browser, url) {
  const [cmd, args] = browser.app ? ['open', ['-a', browser.app, url]] : [browser.bin, [url]];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
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
  'cmd+t': () => openTab(),
  'cmd+shift+t': () => reopenClosed(),
  'ctrl+f': () => openFind(),
  'cmd+f': () => openFind(),
  'cmd+g': () => findAgain(true),
  'cmd+shift+g': () => findAgain(false),
  f3: () => findAgain(true),
  'shift+f3': () => findAgain(false),
  'ctrl+w': () => closeTab(),
  'ctrl+shift+t': () => newWorkspaceAction(),
  'ctrl+tab': () => cycleTab(1),
  'ctrl+shift+tab': () => cycleTab(-1),
  'ctrl+l': () => focusAddressBar(),
  'cmd+l': () => focusAddressBar(),
  'alt+d': () => focusAddressBar(),
  'ctrl+r': () => activeWc()?.reload(),
  f5: () => activeWc()?.reload(),
  'ctrl+shift+r': () => activeWc()?.reloadIgnoringCache(),
  'ctrl+[': () => activeWc()?.navigationHistory.goBack(),
  'ctrl+]': () => activeWc()?.navigationHistory.goForward(),
  'ctrl+b': () => toggleSidebar(),
  f12: () => activeWc()?.toggleDevTools(),
  'ctrl+shift+i': () => activeWc()?.toggleDevTools(),
  'cmd+shift+j': () => activeWc()?.toggleDevTools(),
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
  if (input.meta) mods.push('cmd');
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
  // Like other Mac browsers: Cmd+1-8 jumps to that tab, Cmd+9 to the last one.
  const cmdDigit = chord.match(/^cmd\+([1-9])$/);
  if (cmdDigit) {
    event.preventDefault();
    const n = Number(cmdDigit[1]);
    return selectTab(n === 9 ? activeWs().tabs.length - 1 : n - 1);
  }
  const ctrlDigit = chord.match(/^ctrl\+([1-9])$/);
  if (ctrlDigit) {
    event.preventDefault();
    return selectWorkspace(Number(ctrlDigit[1]) - 1);
  }

  // Escape closes the find bar, wherever the focus is.
  if (chord === 'escape' && finds.has(activeTab().id)) {
    event.preventDefault();
    return closeFind();
  }

  const action = DIRECT_ACTIONS[chord];
  if (action) {
    event.preventDefault();
    action();
  }
}

// ---------- IPC from the chrome UI ----------

const COMMANDS = {
  switchToTab: (tabId) => {
    const found = findTab(tabId);
    if (!found) return;
    state.activeWs = state.workspaces.indexOf(found.ws);
    found.ws.activeTab = found.idx;
    showActiveView();
  },
  find: (text) => find(text),
  findNext: (forward) => findAgain(forward),
  closeFind: () => closeFind(),
  navigate: (text) => {
    const tab = activeTab();
    tab.url = normalizeUrl(text);
    (views.get(tab.id) || createView(tab)).webContents.loadURL(tab.url).catch(() => {});
    layoutView();
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
  dismissNotice: () => setNotice(activeTab().id, null),
  openExternally: () => {
    const tab = activeTab();
    const browser = externalBrowser();
    if (!browser) return;
    openInBrowser(browser, tab.url);
    setNotice(tab.id, null);
  },
  focusContent: () => (shownTabId === activeTab().id ? activeWc()?.focus() : showActiveView()),
};

ipcMain.on('cmd', (_e, name, arg) => COMMANDS[name]?.(arg));
ipcMain.on('passkey-request', (e) => {
  const entry = [...views].find(([, view]) => view.webContents === e.sender);
  if (entry) setNotice(entry[0], { kind: 'passkey', browser: externalBrowser()?.name ?? null });
});
ipcMain.on('ready', () => broadcast());
ipcMain.handle('suggest', (_e, query) => {
  const current = activeTab().id;
  const openTabs = state.workspaces.flatMap((ws) =>
    ws.tabs
      .filter((t) => t.id !== current && t.url !== BLANK_URL)
      .map((t) => ({ tabId: t.id, url: t.url, title: t.customName || t.title, favicon: t.favicon })),
  );
  return browsingHistory.suggest(String(query || ''), openTabs);
});

// ---------- app lifecycle ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    // On macOS the tab strip is the title bar: hide the native one and set the
    // window buttons into the top-left corner (centered in the 36px tab strip).
    ...(process.platform === 'darwin' && { titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 11 } }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.webContents.on('before-input-event', (event, input) => handleKey(event, input));
  win.on('resize', layoutView);
  win.on('close', () => {
    saveNow();
    browsingHistory.saveNow();
  });
  win.webContents.once('did-finish-load', () => {
    windowReady = true;
    const urls = [...urlsFromArgv(process.argv), ...pendingUrls.splice(0)];
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

// macOS hands over links (as the default browser) and files through events, not argv.
// They can arrive before the window is ready, so hold them until then.
const pendingUrls = [];
let windowReady = false;
function openExternalUrl(url) {
  if (!windowReady) return pendingUrls.push(url);
  if (win.isMinimized()) win.restore();
  win.focus();
  openTab(url);
}
app.on('open-url', (e, url) => {
  e.preventDefault();
  openExternalUrl(url);
});
app.on('open-file', (e, file) => {
  e.preventDefault();
  openExternalUrl(`file://${file}`);
});

app.whenReady().then(() => {
  state = loadState();
  browsingHistory = createHistory(path.join(app.getPath('userData'), 'history.json'));
  // Grant the everyday permissions; refuse the rest (no prompt UI yet).
  const allowed = new Set(['notifications', 'media', 'fullscreen', 'clipboard-sanitized-write', 'pointerLock']);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    if (perm === 'media' && details.mediaTypes?.length) {
      const tabId = tabIdOf(wc);
      if (tabId) mediaTabs.add(tabId);
    }
    cb(allowed.has(perm));
  });
  createWindow();
  setInterval(sleepIdleTabs, 30 * 1000);
});

app.on('window-all-closed', () => app.quit());

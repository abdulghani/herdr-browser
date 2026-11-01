// Herdr Browser: herdr's layout applied to a Chromium browser.
// herdr workspace -> sidebar entry (vertical), herdr tab -> tab strip entry (horizontal).
// This file sets up the app and the window and wires the services (src/services) together.
// The services share one `ctx` object and reach each other through it when they run.
const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { normalizeUrl } = require('./lib/url');
const { createWorkspaces } = require('./services/workspaces/workspaces');
const { createSession } = require('./services/workspaces/session');
const { createClosedTabs } = require('./services/workspaces/closed-tabs');
const { createTabViews } = require('./services/tab-views/tab-views');
const { createSleeping } = require('./services/tab-views/sleeping');
const { handlePermissions } = require('./services/tab-views/permissions');
const { createHistory } = require('./services/history/history');
const { createSuggestions } = require('./services/history/suggestions');
const { createSettings, applyDns } = require('./services/settings/settings');
const { registerHerdrScheme, serveSettingsPage } = require('./services/settings/protocol');
const { handleSettingsIpc } = require('./services/settings/ipc');
const { createFind } = require('./services/find/find');
const { createKeyboard } = require('./services/keyboard/keyboard');
const { createPasskeys } = require('./services/passkeys/passkeys');
const { createContextMenu } = require('./services/context-menu/context-menu');
const { handleUiIpc } = require('./ipc');

app.setName('Herdr Browser');
// A separate profile (and its own single-instance lock), e.g. for development.
if (process.env.HERDR_BROWSER_PROFILE) app.setPath('userData', path.resolve(process.env.HERDR_BROWSER_PROFILE));
// Drop the "Electron/x" and app tokens so sites treat us as plain Chrome.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/, '')
  .replace(/\sherdr-browser\/\S+/i, '')
  .replace(/\sHerdr Browser\/\S+/i, '');

registerHerdrScheme();

// win and state are set once the app is ready; history and settings are the stores in the profile.
const ctx = { win: null, state: null, history: null, settings: null };
ctx.workspaces = createWorkspaces(ctx);
ctx.session = createSession(ctx);
ctx.closedTabs = createClosedTabs(ctx);
ctx.views = createTabViews(ctx);
ctx.sleeping = createSleeping(ctx);
ctx.find = createFind(ctx);
ctx.suggestions = createSuggestions(ctx);
ctx.keyboard = createKeyboard(ctx);
ctx.passkeys = createPasskeys(ctx);
ctx.contextMenu = createContextMenu(ctx);
handleUiIpc(ctx);
handleSettingsIpc(ctx);

// macOS hands over links (as the default browser) and files through events, not argv.
// They can arrive before the window is ready, so hold them until then.
const pendingUrls = [];
let windowReady = false;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    // On macOS the tab strip is the title bar: hide the native one and set the
    // window buttons into the top-left corner (centered in the 36px tab strip).
    ...(process.platform === 'darwin' && { titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 11 } }),
    webPreferences: { preload: path.join(__dirname, 'ui', 'browser', 'preload.js'), contextIsolation: true, sandbox: true },
  });
  ctx.win = win;
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'ui', 'browser', 'index.html'));
  win.webContents.on('before-input-event', (event, input) => ctx.keyboard.handleKey(event, input, win.webContents));
  win.on('resize', () => ctx.views.layout());
  win.on('blur', () => ctx.suggestions.close());
  win.on('close', () => {
    ctx.session.saveNow();
    ctx.history.saveNow();
  });
  win.webContents.once('did-finish-load', () => {
    windowReady = true;
    const urls = [...urlsFromArgv(process.argv), ...pendingUrls.splice(0)];
    if (urls.length) urls.forEach((url) => ctx.workspaces.openTab(url));
    else ctx.views.showActive();
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
  const { win } = ctx;
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  urlsFromArgv(argv).forEach((url) => ctx.workspaces.openTab(url));
});

function openExternalUrl(url) {
  if (!windowReady) return pendingUrls.push(url);
  if (ctx.win.isMinimized()) ctx.win.restore();
  ctx.win.focus();
  ctx.workspaces.openTab(url);
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
  const profile = app.getPath('userData');
  ctx.state = ctx.session.load();
  ctx.history = createHistory(path.join(profile, 'history.json'));
  ctx.settings = createSettings(path.join(profile, 'settings.json'));
  applyDns(app, session.defaultSession, ctx.settings.get().dns);
  serveSettingsPage();
  handlePermissions(ctx);
  createWindow();
  ctx.sleeping.start();
});

app.on('window-all-closed', () => app.quit());

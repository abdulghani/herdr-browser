// Herdr Browser: herdr's layout applied to a web browser. This branch runs on Electrobun: the main
// process is this file under Bun, and pages render in the system's WebKit (WKWebView).
// herdr workspace -> sidebar entry (vertical), herdr tab -> tab strip entry (horizontal).
// This file sets up the window and wires the services (src/services) together. The services share
// one `ctx` object and reach each other through it when they run.
const Electrobun = require('electrobun/main');
const path = require('path');
const fs = require('fs');
const { createWorkspaces } = require('./services/workspaces/workspaces');
const { createSession } = require('./services/workspaces/session');
const { createClosedTabs } = require('./services/workspaces/closed-tabs');
const { createTabViews } = require('./services/tab-views/tab-views');
const { createSleeping } = require('./services/tab-views/sleeping');
const { createPages } = require('./services/tab-views/pages');
const { createHistory } = require('./services/history/history');
const { createSuggestions } = require('./services/history/suggestions');
const { createSettingsPage } = require('./services/settings/settings-page');
const { createFind } = require('./services/find/find');
const { createKeyboard } = require('./services/keyboard/keyboard');
const { createMenu } = require('./services/keyboard/menu');
const { createContextMenu } = require('./services/context-menu/context-menu');
const { createDownloads } = require('./services/downloads/downloads');
const { uiHandlers } = require('./ipc');

const { BrowserWindow, BrowserView, Utils } = Electrobun;
const events = Electrobun.default.events;

// The profile: session, history and downloads list. Electrobun keeps app data per bundle id and
// channel (~/Library/Application Support/dev.herdr.browser.electrobun/<channel>), apart from the Electron
// build's profile. HERDR_BROWSER_PROFILE picks another folder, e.g. while developing.
const profile = path.resolve(process.env.HERDR_BROWSER_PROFILE || Utils.paths.userData);
try {
  fs.mkdirSync(profile, { recursive: true });
} catch {}

// win, rpc and state are set below; history is the store in the profile.
const ctx = { win: null, rpc: null, state: null, history: null, profile };
// Messages to the browser UI (src/ui/browser), e.g. ctx.ui.send('state', ...).
ctx.ui = { send: (channel, payload) => ctx.rpc?.send[channel](payload) };
ctx.workspaces = createWorkspaces(ctx);
ctx.session = createSession(ctx);
ctx.closedTabs = createClosedTabs(ctx);
ctx.views = createTabViews(ctx);
ctx.sleeping = createSleeping(ctx);
ctx.pages = createPages(ctx);
ctx.find = createFind(ctx);
ctx.suggestions = createSuggestions(ctx);
ctx.settingsPage = createSettingsPage(ctx);
ctx.keyboard = createKeyboard(ctx);
ctx.menu = createMenu(ctx);
ctx.contextMenu = createContextMenu(ctx);
ctx.downloads = createDownloads(ctx);

ctx.state = ctx.session.load();
ctx.history = createHistory(path.join(profile, 'history.json'));
ctx.downloads.load();

// macOS hands over links (as the default browser) and files through 'open-url'. They can arrive
// before the browser UI is ready, so hold them until then.
const pendingUrls = [];
let uiReady = false;

function onUiReady() {
  if (uiReady) return ctx.workspaces.broadcast();
  uiReady = true;
  const urls = pendingUrls.splice(0);
  if (urls.length) urls.forEach((url) => ctx.workspaces.openTab(url));
  else ctx.views.showActive();
}

function openExternalUrl(url) {
  if (!uiReady) return pendingUrls.push(url);
  if (ctx.win.isMinimized()) ctx.win.unminimize();
  ctx.win.focus();
  ctx.workspaces.openTab(url);
}

function saveAll() {
  ctx.session.saveNow();
  ctx.history.saveNow();
  ctx.downloads.saveNow();
}

ctx.quit = () => {
  saveAll();
  Utils.quit();
};

ctx.rpc = BrowserView.defineRPC({ maxRequestTime: 10000, handlers: uiHandlers(ctx, onUiReady) });
ctx.win = new BrowserWindow({
  title: 'Herdr Browser',
  url: 'views://ui/browser/index.html',
  frame: { width: 1400, height: 900 },
  // The tab strip is the title bar: no native one, the window buttons inset into the top-left
  // corner (centered in the 36px tab strip).
  titleBarStyle: 'hiddenInset',
  trafficLightOffset: { x: 12, y: 11 },
  rpc: ctx.rpc,
});
ctx.win.on('blur', () => {
  ctx.ui.send('suggest-close');
  ctx.downloads.close();
});
ctx.win.on('close', saveAll);
// Everything the pages' preload (src/ui/page-preload.js) reports from the browser UI itself.
ctx.win.webview.on('host-message', (e) => ctx.pages.onMessage(null, e.data.detail));

ctx.menu.install();
ctx.sleeping.start();

events.on('open-url', (e) => openExternalUrl(e.data.url));
events.on('before-quit', saveAll);

// For the tests, which drive the services through it (src/testing/fake-electrobun.js).
module.exports = { ctx };

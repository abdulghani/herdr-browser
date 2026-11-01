// One WebContentsView per tab, created when the tab is first shown, laid out under the browser UI.
const { WebContentsView } = require('electron');
const path = require('path');
const { BLANK_URL, normalizeUrl } = require('../../lib/url');

const SIDEBAR_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 52; // icon rail, must match src/ui/browser/styles.css
const CHROME_HEIGHT = 76; // tab strip + toolbar, must match src/ui/browser/styles.css
const NOTICE_HEIGHT = 36; // per-tab notice bar under the toolbar, must match src/ui/browser/styles.css
const FIND_HEIGHT = 36; // per-tab find bar under the notice bar, must match src/ui/browser/styles.css
const BLANK_BG = '#0b0d10'; // --bg in src/ui/browser/styles.css, so a blank tab isn't a white flash
const PAGE_PRELOAD = path.join(__dirname, '..', '..', 'ui', 'page-preload.js');

function createTabViews(ctx) {
  const views = new Map(); // tabId -> WebContentsView
  let shownTabId = null;

  const get = (tabId) => views.get(tabId);
  const shown = () => shownTabId;
  const awake = () => [...views.keys()];
  const activeWc = () => views.get(ctx.workspaces.activeTab().id)?.webContents;

  function tabIdOf(wc) {
    for (const [tabId, view] of views) if (view.webContents === wc) return tabId;
    return null;
  }

  function contentBounds() {
    const [w, h] = ctx.win.getContentSize();
    const left = ctx.state.sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
    const tab = ctx.workspaces.activeTab();
    const top = CHROME_HEIGHT + (tab.notice ? NOTICE_HEIGHT : 0) + (ctx.find.has(tab.id) ? FIND_HEIGHT : 0);
    return { x: left, y: top, width: Math.max(0, w - left), height: Math.max(0, h - top) };
  }

  const layout = () => views.get(shownTabId)?.setBounds(contentBounds());

  function createView(tab) {
    const view = new WebContentsView({
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: PAGE_PRELOAD },
    });
    views.set(tab.id, view);
    watchPage(view, tab);
    const history = ctx.sleeping.takeHistory(tab.id);
    const wc = view.webContents;
    (history?.entries.length ? wc.navigationHistory.restore(history) : wc.loadURL(tab.url)).catch(() => {});
    return view;
  }

  // Keep the tab's state in step with its page.
  function watchPage(view, tab) {
    const wc = view.webContents;
    const { workspaces } = ctx;
    const update = (fields) => {
      const found = workspaces.findTab(tab.id);
      if (!found) return;
      Object.assign(found.tab, fields);
      workspaces.broadcast();
    };

    wc.on('page-title-updated', (_e, title) => {
      update({ title: title === BLANK_URL ? 'New Tab' : title });
      ctx.history.update(wc.getURL(), { title });
    });
    // Pages with no background of their own paint over the view's color, so only darken blank tabs.
    const paintBackground = (url) => view.setBackgroundColor(url === BLANK_URL || url.startsWith('herdr:') ? BLANK_BG : '#ffffff');
    paintBackground(tab.url);
    wc.on('did-start-navigation', (details) => details.isMainFrame && paintBackground(details.url));
    wc.on('page-favicon-updated', (_e, favicons) => {
      update({ favicon: favicons[0] || null });
      ctx.history.update(wc.getURL(), { favicon: favicons[0] });
    });
    wc.on('did-navigate', (_e, url) => {
      ctx.sleeping.clearMedia(tab.id);
      ctx.history.visit(url, wc.getTitle());
      update({ url });
      ctx.passkeys.setNotice(tab.id, null);
    });
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => isMainFrame && update({ url }));
    wc.on('found-in-page', (_e, result) => ctx.find.onResult(tab.id, result));
    wc.on('did-start-loading', () => workspaces.broadcast());
    wc.on('did-stop-loading', () => workspaces.broadcast());
    wc.on('before-input-event', (event, input) => ctx.keyboard.handleKey(event, input, wc));
    wc.on('did-start-navigation', (details) => details.isMainFrame && !details.isSameDocument && ctx.keyboard.forgetTextFocus(wc.id));
    wc.on('focus', () => {
      ctx.suggestions.close();
      ctx.downloads.close();
    });
    wc.setWindowOpenHandler(({ url }) => {
      // Popups and target=_blank open as a new tab in the same workspace.
      const found = workspaces.findTab(tab.id);
      if (found) workspaces.openTab(url, found.ws, found.idx + 1);
      return { action: 'deny' };
    });
    wc.on('context-menu', (_e, params) => ctx.contextMenu.show(wc, params, tab.id));
  }

  function showActive() {
    const { win } = ctx;
    const tab = ctx.workspaces.activeTab();
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
    ctx.workspaces.broadcast();
  }

  // Take the page off the window without picking another one.
  function hideShown() {
    const view = views.get(shownTabId);
    if (view) ctx.win.contentView.removeChildView(view);
    shownTabId = null;
  }

  function destroy(tabId) {
    const view = views.get(tabId);
    if (!view) return;
    if (shownTabId === tabId) {
      ctx.win.contentView.removeChildView(view);
      shownTabId = null;
    }
    view.webContents.close();
    views.delete(tabId);
    ctx.sleeping.viewGone(tabId);
    ctx.find.drop(tabId);
  }

  // The tab is closed: drop its view and any history kept for it.
  function discard(tabId) {
    destroy(tabId);
    ctx.sleeping.forget(tabId);
  }

  // The tab's back/forward history, from its page or, while it sleeps, from what was kept.
  function historyOf(tabId) {
    const nav = views.get(tabId)?.webContents.navigationHistory;
    if (!nav?.length()) return ctx.sleeping.keptHistory(tabId);
    return { entries: nav.getAllEntries(), index: nav.getActiveIndex() };
  }

  // Load what was typed in the address bar.
  function navigate(text) {
    const tab = ctx.workspaces.activeTab();
    tab.url = normalizeUrl(text);
    (views.get(tab.id) || createView(tab)).webContents.loadURL(tab.url).catch(() => {});
    views.get(tab.id).webContents.focus();
    ctx.workspaces.broadcast();
  }

  const focusContent = () => (shownTabId === ctx.workspaces.activeTab().id ? activeWc()?.focus() : showActive());

  return { get, shown, awake, activeWc, tabIdOf, layout, showActive, hideShown, destroy, discard, historyOf, navigate, focusContent };
}

module.exports = { createTabViews };

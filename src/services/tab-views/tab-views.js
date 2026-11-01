// The page shown in each tab. Each awake tab has a native WebKit view: the browser UI draws an
// <electrobun-webview> tag for it in the content area (src/ui/browser/PageViews.svelte), and the
// tag reports the view's id here ('tabView'), so this side can load pages into it and follow its
// events. Only the shown tab's view is visible; the UI hides the others.
const { BrowserView } = require('electrobun/main');
const { BLANK_URL, normalizeUrl, pageUrl, tabUrl } = require('../../lib/url');
const { focusView } = require('./native-focus');

// Events the native view reports (Electrobun's BrowserView events) and what they mean here.
const LOADING_EVENTS = { 'will-navigate': true, 'load-started': true, 'dom-ready': false, 'load-finished': false };
const DOWNLOAD_EVENTS = ['download-started', 'download-progress', 'download-completed', 'download-failed'];

function createTabViews(ctx) {
  const awakeTabs = new Set(); // tabs that should have a view; the UI draws a tag for each
  const views = new Map(); // tabId -> BrowserView, once the UI has made it
  const loading = new Set(); // tabIds whose page is loading
  const fresh = new Set(); // tabs whose view hasn't finished its first navigation
  let shownTabId = null;

  const get = (tabId) => views.get(tabId);
  const shown = () => shownTabId;
  const awake = () => [...awakeTabs];
  const isLoading = (tabId) => loading.has(tabId);
  const activeView = () => views.get(ctx.workspaces.activeTab().id);

  // What the UI needs to draw the views: which tabs have one, what each starts on, which is shown.
  const pages = () => [...awakeTabs].map((tabId) => ({ id: tabId, src: pageUrl(ctx.workspaces.findTab(tabId)?.tab.url || BLANK_URL) }));

  // The UI made the view for a tab.
  function attach(tabId, webviewId) {
    const view = BrowserView.getById(webviewId);
    if (!view || !awakeTabs.has(tabId) || !ctx.workspaces.findTab(tabId)) return;
    views.set(tabId, view);
    loading.add(tabId);
    fresh.add(tabId);
    watchPage(view, tabId);
    // A new blank tab keeps the focus in the address bar.
    if (tabId === shownTabId && ctx.workspaces.findTab(tabId).tab.url !== BLANK_URL) focusView(view);
    ctx.workspaces.broadcast();
  }

  // Keep the tab's state in step with its page. Title, favicon, keys and the like come from the
  // page's preload instead (src/ui/page-preload.js, handled in pages.js).
  function watchPage(view, tabId) {
    const { workspaces } = ctx;
    const mine = () => views.get(tabId) === view;
    const update = (fields) => {
      const found = workspaces.findTab(tabId);
      if (!found || !mine()) return;
      Object.assign(found.tab, fields);
      workspaces.broadcast();
    };
    const urlOf = (e) => tabUrl(String(e.data?.detail || ''));

    view.on('did-navigate', (e) => {
      if (!mine()) return;
      const url = urlOf(e);
      ctx.sleeping.clearMedia(tabId);
      ctx.history.visit(url, '');
      // Leaving the page drops its notice, but loading a new view's first page doesn't.
      if (!fresh.delete(tabId)) ctx.pages.setNotice(tabId, null);
      update({ url, favicon: null });
    });
    view.on('did-navigate-in-page', (e) => update({ url: urlOf(e) }));
    for (const [event, isLoading] of Object.entries(LOADING_EVENTS)) {
      view.on(event, () => {
        if (!mine()) return;
        if (isLoading) loading.add(tabId);
        else loading.delete(tabId);
        workspaces.broadcast();
      });
    }
    // Popups, target=_blank and Cmd+click open as a new tab in the same workspace, next to this one.
    view.on('new-window-open', (e) => {
      const detail = e.data?.detail;
      const url = typeof detail === 'string' ? detail : detail?.url;
      const found = mine() && url && workspaces.findTab(tabId);
      if (found) workspaces.openTab(url, found.ws, found.idx + 1);
    });
    view.on('host-message', (e) => mine() && ctx.pages.onMessage(tabId, e.data?.detail));
    // A link that turns into a download doesn't finish loading a page.
    for (const event of DOWNLOAD_EVENTS)
      view.on(event, (e) => {
        if (loading.delete(tabId)) workspaces.broadcast();
        ctx.downloads.onEvent(event, e.data?.detail, tabId);
      });
  }

  function showActive() {
    const tab = ctx.workspaces.activeTab();
    // Views are made lazily, so restoring a big session doesn't load every page at once.
    awakeTabs.add(tab.id);
    shownTabId = tab.id;
    if (ctx.sleeping.woke(tab.id)) ctx.pages.setNotice(tab.id, { kind: 'woke' });
    focusView(views.get(tab.id));
    ctx.workspaces.broadcast();
  }

  // Take the page off the window without picking another one.
  function hideShown() {
    shownTabId = null;
  }

  // The tab sleeps or is closed: the UI removes its tag, which removes the native view and,
  // with it, the page's back/forward history.
  function destroy(tabId) {
    awakeTabs.delete(tabId);
    views.delete(tabId);
    loading.delete(tabId);
    fresh.delete(tabId);
    if (shownTabId === tabId) shownTabId = null;
    ctx.sleeping.viewGone(tabId);
    ctx.find.drop(tabId);
  }

  // The tab is closed: also forget that it slept.
  function discard(tabId) {
    destroy(tabId);
    ctx.sleeping.forget(tabId);
  }

  // Load what was typed in the address bar.
  function navigate(text) {
    const tab = ctx.workspaces.activeTab();
    tab.url = normalizeUrl(text);
    const view = views.get(tab.id);
    if (view) {
      view.loadURL(pageUrl(tab.url));
      loading.add(tab.id);
      focusView(view);
    }
    awakeTabs.add(tab.id);
    shownTabId = tab.id;
    ctx.workspaces.broadcast();
  }

  // Back, forward and reload go through the tag in the UI, which has them natively.
  const pageAction = (action) => views.has(shownTabId) && ctx.ui.send('page-action', { tabId: shownTabId, action });
  const runInPage = (js) => activeView()?.executeJavascript(js);

  // Back to the page, e.g. after Escape in the address bar.
  function focusContent() {
    if (shownTabId !== ctx.workspaces.activeTab().id) return showActive();
    focusView(views.get(shownTabId));
  }

  // The browser UI's own view takes the keyboard focus, before one of its fields does.
  const focusUi = () => focusView(ctx.win?.webview);

  return {
    get,
    shown,
    awake,
    pages,
    isLoading,
    activeView,
    attach,
    showActive,
    hideShown,
    destroy,
    discard,
    navigate,
    pageAction,
    runInPage,
    focusContent,
    focusUi,
  };
}

module.exports = { createTabViews };

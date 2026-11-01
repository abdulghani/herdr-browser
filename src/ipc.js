// What the browser UI (src/ui/browser) asks the main process to do, over Electrobun's RPC between
// the Bun process and the window's webview. herdr.cmd(name, arg) in the page arrives here as the
// 'cmd' message; see src/ui/lib/bridge.js for the page's side.

function commands(ctx) {
  const ws = () => ctx.workspaces;
  const views = () => ctx.views;
  return {
    switchToTab: (tabId) => ws().selectTabById(tabId),
    find: (text) => ctx.find.search(text),
    findNext: (forward) => ctx.find.again(forward),
    closeFind: () => ctx.find.close(),
    navigate: (text) => views().navigate(text),
    back: () => views().pageAction('goBack'),
    forward: () => views().pageAction('goForward'),
    reload: () => views().pageAction('reload'),
    stop: () => views().runInPage('window.stop()'),
    newTab: () => ws().openTab(),
    openSettings: () => ws().openSettings(),
    closeTab: (tabId) => ws().closeTab(tabId),
    selectTab: (tabId) => ws().selectTabById(tabId),
    newWorkspace: () => ws().addWorkspace(),
    closeWorkspace: (wsId) => ws().closeWorkspace(wsId),
    selectWorkspace: (wsId) => ws().selectWorkspace(ctx.state.workspaces.findIndex((w) => w.id === wsId)),
    renameWorkspace: (arg) => ws().renameWorkspace(arg),
    renameTab: (arg) => ws().renameTab(arg),
    moveTabTo: (arg) => ws().moveTabTo(arg),
    moveWorkspaceTo: (arg) => ws().moveWorkspaceTo(arg),
    toggleSidebar: () => ws().toggleSidebar(),
    dismissNotice: () => ctx.pages.setNotice(ws().activeTab().id, null),
    focusContent: () => views().focusContent(),
    toggleDownloads: () => ctx.downloads.toggle(),
    showDownloads: () => ctx.downloads.show(),
    hideDownloads: () => ctx.downloads.hide(),
    downloadsAction: ({ action, id }) => ctx.downloads.act(action, id),
    downloadsClear: () => ctx.downloads.clear(),
    downloadsFolder: () => ctx.downloads.openFolder(),
    downloadsPointer: () => ctx.downloads.keepOpen(),
  };
}

// The handlers for BrowserView.defineRPC: requests answer the page, messages don't.
function uiHandlers(ctx, onReady) {
  const COMMANDS = commands(ctx);
  return {
    requests: {
      suggest: (query) => ctx.suggestions.suggest(query),
    },
    messages: {
      cmd: ({ name, arg } = {}) => COMMANDS[name]?.(arg),
      // The UI asks for the state once it has loaded.
      ready: () => onReady(),
      // The UI made the native webview for a tab (<electrobun-webview>, src/ui/browser/PageViews.svelte).
      tabView: ({ tabId, webviewId }) => ctx.views.attach(tabId, webviewId),
    },
  };
}

module.exports = { uiHandlers };

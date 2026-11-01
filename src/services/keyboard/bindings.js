// The key tables (mirrors ~/.config/herdr/config.toml). Each action reaches the services through
// ctx when the key is pressed. Keys with Cmd come from the application menu (menu.js); the others
// from the preload in each page (src/ui/page-preload.js), which passes them on before the page
// sees them.

// The key pressed after the Ctrl+Space prefix.
function prefixActions(ctx) {
  const ws = () => ctx.workspaces;
  return {
    c: () => ws().openTab(),
    k: () => ws().closeTab(),
    r: () => ws().requestRename('tab', ws().activeTab().id),
    n: () => ws().cycleTab(1),
    p: () => ws().cycleTab(-1),
    b: () => ws().toggleSidebar(),
    'shift+c': () => ws().addWorkspace(),
    'shift+k': () => ws().closeWorkspace(),
    'shift+r': () => ws().requestRename('workspace', ws().activeWs().id),
    'shift+n': () => ws().cycleWorkspace(1),
    'shift+p': () => ws().cycleWorkspace(-1),
    '?': () => ctx.ui.send('toggle-help'),
  };
}

// Keys that work on their own.
function directActions(ctx) {
  const ws = () => ctx.workspaces;
  const find = () => ctx.find;
  const views = () => ctx.views;
  // Page zoom as a factor (1 = 100%), in steps of 10%.
  const zoom = (delta) => {
    const view = views().activeView();
    if (view) view.setPageZoom(delta ? Math.min(5, Math.max(0.3, Math.round((view.getPageZoom() + delta) * 10) / 10)) : 1);
  };
  const devTools = () => views().activeView()?.toggleDevTools();
  return {
    'alt+up': () => ws().cycleWorkspace(-1),
    'alt+down': () => ws().cycleWorkspace(1),
    'alt+left': () => ws().cycleTab(-1),
    'alt+right': () => ws().cycleTab(1),
    'alt+shift+left': () => ws().moveTab(-1),
    'alt+shift+right': () => ws().moveTab(1),
    'alt+shift+up': () => ws().moveWorkspace(-1),
    'alt+shift+down': () => ws().moveWorkspace(1),
    'ctrl+t': () => ws().openTab(),
    'cmd+,': () => ws().openSettings(),
    'ctrl+,': () => ws().openSettings(),
    'cmd+t': () => ws().openTab(),
    'cmd+shift+t': () => ctx.closedTabs.reopen(),
    'ctrl+f': () => find().open(),
    'cmd+f': () => find().open(),
    'cmd+g': () => find().again(true),
    'cmd+shift+g': () => find().again(false),
    f3: () => find().again(true),
    'shift+f3': () => find().again(false),
    'ctrl+w': () => ws().closeTab(),
    'ctrl+shift+t': () => ws().addWorkspace(),
    'ctrl+tab': () => ws().cycleTab(1),
    'ctrl+shift+tab': () => ws().cycleTab(-1),
    'ctrl+l': () => ws().focusAddressBar(),
    'cmd+l': () => ws().focusAddressBar(),
    'alt+d': () => ws().focusAddressBar(),
    'ctrl+r': () => views().pageAction('reload'),
    'cmd+r': () => views().pageAction('reload'),
    f5: () => views().pageAction('reload'),
    // WebKit's views have no reload that skips the cache; this reloads like Ctrl+R.
    'ctrl+shift+r': () => views().pageAction('reload'),
    'ctrl+[': () => views().pageAction('goBack'),
    'ctrl+]': () => views().pageAction('goForward'),
    'cmd+[': () => views().pageAction('goBack'),
    'cmd+]': () => views().pageAction('goForward'),
    'cmd+w': () => ws().closeTab(),
    'cmd+q': () => ctx.quit(),
    'cmd+shift+]': () => ws().cycleTab(1),
    'cmd+shift+[': () => ws().cycleTab(-1),
    'ctrl+b': () => ws().toggleSidebar(),
    f12: devTools,
    'ctrl+shift+i': devTools,
    'cmd+shift+j': devTools,
    // Downloads, like Chrome.
    'ctrl+j': () => ctx.downloads.toggle(),
    'alt+cmd+l': () => ctx.downloads.toggle(),
    'ctrl+=': () => zoom(0.1),
    'ctrl+shift+=': () => zoom(0.1),
    'ctrl+-': () => zoom(-0.1),
    'ctrl+0': () => zoom(0),
    'cmd+=': () => zoom(0.1),
    'cmd+-': () => zoom(-0.1),
    'cmd+0': () => zoom(0),
  };
}

module.exports = { prefixActions, directActions };

// The key tables (mirrors ~/.config/herdr/config.toml). Each action reaches the services through
// ctx when the key is pressed.

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
    '?': () => ctx.win.webContents.send('toggle-help'),
  };
}

// Keys that work on their own.
function directActions(ctx) {
  const ws = () => ctx.workspaces;
  const find = () => ctx.find;
  const page = () => ctx.views.activeWc();
  const zoom = (delta) => {
    const wc = page();
    if (wc) wc.setZoomLevel(wc.getZoomLevel() + delta);
  };
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
    'ctrl+r': () => page()?.reload(),
    f5: () => page()?.reload(),
    'ctrl+shift+r': () => page()?.reloadIgnoringCache(),
    'ctrl+[': () => page()?.navigationHistory.goBack(),
    'ctrl+]': () => page()?.navigationHistory.goForward(),
    'ctrl+b': () => ws().toggleSidebar(),
    f12: () => page()?.toggleDevTools(),
    'ctrl+shift+i': () => page()?.toggleDevTools(),
    'cmd+shift+j': () => page()?.toggleDevTools(),
    // Downloads, like Chrome. With Option held, macOS reports L as ¬.
    'ctrl+j': () => ctx.downloads.toggle(),
    'alt+cmd+l': () => ctx.downloads.toggle(),
    'alt+cmd+¬': () => ctx.downloads.toggle(),
    'ctrl+=': () => zoom(0.5),
    'ctrl+shift+=': () => zoom(0.5),
    'ctrl+-': () => zoom(-0.5),
    'ctrl+0': () => page()?.setZoomLevel(0),
  };
}

module.exports = { prefixActions, directActions };

// What the browser UI (src/ui/browser) asks the main process to do: herdr.cmd(name, arg) in the
// page arrives here as the 'cmd' message.
const { ipcMain } = require('electron');

function commands(ctx) {
  const ws = () => ctx.workspaces;
  const page = () => ctx.views.activeWc();
  return {
    showSuggestions: (payload) => ctx.suggestions.show(payload),
    hideSuggestions: () => ctx.suggestions.hide(),
    selectSuggestion: (index) => ctx.suggestions.select(index),
    switchToTab: (tabId) => ws().selectTabById(tabId),
    find: (text) => ctx.find.search(text),
    findNext: (forward) => ctx.find.again(forward),
    closeFind: () => ctx.find.close(),
    navigate: (text) => ctx.views.navigate(text),
    back: () => page()?.navigationHistory.goBack(),
    forward: () => page()?.navigationHistory.goForward(),
    reload: () => page()?.reload(),
    stop: () => page()?.stop(),
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
    dismissNotice: () => ctx.passkeys.dismiss(),
    openExternally: () => ctx.passkeys.openExternally(),
    focusContent: () => ctx.views.focusContent(),
  };
}

function handleUiIpc(ctx) {
  const COMMANDS = commands(ctx);
  ipcMain.on('cmd', (_e, name, arg) => COMMANDS[name]?.(arg));
  // The UI asks for the state once it has loaded.
  ipcMain.on('ready', () => ctx.workspaces.broadcast());
}

module.exports = { handleUiIpc };

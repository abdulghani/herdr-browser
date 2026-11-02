// What the browser UI (src/ui/browser) asks the main process to do: herdr.cmd(name, arg) in the
// page arrives here as the 'cmd' message.
import { ipcMain } from 'electron';
import type { Anchor, Ctx } from './types';
import type { SuggestionsPayload } from './services/history/suggestions';
import type { Rename, TabMove, WorkspaceMove } from './services/workspaces/workspaces';

function commands(ctx: Ctx) {
  const ws = () => ctx.workspaces;
  const page = () => ctx.views.activeWc();
  return {
    showSuggestions: (payload: SuggestionsPayload) => ctx.suggestions.show(payload),
    hideSuggestions: () => ctx.suggestions.hide(),
    selectSuggestion: (index: number) => ctx.suggestions.select(index),
    switchToTab: (tabId: string) => ws().selectTabById(tabId),
    find: (text: string) => ctx.find.search(text),
    findNext: (forward: boolean) => ctx.find.again(forward),
    closeFind: () => ctx.find.close(),
    navigate: (text: string) => ctx.views.navigate(text),
    back: () => page()?.navigationHistory.goBack(),
    forward: () => page()?.navigationHistory.goForward(),
    reload: () => page()?.reload(),
    stop: () => page()?.stop(),
    newTab: () => ws().openTab(),
    openSettings: () => ws().openSettings(),
    closeTab: (tabId: string) => ws().closeTab(tabId),
    selectTab: (tabId: string) => ws().selectTabById(tabId),
    newWorkspace: () => ws().addWorkspace(),
    closeWorkspace: (wsId: string) => ws().closeWorkspace(wsId),
    selectWorkspace: (wsId: string) => ws().selectWorkspace(ctx.state.workspaces.findIndex((w) => w.id === wsId)),
    renameWorkspace: (arg: Rename) => ws().renameWorkspace(arg),
    renameTab: (arg: Rename) => ws().renameTab(arg),
    moveTabTo: (arg: TabMove) => ws().moveTabTo(arg),
    moveWorkspaceTo: (arg: WorkspaceMove) => ws().moveWorkspaceTo(arg),
    toggleSidebar: () => ws().toggleSidebar(),
    dismissNotice: () => ctx.passkeys.dismiss(),
    openExternally: () => ctx.passkeys.openExternally(),
    focusContent: () => ctx.views.focusContent(),
    toggleDownloads: (rect: Anchor) => ctx.downloads.toggle(rect),
    showDownloads: (rect: Anchor) => ctx.downloads.show(rect),
    hideDownloads: () => ctx.downloads.hide(),
  };
}

// The names the UI may send, and what each one's argument is.
export type Commands = ReturnType<typeof commands>;

export function handleUiIpc(ctx: Ctx) {
  // Looked up by a name from the page, so any name may come; the UI sends each one its own argument.
  const COMMANDS: Partial<Record<string, (arg: never) => void>> = commands(ctx);
  ipcMain.on('cmd', (_e, name: string, arg: unknown) => COMMANDS[name]?.(arg as never));
  // The UI asks for the state once it has loaded.
  ipcMain.on('ready', () => ctx.workspaces.broadcast());
}

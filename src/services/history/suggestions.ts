// Address bar suggestions: ranking them (the 'suggest' call from the browser UI) and the overlay
// view that draws the list on top of the page.
import { WebContentsView, ipcMain } from 'electron';
import path from 'path';
import { BLANK_URL } from '../../lib/url';
import { uiPage } from '../../lib/ui-build';
import type { Anchor, Ctx, SuggestionRow } from '../../types';

// What the address bar sends to show the list: its rows, the selected one, and where it goes.
export interface SuggestionsPayload {
  rows: SuggestionRow[];
  selected: number;
  rect: Anchor;
}

const SUGGEST_ROW_HEIGHT = 32; // row height (h-8) in src/ui/suggestions/SuggestionRow.svelte
const SUGGEST_PADDING = 10; // the list's padding + border, top and bottom (src/ui/suggestions/App.svelte)
// The preload as built: dist-main/ui/suggestions/preload.cjs.
const PRELOAD = path.join(__dirname, '..', '..', 'ui', 'suggestions', 'preload.cjs');

export function createSuggestions(ctx: Ctx) {
  let suggestView: WebContentsView | null = null;

  // The list floats over the page, so it lives in its own transparent view stacked above it.
  function show({ rows, selected, rect }: SuggestionsPayload) {
    if (!suggestView) {
      suggestView = new WebContentsView({
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          preload: PRELOAD,
        },
      });
      suggestView.setBackgroundColor('#00000000');
      suggestView.webContents.loadFile(uiPage('suggestions'));
    }
    const send = () => suggestView!.webContents.send('suggest-rows', { rows, selected });
    if (suggestView.webContents.isLoading()) suggestView.webContents.once('did-finish-load', send);
    else send();
    ctx.win.contentView.addChildView(suggestView); // (re-)adding puts it on top of the page view
    suggestView.setBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: rows.length * SUGGEST_ROW_HEIGHT + SUGGEST_PADDING,
    });
    suggestView.setVisible(true);
  }

  const hide = () => suggestView?.setVisible(false);
  const select = (index: number) => suggestView?.webContents.send('suggest-select', index);

  // Clicking into the page or leaving the window closes the list, like clicking away in Chrome.
  function close() {
    if (!suggestView?.getVisible()) return;
    suggestView!.setVisible(false);
    ctx.win.webContents.send('suggest-close');
  }

  ipcMain.on('suggest-hover', (_e, index: number) => ctx.win.webContents.send('suggest-hover', index));
  ipcMain.on('suggest-pick', (_e, index: number) => ctx.win.webContents.send('suggest-pick', index));

  // Open tabs (other than this one) and browsing history matching what is typed.
  ipcMain.handle('suggest', (_e, query: unknown) => {
    const current = ctx.workspaces.activeTab().id;
    const openTabs = ctx.state.workspaces.flatMap((ws) =>
      ws.tabs
        .filter((t) => t.id !== current && t.url !== BLANK_URL)
        .map((t) => ({ tabId: t.id, url: t.url, title: t.customName || t.title, favicon: t.favicon })),
    );
    return ctx.history.suggest(String(query || ''), openTabs);
  });

  return { show, hide, select, close };
}

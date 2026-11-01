// Address bar suggestions: ranking them (the 'suggest' call from the browser UI) and the overlay
// view that draws the list on top of the page.
const { WebContentsView, ipcMain } = require('electron');
const path = require('path');
const { BLANK_URL } = require('../../lib/url');

const SUGGEST_ROW_HEIGHT = 32; // .sg height in src/ui/browser/styles.css
const SUGGEST_PADDING = 10; // #suggestions padding + border, top and bottom
const UI_DIR = path.join(__dirname, '..', '..', 'ui', 'suggestions');

function createSuggestions(ctx) {
  let suggestView = null;

  // The list floats over the page, so it lives in its own transparent view stacked above it.
  function show({ rows, selected, rect }) {
    if (!suggestView) {
      suggestView = new WebContentsView({
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          preload: path.join(UI_DIR, 'preload.js'),
        },
      });
      suggestView.setBackgroundColor('#00000000');
      suggestView.webContents.loadFile(path.join(UI_DIR, 'index.html'));
    }
    const send = () => suggestView.webContents.send('suggest-rows', { rows, selected });
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
  const select = (index) => suggestView?.webContents.send('suggest-select', index);

  // Clicking into the page or leaving the window closes the list, like clicking away in Chrome.
  function close() {
    if (!suggestView?.getVisible()) return;
    suggestView.setVisible(false);
    ctx.win.webContents.send('suggest-close');
  }

  ipcMain.on('suggest-hover', (_e, index) => ctx.win.webContents.send('suggest-hover', index));
  ipcMain.on('suggest-pick', (_e, index) => ctx.win.webContents.send('suggest-pick', index));

  // Open tabs (other than this one) and browsing history matching what is typed.
  ipcMain.handle('suggest', (_e, query) => {
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

module.exports = { createSuggestions };

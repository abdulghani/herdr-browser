// The right-click menu on a page. The page's preload (src/ui/page-preload.js) stops WebKit's own
// menu and reports what was clicked: { linkURL, selectionText, isEditable }.
const Electrobun = require('electrobun/main');

const { ContextMenu, Utils } = Electrobun;

function createContextMenu(ctx) {
  const ACTIONS = {
    'open-link': ({ url, tabId }) => ctx.workspaces.openTab(url, ctx.workspaces.findTab(tabId)?.ws),
    'copy-link': ({ url }) => Utils.clipboardWriteText(url),
    back: () => ctx.views.pageAction('goBack'),
    forward: () => ctx.views.pageAction('goForward'),
    reload: () => ctx.views.pageAction('reload'),
    inspect: () => ctx.views.activeView()?.openDevTools(),
  };
  let listening = false;

  function show(tabId, { linkURL, selectionText, isEditable } = {}) {
    if (!listening) {
      listening = true;
      ContextMenu.on('context-menu-clicked', (e) => ACTIONS[e?.data?.action]?.(e.data.data || {}));
    }
    const items = [];
    const link = typeof linkURL === 'string' && /^(https?|file|mailto):/i.test(linkURL) ? linkURL : null;
    if (link) {
      items.push({ label: 'Open Link in New Tab', action: 'open-link', data: { url: link, tabId } });
      items.push({ label: 'Copy Link Address', action: 'copy-link', data: { url: link } });
      items.push({ type: 'separator' });
    }
    if (isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' });
    else if (selectionText) items.push({ role: 'copy' }, { type: 'separator' });
    // WebKit's views can't say from here whether there is a page to go back or forward to.
    items.push(
      { label: 'Back', action: 'back' },
      { label: 'Forward', action: 'forward' },
      { label: 'Reload', action: 'reload' },
      { type: 'separator' },
      { label: 'Inspect', action: 'inspect' },
    );
    ContextMenu.showContextMenu(items);
  }

  return { show };
}

module.exports = { createContextMenu };

// The right-click menu on a page.
import { Menu, clipboard, type ContextMenuParams, type MenuItemConstructorOptions, type WebContents } from 'electron';
import type { Ctx } from '../../types';

export function createContextMenu(ctx: Ctx) {
  function show(wc: WebContents, params: ContextMenuParams, tabId: string) {
    const items: MenuItemConstructorOptions[] = [];
    if (params.linkURL) {
      items.push({ label: 'Open Link in New Tab', click: () => ctx.workspaces.openTab(params.linkURL, ctx.workspaces.findTab(tabId)?.ws) });
      items.push({ label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) });
      items.push({ type: 'separator' });
    }
    if (params.mediaType === 'image' && params.srcURL) items.push(...imageItems(wc, params, tabId), { type: 'separator' });
    if (params.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' });
    else if (params.selectionText) items.push({ role: 'copy' }, { type: 'separator' });
    items.push(
      { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
      { label: 'Reload', click: () => wc.reload() },
      { type: 'separator' },
      { label: 'Inspect', click: () => wc.inspectElement(params.x, params.y) },
    );
    Menu.buildFromTemplate(items).popup({ window: ctx.win });
  }

  // Like Chrome's: the image's own address works for data: images too.
  function imageItems(wc: WebContents, params: ContextMenuParams, tabId: string): MenuItemConstructorOptions[] {
    const url = params.srcURL;
    return [
      { label: 'Open Image in New Tab', click: () => ctx.workspaces.openTab(url, ctx.workspaces.findTab(tabId)?.ws) },
      { label: 'Save Image As…', click: () => ctx.downloads.saveAs(wc, url) },
      { label: 'Copy Image', click: () => wc.copyImageAt(params.x, params.y) },
      { label: 'Copy Image Address', click: () => clipboard.writeText(url) },
    ];
  }

  return { show };
}

// Find in page: a find bar per tab, under the toolbar.
function createFind(ctx) {
  const finds = new Map(); // tabId -> { text, active, total } while its find bar is open

  const get = (tabId) => finds.get(tabId);
  const has = (tabId) => finds.has(tabId);
  const drop = (tabId) => finds.delete(tabId);

  function open() {
    const tab = ctx.workspaces.activeTab();
    if (!finds.has(tab.id)) {
      finds.set(tab.id, { text: '', active: 0, total: 0 });
      ctx.views.layout();
      ctx.workspaces.broadcast();
    }
    ctx.win.webContents.focus();
    ctx.win.webContents.send('focus-find');
  }

  function search(text, { forward = true, findNext = false } = {}) {
    const tab = ctx.workspaces.activeTab();
    const entry = finds.get(tab.id);
    const wc = ctx.views.get(tab.id)?.webContents;
    if (!entry || !wc) return;
    entry.text = text;
    if (text) {
      wc.findInPage(text, { forward, findNext });
    } else {
      wc.stopFindInPage('clearSelection');
      Object.assign(entry, { active: 0, total: 0 });
      ctx.workspaces.broadcast();
    }
  }

  function again(forward) {
    const text = finds.get(ctx.workspaces.activeTab().id)?.text;
    if (text) search(text, { forward, findNext: true });
    else open();
  }

  function close() {
    const tab = ctx.workspaces.activeTab();
    if (!finds.delete(tab.id)) return;
    ctx.views.get(tab.id)?.webContents.stopFindInPage('keepSelection');
    ctx.views.layout();
    ctx.workspaces.broadcast();
    ctx.views.activeWc()?.focus();
  }

  // The page reports how many matches there are and which one is selected.
  function onResult(tabId, result) {
    const find = finds.get(tabId);
    if (!find || !result.finalUpdate) return;
    Object.assign(find, { active: result.activeMatchOrdinal, total: result.matches });
    ctx.workspaces.broadcast();
  }

  return { get, has, drop, open, search, again, close, onResult };
}

module.exports = { createFind };

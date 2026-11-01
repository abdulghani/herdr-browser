// Find in page: a find bar per tab, under the toolbar. WebKit finds and highlights the matches
// (Electrobun's findInPage) but doesn't say how many there are, so the page's preload counts them
// (window.__herdrCountMatches in src/ui/page-preload.js) and reports back ('find').
function createFind(ctx) {
  const finds = new Map(); // tabId -> { text, total } while its find bar is open

  const get = (tabId) => finds.get(tabId);
  const has = (tabId) => finds.has(tabId);
  const drop = (tabId) => finds.delete(tabId);

  function open() {
    const tab = ctx.workspaces.activeTab();
    if (!finds.has(tab.id)) {
      finds.set(tab.id, { text: '', total: 0 });
      ctx.workspaces.broadcast();
    }
    ctx.views.focusUi();
    ctx.ui.send('focus-find');
  }

  function search(text, { forward = true } = {}) {
    const tab = ctx.workspaces.activeTab();
    const entry = finds.get(tab.id);
    const view = ctx.views.get(tab.id);
    if (!entry || !view) return;
    const changed = entry.text !== text;
    entry.text = text;
    if (text) {
      view.findInPage(text, { forward, matchCase: false });
      if (changed) view.executeJavascript(`window.__herdrCountMatches?.(${JSON.stringify(text)})`);
    } else {
      view.stopFindInPage();
      entry.total = 0;
      ctx.workspaces.broadcast();
    }
  }

  function again(forward) {
    const text = finds.get(ctx.workspaces.activeTab().id)?.text;
    if (text) search(text, { forward });
    else open();
  }

  function close() {
    const tab = ctx.workspaces.activeTab();
    if (!finds.delete(tab.id)) return;
    ctx.views.get(tab.id)?.stopFindInPage();
    ctx.workspaces.broadcast();
    ctx.views.focusContent();
  }

  // The page counted the matches of what is being searched.
  function onResult(tabId, total) {
    const find = finds.get(tabId);
    if (!find) return;
    find.total = Math.max(0, Number(total) || 0);
    ctx.workspaces.broadcast();
  }

  return { get, has, drop, open, search, again, close, onResult };
}

module.exports = { createFind };

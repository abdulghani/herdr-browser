// Address bar suggestions: ranking them for the 'suggest' request from the browser UI. The list
// itself is drawn by the UI over the page (src/ui/suggestions, shown through a mask in the page view).
const { BLANK_URL } = require('../../lib/url');

function createSuggestions(ctx) {
  // Open tabs (other than this one) and browsing history matching what is typed.
  function suggest(query) {
    const current = ctx.workspaces.activeTab().id;
    const openTabs = ctx.state.workspaces.flatMap((ws) =>
      ws.tabs
        .filter((t) => t.id !== current && t.url !== BLANK_URL)
        .map((t) => ({ tabId: t.id, url: t.url, title: t.customName || t.title, favicon: t.favicon })),
    );
    return ctx.history.suggest(String(query || ''), openTabs);
  }

  return { suggest };
}

module.exports = { createSuggestions };

// What the preload in every page (src/ui/page-preload.js) reports, through Electrobun's
// host-message bridge: the title and favicon (WebKit views have no events for them), key presses
// for the browser's shortcuts, focus, sound and camera use, right-clicks, find results and the
// settings page's requests. tabId is null for the browser UI itself, which runs the same preload.
// Also the notice bar shown under the toolbar of one tab.
const { BLANK_URL } = require('../../lib/url');

function createPages(ctx) {
  const tabOf = (tabId) => ctx.workspaces.findTab(tabId)?.tab;

  function update(tabId, fields) {
    const tab = tabOf(tabId);
    if (!tab) return;
    Object.assign(tab, fields);
    ctx.workspaces.broadcast();
  }

  const HANDLERS = {
    title: (tabId, { title }) => {
      const tab = tabOf(tabId);
      if (!tab) return;
      update(tabId, { title: !title || title === BLANK_URL ? (tab.url === BLANK_URL ? 'New Tab' : tab.url) : title });
      ctx.history.update(tab.url, { title });
    },
    favicon: (tabId, { url }) => {
      const tab = tabOf(tabId);
      if (!tab) return;
      update(tabId, { favicon: url || null });
      ctx.history.update(tab.url, { favicon: url });
    },
    key: (tabId, input) => ctx.keyboard.handleKey(input),
    // Clicking into a page closes the address bar suggestions and the downloads panel.
    focus: () => {
      ctx.ui.send('suggest-close');
      ctx.downloads.close();
    },
    media: (tabId, { active }) => ctx.sleeping.setMedia(tabId, !!active),
    'context-menu': (tabId, params) => ctx.contextMenu.show(tabId, params),
    find: (tabId, { total }) => ctx.find.onResult(tabId, total),
    'settings-get': (tabId) => ctx.settingsPage.reply(tabId),
  };

  function onMessage(tabId, message) {
    if (!message || typeof message !== 'object' || !Object.hasOwn(HANDLERS, message.type)) return;
    // Only the key presses count from the browser UI; the rest is about a tab's page.
    if (tabId === null && message.type !== 'key') return;
    HANDLERS[message.type](tabId, message);
  }

  // The notice bar under the toolbar of one tab; null hides it. Kinds: 'woke' (the tab slept, so
  // its back/forward history is gone).
  function setNotice(tabId, notice) {
    const tab = tabOf(tabId);
    if (!tab || (!tab.notice && !notice)) return;
    tab.notice = notice || undefined;
    ctx.workspaces.broadcast();
  }

  return { onMessage, setNotice };
}

module.exports = { createPages };

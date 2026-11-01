// The browser UI's side of the RPC with the main process (src/ipc.js), over Electrobun's
// Electroview. It gives the components the same window.herdr the Electron build's preload did,
// plus window.suggestions and window.downloads for the address bar suggestions and the downloads
// panel, which are drawn in this page over the page view (src/ui/browser/Overlays.svelte).

// Electroview is the class from 'electrobun/view' (passed in so tests can use a fake).
export function createBridge(Electroview, platform) {
  const listeners = {};
  const on = (channel, fn) => {
    (listeners[channel] ??= []).push(fn);
    return () => (listeners[channel] = listeners[channel].filter((other) => other !== fn));
  };
  const emit = (channel, payload) => (listeners[channel] ?? []).forEach((fn) => fn(payload));

  // Every message from main ('state', 'rename', 'focus-address', ...) goes to its listeners.
  const rpc = Electroview.defineRPC({ maxRequestTime: 10000, handlers: { requests: {}, messages: { '*': emit } } });
  new Electroview({ rpc });
  const send = (name, arg) => rpc.send.cmd({ name, arg });

  // Commands that stay in this page: the suggestion list is drawn here, under the address bar.
  const ROW_HEIGHT = 32; // h-8 in src/ui/suggestions/SuggestionRow.svelte
  const LIST_PADDING = 10; // the list's padding + border, top and bottom (src/ui/suggestions/App.svelte)
  const LOCAL = {
    showSuggestions: ({ rows, selected, rect }) => {
      emit('suggest-rows', { rows, selected });
      emit('suggest-overlay', { ...rect, height: rows.length * ROW_HEIGHT + LIST_PADDING });
    },
    hideSuggestions: () => emit('suggest-overlay', null),
    selectSuggestion: (index) => emit('suggest-select', index),
  };
  // A click into the page closes the list, like clicking away in Chrome.
  on('suggest-close', () => emit('suggest-overlay', null));
  // The keys this page's preload (src/ui/page-preload.js) passes on, as for every page.
  on('state', (state) => (window.__herdrKeys = state.keys));

  const herdr = {
    platform,
    cmd: (name, arg) => (Object.hasOwn(LOCAL, name) ? LOCAL[name](arg) : send(name, arg)),
    ready: () => rpc.send.ready(),
    suggest: (query) => rpc.request.suggest(query),
    on,
    // A tab's page view exists: tell main which native view it is.
    tabView: (tabId, webviewId) => rpc.send.tabView({ tabId, webviewId }),
  };

  const suggestions = {
    onRows: (fn) => on('suggest-rows', fn),
    onSelect: (fn) => on('suggest-select', fn),
    hover: (index) => emit('suggest-hover', index),
    pick: (index) => emit('suggest-pick', index),
  };

  const downloads = {
    onRows: (fn) => on('downloads-rows', fn),
    action: (action, id) => send('downloadsAction', { action, id }),
    clear: () => send('downloadsClear'),
    openFolder: () => send('downloadsFolder'),
    pointer: () => send('downloadsPointer'),
  };

  return { herdr, suggestions, downloads };
}

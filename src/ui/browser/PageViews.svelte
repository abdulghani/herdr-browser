<script>
  // The pages: one <electrobun-webview> per awake tab, filling this box under the bars. Each tag is
  // a native WebKit view that Electrobun lays over this spot of the window; only the shown tab's is
  // visible. The tags are made by hand, not by the template, so a page is never reloaded by a
  // redraw. The address bar suggestions and the downloads panel are drawn by this page over the
  // views: the views cut holes ("masks") where those overlays are.
  import { onDestroy } from 'svelte';
  import preloadSource from '../page-preload.js?raw';

  let { appState, onnav } = $props();
  const herdr = window.herdr;

  const MASKS = '#suggestions-overlay,#downloads-overlay';
  const BLANK = 'about:blank';
  const ACTIONS = ['goBack', 'goForward', 'reload'];
  let box;
  // Not drawn from, so they don't need to be reactive.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const tags = new Map(); // tabId -> the tag
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const timers = new Set();
  onDestroy(() => timers.forEach(clearInterval));

  // The tag gets its native view a moment after it is added; then main is told which view is the
  // tab's, and the view is shown or hidden like the rest.
  function whenReady(tag, fn) {
    if (tag.webviewId != null) return fn();
    const timer = setInterval(() => {
      if (tag.webviewId == null && tag.isConnected) return;
      clearInterval(timer);
      timers.delete(timer);
      if (tag.isConnected) fn();
    }, 30);
    timers.add(timer);
  }

  function create(tabId, src, keys) {
    const tag = document.createElement('electrobun-webview');
    tag.dataset.tab = tabId;
    tag.className = 'page-view';
    // Web pages get no Electrobun RPC: only the events and the host-message bridge.
    tag.setAttribute('sandbox', '');
    tag.setAttribute('renderer', 'native');
    tag.setAttribute('masks', MASKS);
    tag.setAttribute('preload', `window.__herdrKeys=${JSON.stringify(keys || [])};\n${preloadSource}`);
    tag.setAttribute('src', src);
    // A blank tab shows the browser's dark background instead of a white page.
    if (src === BLANK) tag.setAttribute('transparent', '');
    // The box has no template content, so Svelte has nothing here to get confused about.
    // eslint-disable-next-line svelte/no-dom-manipulating
    box.append(tag);
    tag.on?.('did-navigate', (e) => {
      const blank = e.detail === BLANK;
      if (tag.transparent !== blank) tag.toggleTransparent(blank);
    });
    for (const event of ['did-navigate', 'did-navigate-in-page']) tag.on?.(event, () => tabId === appState?.shown && updateNav());
    whenReady(tag, () => {
      herdr.tabView(tabId, tag.webviewId);
      show(tag, tabId === appState?.shown);
      if (tabId === appState?.shown) updateNav();
    });
    return tag;
  }

  // A hidden view still takes the mouse, so it also lets clicks through to the view under it.
  function show(tag, visible) {
    if (tag.webviewId == null || tag.hidden === !visible) return;
    tag.toggleHidden(!visible);
    tag.togglePassthrough(!visible);
    if (visible) updateNav();
  }

  // Back and forward for the toolbar, asked from the shown tab's view.
  async function updateNav() {
    const tag = tags.get(appState?.shown);
    if (!tag?.canGoBack) return onnav({ canGoBack: false, canGoForward: false });
    const [canGoBack, canGoForward] = await Promise.all([tag.canGoBack(), tag.canGoForward()]);
    if (tags.get(appState?.shown) === tag) onnav({ canGoBack, canGoForward });
  }

  function sync(state) {
    const wanted = new Map((state.pages ?? []).map((page) => [page.id, page.src]));
    for (const [tabId, tag] of tags) {
      if (wanted.has(tabId)) continue;
      tag.remove();
      tags.delete(tabId);
    }
    for (const [tabId, src] of wanted) if (!tags.has(tabId)) tags.set(tabId, create(tabId, src, state.keys));
    for (const [tabId, tag] of tags) show(tag, tabId === state.shown);
    if (!tags.has(state.shown)) onnav({ canGoBack: false, canGoForward: false });
  }

  $effect(() => {
    if (appState) sync(appState);
  });

  // An overlay opened, moved or closed: cut the holes for it again.
  const resync = () => tags.forEach((tag) => tag.syncDimensions?.(true));
  window.addEventListener('herdr-overlays', resync);
  onDestroy(() => window.removeEventListener('herdr-overlays', resync));

  // Back, forward and reload from the toolbar, the keys and the context menu (through main).
  herdr.on('page-action', ({ tabId, action }) => {
    const tag = tags.get(tabId);
    if (tag && ACTIONS.includes(action)) tag[action]();
  });
</script>

<div id="pages" class="relative min-h-0 flex-1" bind:this={box}></div>

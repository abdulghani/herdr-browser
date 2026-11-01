// Runs before the page's own scripts in every tab (the <electrobun-webview> tags' preload, see
// src/ui/browser/PageViews.svelte) and in the browser UI itself (imported by
// src/ui/browser/main.js). It is a plain script, injected as text, so it can't import anything.
// It reports to the main process through Electrobun's host-message bridge
// (window.__electrobunSendToHost; handled in src/services/tab-views/pages.js):
//   - the browser's shortcuts: WebKit gives the main process no look at key presses, so the keys
//     listed in window.__herdrKeys are passed on and kept from the page (keys with Cmd come through
//     the application menu instead). A page whose own capture listener on window runs first and
//     stops the event can still swallow a key.
//   - the title and favicon, which WebKit views report no events for
//   - focus (to close the address bar suggestions), sound and camera/mic use (to keep the tab
//     awake), right-clicks (for the browser's context menu) and how many matches find in page has
//   - on the settings page, window.herdrSettings to ask for what it shows
// It runs once per document, but a tab's first page (about:blank) hands its window object on to
// the next page, so what is set on the window is only set up once per window.
(() => {
  if (window.__herdrPreloadDocument === document) return;
  const firstInWindow = !window.__herdrPreloadDocument;
  window.__herdrPreloadDocument = document;

  const send = (message) => window.__electrobunSendToHost?.(message);
  const isTop = window === window.top;
  const isBrowserUi = () => location.href.startsWith('views://ui/browser/');

  const isTextField = (el) =>
    !!el &&
    (el.isContentEditable ||
      el.tagName === 'TEXTAREA' ||
      (el.tagName === 'INPUT' &&
        !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(el.type)));

  // ---------- keys ----------

  // A key press -> the name used in the key tables, as src/lib/keys.js does it.
  const KEY_NAMES = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ' ': 'space',
    Tab: 'tab',
    '+': '=',
    _: '-',
    '{': '[',
    '}': ']',
  };
  function chordOf(e) {
    if (e.key === '?') return '?';
    const key = e.code === 'Space' ? 'space' : KEY_NAMES[e.key] || e.key.toLowerCase();
    const mods = [e.ctrlKey && 'ctrl', e.altKey && 'alt', e.metaKey && 'cmd', e.shiftKey && 'shift'].filter(Boolean);
    return [...mods, key].join('+');
  }

  // Option+arrow (with or without Shift) moves or selects by word in a text field.
  const WORD_MOVE = /^alt\+(shift\+)?(left|right|up|down)$/;
  let prefixUntil = 0; // after Ctrl+Space, the next key goes to the browser

  function forward(e) {
    send({ type: 'key', key: e.key, code: e.code, control: e.ctrlKey, alt: e.altKey, meta: e.metaKey, shift: e.shiftKey });
  }

  function stop(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onKeyDown(e) {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key) || e.isComposing) return;
    const chord = chordOf(e);
    if (prefixUntil > Date.now()) {
      prefixUntil = 0;
      stop(e);
      return forward(e);
    }
    // Escape closes the find bar or downloads panel, and still reaches the page.
    if (chord === 'escape') return forward(e);
    if (!(window.__herdrKeys || []).includes(chord)) return;
    if (WORD_MOVE.test(chord) && isTextField(e.composedPath()[0])) return;
    stop(e);
    if (chord === 'ctrl+space') prefixUntil = Date.now() + 2000;
    forward(e);
  }

  // ---------- right-click ----------

  // After the page's own handlers (bubbling, on window): a page with its own menu keeps it.
  function onContextMenu(e) {
    const target = e.composedPath()[0];
    if (e.defaultPrevented || (isBrowserUi() && isTextField(target))) return;
    e.preventDefault();
    if (isBrowserUi()) return;
    const link = e.composedPath().find((el) => el.tagName === 'A' && el.href);
    send({
      type: 'context-menu',
      linkURL: link ? String(link.href) : '',
      selectionText: String(window.getSelection?.() || ''),
      isEditable: isTextField(target),
    });
  }

  // ---------- focus, sound and camera ----------

  let mediaActive = false;
  let capturing = false;
  const playing = new Set();
  function reportMedia() {
    const active = capturing || playing.size > 0;
    if (active !== mediaActive) send({ type: 'media', active: (mediaActive = active) });
  }

  // A page that asked for the camera or mic is likely in a call: keep it awake until it navigates.
  function watchCapture() {
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) return;
    const getUserMedia = media.getUserMedia.bind(media);
    media.getUserMedia = (constraints) =>
      getUserMedia(constraints).then((stream) => {
        capturing = true;
        reportMedia();
        return stream;
      });
  }

  // ---------- once per window ----------

  if (firstInWindow) {
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointerdown', () => !isBrowserUi() && send({ type: 'focus' }), true);
    // Back and forward can bring a page back from WebKit's cache without loading it again.
    window.addEventListener('pageshow', (e) => e.persisted && window.__herdrReportPage?.(true));
    watchCapture();
  }

  if (isBrowserUi()) return;

  // ---------- once per page ----------

  document.addEventListener('play', (e) => playing.add(e.target) && reportMedia(), true);
  for (const type of ['pause', 'ended', 'emptied']) document.addEventListener(type, (e) => playing.delete(e.target) && reportMedia(), true);

  if (!isTop) return;

  // The title and favicon, whenever they change.
  let lastTitle = null;
  let lastIcon = null;
  function reportPage(again = false) {
    if (again) lastTitle = lastIcon = null;
    const title = document.title;
    if (title !== lastTitle) send({ type: 'title', title: (lastTitle = title) });
    const link = document.querySelector('link[rel~="icon" i]');
    const fallback = /^https?:$/.test(location.protocol) ? `${location.origin}/favicon.ico` : '';
    const icon = link?.href || fallback;
    if (icon !== lastIcon) send({ type: 'favicon', url: (lastIcon = icon) });
  }
  window.__herdrReportPage = reportPage;
  document.addEventListener('DOMContentLoaded', () => {
    reportPage();
    new MutationObserver(() => reportPage()).observe(document.head || document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  });
  document.addEventListener('readystatechange', () => document.readyState === 'complete' && reportPage());

  // How many times the text appears in the page (case-insensitive), for the find bar's count.
  window.__herdrCountMatches = (text) => {
    const needle = String(text).toLowerCase();
    const haystack = (document.body?.innerText || '').toLowerCase();
    let total = 0;
    for (let at = needle ? haystack.indexOf(needle) : -1; at !== -1; at = haystack.indexOf(needle, at + needle.length)) total++;
    send({ type: 'find', total });
  };

  // The settings page asks for what it shows.
  if (location.href.startsWith('views://ui/settings/')) {
    const waiting = [];
    window.herdrSettings = {
      get: () =>
        new Promise((resolve) => {
          waiting.push(resolve);
          send({ type: 'settings-get' });
        }),
    };
    window.__herdrSettingsReply = (data) => waiting.splice(0).forEach((resolve) => resolve(data));
  }
})();

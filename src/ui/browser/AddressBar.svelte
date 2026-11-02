<script>
  // The address bar, and the suggestions under it. The list is drawn by an overlay view on top of
  // the page (src/ui/suggestions); this side owns the rows and the selection, and tells main where
  // to put the overlay.
  import { onDestroy, untrack } from 'svelte';

  let { tab } = $props();
  const herdr = window.herdr;
  const cmd = herdr.cmd;

  let input;
  let value = $state('');
  let lastTabId = null;

  let rows = []; // [{ kind: 'typed' | 'tab' | 'history', ... }]
  let selected = 0;
  let seq = 0;
  let open = false;
  let timers = []; // pending blur checks
  onDestroy(() => timers.forEach(clearTimeout));

  // Wait a moment before closing on blur, since a press on the overlay also moves focus out of here
  // just before its pick arrives.
  function onblur() {
    const timer = setTimeout(() => {
      timers = timers.filter((t) => t !== timer);
      if (!hasFocus()) hide();
    }, 150);
    timers.push(timer);
  }

  // Clicking the page moves focus to another view: the address bar stays this document's active
  // element, but the document itself loses focus.
  const hasFocus = () => document.hasFocus() && document.activeElement === input;

  // Show the tab's address, without clobbering what is typed unless the tab changed. Once the page
  // has focus (e.g. a link in it was clicked), the address follows it again.
  function sync() {
    if (!tab) return;
    if (!hasFocus() || tab.id !== lastTabId) value = tab.url === 'about:blank' ? '' : tab.url;
    if (tab.id !== lastTabId) hide();
    lastTabId = tab.id;
  }
  $effect(() => {
    tab;
    untrack(sync);
  });

  // On focus, a blank tab lists recent pages; other tabs wait for typing (so clicking in to copy
  // the address doesn't pop a list over the page).
  async function update({ onFocus = false } = {}) {
    if (!hasFocus()) return hide();
    if (onFocus && tab?.url !== 'about:blank') return;
    const query = input.value.trim();
    const mine = ++seq;
    const matches = await herdr.suggest(query);
    if (mine !== seq || !hasFocus()) return; // a newer keystroke won, or focus left
    rows = query ? [{ kind: 'typed', query }, ...matches] : matches;
    selected = 0;
    if (!rows.length) return hide();
    show();
  }

  function show() {
    const { left, bottom, width } = input.getBoundingClientRect();
    cmd('showSuggestions', { rows, selected, rect: { x: left, y: bottom + 4, width } });
    open = true;
  }

  function hide() {
    seq++;
    rows = [];
    if (open) cmd('hideSuggestions');
    open = false;
  }

  function pick(row) {
    if (!row) return;
    if (row.kind === 'tab') cmd('switchToTab', row.tabId);
    else cmd('navigate', row.kind === 'typed' ? row.query : row.url);
    hide();
    input.blur();
  }

  function onkeydown(e) {
    if (open && e.key === 'Enter') {
      e.preventDefault();
      pick(rows[selected]);
    } else if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      cmd('selectSuggestion', selected);
    } else if (e.key === 'Escape') {
      if (open) return hide();
      sync();
      cmd('focusContent');
    }
  }

  function onsubmit(e) {
    e.preventDefault();
    cmd('navigate', input.value);
    input.blur();
  }

  herdr.on('suggest-hover', (i) => (selected = i));
  herdr.on('suggest-pick', (i) => pick(rows[i]));
  herdr.on('suggest-close', () => hide());
  herdr.on('focus-address', () => {
    input.focus();
    input.select();
  });
</script>

<svelte:window onresize={() => open && show()} />

<form id="address-form" class="ml-1.5 flex-1" {onsubmit}>
  <input
    id="address"
    bind:this={input}
    bind:value
    class="h-7 w-full rounded-md border border-border bg-panel px-2.5 text-fg outline-none select-text focus:border-accent"
    spellcheck="false"
    autocomplete="off"
    placeholder="Search or enter address"
    onfocus={() => {
      input.select();
      update({ onFocus: true });
    }}
    {onblur}
    oninput={() => update()}
    {onkeydown}
  />
</form>

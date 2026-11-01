<script>
  // Draws the address bar suggestions the browser UI (src/ui/browser/AddressBar.svelte) computed;
  // reports hover and picks back.
  import SuggestionRow from './SuggestionRow.svelte';

  const api = window.suggestions;

  let rows = $state.raw([]);
  let selected = $state(0);
  let lastMouse = { x: null, y: null };

  api.onRows((list) => {
    rows = list.rows;
    selected = list.selected;
  });
  api.onSelect((i) => (selected = i));

  // Only move the highlight when the mouse really moved: a list opening under a resting pointer
  // shouldn't change what Enter picks.
  function onmousemove(e, i) {
    const first = lastMouse.x === null; // just where the pointer was when the list appeared
    if (e.screenX === lastMouse.x && e.screenY === lastMouse.y) return;
    lastMouse = { x: e.screenX, y: e.screenY };
    if (first || i === selected) return;
    selected = i;
    api.hover(i);
  }

  // Pick on press: pressing here moves focus out of the address bar, which closes the list.
  function onmousedown(e, i) {
    e.preventDefault();
    api.pick(i);
  }
</script>

<ol id="suggestions" class="rounded-lg border border-border bg-panel p-1">
  {#each rows as row, i (i)}
    <SuggestionRow {row} selected={i === selected} onmousemove={(e) => onmousemove(e, i)} onmousedown={(e) => onmousedown(e, i)} />
  {/each}
</ol>

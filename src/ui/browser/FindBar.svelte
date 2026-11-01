<script>
  // Find in page, under the toolbar (and the notice bar) while it is open for the tab.
  import { untrack } from 'svelte';

  let { find, tabId } = $props();
  const herdr = window.herdr;
  const cmd = herdr.cmd;

  let input;
  let text = $state('');
  let findTabId = null;

  // Don't clobber what the user is typing, unless they switched tabs.
  $effect(() => {
    if (!find) return;
    const id = tabId;
    untrack(() => {
      if (document.activeElement !== input || id !== findTabId) text = find.text;
      findTabId = id;
    });
  });

  const count = $derived(find?.text ? `${find.active}/${find.total}` : '');
  const none = $derived(!!find?.text && !find.total);

  herdr.on('focus-find', () => {
    input.focus();
    input.select();
  });
</script>

<div id="find" class="flex h-find items-center gap-1.5 border-b border-border bg-panel pr-2 pl-2.5" hidden={!find}>
  <input
    id="find-input"
    bind:this={input}
    bind:value={text}
    class="h-[26px] w-[260px] rounded-md border border-border bg-bg px-2.5 text-fg outline-none select-text focus:border-accent"
    spellcheck="false"
    autocomplete="off"
    placeholder="Find in page"
    oninput={() => cmd('find', input.value)}
    onkeydown={(e) => {
      if (e.key === 'Enter') cmd('findNext', !e.shiftKey);
      else if (e.key === 'Escape') cmd('closeFind');
    }}
  />
  <span id="find-count" class={['min-w-12 text-[11px]', none ? 'none text-error' : 'text-muted']}>{count}</span>
  <button id="find-prev" class="h-6 text-[14px]" title="Previous match (Shift+Enter, Cmd+Shift+G)" onclick={() => cmd('findNext', false)}
    >↑</button
  >
  <button id="find-next" class="h-6 text-[14px]" title="Next match (Enter, Cmd+G)" onclick={() => cmd('findNext', true)}>↓</button>
  <button id="find-close" class="h-6 text-[14px]" title="Close (Esc)" onclick={() => cmd('closeFind')}>×</button>
</div>

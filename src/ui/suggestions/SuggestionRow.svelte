<script>
  // One suggestion: what was typed (open or search), or a page from history or an open tab.
  import Highlighted from './Highlighted.svelte';
  import { looksLikeUrl } from './highlight.js';

  let { row, selected, onmousemove, onmousedown } = $props();

  let brokenFavicon = $state(null);
  const url = $derived(row.kind === 'typed' && looksLikeUrl(row.query));
  const detail = $derived.by(() => {
    if (row.kind === 'typed') return url ? 'open' : 'search Google';
    return row.kind === 'tab' ? 'switch to tab' : '';
  });
  const icon = 'sg-icon size-3.5 flex-none rounded-[2px] text-center leading-[14px] text-muted';
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions (the keyboard stays in the address bar) -->
<li
  class={[
    'sg flex h-8 cursor-pointer items-center gap-2.5 rounded-[5px] px-2.5 whitespace-nowrap text-fg',
    selected && 'selected bg-panel-2',
  ]}
  {onmousemove}
  {onmousedown}
>
  {#if row.kind === 'typed'}
    <span class={icon}>{url ? '↗' : '⌕'}</span>
    <span class="sg-title flex-[0_1_auto] truncate">{row.query}</span>
  {:else}
    {#if row.favicon && row.favicon !== brokenFavicon}
      <img class={icon} src={row.favicon} alt="" onerror={() => (brokenFavicon = row.favicon)} />
    {:else}
      <span class={[icon, 'favicon-blank bg-border']}></span>
    {/if}
    <span class="sg-title flex-[0_1_auto] truncate"
      ><Highlighted text={row.title || row.displayUrl} positions={row.title ? row.highlight.title : row.highlight.url} /></span
    >
    {#if row.title}
      <span class="sg-url flex-[1_1_0] truncate text-muted before:content-['—_']"
        ><Highlighted text={row.displayUrl} positions={row.highlight.url} /></span
      >
    {/if}
  {/if}
  <span class="sg-detail ml-auto flex-none pl-2.5 text-[11px] text-muted">{detail}</span>
</li>

<script>
  // One tab: number, favicon (in a dashed ring while asleep), title and close button.
  import { draggable, dragState } from './drag.svelte.js';
  import { tabLabel } from './labels.js';
  import RenameInput from './RenameInput.svelte';

  let { tab, index, wsId, active, asleep, cmd, renaming, onrename, onfinishrename } = $props();

  // A favicon that failed to load shows as a blank square instead.
  let brokenFavicon = $state(null);
  const showFavicon = $derived(tab.favicon && tab.favicon !== brokenFavicon);

  const dnd = $derived(
    draggable('tab', tab.id, (dragged) => {
      if (dragged.kind === 'tab') cmd('moveTabTo', { tabId: dragged.id, wsId, index });
    }),
  );
  const look = $derived(dragState('tab', tab.id));
  const icon = $derived([
    'flex-none',
    asleep ? 'sleeping-ring mx-0.5 -my-1 size-[22px] rounded-full p-1' : 'size-3.5 rounded-[2px]',
    !showFavicon && 'favicon-blank',
    !showFavicon && !asleep && 'bg-border',
  ]);
</script>

<li
  class={[
    'tab app-no-drag group relative flex min-w-[90px] flex-[0_1_200px] cursor-pointer items-center gap-1.5 border-r border-border pr-1.5 pl-2.5',
    active
      ? "active bg-bg text-fg after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-accent after:content-['']"
      : 'text-muted hover:bg-panel-2 hover:text-fg',
    asleep && 'asleep',
    look,
    look === 'dragging' && 'opacity-40',
    look === 'drop-before' && 'shadow-[inset_2px_0_0_var(--color-accent)]',
  ]}
  data-id={tab.id}
  title={`${tabLabel(tab)}\n${tab.url}`}
  onclick={() => cmd('selectTab', tab.id)}
  onauxclick={(e) => e.button === 1 && cmd('closeTab', tab.id)}
  ondblclick={() => onrename('tab', tab.id)}
  {...dnd}
>
  <span class="tab-num text-[10px] text-accent">{index + 1}</span>
  {#if showFavicon}
    <img class={icon} src={tab.favicon} alt="" onerror={() => (brokenFavicon = tab.favicon)} />
  {:else}
    <span class={icon}></span>
  {/if}
  <span class="tab-title flex-1 truncate"
    >{#if renaming}<RenameInput value={tabLabel(tab)} onfinish={onfinishrename} />{:else}{tabLabel(tab)}{/if}</span
  >
  <button
    class={['close px-1', !active && 'invisible group-hover:visible']}
    title="Close"
    onclick={(e) => {
      e.stopPropagation();
      cmd('closeTab', tab.id);
    }}>×</button
  >
</li>

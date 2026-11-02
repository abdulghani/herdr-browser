<script lang="ts">
  // The tabs of the active workspace, across the top. On macOS it is also the title bar.
  import TabItem from './TabItem.svelte';
  import type { HerdrApi } from './preload';
  import type { UiState } from '../../types';

  let {
    appState,
    cmd,
    mac,
    renaming,
    onrename,
    onfinishrename,
  }: {
    appState: UiState | null;
    cmd: HerdrApi['cmd'];
    mac: boolean;
    renaming: { kind: 'tab' | 'workspace'; id: string } | null;
    onrename: (kind: 'tab', id: string) => void;
    onfinishrename: (commit: boolean, name: string) => void;
  } = $props();

  let list: HTMLOListElement;
  const ws = $derived(appState?.workspaces[appState.activeWs]);

  // Keep the active tab in view.
  $effect(() => {
    if (ws) list.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  // A double click on empty space opens a tab.
  const ondblclick = (e: MouseEvent) => {
    const { id } = e.target as HTMLElement;
    return id === 'tabs' || id === 'tabstrip' ? cmd('newTab') : null;
  };
</script>

<nav
  id="tabstrip"
  class={['app-drag flex h-tabstrip items-stretch border-b border-border bg-panel', mac && appState?.sidebarCollapsed && 'pl-7']}
  {ondblclick}
>
  <ol id="tabs" bind:this={list} class="flex min-w-0 [scrollbar-width:none] overflow-x-auto">
    {#each ws?.tabs ?? [] as tab, i (tab.id)}
      <TabItem
        {tab}
        index={i}
        wsId={ws!.id}
        active={i === ws!.activeTab}
        asleep={!appState!.awake.includes(tab.id)}
        renaming={renaming?.kind === 'tab' && renaming.id === tab.id}
        {cmd}
        {onrename}
        {onfinishrename}
      />
    {/each}
  </ol>
  <button id="new-tab" class="app-no-drag m-1.5 text-[16px]" title="New tab (Ctrl+T)" onclick={() => cmd('newTab')}>+</button>
</nav>

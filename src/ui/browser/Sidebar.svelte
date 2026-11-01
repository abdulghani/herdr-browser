<script>
  // The workspaces down the left. Collapsed, it is a rail of initials.
  import WorkspaceItem from './WorkspaceItem.svelte';

  let { appState, cmd, mac, renaming, onrename, onfinishrename, helpOpen = $bindable() } = $props();

  const collapsed = $derived(!!appState?.sidebarCollapsed);
  const headerPadding = $derived.by(() => {
    if (collapsed) return mac ? 'pt-tabstrip' : 'p-0';
    return mac ? 'pr-2 pl-20' : 'pr-2 pl-3';
  });
</script>

<aside
  id="sidebar"
  class={['relative flex flex-none flex-col border-r border-border bg-panel', collapsed ? 'w-sidebar-collapsed' : 'w-sidebar']}
>
  <header
    class={[
      'app-drag flex items-center border-b border-border text-[10px] tracking-[0.08em] text-muted uppercase',
      collapsed ? 'min-h-tabstrip flex-col justify-center' : 'h-tabstrip justify-between',
      headerPadding,
    ]}
  >
    {#if !collapsed}
      <span class="label flex-1">workspaces</span>
      <button
        id="new-ws"
        class="app-no-drag h-6 text-[16px] tracking-normal"
        title="New workspace (Ctrl+Space Shift+C)"
        onclick={() => cmd('newWorkspace')}>+</button
      >
    {/if}
    <button
      id="collapse"
      class="app-no-drag h-6 text-[14px] tracking-normal"
      title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
      onclick={() => cmd('toggleSidebar')}>{collapsed ? '»' : '«'}</button
    >
  </header>

  <ol id="workspaces" class={['flex-1 overflow-y-auto', collapsed ? '[scrollbar-width:none] px-0 py-1.5' : 'p-1.5']}>
    {#each appState?.workspaces ?? [] as ws, i (ws.id)}
      <WorkspaceItem
        {ws}
        index={i}
        active={i === appState.activeWs}
        {collapsed}
        renaming={renaming?.kind === 'workspace' && renaming.id === ws.id}
        {cmd}
        {onrename}
        {onfinishrename}
      />
    {/each}
    {#if collapsed}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (the keyboard has its own shortcuts) -->
      <li class="ws-add group flex cursor-pointer justify-center py-[3px]" title="New workspace" onclick={() => cmd('newWorkspace')}>
        <span
          class="flex size-9 items-center justify-center rounded-lg border border-dashed border-border text-[16px] text-muted group-hover:border-muted group-hover:text-fg"
          >+</span
        >
      </li>
    {/if}
  </ol>

  {#if !collapsed}
    <footer id="help" class="border-t border-border px-3 pt-2.5 pb-[34px] text-[10.5px] leading-[1.8] text-muted" hidden={!helpOpen}>
      <div><kbd>C-Space</kbd> prefix</div>
      <div><kbd>c</kbd>/<kbd>k</kbd>/<kbd>r</kbd> new/close/rename tab</div>
      <div><kbd>C</kbd>/<kbd>K</kbd>/<kbd>R</kbd> same for workspace</div>
      <div><kbd>n</kbd>/<kbd>p</kbd> <kbd>N</kbd>/<kbd>P</kbd> next/prev</div>
      <div><kbd>1-9</kbd> tab · <kbd>b</kbd> collapse sidebar</div>
      <div><kbd>A-←→</kbd> tabs · <kbd>A-↑↓</kbd> workspaces</div>
      <div><kbd>A-S-arrows</kbd> move tab/ws</div>
      <div><kbd>C-t</kbd> <kbd>C-w</kbd> <kbd>C-l</kbd> <kbd>C-1-9</kbd> ws</div>
      <div><kbd>C-[</kbd>/<kbd>C-]</kbd> back/forward</div>
      <div><kbd>C-,</kbd> settings · <kbd>C-j</kbd> downloads</div>
    </footer>
    <button
      id="help-toggle"
      class="absolute right-2 bottom-1.5 h-[22px]"
      title="Keybindings (Ctrl+Space ?)"
      onclick={() => (helpOpen = !helpOpen)}>?</button
    >
  {/if}
</aside>

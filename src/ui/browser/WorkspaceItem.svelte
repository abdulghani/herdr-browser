<script lang="ts">
  // One workspace in the sidebar: number, name and tab count, or its initials in the collapsed rail.
  import { draggable, dragState } from './drag.svelte';
  import { initials, workspaceTitle } from './labels';
  import RenameInput from './RenameInput.svelte';
  import type { HerdrApi } from './preload';
  import type { Workspace } from '../../types';

  let {
    ws,
    index,
    active,
    collapsed,
    cmd,
    renaming,
    onrename,
    onfinishrename,
  }: {
    ws: Workspace;
    index: number;
    active: boolean;
    collapsed: boolean;
    cmd: HerdrApi['cmd'];
    renaming: boolean;
    onrename: (kind: 'workspace', id: string) => void;
    onfinishrename: (commit: boolean, name: string) => void;
  } = $props();

  // Tabs dropped on a workspace move into it; workspaces dropped on one reorder.
  const dnd = $derived(
    draggable('ws', ws.id, (dragged) => {
      if (dragged.kind === 'tab') cmd('moveTabTo', { tabId: dragged.id, wsId: ws.id });
      else cmd('moveWorkspaceTo', { wsId: dragged.id, index });
    }),
  );
  const look = $derived(dragState('ws', ws.id));
  const fill = $derived.by(() => {
    if (collapsed) return 'h-auto justify-center py-[3px]';
    return ['mb-0.5 h-[30px] rounded border-l-2 border-transparent pr-1.5 pl-2', active ? 'bg-accent text-accent-fg' : 'hover:bg-panel-2'];
  });
</script>

<li
  class={[
    'ws group flex cursor-pointer items-center gap-2',
    fill,
    active && 'active',
    look,
    look === 'dragging' && 'opacity-40',
    look === 'drop-before' && 'shadow-[inset_0_2px_0_var(--color-accent)]',
    look === 'drop-into' && 'outline-1 -outline-offset-1 outline-accent outline-dashed',
  ]}
  data-id={ws.id}
  title={workspaceTitle(ws)}
  onclick={() => cmd('selectWorkspace', ws.id)}
  ondblclick={() => onrename('workspace', ws.id)}
  {...dnd}
>
  {#if collapsed}
    <span
      class={[
        'ws-icon relative flex size-9 items-center justify-center rounded-lg text-[12px] font-bold tracking-[0.03em] group-hover:outline-1 group-hover:outline-border',
        active ? 'bg-accent text-accent-fg' : 'bg-panel-2 text-fg',
      ]}
      >{initials(ws.name)}<span
        class="ws-badge absolute -right-[3px] -bottom-[3px] h-3.5 min-w-3.5 rounded-[7px] border border-border bg-bg px-[3px] text-center text-[9px] leading-3 font-normal text-muted"
        >{index + 1}</span
      ></span
    >
  {:else}
    <span class={['ws-num w-3 text-right', active ? 'text-accent-fg' : 'text-muted']}>{index + 1}</span>
    <span class="ws-name flex-1 truncate"
      >{#if renaming}<RenameInput value={ws.name} onfinish={onfinishrename} />{:else}{ws.name}{/if}</span
    >
    <span class={['ws-count text-[10px]', active ? 'text-accent-fg' : 'text-muted']}>{ws.tabs.length}</span>
    <button
      class={['close invisible px-1 group-hover:visible', active && 'text-accent-fg']}
      title="Close"
      onclick={(e) => {
        e.stopPropagation();
        cmd('closeWorkspace', ws.id);
      }}>×</button
    >
  {/if}
</li>

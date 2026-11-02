<script lang="ts">
  // Draws the downloads panel from the rows the main process sends (src/services/downloads), and
  // sends back what is clicked: open, show in folder, pause, resume, cancel, retry or remove.
  import DownloadRow from './DownloadRow.svelte';
  import type { DownloadRow as Row } from '../../types';

  const api = window.downloads;

  let rows = $state.raw<Row[]>([]);
  const nothingToClear = $derived(!rows.some((row) => row.state !== 'progressing'));

  api.onRows((list) => (rows = list));
</script>

<!-- Pointing at the panel keeps it open when a new download opened it. -->
<svelte:body onmouseenter={() => api.pointer()} />

<section class="flex h-screen w-[360px] flex-col overflow-hidden rounded-lg border border-border bg-panel">
  <header class="flex h-10 flex-none items-center gap-0.5 border-b border-border pr-2 pl-3.5">
    <span class="flex-1 font-bold text-fg">Downloads</span>
    <button id="dl-folder" class="h-6 text-[11px]" title="Open the Downloads folder" onclick={() => api.openFolder()}>Open folder</button>
    <button
      id="dl-clear"
      class="h-6 text-[11px]"
      title="Remove finished downloads from the list (the files stay)"
      disabled={nothingToClear}
      onclick={() => api.clear()}>Clear</button
    >
  </header>
  <ol id="dl-list" class="flex-1 overflow-y-auto p-1">
    {#each rows as row (row.id)}
      <DownloadRow {row} onaction={api.action} />
    {:else}
      <li class="dl-empty flex h-[52px] items-center justify-center text-muted">Files you download show up here</li>
    {/each}
  </ol>
</section>

<script>
  // One download: file type, name, status line, progress bar while it runs, and its buttons.
  import Icon from './Icon.svelte';

  let { row, onaction } = $props();

  const LABELS = { show: 'Show in folder', pause: 'Pause', resume: 'Resume', cancel: 'Cancel', retry: 'Retry', remove: 'Remove from list' };

  // Which buttons a row gets for where its download is.
  function actionsFor(row) {
    if (row.state === 'progressing') return [row.paused ? 'resume' : 'pause', 'cancel'];
    if (row.state === 'completed' && !row.removed) return ['show', 'remove'];
    return ['retry', 'remove'];
  }

  // "report.pdf" -> "PDF", shown on the file icon.
  const extension = (filename) => (/\.([a-z0-9]{1,4})$/i.exec(filename)?.[1] || '').toUpperCase();

  const kind = $derived(row.removed ? 'removed' : row.state);
  const openable = $derived(row.state === 'completed' && !row.removed);
  const faded = $derived(['removed', 'cancelled', 'interrupted'].includes(kind));
  const struck = $derived(kind === 'removed' || kind === 'cancelled');
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (rows are pointed at; the buttons take the keyboard) -->
<li
  class={[
    `dl dl-${kind} group flex h-[52px] items-center gap-2.5 rounded-[5px] px-2 hover:bg-panel-2`,
    openable && 'openable cursor-pointer',
  ]}
  title={row.filename}
  onclick={openable ? () => onaction('open', row.id) : undefined}
>
  <span
    class={[
      'dl-type relative flex h-8 w-7 flex-none items-center justify-center',
      kind === 'completed' ? 'text-fg' : 'text-muted',
      faded && 'opacity-50',
    ]}
  >
    <Icon name="file" class="h-8 w-7" strokeWidth={0.9} />
    <span class="dl-ext absolute bottom-1.5 text-[7px] font-bold text-accent">{extension(row.filename)}</span>
  </span>
  <span class="dl-text flex min-w-0 flex-1 flex-col gap-[3px]">
    <span class={['dl-name truncate', struck ? 'text-muted line-through' : 'text-fg']}>{row.filename}</span>
    <span class={['dl-status truncate text-[11px]', kind === 'interrupted' ? 'text-error' : 'text-muted']}>{row.status}</span>
    {#if row.state === 'progressing'}
      <span class={['dl-bar relative h-[3px] overflow-hidden rounded-[2px] bg-border', row.paused && 'paused']}>
        {#if row.progress === null}
          <span
            class={[
              'dl-bar-fill indeterminate animate-dl-slide absolute inset-y-0 w-[30%] rounded-[2px]',
              row.paused ? 'bg-muted' : 'bg-accent',
            ]}
          ></span>
        {:else}
          <span
            class={[
              'dl-bar-fill absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-200',
              row.paused ? 'bg-muted' : 'bg-accent',
            ]}
            style:width={`${Math.round(row.progress * 100)}%`}
          ></span>
        {/if}
      </span>
    {/if}
  </span>
  <!-- The buttons show on hover, and always while the download runs (so it can be paused). -->
  <span class={['dl-actions flex flex-none gap-0.5', row.state === 'progressing' ? 'visible' : 'invisible group-hover:visible']}>
    {#each actionsFor(row) as name (name)}
      <button
        class={`dl-btn dl-${name} flex size-[26px] items-center justify-center p-0 hover:bg-border`}
        title={LABELS[name]}
        onclick={(e) => {
          e.stopPropagation();
          onaction(name, row.id);
        }}><Icon {name} /></button
      >
    {/each}
  </span>
</li>

<script>
  // The download button shows once there is something to list, like Chrome's, with a ring around
  // it filling up while files download (spinning when their size isn't known).
  let { downloads, platform, onclick, button = $bindable() } = $props();

  const running = $derived(downloads?.active > 0);
  const sized = $derived(running && downloads.progress !== null);
  const filled = $derived(sized ? Math.round(downloads.progress * 100) : 25);
  const keys = $derived(platform === 'darwin' ? 'Cmd+Option+L' : 'Ctrl+J');
  const title = $derived(
    running ? `Downloading ${downloads.active} file${downloads.active > 1 ? 's' : ''} (${keys})` : `Downloads (${keys})`,
  );
</script>

<button
  id="downloads"
  bind:this={button}
  class={[
    'relative ml-1.5 flex h-7 w-7 min-w-7 items-center justify-center p-0 text-[14px]',
    downloads?.open && 'open bg-panel-2',
    running ? 'running text-accent' : downloads?.open && 'text-fg',
    running && !sized && 'indeterminate',
  ]}
  {title}
  hidden={!downloads?.any}
  {onclick}
>
  <svg
    class={[
      'absolute inset-0 size-7 [transform:rotate(-90deg)]',
      running ? 'visible' : 'invisible',
      running && !sized && 'animate-dl-spin',
    ]}
    viewBox="0 0 28 28"
    fill="none"
    stroke-width="2"
    aria-hidden="true"
  >
    <circle class="stroke-border" cx="14" cy="14" r="12" />
    <circle
      id="downloads-ring"
      class="stroke-accent [transition:stroke-dasharray_0.2s]"
      cx="14"
      cy="14"
      r="12"
      pathLength="100"
      stroke-linecap="round"
      stroke-dasharray={`${filled} 100`}
    />
  </svg>
  <svg
    class="size-4"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"><path d="M8 2.5v7.5M4.75 6.75 8 10l3.25-3.25M3 13.5h10" /></svg
  >
</button>

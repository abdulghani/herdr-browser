<script>
  // Back, forward, reload, the address bar, the download button and settings.
  import AddressBar from './AddressBar.svelte';
  import DownloadButton from './DownloadButton.svelte';

  let { appState, tab, downloads } = $props();
  const herdr = window.herdr;
  const cmd = herdr.cmd;

  let downloadsButton = $state();
  let settingsButton = $state();
  const nav = $derived(appState?.nav);

  // Where the downloads panel goes: under the download button, or the settings button while there's none.
  export function downloadsAnchor() {
    const button = downloadsButton.hidden ? settingsButton : downloadsButton;
    const { left, bottom, width } = button.getBoundingClientRect();
    return { x: left, y: bottom, width };
  }
</script>

<div id="toolbar" class="flex h-toolbar items-center gap-0.5 border-b border-border bg-bg px-2">
  <button id="sidebar-toggle" class="h-7 min-w-7 text-[14px]" title="Collapse/expand sidebar (Ctrl+B)" onclick={() => cmd('toggleSidebar')}
    >☰</button
  >
  <button id="back" class="h-7 min-w-7 text-[14px]" title="Back (Ctrl+[)" disabled={nav && !nav.canGoBack} onclick={() => cmd('back')}
    >←</button
  >
  <button
    id="forward"
    class="h-7 min-w-7 text-[14px]"
    title="Forward (Ctrl+])"
    disabled={nav && !nav.canGoForward}
    onclick={() => cmd('forward')}>→</button
  >
  <button
    id="reload"
    class="h-7 min-w-7 text-[14px]"
    title={nav?.loading ? 'Stop' : 'Reload (Ctrl+R)'}
    onclick={() => cmd(nav?.loading ? 'stop' : 'reload')}>{nav?.loading ? '×' : '↻'}</button
  >
  <AddressBar {tab} />
  <span id="prefix" class="ml-2 rounded bg-accent px-2 py-[3px] text-[10px] font-bold text-accent-fg" hidden={!appState?.prefixArmed}
    >PREFIX</span
  >
  <DownloadButton
    bind:button={downloadsButton}
    {downloads}
    platform={herdr.platform}
    onclick={() => cmd('toggleDownloads', downloadsAnchor())}
  />
  <button
    id="settings"
    bind:this={settingsButton}
    class="ml-0.5 h-7 min-w-7 text-[14px]"
    title="Settings (Cmd+,)"
    onclick={() => cmd('openSettings')}>⚙&#xFE0E;</button
  >
</div>

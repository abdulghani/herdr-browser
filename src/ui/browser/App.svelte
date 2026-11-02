<script lang="ts">
  // The browser UI: workspaces in the sidebar, the active workspace's tabs, the toolbar and the
  // bars under it. The main process sends the whole state on every change ('state').
  import FindBar from './FindBar.svelte';
  import NoticeBar from './NoticeBar.svelte';
  import Sidebar from './Sidebar.svelte';
  import TabStrip from './TabStrip.svelte';
  import Toolbar from './Toolbar.svelte';
  import type { DownloadsSummary, UiState } from '../../types';

  type Renaming = { kind: 'tab' | 'workspace'; id: string };

  const herdr = window.herdr;
  const cmd = herdr.cmd;
  const mac = herdr.platform === 'darwin';

  let latest: UiState | null = null; // the newest state from main
  let shown = $state.raw<UiState | null>(null); // the state on screen; held still while a rename is open
  let downloads = $state.raw<DownloadsSummary | null>(null); // download progress also comes on its own
  let renaming = $state<Renaming | null>(null); // { kind, id } while an inline rename input is open
  let helpOpen = $state(false);
  let pendingRename: Renaming | null = null; // workspace rename requested while the sidebar is collapsed
  let collapseAfterRename = false;
  let toolbar: ReturnType<typeof Toolbar>;

  const ws = $derived(shown?.workspaces[shown.activeWs]);
  const tab = $derived(ws?.tabs[ws.activeTab]);

  function show(s: UiState) {
    shown = s;
    downloads = s.downloads;
  }

  // ---------- inline rename ----------

  // The rename input doesn't fit in the icon rail, so expand for the rename and collapse again after.
  function requestRename(kind: Renaming['kind'], id: string) {
    if (kind === 'workspace' && latest?.sidebarCollapsed) {
      pendingRename = { kind, id };
      collapseAfterRename = true;
      cmd('toggleSidebar');
      return;
    }
    startRename(kind, id);
  }

  function startRename(kind: Renaming['kind'], id: string) {
    const found = kind === 'tab' ? ws?.tabs.some((t) => t.id === id) : shown?.workspaces.some((w) => w.id === id);
    if (found) renaming = { kind, id };
  }

  function finishRename(commit: boolean, name: string) {
    const { kind, id } = renaming!;
    renaming = null;
    if (commit) cmd(kind === 'tab' ? 'renameTab' : 'renameWorkspace', { id, name });
    if (collapseAfterRename) {
      collapseAfterRename = false;
      cmd('toggleSidebar');
    }
    if (latest) show(latest);
    cmd('focusContent');
  }

  // ---------- messages from main ----------

  herdr.on('state', (s) => {
    latest = s;
    if (!renaming) show(s);
    if (pendingRename && !s.sidebarCollapsed) {
      const { kind, id } = pendingRename;
      pendingRename = null;
      requestAnimationFrame(() => startRename(kind, id));
    }
  });
  herdr.on('rename', ({ kind, id }) => requestAnimationFrame(() => requestRename(kind, id)));
  herdr.on('toggle-help', () => (helpOpen = !helpOpen));
  // Progress of running downloads comes on its own, so the rest of the UI isn't redrawn for it.
  herdr.on('downloads', (d) => {
    if (latest) latest.downloads = d;
    downloads = d;
  });
  herdr.on('show-downloads', () => cmd('showDownloads', toolbar.downloadsAnchor()));
  herdr.ready();
</script>

<svelte:window onresize={() => downloads?.open && cmd('showDownloads', toolbar.downloadsAnchor())} />

<div id="app" class={['flex h-screen', `platform-${herdr.platform}`, shown?.sidebarCollapsed && 'collapsed']}>
  <Sidebar appState={shown} {cmd} {mac} {renaming} onrename={requestRename} onfinishrename={finishRename} bind:helpOpen />
  <main class="flex min-w-0 flex-1 flex-col">
    <TabStrip appState={shown} {cmd} {mac} {renaming} onrename={startRename} onfinishrename={finishRename} />
    <Toolbar bind:this={toolbar} appState={shown} {tab} {downloads} />
    <NoticeBar notice={tab?.notice} {cmd} />
    <FindBar find={shown?.find} tabId={tab?.id} />
  </main>
</div>

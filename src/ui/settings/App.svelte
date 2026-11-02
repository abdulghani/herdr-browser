<script lang="ts">
  // The herdr://settings page. window.herdrSettings comes from page-preload.ts, which only exposes
  // it on this page.
  import AboutTab from './AboutTab.svelte';
  import DnsTab from './DnsTab.svelte';
  import ShortcutsTab from './ShortcutsTab.svelte';
  import type { SettingsData } from '../../types';

  const api = window.herdrSettings;

  const TABS = [
    { id: 'dns', label: 'DNS' },
    { id: 'shortcuts', label: 'Shortcuts' },
    { id: 'about', label: 'About' },
  ];

  let data = $state.raw<{
    settings: SettingsData['settings'] | null;
    providers: SettingsData['providers'];
    about: SettingsData['about'] | null;
  }>({
    settings: null,
    providers: [],
    about: null,
  });
  let buttons = $state<HTMLButtonElement[]>([]);

  // The open tab is kept in the URL (herdr://settings/#shortcuts), so a reload stays on it.
  const tabOf = (name: string) => TABS.find((t) => t.id === name) || TABS[0];
  const first = tabOf(location.hash.slice(1)).id;
  let current = $state(first);
  history.replaceState(null, '', `#${first}`);

  function showTab(name: string) {
    current = tabOf(name).id;
    history.replaceState(null, '', `#${current}`);
  }

  // Up/down arrows move between tabs, like a native tab list.
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement) + (e.key === 'ArrowDown' ? 1 : -1);
    const next = (i + TABS.length) % TABS.length;
    showTab(TABS[next].id);
    buttons[next].focus();
  }

  api.get().then((loaded) => (data = loaded));
</script>

<main
  class="mx-auto grid max-w-[860px] grid-cols-[160px_minmax(0,1fr)] items-start gap-x-6 px-4 pt-8 pb-16 max-[560px]:grid-cols-[minmax(0,1fr)] max-[560px]:gap-y-4"
>
  <h1 class="col-span-full mb-5 text-[20px] font-bold">Settings</h1>
  <!-- svelte-ignore a11y_interactive_supports_focus (the tabs themselves take the focus) -->
  <div id="tabs" class="sticky top-4 flex flex-col gap-0.5" role="tablist" aria-orientation="vertical" {onkeydown}>
    {#each TABS as tab, i (tab.id)}
      <button
        bind:this={buttons[i]}
        role="tab"
        data-tab={tab.id}
        aria-selected={tab.id === current}
        tabindex={tab.id === current ? 0 : -1}
        class={[
          'h-8 border-l-2 px-3 text-left focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent',
          tab.id === current
            ? 'rounded-l-none rounded-r-md border-l-accent bg-panel-2 text-fg'
            : 'rounded-md border-transparent bg-transparent text-muted hover:bg-panel hover:text-fg',
        ]}
        onclick={() => showTab(tab.id)}>{tab.label}</button
      >
    {/each}
  </div>

  <div id="panels">
    <section role="tabpanel" id="dns" class="rounded-lg border border-border bg-panel p-5" hidden={current !== 'dns'}>
      <DnsTab {api} settings={data.settings} providers={data.providers} />
    </section>
    <section role="tabpanel" id="shortcuts" class="rounded-lg border border-border bg-panel p-5" hidden={current !== 'shortcuts'}>
      <ShortcutsTab platform={data.about?.platform} />
    </section>
    <section role="tabpanel" id="about" class="rounded-lg border border-border bg-panel p-5" hidden={current !== 'about'}>
      <AboutTab about={data.about} />
    </section>
  </div>
</main>

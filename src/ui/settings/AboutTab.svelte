<script lang="ts">
  import type { SettingsData } from '../../types';

  let { about }: { about: SettingsData['about'] | null } = $props();

  const rows = $derived(
    about
      ? [
          ['Version', about.version],
          ['Chromium', about.chrome],
          ['Electron', about.electron],
          ['Profile folder', about.profile],
        ]
      : [],
  );
</script>

<h2 class="mb-1.5 text-[15px] font-bold">About</h2>
<dl id="about-list" class="mb-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
  {#each rows as [name, value] (name)}
    <dt class="text-muted">{name}</dt>
    <dd class="wrap-anywhere select-text">{value}</dd>
  {/each}
</dl>
<p class="mb-4 leading-[1.5] text-muted">
  <a href="https://github.com/abdulghani/herdr-browser" target="_blank">github.com/abdulghani/herdr-browser</a>
</p>

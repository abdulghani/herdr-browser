<script lang="ts">
  // Which DNS server to use, and a lookup to test it.
  import type { SettingsApi } from '../page-preload';
  import type { ResolveResult, SettingsData } from '../../types';

  let { api, settings, providers }: { api: SettingsApi; settings: SettingsData['settings'] | null; providers: SettingsData['providers'] } =
    $props();

  const field = 'h-[30px] min-w-0 rounded-md border border-border bg-bg px-2.5 text-fg outline-none focus:border-accent';

  let provider = $state<string | undefined>();
  let customUrl = $state('');
  let saving = $state(false);
  let status = $state<{ text: string; kind: '' | 'ok' | 'error' }>({ text: '', kind: '' });
  let host = $state('example.com');
  let lookup = $state<
    | null
    | 'busy'
    | { host: string; error: string; addresses?: undefined }
    | { addresses: NonNullable<ResolveResult['addresses']>; error?: undefined }
  >(null); // null, 'busy', { host, error } or { addresses }
  const STATUS_COLORS: Record<string, string> = { ok: 'text-ok', error: 'text-error' };

  // The saved choice, once it has loaded.
  $effect(() => {
    if (!settings) return;
    provider = settings.dns.provider;
    customUrl = settings.dns.customUrl;
  });

  async function save(e: SubmitEvent) {
    e.preventDefault();
    saving = true;
    try {
      await api.setDns({ provider: provider!, customUrl });
      status = { text: 'Saved. New lookups use this server.', kind: 'ok' };
    } catch (err) {
      status = { text: (err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), kind: 'error' };
    } finally {
      saving = false;
    }
  }

  async function resolve(e: SubmitEvent) {
    e.preventDefault();
    const name = host.trim();
    if (!name) return;
    lookup = 'busy';
    const { addresses, error } = await api.resolve(name);
    lookup = error ? { host: name, error } : { addresses: addresses! };
  }
</script>

<h2 class="mb-1.5 text-[15px] font-bold">DNS</h2>
<p class="mb-4 leading-[1.5] text-muted">
  Which server the browser asks to turn site names into addresses. The servers other than the system default use DNS over HTTPS: lookups are
  encrypted, so your network can't see or change which sites you look up.
</p>
<form id="dns-form" onsubmit={save}>
  <div id="dns-providers">
    {#each providers as p (p.id)}
      <label class="provider flex cursor-pointer items-baseline gap-2.5 rounded-md px-2.5 py-2 hover:bg-panel-2">
        <input class="m-0 translate-y-px accent-accent" type="radio" name="dns" value={p.id} bind:group={provider} />
        <span class="name">{p.name}</span>
        <span class="detail text-[12px] text-muted">{p.detail}</span>
      </label>
    {/each}
  </div>
  <label id="custom-row" class="mt-2 ml-[34px] flex flex-col gap-1.5" hidden={provider !== 'custom'}>
    <span class="text-[12px] text-muted">Server address</span>
    <input
      id="custom-url"
      class={field}
      type="url"
      spellcheck="false"
      autocomplete="off"
      placeholder="https://dns.example.com/dns-query"
      bind:value={customUrl}
    />
  </label>
  <div class="mt-4 flex items-center gap-3">
    <button type="submit" id="dns-save" disabled={saving}>Save</button>
    <span id="dns-status" role="status" class={['text-[12px]', status.kind, STATUS_COLORS[status.kind] ?? 'text-muted']}>{status.text}</span
    >
  </div>
</form>

<h3 class="mt-7 mb-2 text-[13px] font-bold">Test a lookup</h3>
<form id="resolve-form" class="flex gap-2" onsubmit={resolve}>
  <input id="resolve-host" class={[field, 'flex-1']} spellcheck="false" autocomplete="off" placeholder="example.com" bind:value={host} />
  <button type="submit">Look up</button>
</form>
<ul id="resolve-result" class="mt-2.5 text-[12px]">
  {#if lookup === 'busy'}
    <li class="py-0.5 wrap-anywhere">Looking up…</li>
  {:else if lookup?.error}
    <li class="error py-0.5 wrap-anywhere text-error">Couldn't look up {lookup.host}: {lookup.error}</li>
  {:else if lookup}
    {#each lookup.addresses as a, i (i)}
      <li class="py-0.5 wrap-anywhere"><span class="family inline-block w-11 text-muted">{a.family}</span>{a.address}</li>
    {/each}
  {/if}
</ul>

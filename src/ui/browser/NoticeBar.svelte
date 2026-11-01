<script>
  // A bar under the toolbar about the tab. Only kind so far: a site asked for a passkey, which
  // Electron can't do.
  let { notice, cmd } = $props();
</script>

<div id="notice" class="flex h-notice items-center gap-2.5 border-b border-border bg-notice pr-2 pl-3.5" hidden={!notice}>
  <span
    id="notice-text"
    class="flex-1 truncate"
    title="Electron, which Herdr Browser runs on, has no passkey support. Use another sign-in option, or open the page in a browser that supports passkeys."
    >This site wants a passkey, which doesn't work here yet.</span
  >
  <button
    id="notice-open"
    class="h-6 bg-accent px-3 font-bold text-accent-fg hover:bg-accent hover:text-accent-fg hover:brightness-110"
    hidden={!notice?.browser}
    onclick={() => cmd('openExternally')}>Open in {notice?.browser}</button
  >
  <button id="notice-dismiss" class="h-6 text-[14px]" title="Dismiss" onclick={() => cmd('dismissNotice')}>×</button>
</div>

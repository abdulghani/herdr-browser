<script>
  // A bar under the toolbar about the tab. Only kind so far: the tab was put to sleep to save
  // memory, and WebKit can't keep a page's back/forward history while it sleeps.
  let { notice, cmd } = $props();

  const TEXTS = {
    woke: {
      text: 'This tab was asleep to save memory, so Back and Forward start over from this page.',
      title: "Tabs not looked at for 10 minutes sleep. WebKit, which Herdr Browser runs on here, can't keep their back/forward history.",
    },
  };
  const shown = $derived(notice && TEXTS[notice.kind]);
</script>

<div id="notice" class="flex h-notice items-center gap-2.5 border-b border-border bg-notice pr-2 pl-3.5" hidden={!shown}>
  <span id="notice-text" class="flex-1 truncate" title={shown?.title}>{shown?.text}</span>
  <button id="notice-dismiss" class="h-6 text-[14px]" title="Dismiss" onclick={() => cmd('dismissNotice')}>×</button>
</div>

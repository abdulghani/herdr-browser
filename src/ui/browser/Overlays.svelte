<script>
  // The address bar suggestions and the downloads panel, drawn over the page. The page is a native
  // view on top of this page, so it cuts a hole where each of these is (the tags' masks, see
  // PageViews.svelte) and they show through. Masks are rectangles: the panels' rounded corners show
  // the browser's background, not the page, behind them.
  import Downloads from '../downloads/App.svelte';
  import Suggestions from '../suggestions/App.svelte';

  let { downloads, anchor } = $props();
  const herdr = window.herdr;

  const PANEL_WIDTH = 360; // w-[360px] in src/ui/downloads/App.svelte
  const MARGIN = 8; // space kept between the panel and the window's edges

  let list = $state(null); // { x, y, width, height } while the suggestions show
  let panel = $state(null); // { x, y } while the downloads panel shows

  herdr.on('suggest-overlay', (rect) => (list = rect));

  // Under the download button, right edges lined up, kept inside the window.
  function place() {
    if (!downloads?.open) return (panel = null);
    const button = anchor();
    const x = Math.max(MARGIN, Math.min(Math.round(button.x + button.width) - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - MARGIN));
    panel = { x, y: Math.round(button.y) + 4 };
  }

  $effect(() => {
    downloads;
    place();
  });

  // The views only re-read where the overlays are when they move themselves, so tell them
  // (PageViews.svelte) each time an overlay opens, moves or closes. Effects run after the page updated.
  $effect(() => {
    list;
    panel;
    window.dispatchEvent(new Event('herdr-overlays'));
  });
</script>

<svelte:window onresize={place} />

<div
  id="suggestions-overlay"
  class="fixed z-20"
  hidden={!list}
  style:left={`${Math.round(list?.x ?? 0)}px`}
  style:top={`${Math.round(list?.y ?? 0)}px`}
  style:width={`${Math.round(list?.width ?? 0)}px`}
  style:height={`${list?.height ?? 0}px`}
>
  <Suggestions />
</div>

<div id="downloads-overlay" class="fixed z-20" hidden={!panel} style:left={`${panel?.x ?? 0}px`} style:top={`${panel?.y ?? 0}px`}>
  <Downloads />
</div>

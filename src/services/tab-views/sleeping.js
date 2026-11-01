// Background tabs not looked at for a while are unloaded to free memory (like Chrome's Memory
// Saver) and load their page again when selected. WebKit gives no way to save a view's
// back/forward history, so a tab that slept comes back with only its current page.
const SLEEP_AFTER_MS = 10 * 60 * 1000;
const CHECK_EVERY_MS = 30 * 1000;

function createSleeping(ctx) {
  const hiddenSince = new Map(); // tabId -> when its loaded view was last hidden
  const mediaTabs = new Set(); // tabs whose page uses the camera or mic, or plays sound
  const slept = new Set(); // tabs put to sleep, until they are shown again

  // The page's preload reports these (src/ui/page-preload.js).
  const setMedia = (tabId, active) => (active ? mediaTabs.add(tabId) : mediaTabs.delete(tabId));
  const clearMedia = (tabId) => mediaTabs.delete(tabId);

  function viewGone(tabId) {
    hiddenSince.delete(tabId);
    mediaTabs.delete(tabId);
  }

  // Asked once when a tab is shown: did it sleep since it was last seen?
  const woke = (tabId) => slept.delete(tabId);

  // Tabs in a call, playing sound, or still loading stay awake.
  const canSleep = (tabId) => !mediaTabs.has(tabId) && !ctx.views.isLoading(tabId);

  function sleepIdleTabs() {
    const now = Date.now();
    let changed = false;
    for (const tabId of ctx.views.awake()) {
      if (tabId === ctx.views.shown()) {
        hiddenSince.delete(tabId);
      } else if (!hiddenSince.has(tabId)) {
        hiddenSince.set(tabId, now);
      } else if (now - hiddenSince.get(tabId) >= SLEEP_AFTER_MS && canSleep(tabId)) {
        ctx.views.destroy(tabId);
        slept.add(tabId);
        changed = true;
      }
    }
    if (changed) ctx.workspaces.broadcast();
  }

  const start = () => setInterval(sleepIdleTabs, CHECK_EVERY_MS);

  return { setMedia, clearMedia, viewGone, woke, forget: (tabId) => slept.delete(tabId), start };
}

module.exports = { createSleeping };

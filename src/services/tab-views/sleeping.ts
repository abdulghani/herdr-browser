// Background tabs not looked at for a while are unloaded to free memory (like Chrome's Memory
// Saver) and reload, with their back/forward history, when selected again.
import type { Ctx, TabHistory } from '../../types';

const SLEEP_AFTER_MS = 10 * 60 * 1000;
const CHECK_EVERY_MS = 30 * 1000;

export function createSleeping(ctx: Ctx) {
  const hiddenSince = new Map<string, number>(); // tabId -> when its loaded view was last hidden
  const sleptHistory = new Map<string, TabHistory>(); // tabId -> back/forward history to restore on wake
  const mediaTabs = new Set<string>(); // tabs that asked for camera/mic on their current page

  // Back/forward history for a tab without a view (asleep, restored or reopened).
  const keepHistory = (tabId: string, history: TabHistory) => sleptHistory.set(tabId, history);
  const keptHistory = (tabId: string) => sleptHistory.get(tabId);
  const forget = (tabId: string) => sleptHistory.delete(tabId);
  function takeHistory(tabId: string) {
    const history = sleptHistory.get(tabId);
    sleptHistory.delete(tabId);
    return history;
  }

  const noteMedia = (tabId: string) => mediaTabs.add(tabId);
  const clearMedia = (tabId: string) => mediaTabs.delete(tabId);

  function viewGone(tabId: string) {
    hiddenSince.delete(tabId);
    mediaTabs.delete(tabId);
  }

  // Tabs in a call, playing sound, or still loading stay awake.
  function canSleep(tabId: string) {
    const wc = ctx.views.get(tabId)!.webContents;
    return !mediaTabs.has(tabId) && !wc.isCurrentlyAudible() && !wc.isLoading() && !wc.isCrashed();
  }

  function sleepTab(tabId: string) {
    const nav = ctx.views.get(tabId)!.webContents.navigationHistory;
    sleptHistory.set(tabId, { entries: nav.getAllEntries(), index: nav.getActiveIndex() });
    ctx.views.destroy(tabId);
  }

  function sleepIdleTabs() {
    const now = Date.now();
    let slept = false;
    for (const tabId of ctx.views.awake()) {
      if (tabId === ctx.views.shown()) {
        hiddenSince.delete(tabId);
      } else if (!hiddenSince.has(tabId)) {
        hiddenSince.set(tabId, now);
      } else if (now - hiddenSince.get(tabId)! >= SLEEP_AFTER_MS && canSleep(tabId)) {
        sleepTab(tabId);
        slept = true;
      }
    }
    if (slept) ctx.workspaces.broadcast();
  }

  const start = () => setInterval(sleepIdleTabs, CHECK_EVERY_MS);

  return { keepHistory, keptHistory, takeHistory, forget, noteMedia, clearMedia, viewGone, start };
}

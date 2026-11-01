// Downloads: the list of recent ones (kept in downloads.json in the profile) and the panel that
// lists them, under the toolbar's download button. WebKit saves each file itself, straight to the
// Downloads folder, and Electrobun reports it as page events: started and done ({ filename, path }),
// failed (with an error), and progress ({ progress }: a percentage, no byte counts, and not saying
// which download when several run in one tab). There is no pausing, resuming or cancelling.
const Electrobun = require('electrobun/main');
const path = require('path');
const fs = require('fs');
const { formatBytes } = require('../../lib/format');

const { Utils } = Electrobun;

const MAX_ENTRIES = 50;
const AUTO_CLOSE = 5000; // ms the panel stays open when a new download opened it and it isn't pointed at
const SAVED_FIELDS = ['id', 'filename', 'savePath', 'totalBytes', 'state', 'startTime', 'endTime', 'error'];

// The line under the file name, e.g. "Done · 3.2 MB" or "45%".
function statusText(e) {
  if (e.removed) return 'Deleted';
  if (e.state === 'completed') return e.totalBytes ? `Done · ${formatBytes(e.totalBytes)}` : 'Done';
  if (e.state === 'interrupted') return e.error ? `Failed · ${e.error}` : 'Failed';
  return e.progress === null ? 'Downloading…' : `${Math.round(e.progress * 100)}%`;
}

const sizeOf = (file) => {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
};

function createDownloads(ctx) {
  let entries = []; // newest first: { id, filename, savePath, state, progress, source, ... }
  let nextId = 1;
  let open = false;
  let autoCloseTimer = null;
  const file = () => path.join(ctx.profile, 'downloads.json');
  const running = () => entries.filter((e) => e.state === 'progressing');

  // ---------- the list ----------

  // Downloads still running at the last quit were cut off.
  function load() {
    try {
      entries = JSON.parse(fs.readFileSync(file(), 'utf8'))
        .filter((e) => e && typeof e.savePath === 'string')
        .slice(0, MAX_ENTRIES)
        .map((e) => ({ ...e, state: e.state === 'completed' ? 'completed' : 'interrupted', progress: null }));
    } catch {
      entries = [];
    }
    nextId = Math.max(0, ...entries.map((e) => Number(e.id) || 0)) + 1;
    markRemoved();
  }

  function saveNow() {
    const data = entries.map((e) => Object.fromEntries(SAVED_FIELDS.map((field) => [field, e[field]])));
    try {
      fs.writeFileSync(file(), JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('downloads save failed', err);
    }
  }

  // A finished file that was deleted (or moved) since shows as "Deleted".
  function markRemoved() {
    for (const e of entries) if (e.state === 'completed') e.removed = !fs.existsSync(e.savePath);
  }

  // ---------- following a download ----------

  // The running download an event is about: by its file, else the newest one from the same tab.
  function findRunning(detail, source) {
    const list = running();
    const byFile = detail?.path && list.find((e) => e.savePath === detail.path);
    return byFile || list.find((e) => e.source === source) || list[0];
  }

  const EVENTS = {
    'download-started': (detail, source) => {
      const savePath = String(detail?.path || '');
      entries.unshift({
        id: nextId++,
        filename: String(detail?.filename || path.basename(savePath) || 'download'),
        savePath,
        state: 'progressing',
        progress: null,
        source,
        startTime: Date.now(),
      });
      entries.splice(MAX_ENTRIES);
      changed(true);
      // Like Chrome's download bubble, show the panel for a moment when a download starts.
      if (!open) {
        show();
        autoCloseTimer = setTimeout(hide, AUTO_CLOSE);
      }
    },
    'download-progress': (detail, source) => {
      const entry = findRunning(detail, source);
      const percent = Number(detail?.progress);
      if (!entry || !Number.isFinite(percent)) return;
      entry.progress = Math.min(1, Math.max(0, percent / 100));
      changed(false);
    },
    'download-completed': (detail, source) => finish(findRunning(detail, source), detail, 'completed'),
    'download-failed': (detail, source) => finish(findRunning(detail, source), detail, 'interrupted'),
  };

  function finish(entry, detail, state) {
    if (!entry) return;
    if (detail?.path) entry.savePath = String(detail.path);
    if (detail?.filename) entry.filename = String(detail.filename);
    entry.state = state;
    entry.error = detail?.error ? String(detail.error) : undefined;
    entry.endTime = Date.now();
    entry.totalBytes = state === 'completed' ? sizeOf(entry.savePath) : 0;
    saveNow();
    changed(true);
  }

  // A page event about a download; source is the tab it came from.
  function onEvent(event, detail, source = null) {
    EVENTS[event]?.(detail, source);
  }

  // A download started, finished or was removed: redraw the toolbar button and the panel.
  // Progress alone only updates the button, not the rest of the browser UI.
  function changed(stateChanged) {
    if (stateChanged) ctx.workspaces.broadcast();
    else ctx.ui.send('downloads', summary());
    if (open) sendRows();
  }

  // What the toolbar button needs: is there anything to list, how many are running, and how far
  // along they are together (null when none has reported progress yet).
  function summary() {
    const list = running();
    const known = list.filter((e) => e.progress !== null);
    const progress = known.length ? known.reduce((total, e) => total + e.progress, 0) / known.length : null;
    return { any: entries.length > 0, active: list.length, progress, open };
  }

  // ---------- actions from the panel ----------

  const ACTIONS = {
    open: (e) => {
      markRemoved();
      if (e.removed) return changed(true);
      if (e.state === 'completed') Utils.openPath(e.savePath);
    },
    show: (e) => Utils.showItemInFolder(e.savePath),
    remove: (e) => {
      entries = entries.filter((other) => other !== e);
      saveNow();
      changed(true);
    },
  };

  function act(action, id) {
    const entry = entries.find((e) => e.id === id);
    if (entry && Object.hasOwn(ACTIONS, action)) ACTIONS[action](entry);
  }

  const openFolder = () => Utils.openPath(Utils.paths.downloads);

  // Clear drops the finished ones from the list (the files stay).
  function clear() {
    entries = running();
    saveNow();
    changed(true);
  }

  // ---------- the panel ----------

  const rows = () =>
    entries.map((e) => ({
      id: e.id,
      filename: e.filename,
      state: e.state,
      removed: !!e.removed,
      progress: e.state === 'progressing' ? e.progress : null,
      status: statusText(e),
    }));

  const sendRows = () => ctx.ui.send('downloads-rows', rows());

  // The UI draws the panel under its button while the summary says it is open.
  function show() {
    markRemoved();
    const wasOpen = open;
    open = true;
    sendRows();
    if (!wasOpen) ctx.workspaces.broadcast();
  }

  function hide() {
    clearTimeout(autoCloseTimer);
    if (!open) return;
    open = false;
    ctx.workspaces.broadcast();
  }

  function toggle() {
    clearTimeout(autoCloseTimer);
    if (open) hide();
    else show();
  }

  return {
    load,
    saveNow,
    onEvent,
    summary,
    show,
    hide,
    toggle,
    act,
    clear,
    openFolder,
    // Pointing at the panel keeps it open.
    keepOpen: () => clearTimeout(autoCloseTimer),
    isOpen: () => open,
    // Clicking into the page or leaving the window closes the panel, like the suggestions.
    close: hide,
  };
}

module.exports = { createDownloads };

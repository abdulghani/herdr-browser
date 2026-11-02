// Downloads: files save straight to the Downloads folder with no dialog, the list of recent ones
// (kept in downloads.json in the profile), and the panel that lists them. Like the address bar
// suggestions, the panel floats over the page in its own view, under the toolbar button.
const { app, session, shell, WebContentsView, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { uniqueName } = require('../../lib/files');
const { formatBytes, formatDuration } = require('../../lib/format');
const { uiPage } = require('../../lib/ui-build');

const MAX_ENTRIES = 50;
const UPDATE_EVERY = 250; // ms between progress updates for one download; state changes go at once
const AUTO_CLOSE = 5000; // ms the panel stays open when a new download opened it and it isn't pointed at
const PANEL_WIDTH = 360; // the panel's width in src/ui/downloads/App.svelte
const HEADER_HEIGHT = 40; // its header's height (h-10)
const ROW_HEIGHT = 52; // a row's height in src/ui/downloads/DownloadRow.svelte
const PANEL_PADDING = 10; // the panel's border + the list's padding, top and bottom
const MAX_HEIGHT = 440;
const MARGIN = 8; // space kept between the panel and the window's edges
const PRELOAD = path.join(__dirname, '..', '..', 'ui', 'downloads', 'preload.js');
const SAVED_FIELDS = ['id', 'filename', 'url', 'savePath', 'receivedBytes', 'totalBytes', 'state', 'startTime', 'endTime'];

const sum = (list, field) => list.reduce((total, e) => total + e[field], 0);

// The line under the file name, e.g. "3.2 MB of 10 MB · 2 s left".
function statusText(e) {
  if (e.removed) return 'Deleted';
  if (e.state === 'completed') return `Done · ${formatBytes(e.totalBytes || e.receivedBytes)}`;
  if (e.state === 'cancelled') return 'Cancelled';
  if (e.state === 'interrupted') return 'Failed';
  const sizes = e.totalBytes > 0 ? `${formatBytes(e.receivedBytes)} of ${formatBytes(e.totalBytes)}` : formatBytes(e.receivedBytes);
  if (e.paused) return `Paused · ${sizes}`;
  if (!(e.totalBytes > 0 && e.speed > 0)) return sizes;
  return `${sizes} · ${formatDuration((e.totalBytes - e.receivedBytes) / e.speed)} left`;
}

function createDownloads(ctx) {
  let entries = []; // newest first: { id, filename, url, savePath, receivedBytes, totalBytes, state, paused, ... }
  const items = new Map(); // id -> the DownloadItem, while Electron still has it
  const lastSent = new Map(); // id -> { at, bytes } of the last progress update, for throttling and speed
  let nextId = 1;
  let panel = null;
  let open = false;
  let anchor = null; // where the toolbar button is: { x, y, width } (y is its bottom)
  let autoCloseTimer = null;
  const file = () => path.join(app.getPath('userData'), 'downloads.json');
  const find = (id) => entries.find((e) => e.id === id);
  const askWhere = new Set(); // addresses from "Save Image As…", whose downloads ask where to save

  // ---------- the list ----------

  function start() {
    load();
    session.defaultSession.on('will-download', (_event, item) => track(item));
  }

  // Downloads still running at the last quit were cut off, like in Chrome.
  function load() {
    try {
      entries = JSON.parse(fs.readFileSync(file(), 'utf8'))
        .filter((e) => e && typeof e.savePath === 'string')
        .slice(0, MAX_ENTRIES)
        .map((e) => ({ ...e, state: e.state === 'progressing' ? 'interrupted' : e.state, paused: false }));
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

  // Keep the newest MAX_ENTRIES, dropping the oldest finished ones first.
  function trim() {
    while (entries.length > MAX_ENTRIES) {
      const oldest = entries.findLastIndex((e) => !items.has(e.id));
      if (oldest === -1) break;
      entries.splice(oldest, 1);
    }
  }

  // ---------- following a download ----------

  // Save to the Downloads folder under a name no other file (or running download) has. A file
  // from "Save Image As…" asks where to save first; it joins the list once a place is picked, so
  // cancelling the dialog leaves nothing behind.
  function track(item) {
    const savePath = freePath(item.getFilename() || 'download');
    if (!askWhere.delete(item.getURL())) {
      item.setSavePath(savePath);
      follow(item, addEntry(item, savePath));
      return;
    }
    item.setSaveDialogOptions({ defaultPath: savePath });
    let entry = null;
    const begin = () => (entry ||= item.getSavePath() ? addEntry(item, item.getSavePath()) : null);
    item.on('updated', (_e, state) => begin() && onUpdated(entry, item, state));
    item.once('done', (_e, state) => begin() && onDone(entry, item, state));
  }

  function freePath(filename) {
    const dir = app.getPath('downloads');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
    const taken = (name) =>
      fs.existsSync(path.join(dir, name)) || entries.some((e) => items.has(e.id) && e.savePath === path.join(dir, name));
    return path.join(dir, uniqueName(filename, taken));
  }

  // Keep the list up to date as the file comes in.
  function follow(item, entry) {
    item.on('updated', (_e, state) => onUpdated(entry, item, state));
    item.once('done', (_e, state) => onDone(entry, item, state));
  }

  // Add a download to the top of the list.
  function addEntry(item, savePath) {
    const entry = {
      id: nextId++,
      filename: path.basename(savePath),
      url: item.getURL(),
      savePath,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      state: 'progressing',
      paused: false,
      canResume: false,
      startTime: Math.round(item.getStartTime() * 1000) || Date.now(),
      speed: 0,
    };
    entries.unshift(entry);
    items.set(entry.id, item);
    lastSent.set(entry.id, { at: Date.now(), bytes: entry.receivedBytes });
    trim();
    changed(true);
    // Like Chrome's download bubble, show the panel for a moment when a download starts.
    if (!open) {
      ctx.win.webContents.send('show-downloads');
      autoCloseTimer = setTimeout(hide, AUTO_CLOSE);
    }
    return entry;
  }

  function read(entry, item, state) {
    entry.receivedBytes = item.getReceivedBytes();
    entry.totalBytes = item.getTotalBytes();
    entry.state = state;
    entry.paused = item.isPaused();
    entry.canResume = item.canResume();
  }

  // 'updated' comes many times a second: pass progress on at most every UPDATE_EVERY ms, but
  // pausing, resuming or being cut off at once.
  function onUpdated(entry, item, state) {
    const before = `${entry.state}/${entry.paused}`;
    read(entry, item, state);
    const stateChanged = `${entry.state}/${entry.paused}` !== before;
    const now = Date.now();
    const last = lastSent.get(entry.id);
    if (!stateChanged && now - last.at < UPDATE_EVERY) return;
    const seconds = (now - last.at) / 1000;
    const speed = seconds > 0 ? (entry.receivedBytes - last.bytes) / seconds : 0;
    // Smoothed, so the time left doesn't jump around.
    entry.speed = entry.paused || state !== 'progressing' ? 0 : entry.speed ? entry.speed * 0.6 + speed * 0.4 : speed;
    lastSent.set(entry.id, { at: now, bytes: entry.receivedBytes });
    changed(stateChanged);
  }

  function onDone(entry, item, state) {
    read(entry, item, state);
    entry.canResume = false;
    entry.speed = 0;
    entry.endTime = Date.now();
    items.delete(entry.id);
    lastSent.delete(entry.id);
    saveNow();
    changed(true);
  }

  // A download started, finished, paused or was removed: redraw the toolbar button and the
  // panel. Progress alone only updates the button, not the rest of the browser UI.
  function changed(stateChanged) {
    if (stateChanged) ctx.workspaces.broadcast();
    else ctx.win.webContents.send('downloads', summary());
    if (open) refreshPanel();
  }

  // What the toolbar button needs: is there anything to list, how many are running, and how far
  // along they are together (null when no running download knows its size).
  function summary() {
    const running = entries.filter((e) => e.state === 'progressing');
    const sized = running.filter((e) => e.totalBytes > 0);
    const total = sum(sized, 'totalBytes');
    return { any: entries.length > 0, active: running.length, progress: total ? sum(sized, 'receivedBytes') / total : null, open };
  }

  // ---------- actions from the panel ----------

  const ACTIONS = {
    open: (e) => {
      markRemoved();
      if (e.removed) return changed(true);
      if (e.state === 'completed') shell.openPath(e.savePath);
    },
    show: (e) => shell.showItemInFolder(e.savePath),
    pause: (e) => control(e, 'pause'),
    resume: (e) => control(e, 'resume'),
    cancel: (e) => items.get(e.id)?.cancel(),
    retry,
    remove: (e) => {
      items.get(e.id)?.cancel();
      entries = entries.filter((other) => other !== e);
      saveNow();
      changed(true);
    },
  };

  function control(entry, method) {
    const item = items.get(entry.id);
    if (!item) return;
    item[method]();
    read(entry, item, item.getState());
    changed(true);
  }

  // A download cut off part way picks up where it stopped when it can; otherwise it starts over
  // (and shows up as a new download).
  function retry(entry) {
    const item = items.get(entry.id);
    if (item?.canResume()) return control(entry, 'resume');
    entries = entries.filter((e) => e !== entry);
    saveNow();
    changed(true);
    session.defaultSession.downloadURL(entry.url);
  }

  function act(action, id) {
    const entry = find(id);
    if (entry) ACTIONS[action]?.(entry);
  }

  function openFolder() {
    shell.openPath(app.getPath('downloads'));
  }

  // Clear drops the finished ones from the list (the files stay).
  function clear() {
    entries = entries.filter((e) => items.has(e.id));
    saveNow();
    changed(true);
  }

  // ---------- the panel ----------

  function createPanel() {
    panel = new WebContentsView({
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: PRELOAD },
    });
    panel.setBackgroundColor('#00000000');
    panel.webContents.loadFile(uiPage('downloads'));
    // Shortcuts (and Escape) still work while the panel has the focus.
    panel.webContents.on('before-input-event', (event, input) => ctx.keyboard.handleKey(event, input, panel.webContents));
    panel.webContents.on('did-finish-load', () => open && sendRows());
  }

  const rows = () =>
    entries.map((e) => ({
      id: e.id,
      filename: e.filename,
      state: e.state,
      paused: !!e.paused,
      removed: !!e.removed,
      canResume: !!e.canResume,
      progress: e.totalBytes > 0 ? Math.min(1, e.receivedBytes / e.totalBytes) : null,
      status: statusText(e),
    }));

  function sendRows() {
    if (!panel.webContents.isLoading()) panel.webContents.send('downloads-rows', rows());
  }

  // Under the button, right edges lined up, kept inside the window.
  function place() {
    const [width, height] = ctx.win.getContentSize();
    const x = Math.max(MARGIN, Math.min(Math.round(anchor.x + anchor.width) - PANEL_WIDTH, width - PANEL_WIDTH - MARGIN));
    const y = Math.round(anchor.y) + 4;
    const content = HEADER_HEIGHT + Math.max(1, entries.length) * ROW_HEIGHT + PANEL_PADDING;
    panel.setBounds({ x, y, width: PANEL_WIDTH, height: Math.max(0, Math.min(content, MAX_HEIGHT, height - y - MARGIN)) });
  }

  function refreshPanel() {
    place();
    sendRows();
  }

  // The browser UI says where its button is (rect) whenever the panel opens or the window resizes.
  function show(rect) {
    if (rect) anchor = rect;
    if (!anchor) return;
    if (!panel) createPanel();
    markRemoved();
    ctx.win.contentView.addChildView(panel); // (re-)adding puts it on top of the page view
    panel.setVisible(true);
    const wasOpen = open;
    open = true;
    refreshPanel();
    if (!wasOpen) ctx.workspaces.broadcast();
  }

  function hide() {
    clearTimeout(autoCloseTimer);
    if (!open) return;
    open = false;
    panel?.setVisible(false);
    ctx.workspaces.broadcast();
  }

  // The button and the shortcut. When the panel opens, the UI is asked where its button is.
  function toggle(rect) {
    clearTimeout(autoCloseTimer);
    if (open) return hide();
    if (rect) show(rect);
    else ctx.win.webContents.send('show-downloads');
  }

  ipcMain.on('downloads-action', (e, action, id) => e.sender === panel?.webContents && act(action, id));
  ipcMain.on('downloads-clear', (e) => e.sender === panel?.webContents && clear());
  ipcMain.on('downloads-folder', (e) => e.sender === panel?.webContents && openFolder());
  // Pointing at the panel keeps it open.
  ipcMain.on('downloads-pointer', () => clearTimeout(autoCloseTimer));

  // "Save Image As…": download the address, asking where to save it.
  function saveAs(wc, url) {
    askWhere.add(url);
    wc.downloadURL(url);
  }

  return {
    start,
    saveAs,
    saveNow,
    summary,
    show,
    hide,
    toggle,
    isOpen: () => open,
    // Clicking into the page or leaving the window closes the panel, like the suggestions.
    close: hide,
  };
}

module.exports = { createDownloads };

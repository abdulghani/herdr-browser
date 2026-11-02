import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { press } from '../../testing/fake-electron.js';
import { dir, m, start, state, ui, uiSent, useMain, wc } from '../../testing/main-harness.js';

useMain();

const MB = 1024 * 1024;
const rect = { x: 1300.4, y: 70.6, width: 28 };
const downloadsDir = () => path.join(dir, 'Downloads');
const savedFile = () => path.join(dir, 'downloads.json');
const panel = () => m.views.find((v) => v.options.webPreferences.preload.endsWith(path.join('ui', 'downloads', 'preload.js')));
const rows = () =>
  panel()
    .webContents.send.mock.calls.filter(([channel]) => channel === 'downloads-rows')
    .at(-1)[1];
const fromPanel = () => ({ sender: panel().webContents });
const act = (action, id = rows()[0].id) => m.ipc('downloads-action', fromPanel(), action, id);
const progressSent = () => uiSent('downloads');

// A download started, and the panel it opened placed under the button.
function download(options) {
  const item = m.download(options);
  m.cmd('showDownloads', rect);
  return item;
}

describe('downloads', () => {
  beforeEach(() => start());

  it('saves to the Downloads folder without asking, under a name no other file has', () => {
    fs.mkdirSync(downloadsDir());
    fs.writeFileSync(path.join(downloadsDir(), 'report.pdf'), '');
    const first = m.download({ filename: 'report.pdf' });
    expect(first.setSavePath).toHaveBeenCalledWith(path.join(downloadsDir(), 'report (1).pdf'));
    // The first one is still running, so its name is taken too.
    const second = m.download({ filename: 'report.pdf' });
    expect(second.getSavePath()).toBe(path.join(downloadsDir(), 'report (2).pdf'));
    expect(m.download({ filename: '' }).getSavePath()).toBe(path.join(downloadsDir(), 'download'));
  });

  it('asks where to save an image from "Save Image As…", and lists it once a place is picked', () => {
    const src = 'https://img.example/cat.png';
    const saveImage = () => {
      wc().emit('context-menu', {}, { x: 1, y: 1, mediaType: 'image', srcURL: src });
      m.menus
        .at(-1)
        .template.find((i) => i.label === 'Save Image As…')
        .click();
      expect(wc().downloadURL).toHaveBeenLastCalledWith(src);
      return m.download({ filename: 'cat.png', url: src });
    };
    const saved = () => JSON.parse(fs.readFileSync(savedFile(), 'utf8'));

    // Cancelling the dialog: nothing is listed.
    const cancelled = saveImage();
    expect(cancelled.setSavePath).not.toHaveBeenCalled();
    expect(cancelled.setSaveDialogOptions).toHaveBeenCalledWith({ defaultPath: path.join(downloadsDir(), 'cat.png') });
    cancelled.finish('cancelled');
    expect(fs.existsSync(savedFile())).toBe(false);

    // Picking a place: the file is followed there.
    const picked = saveImage();
    picked.savePath = path.join(dir, 'kitty.png');
    picked.progress(500);
    picked.finish();
    expect(saved().map((e) => [e.filename, e.savePath, e.state])).toEqual([['kitty.png', path.join(dir, 'kitty.png'), 'completed']]);

    // Only the address that was asked for asks; the next download of it saves straight away.
    expect(m.download({ filename: 'cat.png', url: src }).setSavePath).toHaveBeenCalled();
  });

  it('shows the button with the progress of running downloads', () => {
    expect(state().downloads).toEqual({ any: false, active: 0, progress: null, open: false });
    const a = m.download({ totalBytes: 1000 });
    const b = m.download({ totalBytes: 3000 });
    expect(state().downloads).toMatchObject({ any: true, active: 2, progress: 0 });
    vi.advanceTimersByTime(300);
    a.progress(500);
    b.progress(1500);
    expect(progressSent().at(-1)[1]).toMatchObject({ active: 2, progress: 0.5 });
    // A download with no known size doesn't count towards the fraction.
    m.download({ totalBytes: 0 });
    a.finish();
    b.finish();
    expect(state().downloads).toMatchObject({ any: true, active: 1, progress: null });
  });

  it('passes progress on at most every 250 ms, but pausing at once', () => {
    const item = m.download();
    const states = uiSent('state').length;
    vi.advanceTimersByTime(100);
    item.progress(100);
    expect(progressSent()).toHaveLength(0);
    vi.advanceTimersByTime(200);
    item.progress(200);
    expect(progressSent()).toHaveLength(1);
    expect(uiSent('state')).toHaveLength(states);
    item.paused = true;
    item.progress(200);
    expect(uiSent('state')).toHaveLength(states + 1);
  });

  it('opens the panel under the button when a download starts, and closes it again', () => {
    m.download({ filename: 'a.zip' });
    expect(uiSent('show-downloads')).toHaveLength(1);
    m.cmd('showDownloads', rect); // the UI answers with where its button is
    expect(panel().webContents.loadFile).toHaveBeenCalledWith(expect.stringMatching(/dist-ui[/\\]downloads[/\\]index\.html$/));
    expect(panel().background).toBe('#00000000');
    expect(panel().bounds).toEqual({ x: 1328 - 360, y: 75, width: 360, height: 40 + 52 + 10 });
    expect(m.win().children.at(-1)).toBe(panel());
    expect(state().downloads.open).toBe(true);
    expect(rows()).toEqual([expect.objectContaining({ filename: 'a.zip', state: 'progressing', status: '0 B of 1000 B' })]);
    // It closes by itself unless pointed at.
    vi.advanceTimersByTime(5000);
    expect(panel().visible).toBe(false);
    expect(state().downloads.open).toBe(false);

    m.download();
    m.cmd('showDownloads', rect);
    m.ipc('downloads-pointer', fromPanel());
    vi.advanceTimersByTime(5000);
    expect(panel().visible).toBe(true);
    // A new download while it is open doesn't ask again.
    m.download();
    expect(uiSent('show-downloads')).toHaveLength(2);
  });

  it('sends the rows once the panel has loaded', () => {
    m.download();
    m.cmd('showDownloads'); // no button rect yet: nothing to place it under
    expect(panel()).toBeUndefined();
    m.cmd('showDownloads', rect);
    const sent = panel().webContents.send;
    panel().webContents.loading = true;
    sent.mockClear();
    m.cmd('showDownloads');
    expect(sent).not.toHaveBeenCalled();
    panel().webContents.loading = false;
    panel().webContents.emit('did-finish-load');
    expect(sent).toHaveBeenCalledWith('downloads-rows', expect.any(Array));
  });

  it('keeps the panel inside the window and scrolls long lists', () => {
    for (let i = 0; i < 12; i++) m.download();
    m.cmd('showDownloads', { x: 10, y: 70, width: 28 });
    expect(panel().bounds).toEqual({ x: 8, y: 74, width: 360, height: 440 });
    m.cmd('showDownloads', { x: 1500, y: 870, width: 28 });
    expect(panel().bounds).toEqual({ x: 1400 - 360 - 8, y: 874, width: 360, height: 18 });
  });

  it('describes each download in its row', () => {
    const running = download({ filename: 'big.iso', totalBytes: 10 * MB });
    vi.advanceTimersByTime(1000);
    running.progress(2 * MB);
    expect(rows()[0]).toMatchObject({ status: '2 MB of 10 MB · 4 s left', progress: 0.2 });
    vi.advanceTimersByTime(1000);
    running.progress(4 * MB); // smoothed speed: 2 MB/s
    expect(rows()[0].status).toBe('4 MB of 10 MB · 3 s left');
    act('pause');
    expect(rows()[0]).toMatchObject({ paused: true, status: 'Paused · 4 MB of 10 MB' });
    act('resume');
    expect(running.resume).toHaveBeenCalled();
    expect(rows()[0].paused).toBe(false);

    const unsized = m.download({ filename: 'stream', totalBytes: 0 });
    vi.advanceTimersByTime(300);
    unsized.progress(1536);
    expect(rows()[0]).toMatchObject({ status: '1.5 KB', progress: null });
    unsized.finish();
    expect(rows()[0].status).toBe('Done · 1.5 KB'); // the size it ended up with

    running.finish();
    expect(rows()[1]).toMatchObject({ state: 'completed', status: 'Done · 10 MB', progress: 1 });
    act('cancel', rows()[1].id); // nothing to cancel any more
    expect(rows()[1].state).toBe('completed');
    const cancelled = m.download();
    act('cancel');
    expect(cancelled.cancel).toHaveBeenCalled();
    expect(rows()[0]).toMatchObject({ state: 'cancelled', status: 'Cancelled' });
    const failed = m.download();
    failed.finish('interrupted');
    expect(rows()[0].status).toBe('Failed');
  });

  it('opens a finished file or shows it in its folder', () => {
    const item = download({ filename: 'a.txt' });
    act('open'); // not done yet
    expect(m.electron.shell.openPath).not.toHaveBeenCalled();
    item.finish();
    act('open');
    expect(m.electron.shell.openPath).toHaveBeenCalledWith(path.join(downloadsDir(), 'a.txt'));
    act('show');
    expect(m.electron.shell.showItemInFolder).toHaveBeenCalledWith(path.join(downloadsDir(), 'a.txt'));
    m.ipc('downloads-folder', fromPanel());
    expect(m.electron.shell.openPath).toHaveBeenLastCalledWith(downloadsDir());

    // A file deleted since shows as deleted instead of opening.
    fs.rmSync(path.join(downloadsDir(), 'a.txt'));
    act('open');
    expect(m.electron.shell.openPath).toHaveBeenCalledTimes(2);
    expect(rows()[0]).toMatchObject({ removed: true, status: 'Deleted' });
  });

  it('pauses and resumes only running downloads', () => {
    const item = download();
    item.finish('cancelled');
    act('pause');
    act('resume');
    act('nope');
    expect(item.pause).not.toHaveBeenCalled();
    expect(item.resume).not.toHaveBeenCalled();
    act('pause', 999);
  });

  it('retries a download that stopped', () => {
    const resumable = download({ url: 'https://example.com/a' });
    resumable.resumable = true;
    resumable.progress(100, 'interrupted');
    act('retry');
    expect(resumable.resume).toHaveBeenCalled();
    expect(rows()[0].state).toBe('progressing');

    resumable.cancel();
    act('retry');
    expect(m.electron.session.defaultSession.downloadURL).toHaveBeenCalledWith('https://example.com/a');
    expect(rows()).toEqual([]);
  });

  it('removes one entry or clears the finished ones, keeping the files', () => {
    const done = download({ filename: 'done.txt' });
    done.finish();
    const running = m.download({ filename: 'running.txt' });
    const other = m.download({ filename: 'other.txt' });
    act('remove', rows()[0].id);
    expect(other.cancel).toHaveBeenCalled();
    expect(rows().map((r) => r.filename)).toEqual(['running.txt', 'done.txt']);
    m.ipc('downloads-clear', fromPanel());
    expect(rows().map((r) => r.filename)).toEqual(['running.txt']);
    expect(fs.existsSync(path.join(downloadsDir(), 'done.txt'))).toBe(true);
    expect(running.cancel).not.toHaveBeenCalled();
    act('remove');
    expect(state().downloads.any).toBe(false);
  });

  it('only takes actions from the panel', () => {
    const item = download();
    m.ipc('downloads-action', { sender: wc() }, 'cancel', rows()[0].id);
    m.ipc('downloads-clear', { sender: wc() });
    m.ipc('downloads-folder', { sender: wc() });
    expect(item.cancel).not.toHaveBeenCalled();
    expect(m.electron.shell.openPath).not.toHaveBeenCalled();
  });

  it('keeps the newest 50', () => {
    for (let i = 0; i < 51; i++) m.download({ filename: `f${i}` }).finish();
    m.cmd('showDownloads', rect);
    expect(rows()).toHaveLength(50);
    expect(rows()[0].filename).toBe('f50');
    expect(rows().at(-1).filename).toBe('f1');
  });

  it('never drops running downloads to keep the list short', () => {
    for (let i = 0; i < 51; i++) m.download({ filename: `f${i}` });
    m.cmd('showDownloads', rect);
    expect(rows()).toHaveLength(51);
  });
});

describe('the panel', () => {
  beforeEach(() => start());

  it('toggles from the button and the shortcuts', () => {
    m.cmd('toggleDownloads'); // no downloads yet: the UI is asked where to put it
    expect(uiSent('show-downloads')).toHaveLength(1);
    m.cmd('toggleDownloads', rect);
    expect(panel().visible).toBe(true);
    m.cmd('toggleDownloads', rect);
    expect(panel().visible).toBe(false);
    expect(rows()).toEqual([]);

    press(ui(), 'ctrl+j');
    expect(uiSent('show-downloads')).toHaveLength(2);
    m.cmd('showDownloads', rect);
    expect(press(wc(), 'alt+cmd+l', { key: '¬' }).preventDefault).toHaveBeenCalled();
    expect(panel().visible).toBe(false);
    press(wc(), 'alt+cmd+l');
    expect(uiSent('show-downloads')).toHaveLength(3);
  });

  it("doesn't close by itself once opened by hand", () => {
    m.download();
    m.cmd('toggleDownloads', rect);
    vi.advanceTimersByTime(5000);
    expect(panel().visible).toBe(true);
  });

  it('closes on Escape, when the page gets focus or the window loses it', () => {
    m.cmd('hideDownloads'); // nothing open
    m.cmd('toggleDownloads', rect);
    expect(press(panel().webContents, 'escape').preventDefault).toHaveBeenCalled();
    expect(panel().visible).toBe(false);
    expect(press(wc(), 'escape').preventDefault).not.toHaveBeenCalled();

    m.cmd('toggleDownloads', rect);
    wc().emit('focus');
    expect(panel().visible).toBe(false);
    m.cmd('toggleDownloads', rect);
    m.win().emit('blur');
    expect(panel().visible).toBe(false);
    expect(state().downloads.open).toBe(false);
  });
});

describe('the saved list', () => {
  it('is saved when a download finishes and loaded at the next start', () => {
    start();
    download({ filename: 'a.txt', url: 'https://example.com/a', totalBytes: 10 }).finish();
    const saved = JSON.parse(fs.readFileSync(savedFile(), 'utf8'));
    expect(saved).toEqual([
      {
        id: 1,
        filename: 'a.txt',
        url: 'https://example.com/a',
        savePath: path.join(downloadsDir(), 'a.txt'),
        receivedBytes: 10,
        totalBytes: 10,
        state: 'completed',
        startTime: 1700000000000,
        endTime: Date.now(),
      },
    ]);
    m.download({ filename: 'b.txt' });
    m.win().emit('close'); // running downloads are saved on quit too

    start();
    expect(state().downloads).toEqual({ any: true, active: 0, progress: null, open: false });
    m.cmd('showDownloads', rect);
    expect(rows().map((r) => [r.filename, r.state, r.removed])).toEqual([
      ['b.txt', 'interrupted', false],
      ['a.txt', 'completed', false],
    ]);
    // New downloads get new ids.
    m.download({ filename: 'c.txt' });
    expect(rows()[0].id).toBe(3);
  });

  it('marks finished files that were deleted since', () => {
    const file = path.join(dir, 'gone.txt');
    fs.writeFileSync(
      savedFile(),
      JSON.stringify([{ id: 4, filename: 'gone.txt', savePath: file, state: 'completed', totalBytes: 5 }, null, {}]),
    );
    start();
    m.cmd('showDownloads', rect);
    expect(rows()).toEqual([expect.objectContaining({ id: 4, removed: true, status: 'Deleted' })]);
    fs.writeFileSync(file, '');
    m.cmd('hideDownloads');
    m.cmd('showDownloads', rect);
    expect(rows()[0]).toMatchObject({ removed: false, status: 'Done · 5 B' });
  });

  it('starts empty with an unreadable file, and reports a failed save', () => {
    fs.writeFileSync(savedFile(), 'not json');
    start();
    expect(state().downloads.any).toBe(false);
    fs.rmSync(savedFile());
    fs.mkdirSync(savedFile()); // a folder can't be written as a file
    m.download().finish();
    expect(console.error).toHaveBeenCalledWith('downloads save failed', expect.any(Error));
  });
});

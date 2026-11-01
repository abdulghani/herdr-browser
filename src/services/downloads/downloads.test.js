import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dir, m, press, start, state, tab, uiSent, useMain, view } from '../../testing/main-harness.js';

useMain();

const savedFile = () => path.join(dir, 'downloads.json');
const rows = () => uiSent('downloads-rows').at(-1)?.[1];
const act = (action, id = rows()[0].id) => m.cmd('downloadsAction', { action, id });

// WebKit saving a file, as Electrobun reports it from the tab's view.
function download(name = 'file.zip', { from = view() } = {}) {
  const file = path.join(dir, name);
  from.fire('download-started', { filename: name, path: file });
  return {
    file,
    progress: (progress) => from.fire('download-progress', { progress }),
    finish: (bytes = 10) => {
      fs.writeFileSync(file, 'x'.repeat(bytes));
      from.fire('download-completed', { filename: name, path: file });
    },
    fail: (error = 'Cannot create file') => from.fire('download-failed', { filename: name, path: file, error }),
  };
}

describe('downloads', () => {
  beforeEach(() => start());

  it('lists a download and opens the panel for a moment', () => {
    expect(state().downloads).toEqual({ any: false, active: 0, progress: null, open: false });
    const dl = download('report.pdf');
    expect(state().downloads).toEqual({ any: true, active: 1, progress: null, open: true });
    expect(rows()).toEqual([
      { id: 1, filename: 'report.pdf', state: 'progressing', removed: false, progress: null, status: 'Downloading…' },
    ]);
    dl.progress(40);
    expect(uiSent('downloads').at(-1)[1]).toMatchObject({ active: 1, progress: 0.4 });
    expect(rows()[0]).toMatchObject({ progress: 0.4, status: '40%' });
    dl.progress('junk');
    expect(rows()[0].progress).toBe(0.4);
    vi.advanceTimersByTime(5000);
    expect(state().downloads.open).toBe(false);
  });

  it('keeps the panel open while it is pointed at', () => {
    download();
    m.cmd('downloadsPointer');
    vi.advanceTimersByTime(6000);
    expect(state().downloads.open).toBe(true);
    m.cmd('hideDownloads');
    download('second.zip');
    expect(state().downloads.open).toBe(true);
  });

  it('marks downloads done or failed, and saves the list', () => {
    const a = download('a.zip');
    const b = download('b.zip');
    // Progress that doesn't say which download goes to the newest one from the same tab.
    b.progress(50);
    expect(rows().map((r) => r.progress)).toEqual([0.5, null]);
    expect(uiSent('downloads').at(-1)[1].progress).toBe(0.5);
    a.finish(2048);
    b.fail();
    expect(rows().map((r) => [r.filename, r.state, r.status])).toEqual([
      ['b.zip', 'interrupted', 'Failed · Cannot create file'],
      ['a.zip', 'completed', 'Done · 2 KB'],
    ]);
    const saved = JSON.parse(fs.readFileSync(savedFile(), 'utf8'));
    expect(saved.map((e) => [e.filename, e.state, e.totalBytes])).toEqual([
      ['b.zip', 'interrupted', 0],
      ['a.zip', 'completed', 2048],
    ]);
    // Events about no running download are ignored.
    view().fire('download-completed', { path: '/nowhere' });
    view().fire('download-progress', { progress: 10 });
    m.ctx.downloads.onEvent('download-started', null);
    expect(rows()[0]).toMatchObject({ filename: 'download', state: 'progressing' });
  });

  it('shows a download that finished without a size or failed without a reason', () => {
    const dl = download('empty.txt');
    view().fire('download-completed', { path: path.join(dir, 'missing') });
    expect(rows()[0].status).toBe('Done');
    m.cmd('downloadsAction', { action: 'open', id: rows()[0].id });
    expect(rows()[0]).toMatchObject({ removed: true, status: 'Deleted' });
    download('other.zip');
    view().fire('download-failed', {});
    expect(rows()[0].status).toBe('Failed');
    expect(dl.file).toContain('empty.txt');
  });

  it('opens a finished file, shows it in the folder and removes it from the list', () => {
    const dl = download('photo.png');
    dl.finish();
    const { Utils } = m.electrobun;
    act('open');
    expect(Utils.openPath).toHaveBeenCalledWith(dl.file);
    act('show');
    expect(Utils.showItemInFolder).toHaveBeenCalledWith(dl.file);
    act('nope');
    act('open', 999);
    act('remove');
    expect(rows()).toEqual([]);
    expect(JSON.parse(fs.readFileSync(savedFile(), 'utf8'))).toEqual([]);
  });

  it('does not open a file that is still downloading', () => {
    download();
    act('open');
    expect(m.electrobun.Utils.openPath).not.toHaveBeenCalled();
  });

  it('clears finished downloads and opens the Downloads folder', () => {
    download('done.zip').finish();
    download('running.zip');
    m.cmd('downloadsClear');
    expect(rows().map((r) => r.filename)).toEqual(['running.zip']);
    m.cmd('downloadsFolder');
    expect(m.electrobun.Utils.openPath).toHaveBeenCalledWith(path.join(dir, 'Downloads'));
  });

  it('toggles the panel from the button and the keys, and Escape or a click in the page closes it', () => {
    m.cmd('toggleDownloads');
    expect(state().downloads.open).toBe(true);
    expect(rows()).toEqual([]);
    m.cmd('toggleDownloads');
    expect(state().downloads.open).toBe(false);
    press('alt+cmd+l');
    press('escape');
    expect(state().downloads.open).toBe(false);
    m.cmd('showDownloads');
    m.pageMessage(tab().id, { type: 'focus' });
    expect(state().downloads.open).toBe(false);
  });

  it('keeps the newest 50', () => {
    for (let i = 0; i < 52; i++) download(`f${i}.zip`).fail();
    expect(rows()).toHaveLength(50);
    expect(rows()[0].filename).toBe('f51.zip');
  });

  it('loads the saved list, marking unfinished downloads failed and missing files deleted', () => {
    const kept = path.join(dir, 'kept.zip');
    fs.writeFileSync(kept, '');
    fs.writeFileSync(
      savedFile(),
      JSON.stringify([
        { id: 7, filename: 'kept.zip', savePath: kept, state: 'completed', totalBytes: 5 },
        { id: 3, filename: 'gone.zip', savePath: path.join(dir, 'gone.zip'), state: 'completed' },
        { id: 'x', filename: 'cut.zip', savePath: path.join(dir, 'cut.zip'), state: 'progressing' },
        { filename: 'broken' },
        null,
      ]),
    );
    start();
    m.cmd('showDownloads');
    expect(rows().map((r) => [r.id, r.state, r.removed, r.status])).toEqual([
      [7, 'completed', false, 'Done · 5 B'],
      [3, 'completed', true, 'Deleted'],
      ['x', 'interrupted', false, 'Failed'],
    ]);
    download('new.zip');
    expect(rows()[0].id).toBe(8);
  });

  it('starts with an empty list when the saved one is broken, and logs when it cannot save', () => {
    fs.writeFileSync(savedFile(), 'not json');
    start();
    expect(state().downloads.any).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
    download('x.zip').fail();
    expect(console.error).toHaveBeenCalledWith('downloads save failed', expect.any(Error));
  });
});

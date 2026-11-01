// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBody } from '../../testing/dom.js';

let api;
let showRows;

beforeEach(async () => {
  loadBody('src/ui/downloads/index.html');
  api = {
    onRows: vi.fn((fn) => (showRows = fn)),
    action: vi.fn(),
    clear: vi.fn(),
    openFolder: vi.fn(),
    pointer: vi.fn(),
  };
  window.downloads = api;
  vi.resetModules();
  await import('./downloads.js');
});

const items = () => [...document.querySelectorAll('#dl-list li')];
const buttons = (item) => [...item.querySelectorAll('.dl-btn')].map((b) => b.title);
const row = (changes) => ({
  id: 1,
  filename: 'report.pdf',
  state: 'progressing',
  paused: false,
  removed: false,
  canResume: false,
  progress: 0.25,
  status: '1 MB of 4 MB',
  ...changes,
});

describe('downloads panel', () => {
  it('says there is nothing yet, with nothing to clear', () => {
    expect(items().map((i) => i.className)).toEqual(['dl-empty']);
    expect(document.getElementById('dl-clear').disabled).toBe(true);
  });

  it('draws a running download with its progress bar', () => {
    showRows([row()]);
    const [item] = items();
    expect(item.querySelector('.dl-name').textContent).toBe('report.pdf');
    expect(item.querySelector('.dl-status').textContent).toBe('1 MB of 4 MB');
    expect(item.querySelector('.dl-ext').textContent).toBe('PDF');
    expect(item.querySelector('.dl-bar-fill').style.width).toBe('25%');
    expect(buttons(item)).toEqual(['Pause', 'Cancel']);
    expect(item.classList.contains('openable')).toBe(false);
    expect(document.getElementById('dl-clear').disabled).toBe(true);
  });

  it('draws a paused download, and one of unknown size', () => {
    showRows([row({ paused: true }), row({ id: 2, filename: 'stream', progress: null })]);
    const [paused, unsized] = items();
    expect(buttons(paused)).toEqual(['Resume', 'Cancel']);
    expect(paused.querySelector('.dl-bar').classList.contains('paused')).toBe(true);
    expect(unsized.querySelector('.dl-bar-fill').classList.contains('indeterminate')).toBe(true);
    expect(unsized.querySelector('.dl-ext').textContent).toBe('');
  });

  it('opens a finished file on click', () => {
    showRows([row({ state: 'completed', progress: 1, status: 'Done · 4 MB' })]);
    const [item] = items();
    expect(item.querySelector('.dl-bar')).toBeNull();
    expect(buttons(item)).toEqual(['Show in folder', 'Remove from list']);
    item.click();
    expect(api.action).toHaveBeenCalledWith('open', 1);
    expect(document.getElementById('dl-clear').disabled).toBe(false);
  });

  it('offers a retry for stopped and deleted downloads', () => {
    showRows([row({ state: 'cancelled' }), row({ id: 2, state: 'interrupted' }), row({ id: 3, state: 'completed', removed: true })]);
    const [cancelled, failed, deleted] = items();
    for (const item of [cancelled, failed, deleted]) expect(buttons(item)).toEqual(['Retry', 'Remove from list']);
    expect(deleted.className).toBe('dl dl-removed');
    deleted.click();
    expect(api.action).not.toHaveBeenCalled();
  });

  it('sends the button clicks without opening the file', () => {
    showRows([row({ id: 7, state: 'completed' })]);
    items()[0].querySelector('.dl-show').click();
    expect(api.action.mock.calls).toEqual([['show', 7]]);
    items()[0].querySelector('.dl-remove').click();
    expect(api.action).toHaveBeenLastCalledWith('remove', 7);
  });

  it('clears, opens the folder and says when the pointer is on it', () => {
    showRows([row({ state: 'completed' })]);
    document.getElementById('dl-clear').click();
    document.getElementById('dl-folder').click();
    document.body.dispatchEvent(new MouseEvent('mouseenter'));
    expect(api.clear).toHaveBeenCalled();
    expect(api.openFolder).toHaveBeenCalled();
    expect(api.pointer).toHaveBeenCalled();
  });
});

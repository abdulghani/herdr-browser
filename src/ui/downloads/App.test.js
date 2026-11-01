// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.svelte';

let api;
let showRows;

beforeEach(() => {
  api = {
    onRows: vi.fn((fn) => (showRows = (rows) => flushSync(() => fn(rows)))),
    action: vi.fn(),
    clear: vi.fn(),
    openFolder: vi.fn(),
    pointer: vi.fn(),
  };
  window.downloads = api;
  render(App);
});

afterEach(cleanup);

const items = () => [...document.querySelectorAll('#dl-list li')];
const buttons = (item) => [...item.querySelectorAll('.dl-btn')].map((b) => b.title);
const clearButton = () => document.getElementById('dl-clear');
const row = (changes) => ({
  id: 1,
  filename: 'report.pdf',
  state: 'progressing',
  removed: false,
  progress: 0.25,
  status: '25%',
  ...changes,
});

describe('downloads panel', () => {
  it('says there is nothing yet, with nothing to clear', () => {
    expect(items().map((i) => i.classList.contains('dl-empty'))).toEqual([true]);
    expect(items()[0].textContent).toBe('Files you download show up here');
    expect(clearButton().disabled).toBe(true);
  });

  it('draws a running download with its progress bar', () => {
    showRows([row()]);
    const [item] = items();
    expect(item.querySelector('.dl-name').textContent).toBe('report.pdf');
    expect(item.querySelector('.dl-status').textContent).toBe('25%');
    expect(item.querySelector('.dl-ext').textContent).toBe('PDF');
    expect(item.querySelector('.dl-bar-fill').style.width).toBe('25%');
    expect(item.title).toBe('report.pdf');
    // WebKit's downloads can't be paused or cancelled from here.
    expect(buttons(item)).toEqual([]);
    expect(item.classList.contains('openable')).toBe(false);
    expect(clearButton().disabled).toBe(true);
  });

  it('draws a download that has not said how far it is yet', () => {
    showRows([row({ id: 2, filename: 'stream', progress: null })]);
    const [unsized] = items();
    expect(unsized.querySelector('.dl-bar-fill').classList.contains('indeterminate')).toBe(true);
    expect(unsized.querySelector('.dl-ext').textContent).toBe('');
  });

  it('opens a finished file on click', () => {
    showRows([row({ state: 'completed', progress: 1, status: 'Done · 4 MB' })]);
    const [item] = items();
    expect(item.querySelector('.dl-bar')).toBeNull();
    expect(buttons(item)).toEqual(['Show in folder', 'Remove from list']);
    expect(item.querySelector('.dl-actions').classList.contains('invisible')).toBe(true);
    item.click();
    expect(api.action).toHaveBeenCalledWith('open', 1);
    expect(clearButton().disabled).toBe(false);
  });

  it('only offers to remove failed and deleted downloads', () => {
    showRows([row({ id: 2, state: 'interrupted' }), row({ id: 3, state: 'completed', removed: true })]);
    const [failed, deleted] = items();
    for (const item of [failed, deleted]) expect(buttons(item)).toEqual(['Remove from list']);
    expect(deleted.classList.contains('dl-removed')).toBe(true);
    expect(deleted.classList.contains('openable')).toBe(false);
    expect(failed.querySelector('.dl-status').classList.contains('text-error')).toBe(true);
    expect(failed.querySelector('.dl-name').classList.contains('line-through')).toBe(false);
    expect(deleted.querySelector('.dl-name').classList.contains('line-through')).toBe(true);
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
    clearButton().click();
    document.getElementById('dl-folder').click();
    document.querySelector('section').dispatchEvent(new MouseEvent('mouseenter'));
    expect(api.clear).toHaveBeenCalled();
    expect(api.openFolder).toHaveBeenCalled();
    expect(api.pointer).toHaveBeenCalled();
  });
});

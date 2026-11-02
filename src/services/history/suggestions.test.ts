import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { m, start, tab, uiSent, useMain, wc } from '../../testing/main-harness';

useMain();

describe('address bar suggestions', () => {
  const rect = { x: 300.4, y: 70.6, width: 600.2, height: 30 };

  beforeEach(() => start());

  it('shows the list in a view over the page once it has loaded', () => {
    m.cmd('newTab'); // the page view is shown first, the list goes on top of it
    m.cmd('showSuggestions', { rows: [{ url: 'a' }, { url: 'b' }], selected: 0, rect });
    const overlay = m.views.find((v) => v.options.webPreferences.preload.endsWith(path.join('ui', 'suggestions', 'preload.cjs')))!;
    expect(overlay.webContents.loadFile).toHaveBeenCalledWith(expect.stringMatching(/dist-ui[/\\]suggestions[/\\]index\.html$/));
    expect(overlay.background).toBe('#00000000');
    expect(overlay.bounds).toEqual({ x: 300, y: 71, width: 600, height: 2 * 32 + 10 });
    expect(m.win().children.at(-1)).toBe(overlay);
    expect(overlay.webContents.send).toHaveBeenCalledWith('suggest-rows', { rows: [{ url: 'a' }, { url: 'b' }], selected: 0 });

    overlay.webContents.loading = true;
    m.cmd('showSuggestions', { rows: [], selected: -1, rect });
    expect(overlay.webContents.send).toHaveBeenCalledTimes(1);
    overlay.webContents.emit('did-finish-load');
    expect(overlay.webContents.send).toHaveBeenLastCalledWith('suggest-rows', { rows: [], selected: -1 });
    expect(m.views.filter((v) => v === overlay)).toHaveLength(1);

    m.cmd('selectSuggestion', 1);
    expect(overlay.webContents.send).toHaveBeenLastCalledWith('suggest-select', 1);
    m.cmd('hideSuggestions');
    expect(overlay.visible).toBe(false);
  });

  it('closes the list when the page gets focus or the window loses it', () => {
    m.cmd('hideSuggestions');
    m.cmd('selectSuggestion', 0);
    wc().emit('focus');
    expect(uiSent('suggest-close')).toHaveLength(0);

    m.cmd('showSuggestions', { rows: [{}], selected: 0, rect });
    wc().emit('focus');
    expect(uiSent('suggest-close')).toHaveLength(1);
    m.cmd('showSuggestions', { rows: [{}], selected: 0, rect });
    m.win().emit('blur');
    expect(uiSent('suggest-close')).toHaveLength(2);
  });

  it('passes hover and pick from the list to the UI', () => {
    m.ipc('suggest-hover', {}, 2);
    m.ipc('suggest-pick', {}, 3);
    expect(uiSent('suggest-hover')).toEqual([['suggest-hover', 2]]);
    expect(uiSent('suggest-pick')).toEqual([['suggest-pick', 3]]);
  });

  it('suggests other open tabs and history', () => {
    m.cmd('navigate', 'example.com');
    wc().title = 'Example';
    wc().emit('did-navigate', {}, 'https://example.com/');
    m.cmd('navigate', 'other.example');
    m.cmd('newTab');
    m.cmd('navigate', 'github.com');
    m.cmd('renameTab', { id: tab().id, name: 'Code' });
    m.cmd('newTab');
    expect(m.invoke('suggest', {}, 'code')).toEqual([expect.objectContaining({ kind: 'tab', title: 'Code', url: 'https://github.com' })]);
    expect(m.invoke('suggest', {}, null)).toEqual([expect.objectContaining({ kind: 'history', url: 'https://example.com/' })]);
  });
});

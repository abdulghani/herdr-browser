import { beforeEach, describe, expect, it } from 'vitest';
import { press } from '../../testing/fake-electron';
import { m, start, state, ui, uiSent, useMain, view, wc } from '../../testing/main-harness';

useMain();

describe('find in page', () => {
  beforeEach(() => start());

  it('opens the find bar, searches and shows the match count', () => {
    press(wc(), 'cmd+f');
    expect(state().find).toEqual({ text: '', active: 0, total: 0 });
    expect(view().bounds!.y).toBe(76 + 36);
    expect(uiSent('focus-find')).toHaveLength(1);

    m.cmd('find', 'cat');
    expect(wc().findInPage).toHaveBeenCalledWith('cat', { forward: true, findNext: false });
    wc().emit('found-in-page', {}, { finalUpdate: false, activeMatchOrdinal: 1, matches: 9 });
    expect(state().find!.total).toBe(0);
    wc().emit('found-in-page', {}, { finalUpdate: true, activeMatchOrdinal: 2, matches: 5 });
    expect(state().find).toEqual({ text: 'cat', active: 2, total: 5 });

    m.cmd('findNext', false);
    expect(wc().findInPage).toHaveBeenLastCalledWith('cat', { forward: false, findNext: true });
    press(wc(), 'f3');
    press(wc(), 'shift+f3');
    press(wc(), 'cmd+g');
    press(wc(), 'cmd+shift+g');
    expect(wc().findInPage).toHaveBeenCalledTimes(6);

    m.cmd('find', '');
    expect(wc().stopFindInPage).toHaveBeenCalledWith('clearSelection');
    expect(state().find).toEqual({ text: '', active: 0, total: 0 });
  });

  it('closes with Escape and gives focus back to the page', () => {
    press(wc(), 'ctrl+f');
    press(wc(), 'ctrl+f');
    const event = press(ui(), 'escape');
    expect(event.preventDefault).toHaveBeenCalled();
    expect(state().find).toBeNull();
    expect(wc().stopFindInPage).toHaveBeenCalledWith('keepSelection');
    expect(view().bounds!.y).toBe(76);
    expect(press(ui(), 'escape').preventDefault).not.toHaveBeenCalled();
    m.cmd('closeFind');
  });

  it('opens the find bar when searching again with nothing typed', () => {
    press(wc(), 'cmd+g');
    expect(state().find).toEqual({ text: '', active: 0, total: 0 });
  });

  it('ignores found-in-page and find without a find bar', () => {
    wc().emit('found-in-page', {}, { finalUpdate: true, activeMatchOrdinal: 1, matches: 1 });
    m.cmd('find', 'x');
    expect(wc().findInPage).not.toHaveBeenCalled();
    expect(state().find).toBeNull();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { m, press, start, state, tab, uiSent, useMain, view } from '../../testing/main-harness.js';

useMain();

describe('find in page', () => {
  beforeEach(() => start());

  it('opens the find bar, searches and shows how many matches the page counted', () => {
    press('cmd+f');
    expect(state().find).toEqual({ text: '', total: 0 });
    expect(uiSent('focus-find')).toHaveLength(1);

    m.cmd('find', 'cat');
    expect(view().findInPage).toHaveBeenCalledWith('cat', { forward: true, matchCase: false });
    expect(view().executeJavascript).toHaveBeenCalledWith('window.__herdrCountMatches?.("cat")');
    m.pageMessage(tab().id, { type: 'find', total: 5 });
    expect(state().find).toEqual({ text: 'cat', total: 5 });
    m.pageMessage(tab().id, { type: 'find', total: 'lots' });
    expect(state().find.total).toBe(0);

    m.cmd('findNext', false);
    expect(view().findInPage).toHaveBeenLastCalledWith('cat', { forward: false, matchCase: false });
    press('f3');
    press('shift+f3');
    press('cmd+g');
    press('cmd+shift+g');
    expect(view().findInPage).toHaveBeenCalledTimes(6);
    // Only a new text is counted again.
    expect(view().executeJavascript).toHaveBeenCalledTimes(1);

    m.cmd('find', '');
    expect(view().stopFindInPage).toHaveBeenCalled();
    expect(state().find).toEqual({ text: '', total: 0 });
  });

  it('closes with Escape', () => {
    press('ctrl+f');
    press('ctrl+f');
    press('escape');
    expect(state().find).toBeNull();
    expect(view().stopFindInPage).toHaveBeenCalled();
    press('escape');
    m.cmd('closeFind');
    expect(state().find).toBeNull();
  });

  it('opens the find bar when searching again with nothing typed', () => {
    press('cmd+g');
    expect(state().find).toEqual({ text: '', total: 0 });
  });

  it('ignores results and searches without a find bar or a view', () => {
    m.pageMessage(tab().id, { type: 'find', total: 3 });
    m.cmd('find', 'x');
    expect(view().findInPage).not.toHaveBeenCalled();
    expect(state().find).toBeNull();
    m.ui.auto = false;
    m.cmd('newTab');
    press('cmd+f');
    m.cmd('find', 'x');
    press('escape');
    expect(state().find).toBeNull();
  });
});

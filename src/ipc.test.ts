import { beforeEach, describe, expect, it } from 'vitest';
import { m, start, tab, useMain, view, wc } from './testing/main-harness';

useMain();

describe('navigation', () => {
  beforeEach(() => start());

  it('loads what is typed in the address bar', () => {
    m.cmd('navigate', 'example.com');
    expect(wc().loadURL).toHaveBeenLastCalledWith('https://example.com');
    expect(tab().url).toBe('https://example.com');
    m.cmd('navigate', 'cats and dogs');
    expect(tab().url).toBe('https://www.google.com/search?q=cats%20and%20dogs');
  });

  it('creates the page view when the tab has none yet', () => {
    m.cmd('newWorkspace');
    expect(view()).toBeUndefined();
    m.cmd('navigate', 'example.com');
    expect(m.pageViews()).toHaveLength(2);
    expect(m.pageViews()[1].webContents.loadURL).toHaveBeenCalledWith('https://example.com');
  });

  it('goes back, forward, reloads and stops', () => {
    m.cmd('back');
    m.cmd('forward');
    m.cmd('reload');
    m.cmd('stop');
    expect(wc().navigationHistory.goBack).toHaveBeenCalled();
    expect(wc().navigationHistory.goForward).toHaveBeenCalled();
    expect(wc().reload).toHaveBeenCalled();
    expect(wc().stop).toHaveBeenCalled();
  });

  it('ignores unknown commands', () => {
    expect(() => m.cmd('nope')).not.toThrow();
  });
});

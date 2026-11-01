import { beforeEach, describe, expect, it } from 'vitest';
import { m, start, state, tab, uiSent, useMain, view, ws } from './testing/main-harness.js';

useMain();

describe('navigation', () => {
  beforeEach(() => start());

  it('loads what is typed in the address bar', () => {
    m.cmd('navigate', 'example.com');
    expect(view().loadURL).toHaveBeenLastCalledWith('https://example.com');
    expect(tab().url).toBe('https://example.com');
    m.cmd('navigate', 'cats and dogs');
    expect(tab().url).toBe('https://www.google.com/search?q=cats%20and%20dogs');
    m.cmd('navigate', 'herdr://settings');
    expect(view().loadURL).toHaveBeenLastCalledWith('views://ui/settings/index.html');
  });

  it('starts the page view when the tab has none yet', () => {
    m.cmd('newWorkspace');
    expect(state().shown).toBeNull();
    m.cmd('navigate', 'example.com');
    expect(state().shown).toBe(tab().id);
    expect(view().url).toBe('https://example.com');
  });

  it('asks the UI to go back, forward and reload, and stops in the page', () => {
    m.cmd('back');
    m.cmd('forward');
    m.cmd('reload');
    m.cmd('stop');
    const id = tab().id;
    expect(uiSent('page-action').map(([, p]) => p)).toEqual([
      { tabId: id, action: 'goBack' },
      { tabId: id, action: 'goForward' },
      { tabId: id, action: 'reload' },
    ]);
    expect(view().executeJavascript).toHaveBeenCalledWith('window.stop()');
  });

  it('does nothing to a page that has no view', () => {
    m.cmd('newWorkspace');
    m.cmd('reload');
    expect(uiSent('page-action')).toHaveLength(0);
  });

  it('answers suggestions and ignores unknown commands', () => {
    expect(m.suggest('x')).toEqual([]);
    expect(() => m.cmd('nope')).not.toThrow();
    expect(() => m.handlers().messages.cmd()).not.toThrow();
    expect(ws().tabs).toHaveLength(1);
  });
});

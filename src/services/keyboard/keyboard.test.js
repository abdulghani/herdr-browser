import { beforeEach, describe, expect, it, vi } from 'vitest';
import { press } from '../../testing/fake-electron.js';
import { m, start, state, tab, ui, uiSent, useMain, wc, ws } from '../../testing/main-harness.js';

useMain();

describe('keyboard', () => {
  beforeEach(() => start());

  it('ignores key-ups, bare modifiers and unbound keys', () => {
    expect(press(wc(), 'ctrl+t', { type: 'keyUp' }).preventDefault).not.toHaveBeenCalled();
    expect(press(wc(), 'shift', { key: 'Shift' }).preventDefault).not.toHaveBeenCalled();
    expect(press(wc(), 'x').preventDefault).not.toHaveBeenCalled();
    expect(ws().tabs).toHaveLength(1);
  });

  it('runs a prefix action after Ctrl+Space', () => {
    expect(press(ui(), 'ctrl+space').preventDefault).toHaveBeenCalled();
    expect(state().prefixArmed).toBe(true);
    press(ui(), 'c');
    expect(state().prefixArmed).toBe(false);
    expect(ws().tabs).toHaveLength(2);
  });

  it('drops the prefix after 2 seconds', () => {
    press(ui(), 'ctrl+space');
    vi.advanceTimersByTime(2000);
    expect(state().prefixArmed).toBe(false);
    press(ui(), 'c');
    expect(ws().tabs).toHaveLength(1);
  });

  it.each([
    ['k', () => expect(state().workspaces).toHaveLength(1)],
    ['r', () => expect(uiSent('rename').at(-1)[1]).toEqual({ kind: 'tab', id: tab().id })],
    ['b', () => expect(state().sidebarCollapsed).toBe(true)],
    ['shift+c', () => expect(state().workspaces).toHaveLength(2)],
    ['shift+r', () => expect(uiSent('rename').at(-1)[1]).toEqual({ kind: 'workspace', id: ws().id })],
    ['?', () => expect(uiSent('toggle-help')).toHaveLength(1)],
  ])('prefix + %s', (key, check) => {
    press(ui(), 'ctrl+space');
    press(ui(), key);
    check();
  });

  it('cycles tabs and workspaces with prefix keys', () => {
    m.cmd('newTab');
    m.cmd('newTab');
    m.cmd('newWorkspace');
    for (const [key, wsIndex, tabIndex] of [
      ['shift+n', 0, 2],
      ['n', 0, 0],
      ['p', 0, 2],
      ['shift+p', 1, 0],
      ['shift+k', 0, 2],
    ]) {
      press(ui(), 'ctrl+space');
      press(ui(), key);
      expect([state().activeWs, ws().activeTab]).toEqual([wsIndex, tabIndex]);
    }
  });

  it('selects tabs and workspaces with prefix digits', () => {
    m.cmd('newTab');
    m.cmd('newWorkspace');
    press(ui(), 'ctrl+space');
    press(ui(), 'shift+1', { key: '!' });
    expect(state().activeWs).toBe(0);
    press(ui(), 'ctrl+space');
    press(ui(), '1');
    expect(ws().activeTab).toBe(0);
    press(ui(), 'ctrl+space');
    press(ui(), '9');
    expect(ws().activeTab).toBe(0);
    press(ui(), 'ctrl+space');
    press(ui(), 'z');
    expect(state().prefixArmed).toBe(false);
  });

  it('jumps to tabs and workspaces with digit shortcuts', () => {
    m.cmd('newTab');
    m.cmd('newTab');
    m.cmd('newWorkspace');
    press(ui(), 'ctrl+1');
    expect(state().activeWs).toBe(0);
    press(ui(), 'alt+1');
    expect(ws().activeTab).toBe(0);
    press(ui(), 'cmd+9');
    expect(ws().activeTab).toBe(2);
    press(ui(), 'cmd+2');
    expect(ws().activeTab).toBe(1);
    expect(press(ui(), 'cmd+0').preventDefault).not.toHaveBeenCalled();
  });

  it('moves between and reorders tabs and workspaces with Option+arrows', () => {
    m.cmd('navigate', 'a.com');
    m.cmd('newTab');
    m.cmd('navigate', 'b.com');
    press(ui(), 'alt+shift+left');
    expect(ws().tabs.map((t) => t.url)).toEqual(['https://b.com', 'https://a.com']);
    press(ui(), 'alt+shift+left');
    press(ui(), 'alt+shift+right');
    expect(ws().activeTab).toBe(1);
    press(ui(), 'alt+left');
    expect(ws().activeTab).toBe(0);
    press(ui(), 'alt+right');
    expect(ws().activeTab).toBe(1);

    m.cmd('newWorkspace');
    press(ui(), 'alt+up');
    expect(state().activeWs).toBe(0);
    press(ui(), 'alt+down');
    expect(state().activeWs).toBe(1);
    const moving = ws().id;
    press(ui(), 'alt+shift+up');
    expect(state().workspaces[0].id).toBe(moving);
    press(ui(), 'alt+shift+up');
    press(ui(), 'alt+shift+down');
    expect(state().workspaces[1].id).toBe(moving);
  });

  it('leaves Option+arrows to a focused text field', () => {
    m.cmd('newTab');
    m.ipc('text-focus', { sender: wc() }, true);
    expect(press(wc(), 'alt+left').preventDefault).not.toHaveBeenCalled();
    expect(press(wc(), 'alt+shift+right').preventDefault).not.toHaveBeenCalled();
    expect(ws().activeTab).toBe(1);

    m.ipc('text-focus', { sender: wc() }, false);
    press(wc(), 'alt+left');
    expect(ws().activeTab).toBe(0);
  });

  it('forgets the text field when the page navigates away', () => {
    m.cmd('newTab');
    m.ipc('text-focus', { sender: wc() }, true);
    wc().emit('did-start-navigation', { isMainFrame: true, isSameDocument: true, url: 'about:blank' });
    press(wc(), 'alt+left');
    expect(ws().activeTab).toBe(1);
    m.cmd('selectTab', ws().tabs[1].id);
    wc().emit('did-start-navigation', { isMainFrame: true, isSameDocument: false, url: 'about:blank' });
    press(wc(), 'alt+left');
    expect(ws().activeTab).toBe(0);
  });

  it('opens and closes tabs and workspaces', () => {
    press(ui(), 'cmd+t');
    press(ui(), 'ctrl+t');
    expect(ws().tabs).toHaveLength(3);
    press(ui(), 'ctrl+w');
    expect(ws().tabs).toHaveLength(2);
    press(ui(), 'ctrl+tab');
    expect(ws().activeTab).toBe(0);
    press(ui(), 'ctrl+shift+tab');
    expect(ws().activeTab).toBe(1);
    press(ui(), 'ctrl+shift+t');
    expect(state().workspaces).toHaveLength(2);
  });

  it('controls the page', () => {
    const page = wc();
    for (const key of ['ctrl+r', 'f5']) press(ui(), key);
    expect(page.reload).toHaveBeenCalledTimes(2);
    press(ui(), 'ctrl+shift+r');
    expect(page.reloadIgnoringCache).toHaveBeenCalled();
    press(ui(), 'ctrl+[');
    press(ui(), 'ctrl+]');
    expect(page.navigationHistory.goBack).toHaveBeenCalled();
    expect(page.navigationHistory.goForward).toHaveBeenCalled();
    for (const key of ['f12', 'ctrl+shift+i', 'cmd+shift+j']) press(ui(), key);
    expect(page.toggleDevTools).toHaveBeenCalledTimes(3);
  });

  it('zooms the page', () => {
    press(ui(), 'ctrl+=');
    press(ui(), 'ctrl+shift+=');
    expect(wc().zoom).toBe(1);
    press(ui(), 'ctrl+-');
    expect(wc().zoom).toBe(0.5);
    press(ui(), 'ctrl+0');
    expect(wc().zoom).toBe(0);
  });

  it('does nothing to the page when the tab has no view yet', () => {
    m.cmd('newWorkspace');
    for (const key of ['ctrl+r', 'ctrl+=', 'ctrl+0', 'f12']) press(ui(), key);
    expect(m.pageViews()).toHaveLength(1);
  });

  it('focuses the address bar and toggles the sidebar', () => {
    for (const key of ['ctrl+l', 'cmd+l', 'alt+d']) press(ui(), key);
    expect(uiSent('focus-address')).toHaveLength(3);
    press(ui(), 'ctrl+b');
    expect(state().sidebarCollapsed).toBe(true);
  });
});

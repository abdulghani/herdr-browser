import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m, press, start, state, tab, uiSent, useMain, view, ws } from '../../testing/main-harness.js';

useMain();

const pageActions = () => m.sent.filter(([c]) => c === 'page-action').map(([, p]) => p.action);

describe('keyboard', () => {
  beforeEach(() => start());

  it('ignores bare modifiers, unbound keys and junk', () => {
    press('shift', { key: 'Shift' });
    press('x');
    m.ctx.keyboard.handleKey(null);
    m.ctx.keyboard.handleKey({ key: 5 });
    expect(m.ctx.keyboard.run('nope+x')).toBe(false);
    expect(ws().tabs).toHaveLength(1);
  });

  it('takes keys from a page as well as from the browser UI', () => {
    press('ctrl+t', { from: 'page' });
    expect(ws().tabs).toHaveLength(2);
  });

  it('runs a prefix action after Ctrl+Space', () => {
    press('ctrl+space');
    expect(state().prefixArmed).toBe(true);
    press('c');
    expect(state().prefixArmed).toBe(false);
    expect(ws().tabs).toHaveLength(2);
  });

  it('drops the prefix after 2 seconds', () => {
    press('ctrl+space');
    vi.advanceTimersByTime(2000);
    expect(state().prefixArmed).toBe(false);
    press('c');
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
    press('ctrl+space');
    press(key, key === '?' ? { key: '?' } : {});
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
      press('ctrl+space');
      press(key);
      expect([state().activeWs, ws().activeTab]).toEqual([wsIndex, tabIndex]);
    }
  });

  it('selects tabs and workspaces with prefix digits', () => {
    m.cmd('newTab');
    m.cmd('newWorkspace');
    press('ctrl+space');
    press('shift+1', { key: '!' });
    expect(state().activeWs).toBe(0);
    press('ctrl+space');
    press('1');
    expect(ws().activeTab).toBe(0);
    press('ctrl+space');
    press('9');
    expect(ws().activeTab).toBe(0);
    press('ctrl+space');
    press('z', { code: undefined });
    expect(state().prefixArmed).toBe(false);
  });

  it('jumps to tabs and workspaces with digit shortcuts', () => {
    m.cmd('newTab');
    m.cmd('newTab');
    m.cmd('newWorkspace');
    press('ctrl+1');
    expect(state().activeWs).toBe(0);
    press('alt+1');
    expect(ws().activeTab).toBe(0);
    press('cmd+9');
    expect(ws().activeTab).toBe(2);
    press('cmd+2');
    expect(ws().activeTab).toBe(1);
    expect(m.ctx.keyboard.run('alt+0')).toBe(false);
  });

  it('moves between and reorders tabs and workspaces with Option+arrows', () => {
    m.cmd('navigate', 'a.com');
    m.cmd('newTab');
    m.cmd('navigate', 'b.com');
    press('alt+shift+left');
    expect(ws().tabs.map((t) => t.url)).toEqual(['https://b.com', 'https://a.com']);
    press('alt+shift+left');
    press('alt+shift+right');
    expect(ws().activeTab).toBe(1);
    press('alt+left');
    expect(ws().activeTab).toBe(0);
    press('alt+right');
    expect(ws().activeTab).toBe(1);
    press('cmd+shift+[');
    expect(ws().activeTab).toBe(0);
    press('cmd+shift+]');
    expect(ws().activeTab).toBe(1);

    m.cmd('newWorkspace');
    press('alt+up');
    expect(state().activeWs).toBe(0);
    press('alt+down');
    expect(state().activeWs).toBe(1);
    const moving = ws().id;
    press('alt+shift+up');
    expect(state().workspaces[0].id).toBe(moving);
    press('alt+shift+up');
    press('alt+shift+down');
    expect(state().workspaces[1].id).toBe(moving);
  });

  it('opens and closes tabs and workspaces', () => {
    press('cmd+t');
    press('ctrl+t');
    expect(ws().tabs).toHaveLength(3);
    press('ctrl+w');
    press('cmd+w');
    expect(ws().tabs).toHaveLength(1);
    press('ctrl+tab');
    press('ctrl+shift+tab');
    press('ctrl+shift+t');
    expect(state().workspaces).toHaveLength(2);
  });

  it('controls the page', () => {
    const page = view();
    for (const key of ['ctrl+r', 'cmd+r', 'f5', 'ctrl+shift+r']) press(key);
    for (const key of ['ctrl+[', 'cmd+[']) press(key);
    for (const key of ['ctrl+]', 'cmd+]']) press(key);
    expect(pageActions()).toEqual(['reload', 'reload', 'reload', 'reload', 'goBack', 'goBack', 'goForward', 'goForward']);
    for (const key of ['f12', 'ctrl+shift+i', 'cmd+shift+j']) press(key);
    expect(page.toggleDevTools).toHaveBeenCalledTimes(3);
  });

  it('zooms the page in steps of 10%, within limits', () => {
    press('ctrl+=');
    press('ctrl+shift+=');
    press('cmd+=');
    expect(view().zoom).toBe(1.3);
    press('ctrl+-');
    press('cmd+-');
    expect(view().zoom).toBe(1.1);
    press('cmd+0');
    expect(view().zoom).toBe(1);
    for (let i = 0; i < 12; i++) press('ctrl+-');
    expect(view().zoom).toBe(0.3);
    press('ctrl+0');
    expect(view().zoom).toBe(1);
    for (let i = 0; i < 50; i++) press('ctrl+=');
    expect(view().zoom).toBe(5);
  });

  it('does nothing to the page when the tab has no view yet', () => {
    m.ui.auto = false;
    m.cmd('newTab');
    for (const key of ['ctrl+r', 'ctrl+=', 'ctrl+0', 'f12']) press(key);
    expect(pageActions()).toEqual([]);
  });

  it('focuses the address bar, opens settings and downloads, and toggles the sidebar', () => {
    for (const key of ['ctrl+l', 'cmd+l', 'alt+d']) press(key);
    expect(uiSent('focus-address')).toHaveLength(3);
    press('ctrl+b');
    expect(state().sidebarCollapsed).toBe(true);
    press('cmd+,');
    expect(tab().url).toBe('herdr://settings/');
    press('ctrl+,');
    expect(ws().tabs).toHaveLength(2);
    press('ctrl+j');
    expect(state().downloads.open).toBe(true);
    press('escape');
    expect(state().downloads.open).toBe(false);
    press('alt+cmd+l');
    expect(state().downloads.open).toBe(true);
  });

  it('lists the keys pages pass on: no Cmd ones, which the menu has', () => {
    const keys = m.ctx.keyboard.forwardedKeys();
    expect(keys).toEqual(expect.arrayContaining(['ctrl+space', 'alt+left', 'ctrl+t', 'f5', 'ctrl+1', 'alt+9']));
    expect(keys.some((k) => k.includes('cmd'))).toBe(false);
  });
});

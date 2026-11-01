import { beforeEach, describe, expect, it } from 'vitest';
import { m, start, state, tab, uiSent, useMain, wc, ws } from '../../testing/main-harness.js';

useMain();

describe('tabs', () => {
  beforeEach(() => start());

  it('opens a new tab and focuses the address bar', () => {
    m.cmd('newTab');
    expect(ws().tabs).toHaveLength(2);
    expect(ws().activeTab).toBe(1);
    expect(uiSent('focus-address')).toHaveLength(1);
    expect(m.win().children).toEqual([m.pageViews()[1]]);
  });

  it('closes a tab and selects its left neighbour', () => {
    m.cmd('navigate', 'a.com');
    m.cmd('newTab');
    m.cmd('navigate', 'b.com');
    const closing = m.shownView();
    m.cmd('closeTab');
    expect(closing.webContents.close).toHaveBeenCalled();
    expect(ws().tabs.map((t) => t.url)).toEqual(['https://a.com']);
    expect(state().awake).toHaveLength(1);
    expect(m.shownView()).toBe(m.pageViews()[0]);
  });

  it('closing the first tab keeps the first tab selected', () => {
    m.cmd('navigate', 'a.com');
    m.cmd('newTab');
    m.cmd('navigate', 'b.com');
    m.cmd('closeTab', ws().tabs[0].id);
    expect(ws().activeTab).toBe(0);
    expect(tab().url).toBe('https://b.com');
  });

  it('closing the last tab closes the workspace', () => {
    m.cmd('newWorkspace');
    m.cmd('renameWorkspace', { id: ws().id, name: 'second' });
    m.cmd('closeTab');
    expect(state().workspaces.map((w) => w.name)).toEqual(['main']);
  });

  it('ignores closing a tab that does not exist', () => {
    m.cmd('closeTab', 'nope');
    expect(ws().tabs).toHaveLength(1);
  });

  it('selects and switches to tabs by id', () => {
    m.cmd('newTab');
    m.cmd('newWorkspace');
    const first = state().workspaces[0].tabs[0].id;
    m.cmd('switchToTab', first);
    expect(state().activeWs).toBe(0);
    expect(ws().activeTab).toBe(0);
    m.cmd('selectTab', ws().tabs[1].id);
    expect(ws().activeTab).toBe(1);
    m.cmd('selectTab', 'nope');
    m.cmd('switchToTab', 'nope');
    expect(ws().activeTab).toBe(1);
  });

  it('renames a tab, and clears the name when it is blank', () => {
    m.cmd('renameTab', { id: tab().id, name: '  Mail ' });
    expect(tab().customName).toBe('Mail');
    m.cmd('renameTab', { id: tab().id, name: '  ' });
    expect(tab().customName).toBeUndefined();
    m.cmd('renameTab', { id: 'nope', name: 'x' });
  });

  it('reorders tabs by drag and drop', () => {
    m.cmd('navigate', 'a.com');
    m.cmd('newTab');
    m.cmd('navigate', 'b.com');
    m.cmd('newTab');
    m.cmd('navigate', 'c.com');
    const [a] = ws().tabs;
    m.cmd('moveTabTo', { tabId: a.id, wsId: ws().id, index: 3 });
    expect(ws().tabs.map((t) => t.url)).toEqual(['https://b.com', 'https://c.com', 'https://a.com']);

    // Moving the active tab keeps it active.
    m.cmd('selectTab', a.id);
    m.cmd('moveTabTo', { tabId: a.id, wsId: ws().id, index: 0 });
    expect(ws().tabs.map((t) => t.url)).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
    expect(ws().activeTab).toBe(0);
  });

  it('moves a tab to another workspace', () => {
    m.cmd('navigate', 'a.com');
    m.cmd('newWorkspace');
    const target = ws().id;
    m.cmd('switchToTab', state().workspaces[0].tabs[0].id);
    m.cmd('moveTabTo', { tabId: tab().id, wsId: target });
    expect(state().activeWs).toBe(1);
    expect(ws(1).tabs.map((t) => t.url)).toEqual(['about:blank', 'https://a.com']);
    expect(ws(0).tabs.map((t) => t.url)).toEqual(['about:blank']);
    m.cmd('moveTabTo', { tabId: 'nope', wsId: target });
    m.cmd('moveTabTo', { tabId: tab().id, wsId: 'nope' });
    expect(ws(1).tabs).toHaveLength(2);
  });
});

describe('workspaces', () => {
  beforeEach(() => start());

  it('creates a workspace and asks for its name before loading', () => {
    m.cmd('newWorkspace');
    expect(state().workspaces.map((w) => w.name)).toEqual(['main', 'workspace 2']);
    expect(state().activeWs).toBe(1);
    expect(m.win().children).toEqual([]);
    expect(uiSent('rename').at(-1)[1]).toEqual({ kind: 'workspace', id: ws().id });
    m.cmd('focusContent');
    expect(m.shownView()).toBe(m.pageViews()[1]);
    m.cmd('focusContent');
    expect(wc().focus).toHaveBeenCalledTimes(2);
  });

  it('renames a workspace, ignoring blank names', () => {
    m.cmd('renameWorkspace', { id: ws().id, name: ' home ' });
    m.cmd('renameWorkspace', { id: ws().id, name: '   ' });
    m.cmd('renameWorkspace', { id: 'nope', name: 'x' });
    expect(ws().name).toBe('home');
  });

  it('selects and closes workspaces', () => {
    m.cmd('newWorkspace');
    m.cmd('newWorkspace');
    const [a, b, c] = state().workspaces;
    m.cmd('selectWorkspace', a.id);
    expect(state().activeWs).toBe(0);
    m.cmd('selectWorkspace', 'nope');
    expect(state().activeWs).toBe(0);
    m.cmd('closeWorkspace', b.id);
    expect(state().workspaces.map((w) => w.id)).toEqual([a.id, c.id]);
    m.cmd('closeWorkspace', 'nope');
    m.cmd('closeWorkspace');
    m.cmd('closeWorkspace');
    expect(state().workspaces.map((w) => w.name)).toEqual(['main']);
    expect(state().workspaces[0].id).not.toBe(a.id);
  });

  it('reorders workspaces and keeps the active one', () => {
    m.cmd('newWorkspace');
    m.cmd('newWorkspace');
    const [a, b, c] = state().workspaces.map((w) => w.id);
    m.cmd('moveWorkspaceTo', { wsId: a, index: 3 });
    expect(state().workspaces.map((w) => w.id)).toEqual([b, c, a]);
    expect(ws().id).toBe(c);
    m.cmd('moveWorkspaceTo', { wsId: c, index: 0 });
    expect(state().workspaces.map((w) => w.id)).toEqual([c, b, a]);
    m.cmd('moveWorkspaceTo', { wsId: 'nope', index: 0 });
    expect(state().workspaces.map((w) => w.id)).toEqual([c, b, a]);
  });

  it('collapses the sidebar', () => {
    m.cmd('toggleSidebar');
    expect(state().sidebarCollapsed).toBe(true);
    expect(m.shownView().bounds).toMatchObject({ x: 52, width: 1348 });
    m.win().emit('resize');
    expect(m.shownView().setBounds).toHaveBeenCalledTimes(3);
  });
});

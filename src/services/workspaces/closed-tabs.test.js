import { beforeEach, describe, expect, it } from 'vitest';
import { m, press, start, state, useMain, ws } from '../../testing/main-harness.js';

useMain();

describe('reopening closed tabs', () => {
  beforeEach(() => start());

  it('reopens a closed tab where it was', () => {
    m.cmd('navigate', 'a.com');
    m.cmd('newTab');
    m.cmd('navigate', 'b.com');
    m.cmd('closeTab');
    press('cmd+shift+t');
    expect(ws().tabs.map((t) => t.url)).toEqual(['https://a.com', 'https://b.com']);
    expect(ws().activeTab).toBe(1);
  });

  it('does not remember blank tabs', () => {
    m.cmd('newTab');
    m.cmd('closeTab');
    press('cmd+shift+t');
    expect(ws().tabs).toHaveLength(1);
  });

  it('reopens a closed workspace at its place', () => {
    m.cmd('newWorkspace');
    m.cmd('renameWorkspace', { id: ws().id, name: 'docs' });
    m.cmd('navigate', 'docs.example');
    m.cmd('newTab');
    m.cmd('selectWorkspace', state().workspaces[0].id);
    m.cmd('closeWorkspace', state().workspaces[1].id);
    expect(state().workspaces).toHaveLength(1);
    press('cmd+shift+t');
    expect(state().workspaces.map((w) => w.name)).toEqual(['main', 'docs']);
    expect(state().activeWs).toBe(1);
    expect(ws().tabs.map((t) => t.url)).toEqual(['https://docs.example', 'about:blank']);
    expect(ws().activeTab).toBe(1);
  });

  it('falls back to the active workspace when the old one is gone', () => {
    m.cmd('newWorkspace');
    m.cmd('navigate', 'a.com');
    m.cmd('newTab');
    m.cmd('selectTab', ws().tabs[0].id);
    m.cmd('closeTab');
    // Only a blank tab is left, so closing the workspace is not remembered.
    m.cmd('closeWorkspace');
    press('cmd+shift+t');
    expect(state().workspaces.map((w) => w.name)).toEqual(['main']);
    expect(ws().tabs.map((t) => t.url)).toEqual(['https://a.com', 'about:blank']);
  });

  it('keeps at most 25 closed tabs', () => {
    for (let i = 0; i < 27; i++) {
      m.cmd('newTab');
      m.cmd('navigate', `site${i}.com`);
      m.cmd('closeTab');
    }
    for (let i = 0; i < 30; i++) press('cmd+shift+t');
    expect(ws().tabs).toHaveLength(26);
  });
});

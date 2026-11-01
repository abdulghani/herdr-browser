import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { dir, m, press, sessionFile, start, state, tab, useMain, view, writeSession, ws } from '../../testing/main-harness.js';

useMain();

describe('session', () => {
  it('saves the session shortly after a change', () => {
    start();
    m.cmd('navigate', 'example.com');
    expect(fs.existsSync(sessionFile())).toBe(false);
    vi.advanceTimersByTime(500);
    const saved = JSON.parse(fs.readFileSync(sessionFile(), 'utf8'));
    expect(saved).toMatchObject({ version: 1, activeWs: 0, sidebarCollapsed: false, closed: [] });
    expect(saved.workspaces).toEqual([
      { name: 'main', activeTab: 0, tabs: [{ url: 'https://example.com', title: 'New Tab', favicon: null }] },
    ]);
  });

  it('saves the session and history when the window closes', () => {
    start();
    m.cmd('navigate', 'example.com');
    view().fire('did-navigate', 'https://example.com/');
    m.pageMessage(tab().id, { type: 'title', title: 'Example' });
    m.win().emit('close');
    expect(JSON.parse(fs.readFileSync(sessionFile(), 'utf8')).workspaces[0].tabs[0].url).toBe('https://example.com/');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'history.json'), 'utf8'))).toEqual([
      expect.objectContaining({ url: 'https://example.com/', title: 'Example', visits: 1 }),
    ]);
  });

  it('logs when the session cannot be written', () => {
    start();
    fs.rmSync(dir, { recursive: true, force: true });
    m.win().emit('close');
    expect(console.error).toHaveBeenCalledWith('session save failed', expect.any(Error));
  });

  it('restores workspaces, tabs and closed tabs, but not back/forward history', () => {
    const history = { entries: [{ url: 'https://a.com/' }, { url: 'https://b.com/' }], index: 1 };
    writeSession({
      activeWs: 5,
      sidebarCollapsed: true,
      workspaces: [
        {
          name: 'work',
          activeTab: 9,
          tabs: [
            { url: 'https://a.com/', title: 'A' },
            { url: 'https://b.com/', title: 'B', history },
          ],
        },
        { name: 'empty', tabs: [] },
      ],
      closed: [{ kind: 'tab', wsName: 'work', index: 0, tab: { url: 'https://c.com/', title: 'C', history } }],
    });
    start();
    expect(state().workspaces.map((w) => w.name)).toEqual(['work', 'empty']);
    expect(state().activeWs).toBe(1);
    expect(state().sidebarCollapsed).toBe(true);
    expect(ws(1).tabs).toEqual([expect.objectContaining({ url: 'about:blank' })]);

    m.cmd('selectWorkspace', ws(0).id);
    expect(ws().activeTab).toBe(1);
    expect(tab()).not.toHaveProperty('history');
    expect(view().url).toBe('https://b.com/');

    press('cmd+shift+t');
    expect(ws().tabs.map((t) => t.url)).toEqual(['https://c.com/', 'https://a.com/', 'https://b.com/']);
    expect(tab()).not.toHaveProperty('history');
  });

  it('starts fresh when the session file is broken or empty', () => {
    fs.writeFileSync(sessionFile(), 'not json');
    start();
    expect(state().workspaces.map((w) => w.name)).toEqual(['main']);

    writeSession({ workspaces: [] });
    start();
    expect(state().workspaces.map((w) => w.name)).toEqual(['main']);
  });
});

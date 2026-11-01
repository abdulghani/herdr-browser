import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dir, load, m, sessionFile, start, state, tab, uiSent, useMain, view, ws } from './testing/main-harness.js';

useMain();

describe('startup', () => {
  it('opens the window on the built browser UI, with the tab strip as its title bar', () => {
    load();
    expect(m.win().options).toMatchObject({
      title: 'Herdr Browser',
      url: 'views://ui/browser/index.html',
      titleBarStyle: 'hiddenInset',
      trafficLightOffset: { x: 12, y: 11 },
    });
    expect(m.electrobun.ApplicationMenu.setApplicationMenu).toHaveBeenCalled();
  });

  it('keeps the profile in the app data folder, or in HERDR_BROWSER_PROFILE', () => {
    const nested = path.join(dir, 'a', 'b');
    load({ userData: nested });
    expect(fs.existsSync(nested)).toBe(true);
    process.env.HERDR_BROWSER_PROFILE = path.join(dir, 'other');
    start({ userData: '/nowhere' });
    m.win().emit('close');
    expect(fs.existsSync(path.join(dir, 'other', 'session.json'))).toBe(true);
  });

  it('carries on when the profile folder cannot be made', () => {
    const file = path.join(dir, 'file');
    fs.writeFileSync(file, '');
    expect(() => load({ userData: path.join(file, 'profile') })).not.toThrow();
  });

  it('opens one workspace with a blank tab once the UI is ready', () => {
    load();
    expect(state()).toBeUndefined();
    m.ready();
    expect(state().workspaces).toEqual([{ id: expect.any(String), name: 'main', activeTab: 0, tabs: [expect.any(Object)] }]);
    expect(tab()).toMatchObject({ url: 'about:blank', title: 'New Tab', favicon: null });
    expect(state()).toMatchObject({ prefixArmed: false, find: null, loading: true, shown: tab().id, awake: [tab().id] });
    expect(state().pages).toEqual([{ id: tab().id, src: 'about:blank' }]);
    expect(state().keys).toEqual(expect.arrayContaining(['ctrl+space', 'ctrl+t', 'alt+1', 'ctrl+9']));
    expect(state().keys).not.toContain('cmd+t');
    expect(view().url).toBe('about:blank');
    expect(m.win().setTitle).toHaveBeenLastCalledWith('New Tab — main');
  });

  it('re-sends the state when the UI asks again', () => {
    start();
    const before = uiSent('state').length;
    m.ready();
    expect(uiSent('state')).toHaveLength(before + 1);
    expect(ws().tabs).toHaveLength(1);
  });

  it('closes the suggestions and the downloads panel when the window loses focus', () => {
    start();
    m.cmd('showDownloads');
    m.win().emit('blur');
    expect(uiSent('suggest-close')).toHaveLength(1);
    expect(state().downloads.open).toBe(false);
  });

  it('saves everything on quit', () => {
    start();
    m.cmd('navigate', 'example.com');
    m.appEvents.emit('before-quit');
    expect(JSON.parse(fs.readFileSync(sessionFile(), 'utf8')).workspaces[0].tabs[0].url).toBe('https://example.com');
    expect(fs.existsSync(path.join(dir, 'downloads.json'))).toBe(true);
    m.menuClick('cmd+q');
    expect(m.electrobun.Utils.quit).toHaveBeenCalled();
  });
});

describe('links from outside', () => {
  const open = (url) => m.appEvents.emit('open-url', { data: { url } });

  it('holds links that arrive before the UI is ready', () => {
    load();
    open('https://early.example/');
    open('file:///tmp/page.html');
    m.ready();
    expect(ws().tabs.map((t) => t.url)).toEqual(['about:blank', 'https://early.example/', 'file:///tmp/page.html']);
  });

  it('opens links in the running window, bringing it back', () => {
    start();
    m.win().minimized = true;
    open('https://late.example/');
    expect(m.win().unminimize).toHaveBeenCalled();
    expect(m.win().focus).toHaveBeenCalled();
    expect(tab().url).toBe('https://late.example/');
    open('https://again.example/');
    expect(m.win().unminimize).toHaveBeenCalledTimes(1);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { dir, load, m, setPlatform, start, state, tab, uiSent, useMain, wc, ws } from './testing/main-harness.js';

useMain();

describe('startup', () => {
  it('names the app, looks like plain Chrome and registers herdr://', () => {
    load();
    const { app, protocol } = m.electron;
    expect(app.setName).toHaveBeenCalledWith('Herdr Browser');
    expect(app.userAgentFallback).toBe('Mozilla/5.0 Chrome/140.0 Safari/537.36');
    expect(protocol.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      { scheme: 'herdr', privileges: { standard: true, secure: true, supportFetchAPI: true } },
    ]);
    expect(app.quit).not.toHaveBeenCalled();
  });

  it('uses the profile from HERDR_BROWSER_PROFILE', () => {
    process.env.HERDR_BROWSER_PROFILE = dir;
    load({ userData: '/nowhere' });
    expect(m.electron.app.setPath).toHaveBeenCalledWith('userData', path.resolve(dir));
  });

  it('quits when another instance holds the lock', () => {
    load({ singleInstance: false });
    expect(m.electron.app.quit).toHaveBeenCalled();
  });

  it('quits when all windows close', () => {
    load();
    m.handlers.app.emit('window-all-closed');
    expect(m.electron.app.quit).toHaveBeenCalled();
  });

  it('opens one workspace with a blank tab', () => {
    start();
    expect(state().workspaces).toEqual([{ id: expect.any(String), name: 'main', activeTab: 0, tabs: [expect.any(Object)] }]);
    expect(tab()).toMatchObject({ url: 'about:blank', title: 'New Tab', favicon: null });
    expect(m.pageViews()).toHaveLength(1);
    expect(wc().loadURL).toHaveBeenCalledWith('about:blank');
    expect(m.shownView().background).toBe('#0b0d10');
    expect(m.shownView().bounds).toEqual({ x: 220, y: 76, width: 1180, height: 824 });
    expect(wc().focus).toHaveBeenCalled();
    expect(m.win().setTitle).toHaveBeenLastCalledWith('New Tab — main');
    expect(state()).toMatchObject({ prefixArmed: false, find: null, nav: { canGoBack: false, canGoForward: false, loading: false } });
    expect(m.electron.Menu.setApplicationMenu).toHaveBeenCalledWith(null);
    expect(m.win().loadFile).toHaveBeenCalledWith(expect.stringMatching(/dist-ui[/\\]browser[/\\]index\.html$/));
    expect(m.win().options.titleBarStyle).toBeUndefined();
  });

  it('hides the native title bar on macOS', () => {
    setPlatform('darwin');
    start();
    expect(m.win().options).toMatchObject({ titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 11 } });
  });

  it('applies the saved DNS setting', () => {
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ dns: { provider: 'cloudflare' } }));
    start();
    expect(m.electron.app.configureHostResolver).toHaveBeenCalledWith({
      secureDnsMode: 'secure',
      secureDnsServers: ['https://cloudflare-dns.com/dns-query'],
    });
  });

  it('opens URLs and files passed on the command line', () => {
    const file = path.join(dir, 'page.html');
    fs.writeFileSync(file, '<p>hi</p>');
    start({}, ['electron', '.', '--flag', 'example.com', file]);
    expect(ws().tabs.map((t) => t.url)).toEqual(['about:blank', 'https://example.com', `file://${file}`]);
  });

  it('skips only the executable in a packaged app', () => {
    start({ isPackaged: true }, ['/Applications/Herdr', 'example.com']);
    expect(ws().tabs.map((t) => t.url)).toEqual(['about:blank', 'https://example.com']);
  });

  it('re-sends the state when the UI asks', () => {
    start();
    const before = uiSent('state').length;
    m.ipc('ready', {});
    expect(uiSent('state')).toHaveLength(before + 1);
  });
});

describe('links from outside', () => {
  const event = () => ({ preventDefault: vi.fn() });

  it('holds links that arrive before the window is ready', () => {
    load();
    const e = event();
    m.handlers.app.emit('open-url', e, 'https://early.example/');
    m.handlers.app.emit('open-file', event(), '/tmp/page.html');
    expect(e.preventDefault).toHaveBeenCalled();
    m.handlers.app.emit('second-instance', {}, ['herdr', '.', 'ignored.example']);
    m.ready();
    m.finishLoad();
    expect(ws().tabs.map((t) => t.url)).toEqual(['about:blank', 'https://early.example/', 'file:///tmp/page.html']);
  });

  it('opens links in the running window, bringing it back', () => {
    start();
    m.win().minimized = true;
    m.handlers.app.emit('open-url', event(), 'https://late.example/');
    expect(m.win().restore).toHaveBeenCalled();
    expect(m.win().focus).toHaveBeenCalled();
    expect(tab().url).toBe('https://late.example/');
    m.handlers.app.emit('open-url', event(), 'https://again.example/');
    expect(m.win().restore).toHaveBeenCalledTimes(1);
  });

  it('opens URLs from a second launch', () => {
    start();
    m.win().minimized = true;
    m.handlers.app.emit('second-instance', {}, ['herdr', '.', 'example.com']);
    expect(m.win().restore).toHaveBeenCalled();
    expect(tab().url).toBe('https://example.com');
    m.handlers.app.emit('second-instance', {}, ['herdr', '.']);
    expect(m.win().restore).toHaveBeenCalledTimes(1);
    expect(ws().tabs).toHaveLength(2);
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMain, press } from './helpers/fake-electron.js';

const SETTINGS_DIR = path.resolve(import.meta.dirname, '../src/settings');
const realPlatform = process.platform;
const realPath = process.env.PATH;

let dir;
let m;

const setPlatform = (value) => Object.defineProperty(process, 'platform', { value, configurable: true });

// Loads main.js, runs app.whenReady and lets the UI page finish loading.
function start(options = {}, argv) {
  m = loadMain({ userData: dir, ...options });
  m.ready();
  m.finishLoad(argv);
  return m;
}

const state = () => m.state();
const ws = (i = state().activeWs) => state().workspaces[i];
const tab = () => ws().tabs[ws().activeTab];
const wc = () => m.shownView().webContents;
const ui = () => m.win().webContents;
const uiSent = (channel) => ui().send.mock.calls.filter(([c]) => c === channel);
const sessionFile = () => path.join(dir, 'session.json');
const writeSession = (data) => fs.writeFileSync(sessionFile(), JSON.stringify(data));
const settingsEvent = (url = 'herdr://settings/') => {
  const frame = { url };
  return { sender: { mainFrame: frame }, senderFrame: frame };
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-main-'));
  vi.useFakeTimers();
  setPlatform('linux');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setPlatform(realPlatform);
  process.env.PATH = realPath;
  delete process.env.HERDR_BROWSER_PROFILE;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('startup', () => {
  it('names the app, looks like plain Chrome and registers herdr://', () => {
    m = loadMain({ userData: dir });
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
    m = loadMain({ userData: '/nowhere' });
    expect(m.electron.app.setPath).toHaveBeenCalledWith('userData', path.resolve(dir));
  });

  it('quits when another instance holds the lock', () => {
    m = loadMain({ userData: dir, singleInstance: false });
    expect(m.electron.app.quit).toHaveBeenCalled();
  });

  it('quits when all windows close', () => {
    m = loadMain({ userData: dir });
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
    expect(m.win().loadFile).toHaveBeenCalledWith(expect.stringMatching(/ui[/\\]index\.html$/));
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
    wc().title = 'Example';
    wc().emit('did-navigate', {}, 'https://example.com/');
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

  it('restores workspaces, tabs, back/forward history and closed tabs', () => {
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
      closed: [{ kind: 'tab', wsName: 'work', index: 0, tab: { url: 'https://c.com/', title: 'C' } }],
    });
    start();
    expect(state().workspaces.map((w) => w.name)).toEqual(['work', 'empty']);
    expect(state().activeWs).toBe(1);
    expect(state().sidebarCollapsed).toBe(true);
    expect(ws(1).tabs).toEqual([expect.objectContaining({ url: 'about:blank' })]);
    expect(m.shownView().bounds.x).toBe(52);

    m.cmd('selectWorkspace', ws(0).id);
    expect(ws().activeTab).toBe(1);
    expect(wc().navigationHistory.restore).toHaveBeenCalledWith(history);
    expect(wc().loadURL).not.toHaveBeenCalled();
    expect(state().nav).toMatchObject({ canGoBack: true, canGoForward: false });

    press(wc(), 'cmd+shift+t');
    expect(ws().tabs.map((t) => t.url)).toEqual(['https://c.com/', 'https://a.com/', 'https://b.com/']);
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
    expect(m.shownView()).toBeUndefined();
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

describe('page events', () => {
  beforeEach(() => start());

  it('tracks the title, favicon and URL', () => {
    wc().url = 'https://example.com/';
    wc().title = 'Example';
    wc().emit('did-navigate', {}, 'https://example.com/');
    wc().emit('page-title-updated', {}, 'Example Domain');
    wc().emit('page-favicon-updated', {}, ['https://example.com/favicon.ico']);
    expect(tab()).toMatchObject({ url: 'https://example.com/', title: 'Example Domain', favicon: 'https://example.com/favicon.ico' });
    expect(m.win().setTitle).toHaveBeenLastCalledWith('Example Domain — main');

    wc().emit('page-favicon-updated', {}, []);
    wc().emit('page-title-updated', {}, 'about:blank');
    expect(tab()).toMatchObject({ title: 'New Tab', favicon: null });
  });

  it('follows in-page navigation of the main frame only', () => {
    wc().emit('did-navigate-in-page', {}, 'https://example.com/#a', false);
    expect(tab().url).toBe('about:blank');
    wc().emit('did-navigate-in-page', {}, 'https://example.com/#b', true);
    expect(tab().url).toBe('https://example.com/#b');
  });

  it('paints blank and herdr pages dark, others white', () => {
    const view = m.shownView();
    view.webContents.emit('did-start-navigation', { isMainFrame: true, url: 'https://example.com/' });
    expect(view.background).toBe('#ffffff');
    view.webContents.emit('did-start-navigation', { isMainFrame: true, url: 'herdr://settings/' });
    expect(view.background).toBe('#0b0d10');
    view.webContents.emit('did-start-navigation', { isMainFrame: false, url: 'https://ads.example/' });
    expect(view.background).toBe('#0b0d10');
  });

  it('reports loading', () => {
    wc().loading = true;
    wc().emit('did-start-loading');
    expect(state().nav.loading).toBe(true);
    wc().loading = false;
    wc().emit('did-stop-loading');
    expect(state().nav.loading).toBe(false);
  });

  it('opens popups as a new tab next to the opener', () => {
    m.cmd('newTab');
    m.cmd('selectTab', ws().tabs[0].id);
    const result = wc().windowOpenHandler({ url: 'https://popup.example/' });
    expect(result).toEqual({ action: 'deny' });
    expect(ws().tabs.map((t) => t.url)).toEqual(['about:blank', 'https://popup.example/', 'about:blank']);
    expect(ws().activeTab).toBe(1);
  });

  it('ignores events from a tab that was closed', () => {
    const first = m.shownView().webContents;
    m.cmd('newTab');
    m.cmd('closeTab', ws().tabs[0].id);
    first.emit('page-title-updated', {}, 'Gone');
    expect(ws().tabs.map((t) => t.title)).toEqual(['New Tab']);
    expect(first.windowOpenHandler({ url: 'https://x.example/' })).toEqual({ action: 'deny' });
    expect(ws().tabs).toHaveLength(1);
  });
});

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

describe('reopening closed tabs', () => {
  beforeEach(() => start());

  it('reopens a closed tab where it was, with its history', () => {
    m.cmd('navigate', 'a.com');
    m.cmd('newTab');
    m.cmd('navigate', 'b.com');
    const entries = [{ url: 'https://x.com/' }, { url: 'https://b.com/' }];
    Object.assign(wc(), { entries, activeIndex: 1 });
    m.cmd('closeTab');
    press(ui(), 'cmd+shift+t');
    expect(ws().tabs.map((t) => t.url)).toEqual(['https://a.com', 'https://b.com']);
    expect(ws().activeTab).toBe(1);
    expect(wc().navigationHistory.restore).toHaveBeenCalledWith({ entries, index: 1 });
  });

  it('does not remember blank tabs', () => {
    m.cmd('newTab');
    m.cmd('closeTab');
    press(ui(), 'cmd+shift+t');
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
    press(ui(), 'cmd+shift+t');
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
    press(ui(), 'cmd+shift+t');
    expect(state().workspaces.map((w) => w.name)).toEqual(['main']);
    expect(ws().tabs.map((t) => t.url)).toEqual(['https://a.com', 'about:blank']);
  });

  it('keeps at most 25 closed tabs', () => {
    for (let i = 0; i < 27; i++) {
      m.cmd('newTab');
      m.cmd('navigate', `site${i}.com`);
      m.cmd('closeTab');
    }
    for (let i = 0; i < 30; i++) press(ui(), 'cmd+shift+t');
    expect(ws().tabs).toHaveLength(26);
  });
});

describe('tab sleeping', () => {
  const MINUTE = 60 * 1000;

  beforeEach(() => start());

  it('unloads a tab hidden for 10 minutes and wakes it with its history', () => {
    m.cmd('navigate', 'a.com');
    const sleeper = m.shownView();
    Object.assign(sleeper.webContents, { entries: [{ url: 'https://a.com/' }], activeIndex: 0 });
    const sleeperId = tab().id;
    m.cmd('newTab');
    vi.advanceTimersByTime(30 * 1000); // first check notes when it was hidden
    vi.advanceTimersByTime(10 * MINUTE);
    expect(sleeper.webContents.close).toHaveBeenCalled();
    expect(state().awake).toEqual([tab().id]);

    m.cmd('selectTab', sleeperId);
    expect(state().awake).toContain(sleeperId);
    expect(wc().navigationHistory.restore).toHaveBeenCalledWith({ entries: [{ url: 'https://a.com/' }], index: 0 });
  });

  it('keeps tabs that use the camera or are loading awake', () => {
    m.cmd('navigate', 'meet.example');
    const call = m.shownView().webContents;
    m.cmd('newTab');
    m.cmd('navigate', 'slow.example');
    m.shownView().webContents.loading = true;
    m.cmd('newTab');

    const cb = vi.fn();
    m.handlers.permission(call, 'media', cb, { mediaTypes: ['video'] });
    expect(cb).toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(11 * MINUTE);
    expect(state().awake).toHaveLength(3);

    // Leaving the page ends the call.
    call.emit('did-navigate', {}, 'https://example.com/');
    vi.advanceTimersByTime(MINUTE);
    expect(state().awake).toHaveLength(2);
    expect(call.close).toHaveBeenCalled();
  });

  it('grants everyday permissions only', () => {
    const cb = vi.fn();
    m.handlers.permission(wc(), 'geolocation', cb, {});
    expect(cb).toHaveBeenLastCalledWith(false);
    m.handlers.permission({}, 'media', cb, { mediaTypes: ['audio'] });
    m.handlers.permission(wc(), 'media', cb, {});
    expect(cb).toHaveBeenLastCalledWith(true);
  });
});

describe('find in page', () => {
  beforeEach(() => start());

  it('opens the find bar, searches and shows the match count', () => {
    press(wc(), 'cmd+f');
    expect(state().find).toEqual({ text: '', active: 0, total: 0 });
    expect(m.shownView().bounds.y).toBe(76 + 36);
    expect(uiSent('focus-find')).toHaveLength(1);

    m.cmd('find', 'cat');
    expect(wc().findInPage).toHaveBeenCalledWith('cat', { forward: true, findNext: false });
    wc().emit('found-in-page', {}, { finalUpdate: false, activeMatchOrdinal: 1, matches: 9 });
    expect(state().find.total).toBe(0);
    wc().emit('found-in-page', {}, { finalUpdate: true, activeMatchOrdinal: 2, matches: 5 });
    expect(state().find).toEqual({ text: 'cat', active: 2, total: 5 });

    m.cmd('findNext', false);
    expect(wc().findInPage).toHaveBeenLastCalledWith('cat', { forward: false, findNext: true });
    press(wc(), 'f3');
    press(wc(), 'shift+f3');
    press(wc(), 'cmd+g');
    press(wc(), 'cmd+shift+g');
    expect(wc().findInPage).toHaveBeenCalledTimes(6);

    m.cmd('find', '');
    expect(wc().stopFindInPage).toHaveBeenCalledWith('clearSelection');
    expect(state().find).toEqual({ text: '', active: 0, total: 0 });
  });

  it('closes with Escape and gives focus back to the page', () => {
    press(wc(), 'ctrl+f');
    press(wc(), 'ctrl+f');
    const event = press(ui(), 'escape');
    expect(event.preventDefault).toHaveBeenCalled();
    expect(state().find).toBeNull();
    expect(wc().stopFindInPage).toHaveBeenCalledWith('keepSelection');
    expect(m.shownView().bounds.y).toBe(76);
    expect(press(ui(), 'escape').preventDefault).not.toHaveBeenCalled();
    m.cmd('closeFind');
  });

  it('opens the find bar when searching again with nothing typed', () => {
    press(wc(), 'cmd+g');
    expect(state().find).toEqual({ text: '', active: 0, total: 0 });
  });

  it('ignores found-in-page and find without a find bar', () => {
    wc().emit('found-in-page', {}, { finalUpdate: true, activeMatchOrdinal: 1, matches: 1 });
    m.cmd('find', 'x');
    expect(wc().findInPage).not.toHaveBeenCalled();
    expect(state().find).toBeNull();
  });
});

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

describe('address bar suggestions', () => {
  const rect = { x: 300.4, y: 70.6, width: 600.2, height: 30 };

  beforeEach(() => start());

  it('shows the list in a view over the page once it has loaded', () => {
    m.cmd('newTab'); // the page view is shown first, the list goes on top of it
    m.cmd('showSuggestions', { rows: [{ url: 'a' }, { url: 'b' }], selected: 0, rect });
    const overlay = m.views.find((v) => v.options.webPreferences.preload.endsWith('suggest-preload.js'));
    expect(overlay.webContents.loadFile).toHaveBeenCalledWith(expect.stringMatching(/ui[/\\]suggest\.html$/));
    expect(overlay.background).toBe('#00000000');
    expect(overlay.bounds).toEqual({ x: 300, y: 71, width: 600, height: 2 * 32 + 10 });
    expect(m.win().children.at(-1)).toBe(overlay);
    expect(overlay.webContents.send).toHaveBeenCalledWith('suggest-rows', { rows: [{ url: 'a' }, { url: 'b' }], selected: 0 });

    overlay.webContents.loading = true;
    m.cmd('showSuggestions', { rows: [], selected: -1, rect });
    expect(overlay.webContents.send).toHaveBeenCalledTimes(1);
    overlay.webContents.emit('did-finish-load');
    expect(overlay.webContents.send).toHaveBeenLastCalledWith('suggest-rows', { rows: [], selected: -1 });
    expect(m.views.filter((v) => v === overlay)).toHaveLength(1);

    m.cmd('selectSuggestion', 1);
    expect(overlay.webContents.send).toHaveBeenLastCalledWith('suggest-select', 1);
    m.cmd('hideSuggestions');
    expect(overlay.visible).toBe(false);
  });

  it('closes the list when the page gets focus or the window loses it', () => {
    m.cmd('hideSuggestions');
    m.cmd('selectSuggestion', 0);
    wc().emit('focus');
    expect(uiSent('suggest-close')).toHaveLength(0);

    m.cmd('showSuggestions', { rows: [{}], selected: 0, rect });
    wc().emit('focus');
    expect(uiSent('suggest-close')).toHaveLength(1);
    m.cmd('showSuggestions', { rows: [{}], selected: 0, rect });
    m.win().emit('blur');
    expect(uiSent('suggest-close')).toHaveLength(2);
  });

  it('passes hover and pick from the list to the UI', () => {
    m.ipc('suggest-hover', {}, 2);
    m.ipc('suggest-pick', {}, 3);
    expect(uiSent('suggest-hover')).toEqual([['suggest-hover', 2]]);
    expect(uiSent('suggest-pick')).toEqual([['suggest-pick', 3]]);
  });

  it('suggests other open tabs and history', () => {
    m.cmd('navigate', 'example.com');
    wc().title = 'Example';
    wc().emit('did-navigate', {}, 'https://example.com/');
    m.cmd('navigate', 'other.example');
    m.cmd('newTab');
    m.cmd('navigate', 'github.com');
    m.cmd('renameTab', { id: tab().id, name: 'Code' });
    m.cmd('newTab');
    expect(m.invoke('suggest', {}, 'code')).toEqual([expect.objectContaining({ kind: 'tab', title: 'Code', url: 'https://github.com' })]);
    expect(m.invoke('suggest', {}, null)).toEqual([expect.objectContaining({ kind: 'history', url: 'https://example.com/' })]);
  });
});

describe('settings', () => {
  beforeEach(() => start());

  it('opens settings in a tab, or switches to the open one', () => {
    press(ui(), 'cmd+,');
    expect(tab().url).toBe('herdr://settings/');
    expect(ws().activeTab).toBe(1);
    expect(m.shownView().background).toBe('#0b0d10');
    m.cmd('selectTab', ws().tabs[0].id);
    press(ui(), 'ctrl+,');
    m.cmd('openSettings');
    expect(ws().tabs).toHaveLength(2);
    expect(ws().activeTab).toBe(1);
  });

  it('only answers the settings page itself', async () => {
    const other = settingsEvent('https://evil.example/');
    const subframe = { sender: { mainFrame: { url: 'herdr://settings/' } }, senderFrame: { url: 'herdr://settings/' } };
    expect(m.invoke('settings-get', other)).toBe(false);
    expect(m.invoke('settings-get', subframe)).toBe(false);
    expect(m.invoke('settings-set-dns', other, { provider: 'google' })).toBeUndefined();
    expect(await m.invoke('settings-resolve', other, 'example.com')).toBeUndefined();
    expect(m.electron.session.defaultSession.resolveHost).not.toHaveBeenCalled();
  });

  it('gives the settings page the settings, providers and app info', () => {
    const result = m.invoke('settings-get', settingsEvent());
    expect(result.settings).toEqual({ dns: { provider: 'system', customUrl: '' } });
    expect(result.providers.map((p) => p.id)).toContain('cloudflare');
    expect(result.providers.every((p) => !('url' in p))).toBe(true);
    expect(result.about).toMatchObject({ version: '0.3.3', platform: 'linux', profile: dir });
  });

  it('saves and applies a DNS choice', () => {
    m.invoke('settings-set-dns', settingsEvent(), { provider: 'quad9' });
    expect(m.electron.app.configureHostResolver).toHaveBeenLastCalledWith({
      secureDnsMode: 'secure',
      secureDnsServers: ['https://dns.quad9.net/dns-query'],
    });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).dns.provider).toBe('quad9');
  });

  it('looks up a host for the settings page', async () => {
    const { resolveHost } = m.electron.session.defaultSession;
    resolveHost.mockResolvedValueOnce({ endpoints: [{ address: '1.2.3.4' }] });
    expect(await m.invoke('settings-resolve', settingsEvent(), ' example.com ')).toEqual({ addresses: [{ address: '1.2.3.4' }] });
    expect(resolveHost).toHaveBeenCalledWith('example.com', { cacheUsage: 'disallowed' });

    resolveHost.mockRejectedValueOnce(new Error('net::ERR_NAME_NOT_RESOLVED'));
    expect(await m.invoke('settings-resolve', settingsEvent(), 'nope.invalid')).toEqual({ error: 'ERR_NAME_NOT_RESOLVED' });
  });
});

describe('herdr:// protocol', () => {
  beforeEach(() => start());

  const serve = (url) => m.handlers.protocol.herdr({ url });

  it('serves files from src/settings and forbids framing', async () => {
    m.electron.net.fetch.mockImplementation(async () => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    const response = await serve('herdr://settings/');
    expect(m.electron.net.fetch).toHaveBeenCalledWith(pathToFileURL(path.join(SETTINGS_DIR, 'index.html')).href);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(response.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(await response.text()).toBe('<html>');

    await serve('herdr://settings/settings.css');
    expect(m.electron.net.fetch).toHaveBeenLastCalledWith(pathToFileURL(path.join(SETTINGS_DIR, 'settings.css')).href);
  });

  it('answers 404 for other hosts, paths outside src/settings and missing files', async () => {
    expect((await serve('herdr://other/')).status).toBe(404);
    expect((await serve('herdr://settings/..%2f..%2fmain.js')).status).toBe(404);
    expect(m.electron.net.fetch).not.toHaveBeenCalled();
    m.electron.net.fetch.mockRejectedValue(new Error('missing'));
    const response = await serve('herdr://settings/missing.html');
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
  });
});

describe('passkeys', () => {
  function withBrowser(bin) {
    const bindir = path.join(dir, 'bin');
    fs.mkdirSync(bindir, { recursive: true });
    if (bin) fs.writeFileSync(path.join(bindir, bin), '');
    process.env.PATH = bindir;
  }

  it('offers to open the page in a browser that has passkeys', () => {
    withBrowser('chromium');
    start();
    m.cmd('navigate', 'login.example');
    m.ipc('passkey-request', { sender: wc() });
    expect(tab().notice).toEqual({ kind: 'passkey', browser: 'Chromium' });
    expect(state().workspaces[0].tabs[0].notice).toEqual({ kind: 'passkey', browser: 'Chromium' });
    expect(m.shownView().bounds.y).toBe(76 + 36);

    m.cmd('openExternally');
    expect(m.childProcess.spawn).toHaveBeenCalledWith('chromium', ['https://login.example'], { detached: true, stdio: 'ignore' });
    expect(m.childProcess.spawn.mock.results[0].value.unref).toHaveBeenCalled();
    expect(tab().notice).toBeUndefined();
    expect(m.shownView().bounds.y).toBe(76);
  });

  it('uses open -a on macOS', () => {
    setPlatform('darwin');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === '/Applications/Brave Browser.app');
    start();
    m.ipc('passkey-request', { sender: wc() });
    expect(tab().notice.browser).toBe('Brave');
    m.cmd('openExternally');
    expect(m.childProcess.spawn).toHaveBeenCalledWith('open', ['-a', 'Brave Browser', 'about:blank'], expect.any(Object));
  });

  it('shows the notice without a browser, and can be dismissed', () => {
    withBrowser(null);
    start();
    m.ipc('passkey-request', { sender: wc() });
    expect(tab().notice).toEqual({ kind: 'passkey', browser: null });
    m.cmd('openExternally');
    expect(m.childProcess.spawn).not.toHaveBeenCalled();
    m.cmd('dismissNotice');
    expect(tab().notice).toBeUndefined();
    m.cmd('dismissNotice');
  });

  it('clears the notice when the page navigates, also for a background tab', () => {
    withBrowser(null);
    start();
    const page = wc();
    m.ipc('passkey-request', { sender: page });
    m.cmd('newTab');
    page.emit('did-navigate', {}, 'https://elsewhere.example/');
    expect(state().workspaces[0].tabs[0].notice).toBeUndefined();
  });

  it('works without a PATH and on other platforms', () => {
    delete process.env.PATH;
    start();
    m.ipc('passkey-request', { sender: wc() });
    expect(tab().notice.browser).toBeNull();

    setPlatform('win32');
    start();
    m.ipc('passkey-request', { sender: wc() });
    expect(tab().notice.browser).toBeNull();
  });

  it('ignores requests from something that is not a tab', () => {
    start();
    m.ipc('passkey-request', { sender: ui() });
    expect(tab().notice).toBeUndefined();
  });
});

describe('context menu', () => {
  beforeEach(() => start());

  const openMenu = (params) => {
    wc().emit('context-menu', {}, { x: 10, y: 20, ...params });
    const menu = m.menus.at(-1);
    expect(menu.popup).toHaveBeenCalledWith({ window: m.win() });
    return menu.template;
  };
  const item = (template, label) => template.find((i) => i.label === label);

  it('offers link actions', () => {
    const template = openMenu({ linkURL: 'https://link.example/' });
    item(template, 'Copy Link Address').click();
    expect(m.electron.clipboard.writeText).toHaveBeenCalledWith('https://link.example/');
    item(template, 'Open Link in New Tab').click();
    expect(ws().tabs.map((t) => t.url)).toEqual(['about:blank', 'https://link.example/']);
  });

  it('offers editing for fields and copy for selected text', () => {
    expect(
      openMenu({ isEditable: true })
        .map((i) => i.role)
        .filter(Boolean),
    ).toEqual(['cut', 'copy', 'paste']);
    expect(
      openMenu({ selectionText: 'hi' })
        .map((i) => i.role)
        .filter(Boolean),
    ).toEqual(['copy']);
    expect(
      openMenu({})
        .map((i) => i.role)
        .filter(Boolean),
    ).toEqual([]);
  });

  it('navigates and inspects the page', () => {
    const page = wc();
    Object.assign(page, { entries: [{}, {}], activeIndex: 1 });
    const template = openMenu({});
    expect(item(template, 'Back').enabled).toBe(true);
    expect(item(template, 'Forward').enabled).toBe(false);
    for (const label of ['Back', 'Forward', 'Reload', 'Inspect']) item(template, label).click();
    expect(page.navigationHistory.goBack).toHaveBeenCalled();
    expect(page.navigationHistory.goForward).toHaveBeenCalled();
    expect(page.reload).toHaveBeenCalled();
    expect(page.inspectElement).toHaveBeenCalledWith(10, 20);
  });
});

describe('links from outside', () => {
  const event = () => ({ preventDefault: vi.fn() });

  it('holds links that arrive before the window is ready', () => {
    m = loadMain({ userData: dir });
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

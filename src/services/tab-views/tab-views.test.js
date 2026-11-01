import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m, start, state, tab, useMain, view, ws } from '../../testing/main-harness.js';

useMain();

describe('page views', () => {
  beforeEach(() => start());

  it('follows the URL and keeps the title and favicon until the page reports new ones', () => {
    m.pageMessage(tab().id, { type: 'favicon', url: 'https://old.example/favicon.ico' });
    view().fire('did-navigate', 'https://example.com/');
    expect(tab()).toMatchObject({ url: 'https://example.com/', favicon: null });
    view().fire('did-navigate-in-page', 'https://example.com/#b');
    expect(tab().url).toBe('https://example.com/#b');
    view().fire('did-navigate', 'views://ui/settings/index.html#about');
    expect(tab().url).toBe('herdr://settings/#about');
    view().fire('did-navigate');
    expect(tab().url).toBe('');
  });

  it('reports loading', () => {
    expect(state().loading).toBe(true);
    view().fire('dom-ready', 'about:blank');
    expect(state().loading).toBe(false);
    view().fire('will-navigate', 'https://example.com/');
    expect(state().loading).toBe(true);
    view().fire('load-finished');
    expect(state().loading).toBe(false);
    view().fire('load-started');
    view().fire('download-started', { filename: 'a.zip', path: '/tmp/a.zip' });
    expect(state().loading).toBe(false);
  });

  it('opens popups and Cmd+clicked links as a new tab next to the opener', () => {
    m.cmd('newTab');
    m.cmd('selectTab', ws().tabs[0].id);
    const opener = view();
    opener.fire('new-window-open', { url: 'https://popup.example/', isCmdClick: false });
    opener.fire('new-window-open', 'https://string.example/');
    opener.fire('new-window-open', {});
    expect(ws().tabs.map((t) => t.url)).toEqual(['about:blank', 'https://string.example/', 'https://popup.example/', 'about:blank']);
    expect(ws().activeTab).toBe(1);
  });

  it('ignores events from a tab that was closed or a view it no longer has', () => {
    const first = view();
    const firstId = tab().id;
    m.cmd('newTab');
    m.cmd('closeTab', firstId);
    first.fire('did-navigate', 'https://gone.example/');
    first.fire('host-message', { type: 'title', title: 'Gone' });
    first.fire('new-window-open', 'https://x.example/');
    first.fire('dom-ready');
    expect(ws().tabs.map((t) => [t.url, t.title])).toEqual([['about:blank', 'New Tab']]);
  });

  it('only takes a view for an awake tab that exists', () => {
    const { tabView } = m.handlers().messages;
    tabView({ tabId: 'nope', webviewId: view().id });
    tabView({ tabId: tab().id, webviewId: 999 });
    expect(state().awake).toEqual([tab().id]);
  });

  it('runs page actions and zoom on the shown page only', () => {
    m.cmd('stop');
    expect(view().executeJavascript).toHaveBeenCalledWith('window.stop()');
    m.ui.auto = false;
    m.cmd('newTab');
    m.cmd('stop');
    m.cmd('back');
    expect(m.sent.filter(([c]) => c === 'page-action')).toHaveLength(0);
  });

  it('wakes a sleeping tab with a notice that its history is gone', () => {
    m.cmd('navigate', 'a.com');
    view().fire('dom-ready');
    const sleeper = tab().id;
    m.cmd('newTab');
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(state().awake).toEqual([tab().id]);
    m.cmd('selectTab', sleeper);
    expect(tab().notice).toEqual({ kind: 'woke' });
    // Loading its page again keeps the notice; leaving the page drops it.
    view().fire('did-navigate', 'https://a.com/');
    expect(tab().notice).toEqual({ kind: 'woke' });
    view().fire('did-navigate', 'https://b.com/');
    expect(tab().notice).toBeUndefined();
    m.cmd('selectTab', ws().tabs[1].id);
    m.cmd('selectTab', sleeper);
    expect(tab().notice).toBeUndefined();
  });
});

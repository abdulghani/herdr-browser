import { beforeEach, describe, expect, it } from 'vitest';
import { m, start, state, tab, useMain, wc, ws } from '../../testing/main-harness.js';

useMain();

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

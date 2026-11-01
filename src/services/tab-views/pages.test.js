import { beforeEach, describe, expect, it } from 'vitest';
import { m, start, state, tab, uiSent, useMain, view } from '../../testing/main-harness.js';

useMain();

describe('what the page preload reports', () => {
  beforeEach(() => start());

  it('tracks the title and favicon, also in history', () => {
    m.cmd('navigate', 'example.com');
    view().fire('did-navigate', 'https://example.com/');
    m.pageMessage(tab().id, { type: 'title', title: 'Example Domain' });
    m.pageMessage(tab().id, { type: 'favicon', url: 'https://example.com/favicon.ico' });
    expect(tab()).toMatchObject({ title: 'Example Domain', favicon: 'https://example.com/favicon.ico' });
    expect(m.win().setTitle).toHaveBeenLastCalledWith('Example Domain — main');
    expect(m.suggest('example')[0]).toMatchObject({ title: 'Example Domain', favicon: 'https://example.com/favicon.ico' });

    m.pageMessage(tab().id, { type: 'favicon', url: '' });
    m.pageMessage(tab().id, { type: 'title', title: '' });
    expect(tab()).toMatchObject({ title: 'https://example.com/', favicon: null });
  });

  it('calls a blank page New Tab', () => {
    m.pageMessage(tab().id, { type: 'title', title: 'about:blank' });
    expect(tab().title).toBe('New Tab');
  });

  it('closes the suggestions and downloads when the page is clicked', () => {
    m.cmd('showDownloads');
    m.pageMessage(tab().id, { type: 'focus' });
    expect(uiSent('suggest-close')).toHaveLength(1);
    expect(state().downloads.open).toBe(false);
  });

  it('ignores messages it does not know, from tabs that are gone, and page messages from the UI', () => {
    const id = tab().id;
    const { onMessage } = m.ctx.pages;
    onMessage(id, null);
    onMessage(id, 'title');
    onMessage(id, { type: 'toString' });
    onMessage('gone', { type: 'title', title: 'x' });
    onMessage('gone', { type: 'favicon', url: 'x' });
    onMessage(null, { type: 'title', title: 'From the UI' });
    onMessage(null, { type: 'focus' });
    expect(tab().title).toBe('New Tab');
    expect(uiSent('suggest-close')).toHaveLength(0);
  });

  it('shows and dismisses the notice bar', () => {
    const { setNotice } = m.ctx.pages;
    setNotice(tab().id, null);
    setNotice('gone', { kind: 'woke' });
    setNotice(tab().id, { kind: 'woke' });
    expect(tab().notice).toEqual({ kind: 'woke' });
    m.cmd('dismissNotice');
    expect(tab().notice).toBeUndefined();
  });
});

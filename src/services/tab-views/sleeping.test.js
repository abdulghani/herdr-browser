import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m, start, state, tab, useMain, wc } from '../../testing/main-harness.js';

useMain();

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

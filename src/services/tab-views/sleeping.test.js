import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m, start, state, tab, useMain, view } from '../../testing/main-harness.js';

useMain();

describe('tab sleeping', () => {
  const MINUTE = 60 * 1000;

  beforeEach(() => start());

  it('unloads a tab hidden for 10 minutes and loads its page again when selected', () => {
    m.cmd('navigate', 'a.com');
    view().fire('dom-ready');
    const sleeperId = tab().id;
    m.cmd('newTab');
    vi.advanceTimersByTime(30 * 1000); // first check notes when it was hidden
    expect(state().awake).toHaveLength(2);
    vi.advanceTimersByTime(10 * MINUTE);
    expect(state().awake).toEqual([tab().id]);
    expect(state().pages.map((p) => p.id)).toEqual([tab().id]);

    m.cmd('selectTab', sleeperId);
    expect(state().awake).toContain(sleeperId);
    expect(view().url).toBe('https://a.com');
  });

  it('keeps tabs in a call, playing sound or loading awake', () => {
    m.cmd('navigate', 'meet.example');
    view().fire('dom-ready');
    const call = tab().id;
    m.pageMessage(call, { type: 'media', active: true });
    m.cmd('newTab');
    m.cmd('navigate', 'music.example');
    view().fire('dom-ready');
    const music = tab().id;
    m.pageMessage(music, { type: 'media', active: true });
    m.cmd('newTab');
    m.cmd('navigate', 'slow.example');
    m.cmd('newTab');
    vi.advanceTimersByTime(11 * MINUTE);
    expect(state().awake).toHaveLength(4);

    // Leaving the page ends the call; the music stops.
    m.viewOf(call).fire('did-navigate', 'https://example.com/');
    m.pageMessage(music, { type: 'media', active: false });
    vi.advanceTimersByTime(MINUTE);
    expect(state().awake).toHaveLength(2);
  });
});

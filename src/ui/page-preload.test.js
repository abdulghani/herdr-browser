// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSent, element, keydown, runPreload, sent } from '../testing/preload.js';

const getUserMedia = vi.fn(async () => 'stream');
const camera = { getUserMedia };
Object.defineProperty(navigator, 'mediaDevices', { value: camera, configurable: true });
const lastOf = (type) => sent.filter((m) => m.type === type).at(-1);
const keysSent = () => sent.filter((m) => m.type === 'key');

beforeEach(async () => {
  document.body.innerHTML = '';
  document.title = 'Hello';
  await runPreload({ keys: ['ctrl+t', 'ctrl+space', 'alt+left', 'alt+shift+right', '?', 'ctrl+='] });
  clearSent();
});

afterEach(() => vi.useRealTimers());

describe('keys', () => {
  it('passes on the listed keys and keeps them from the page', () => {
    const pageSaw = vi.fn();
    document.addEventListener('keydown', pageSaw);
    const e = keydown('t', { ctrlKey: true, code: 'KeyT' });
    expect(e.defaultPrevented).toBe(true);
    expect(pageSaw).not.toHaveBeenCalled();
    expect(keysSent()).toEqual([{ type: 'key', key: 't', code: 'KeyT', control: true, alt: false, meta: false, shift: false }]);
    // Shifted punctuation names the key under it.
    keydown('+', { ctrlKey: true, shiftKey: true });
    expect(keysSent()).toHaveLength(1);
    keydown('+', { ctrlKey: true });
    expect(keysSent()).toHaveLength(2);
  });

  it('leaves other keys, bare modifiers and typing with an input method to the page', () => {
    for (const [key, options] of [
      ['x', {}],
      ['t', { metaKey: true }],
      ['Control', { ctrlKey: true }],
      ['t', { ctrlKey: true, isComposing: true }],
    ])
      expect(keydown(key, options).defaultPrevented).toBe(false);
    expect(keysSent()).toEqual([]);
  });

  it('passes on Escape but leaves it to the page too', () => {
    expect(keydown('Escape').defaultPrevented).toBe(false);
    expect(keysSent()).toEqual([expect.objectContaining({ key: 'Escape' })]);
  });

  it('sends the key after Ctrl+Space to the browser, within 2 seconds', () => {
    vi.useFakeTimers();
    keydown(' ', { ctrlKey: true, code: 'Space' });
    expect(keydown('c').defaultPrevented).toBe(true);
    expect(keysSent().map((k) => k.key)).toEqual([' ', 'c']);
    expect(keydown('c').defaultPrevented).toBe(false);
    keydown(' ', { ctrlKey: true, code: 'Space' });
    vi.advanceTimersByTime(2001);
    expect(keydown('c').defaultPrevented).toBe(false);
    expect(keydown('?', { shiftKey: true }).defaultPrevented).toBe(true);
    // Leave no prefix armed for the next test.
    keydown(' ', { ctrlKey: true, code: 'Space' });
    keydown('z');
  });

  it('leaves Option+arrows to a text field', () => {
    const input = element('<input type="text">');
    expect(keydown('ArrowLeft', { altKey: true }, input).defaultPrevented).toBe(false);
    expect(keydown('ArrowRight', { altKey: true, shiftKey: true }, element('<textarea></textarea>')).defaultPrevented).toBe(false);
    const editable = element('<div></div>');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(keydown('ArrowLeft', { altKey: true }, editable).defaultPrevented).toBe(false);
    expect(keydown('ArrowLeft', { altKey: true }, element('<input type="checkbox">')).defaultPrevented).toBe(true);
    expect(keydown('ArrowLeft', { altKey: true }, element('<button></button>')).defaultPrevented).toBe(true);
  });

  it('passes nothing on before the keys are known', async () => {
    delete window.__herdrKeys;
    expect(keydown('t', { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('runs once per page', async () => {
    await import('./page-preload.js?again');
    window.__herdrKeys = ['ctrl+t'];
    keydown('t', { ctrlKey: true });
    expect(keysSent()).toHaveLength(1);
  });
});

describe('right-click', () => {
  const rightClick = (target) => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };

  it("replaces WebKit's menu with the browser's, saying what was clicked", () => {
    const link = element('<a href="https://link.example/"><b>go</b></a>');
    expect(rightClick(link.firstChild).defaultPrevented).toBe(true);
    expect(lastOf('context-menu')).toEqual({
      type: 'context-menu',
      linkURL: 'https://link.example/',
      selectionText: '',
      isEditable: false,
    });
    rightClick(element('<input>'));
    expect(lastOf('context-menu')).toMatchObject({ linkURL: '', isEditable: true });
  });

  it("leaves a page's own menu alone", () => {
    const div = element('<div></div>');
    div.addEventListener('contextmenu', (e) => e.preventDefault());
    rightClick(div);
    expect(lastOf('context-menu')).toBeUndefined();
  });
});

describe('the page', () => {
  it('reports the title and favicon when they change', async () => {
    document.head.innerHTML = '';
    document.title = 'Hello';
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(lastOf('title')).toEqual({ type: 'title', title: 'Hello' });
    expect(lastOf('favicon')).toEqual({ type: 'favicon', url: `${location.origin}/favicon.ico` });
    const count = sent.length;
    document.dispatchEvent(new Event('readystatechange'));
    expect(sent).toHaveLength(count);

    document.title = 'Changed';
    element('<span></span>');
    document.head.insertAdjacentHTML('beforeend', '<link rel="Shortcut Icon" href="/icon.png">');
    await new Promise((resolve) => setTimeout(resolve));
    expect(lastOf('title').title).toBe('Changed');
    expect(lastOf('favicon').url).toBe(`${location.origin}/icon.png`);
  });

  it('reports the page again when Back brings it back from the cache', () => {
    const count = sent.length;
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(sent).toHaveLength(count);
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(sent.slice(count).map((m) => m.type)).toEqual(['title', 'favicon']);
  });

  it('says when it is clicked', () => {
    window.dispatchEvent(new Event('pointerdown'));
    expect(lastOf('focus')).toEqual({ type: 'focus' });
  });

  it('counts the matches for find in page', () => {
    document.body.innerHTML = '<p>Cat cat CAT dog</p>';
    Object.defineProperty(document.body, 'innerText', { value: document.body.textContent, configurable: true });
    window.__herdrCountMatches('cat');
    expect(lastOf('find')).toEqual({ type: 'find', total: 3 });
    window.__herdrCountMatches('');
    expect(lastOf('find').total).toBe(0);
  });

  it('gives only the settings page the settings API', () => {
    expect(window.herdrSettings).toBeUndefined();
  });
});

describe('sound and camera', () => {
  it('says when something plays, until it all stops', () => {
    const a = element('<audio></audio>');
    const b = element('<video></video>');
    a.dispatchEvent(new Event('play'));
    b.dispatchEvent(new Event('play'));
    expect(sent.filter((m) => m.type === 'media')).toEqual([{ type: 'media', active: true }]);
    a.dispatchEvent(new Event('pause'));
    a.dispatchEvent(new Event('ended'));
    expect(lastOf('media').active).toBe(true);
    b.dispatchEvent(new Event('emptied'));
    expect(lastOf('media').active).toBe(false);
  });

  // (Last: the page then stays in a call.)
  it('keeps a page that used the camera awake', async () => {
    expect(await navigator.mediaDevices.getUserMedia({ video: true })).toBe('stream');
    expect(getUserMedia).toHaveBeenCalledWith({ video: true });
    expect(lastOf('media')).toEqual({ type: 'media', active: true });
  });
});

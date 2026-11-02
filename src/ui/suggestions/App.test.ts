// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import App from './App.svelte';
import type { SuggestionsApi } from './preload';
import type { Suggestion } from '../../types';

type RowsPayload = Parameters<Parameters<SuggestionsApi['onRows']>[0]>[0];

let api: { [K in keyof SuggestionsApi]: Mock<SuggestionsApi[K]> };
let showRows: (payload: RowsPayload) => void;
let select: (index: number) => void;

beforeEach(() => {
  api = {
    onRows: vi.fn<SuggestionsApi['onRows']>((fn) => (showRows = (payload) => flushSync(() => fn(payload)))),
    onSelect: vi.fn<SuggestionsApi['onSelect']>((fn) => (select = (i) => flushSync(() => fn(i)))),
    hover: vi.fn(),
    pick: vi.fn(),
  };
  window.suggestions = api;
  render(App);
});

afterEach(cleanup);

const items = () => [...document.querySelectorAll<HTMLElement>('#suggestions li')];
// The element in `item` the test knows is there.
const part = (item: Element, selector: string) => item.querySelector(selector)!;
const isSelected = (item: Element) => item.classList.contains('selected');
const move = (item: Element, x: number, y: number) =>
  flushSync(() => item.dispatchEvent(new MouseEvent('mousemove', { screenX: x, screenY: y, bubbles: true })));
// The text of a highlighted line, with the bold runs in [brackets].
const marked = (node: Node) =>
  [...node.childNodes]
    .filter((n) => n.nodeType !== Node.COMMENT_NODE)
    .map((n) => (n.nodeName === 'B' ? `[${n.textContent}]` : n.textContent))
    .join('');

const historyRow: Suggestion = {
  kind: 'history',
  title: 'GitHub',
  displayUrl: 'github.com',
  url: 'https://github.com/',
  favicon: 'https://github.com/favicon.ico',
  highlight: { title: [0, 1], url: [3, 4, 5] },
  rank: 0,
};

describe('suggestions overlay', () => {
  it('draws typed rows as open or search', () => {
    showRows({
      rows: [
        { kind: 'typed', query: 'example.com' },
        { kind: 'typed', query: 'cats and dogs' },
        { kind: 'typed', query: 'localhost:3000/x' },
        { kind: 'typed', query: 'mailto:a@b.c' },
      ],
      selected: 1,
    });
    const [url, search, local, scheme] = items();
    expect(part(url, '.sg-icon').textContent).toBe('↗');
    expect(part(url, '.sg-title').textContent).toBe('example.com');
    expect(part(url, '.sg-detail').textContent).toBe('open');
    expect(part(search, '.sg-icon').textContent).toBe('⌕');
    expect(part(search, '.sg-detail').textContent).toBe('search Google');
    expect(isSelected(search)).toBe(true);
    expect(isSelected(url)).toBe(false);
    expect(part(local, '.sg-detail').textContent).toBe('open');
    expect(part(scheme, '.sg-detail').textContent).toBe('open');
  });

  it('draws page rows with bold matched letters', () => {
    showRows({
      rows: [
        historyRow,
        {
          kind: 'tab',
          title: '',
          url: 'https://example.com/',
          favicon: null,
          displayUrl: 'example.com',
          highlight: { title: [], url: [0] },
          rank: 0,
        },
      ],
      selected: 0,
    });
    const [page, tab] = items();
    expect(marked(part(page, '.sg-title'))).toBe('[Gi]tHub');
    expect(marked(part(page, '.sg-url'))).toBe('git[hub].com');
    expect(part(page, 'img').getAttribute('src')).toBe(historyRow.favicon);
    expect(part(page, '.sg-detail').textContent).toBe('');

    // No title: the URL is the title, and there's no separate URL line.
    expect(marked(part(tab, '.sg-title'))).toBe('[e]xample.com');
    expect(tab.querySelector('.sg-url')).toBeNull();
    expect(tab.querySelector('.favicon-blank')).not.toBeNull();
    expect(part(tab, '.sg-detail').textContent).toBe('switch to tab');
  });

  it('swaps a broken favicon for a blank one', () => {
    showRows({ rows: [historyRow], selected: 0 });
    flushSync(() => part(items()[0], 'img').dispatchEvent(new Event('error')));
    expect(items()[0].querySelector('img')).toBeNull();
    expect(items()[0].querySelector('.favicon-blank')).not.toBeNull();
  });

  it('moves the highlight on select', () => {
    showRows({ rows: [historyRow, historyRow, historyRow], selected: 0 });
    select(2);
    expect(items().map(isSelected)).toEqual([false, false, true]);
  });

  it('only follows the mouse once it really moves', () => {
    showRows({ rows: [historyRow, historyRow], selected: 0 });
    const [first, second] = items();
    move(second, 10, 10); // where the pointer was when the list opened
    expect(api.hover).not.toHaveBeenCalled();
    move(second, 10, 10); // same spot again
    expect(api.hover).not.toHaveBeenCalled();
    move(first, 11, 10); // already selected
    expect(api.hover).not.toHaveBeenCalled();
    move(second, 12, 10);
    expect(api.hover).toHaveBeenCalledWith(1);
    expect(isSelected(second)).toBe(true);
    expect(isSelected(first)).toBe(false);
  });

  it('picks a row on mouse press', () => {
    showRows({ rows: [historyRow, historyRow], selected: 0 });
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    items()[1].dispatchEvent(press);
    expect(api.pick).toHaveBeenCalledWith(1);
    expect(press.defaultPrevented).toBe(true);
  });
});

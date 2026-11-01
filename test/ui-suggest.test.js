// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBody } from './helpers/dom.js';

let api;
let showRows;
let select;

beforeEach(async () => {
  loadBody('src/ui/suggest.html');
  api = {
    onRows: vi.fn((fn) => (showRows = fn)),
    onSelect: vi.fn((fn) => (select = fn)),
    hover: vi.fn(),
    pick: vi.fn(),
  };
  window.suggestions = api;
  vi.resetModules();
  await import('../src/ui/suggest.js');
});

const items = () => [...document.querySelectorAll('#suggestions li')];
const move = (item, x, y) => item.dispatchEvent(new MouseEvent('mousemove', { screenX: x, screenY: y, bubbles: true }));

const historyRow = {
  kind: 'history',
  title: 'GitHub',
  displayUrl: 'github.com',
  url: 'https://github.com/',
  favicon: 'https://github.com/favicon.ico',
  highlight: { title: [0, 1], url: [3, 4, 5] },
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
    expect(url.querySelector('.sg-icon').textContent).toBe('↗');
    expect(url.querySelector('.sg-detail').textContent).toBe('open');
    expect(search.querySelector('.sg-icon').textContent).toBe('⌕');
    expect(search.querySelector('.sg-detail').textContent).toBe('search Google');
    expect(search.classList.contains('selected')).toBe(true);
    expect(url.classList.contains('selected')).toBe(false);
    expect(local.querySelector('.sg-detail').textContent).toBe('open');
    expect(scheme.querySelector('.sg-detail').textContent).toBe('open');
  });

  it('draws page rows with bold matched letters', () => {
    showRows({
      rows: [historyRow, { kind: 'tab', title: '', displayUrl: 'example.com', highlight: { title: [], url: [0] } }],
      selected: 0,
    });
    const [page, tab] = items();
    const title = page.querySelector('.sg-title');
    expect(title.innerHTML).toBe('<b>Gi</b>tHub');
    expect(page.querySelector('.sg-url').innerHTML).toBe('git<b>hub</b>.com');
    expect(page.querySelector('img').getAttribute('src')).toBe(historyRow.favicon);
    expect(page.querySelector('.sg-detail').textContent).toBe('');

    // No title: the URL is the title, and there's no separate URL line.
    expect(tab.querySelector('.sg-title').innerHTML).toBe('<b>e</b>xample.com');
    expect(tab.querySelector('.sg-url')).toBeNull();
    expect(tab.querySelector('.favicon-blank')).not.toBeNull();
    expect(tab.querySelector('.sg-detail').textContent).toBe('switch to tab');
  });

  it('swaps a broken favicon for a blank one', () => {
    showRows({ rows: [historyRow], selected: 0 });
    items()[0].querySelector('img').dispatchEvent(new Event('error'));
    expect(items()[0].querySelector('img')).toBeNull();
    expect(items()[0].querySelector('.favicon-blank')).not.toBeNull();
  });

  it('moves the highlight on select', () => {
    showRows({ rows: [historyRow, historyRow, historyRow], selected: 0 });
    select(2);
    expect(items().map((i) => i.classList.contains('selected'))).toEqual([false, false, true]);
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
    expect(second.classList.contains('selected')).toBe(true);
    expect(first.classList.contains('selected')).toBe(false);
  });

  it('picks a row on mouse press', () => {
    showRows({ rows: [historyRow, historyRow], selected: 0 });
    const press = new MouseEvent('mousedown', { cancelable: true });
    items()[1].dispatchEvent(press);
    expect(api.pick).toHaveBeenCalledWith(1);
    expect(press.defaultPrevented).toBe(true);
  });
});

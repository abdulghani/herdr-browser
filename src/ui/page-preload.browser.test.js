// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { element, keydown, runPreload, sent } from '../testing/preload.js';

it('in the browser UI, passes on keys but reports nothing about a page', async () => {
  await runPreload({ keys: ['ctrl+t'], url: 'views://ui/browser/index.html' });
  keydown('t', { ctrlKey: true });
  window.dispatchEvent(new Event('pointerdown'));
  document.dispatchEvent(new Event('DOMContentLoaded'));
  const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  element('<span></span>').dispatchEvent(menu);
  // Its own text fields keep WebKit's menu (paste in the address bar).
  const fieldMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  element('<input>').dispatchEvent(fieldMenu);
  expect(menu.defaultPrevented).toBe(true);
  expect(fieldMenu.defaultPrevented).toBe(false);
  expect(sent.map((m) => m.type)).toEqual(['key']);
  expect(window.__herdrCountMatches).toBeUndefined();
});

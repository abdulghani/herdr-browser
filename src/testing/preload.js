// Runs src/ui/page-preload.js in the jsdom page of a test file, as the app does in every page,
// with window.__electrobunSendToHost recording what it reports. It runs once per file (the page
// only gets it once); `sent` is emptied before each test with clearSent().
import { vi } from 'vitest';

export const sent = [];
let ran = false;

// url: the page's address, for the parts of the preload that depend on it.
export async function runPreload({ keys = [], url } = {}) {
  window.__herdrKeys = keys;
  if (ran) return;
  ran = true;
  if (url) vi.stubGlobal('location', new URL(url));
  window.__electrobunSendToHost = (message) => sent.push(message);
  await import('../ui/page-preload.js');
}

export const clearSent = () => sent.splice(0);

// A key press on target (default the page), as the page would see it. Returns the event.
export function keydown(key, options = {}, target = window) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, composed: true, ...options });
  target.dispatchEvent(event);
  return event;
}

export function element(html) {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const node = holder.firstChild;
  document.body.append(node);
  return node;
}

// Helpers for the tests that run under the jsdom test environment.
import { vi } from 'vitest';

// A stand-in for Electrobun's <electrobun-webview> element (defined by its preload in the app).
// Each one gets its native view id a moment after it is added; nav answers canGoBack/canGoForward.
export const webviewTags = { nav: { canGoBack: false, canGoForward: false }, nextId: 10 };

export function defineFakeWebviewTag() {
  if (customElements.get('electrobun-webview')) return;
  customElements.define(
    'electrobun-webview',
    class extends HTMLElement {
      constructor() {
        super();
        this.webviewId = null;
        this.hidden = false;
        this.transparent = false;
        this.listeners = {};
        for (const name of ['goBack', 'goForward', 'reload', 'syncDimensions']) this[name] = vi.fn();
        this.toggleHidden = vi.fn((value) => (this.hidden = value));
        this.togglePassthrough = vi.fn();
        this.toggleTransparent = vi.fn((value) => (this.transparent = value));
      }
      connectedCallback() {
        this.transparent = this.hasAttribute('transparent');
        queueMicrotask(() => (this.webviewId = webviewTags.nextId++));
      }
      on(event, fn) {
        (this.listeners[event] ||= []).push(fn);
      }
      fire(event, detail) {
        (this.listeners[event] || []).forEach((fn) => fn(new CustomEvent(event, { detail })));
      }
      canGoBack() {
        return Promise.resolve(webviewTags.nav.canGoBack);
      }
      canGoForward() {
        return Promise.resolve(webviewTags.nav.canGoForward);
      }
    },
  );
}

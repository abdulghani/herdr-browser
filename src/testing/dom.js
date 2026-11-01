// Runs under the jsdom test environment.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, vi } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);

// Put the <body> of one of the app's HTML pages into the test document, without its <script>.
export function loadBody(htmlFile) {
  const html = fs.readFileSync(path.join(root, htmlFile), 'utf8');
  const [, attrs, inner] = html.match(/<body([^>]*)>([\s\S]*)<\/body>/);
  document.body.className = attrs.match(/class="([^"]*)"/)?.[1] ?? '';
  document.body.innerHTML = inner.replace(/<script[\s\S]*?<\/script>/g, '');
}

// A stand-in for the parts of Electron the preloads use. `emit` plays a message from main.
export function fakeElectron() {
  const listeners = {};
  const exposed = {};
  const electron = {
    exposed,
    contextBridge: {
      exposeInMainWorld: vi.fn((name, api) => (exposed[name] = api)),
      executeInMainWorld: vi.fn(),
    },
    ipcRenderer: {
      send: vi.fn(),
      invoke: vi.fn((...args) => Promise.resolve(args)),
      on: vi.fn((channel, fn) => (listeners[channel] ??= []).push(fn)),
    },
    emit: (channel, payload) => (listeners[channel] ?? []).forEach((fn) => fn({}, payload)),
  };
  return electron;
}

// Run a preload fresh with `electron` resolving to the fake.
export function runPreload(file, electron) {
  const Module = require('node:module');
  const load = Module._load;
  const full = path.join(root, file);
  delete require.cache[full];
  Module._load = function (request, ...rest) {
    return request === 'electron' ? electron : load.call(this, request, ...rest);
  };
  try {
    require(full);
  } finally {
    Module._load = load;
  }
}

// Focus events reach the preload's window listeners; this returns what it last sent for them.
function focusReports(electron) {
  const sent = (target, type) => {
    target.dispatchEvent(new FocusEvent(type, { bubbles: true }));
    return electron.ipcRenderer.send.mock.calls.filter(([channel]) => channel === 'text-focus').at(-1)[1];
  };
  return sent;
}

function element(html) {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const node = holder.firstChild;
  document.body.append(node);
  return node;
}

// Checks that a preload reports text field focus to the main process.
export function checkTextFocus(electron) {
  const sent = focusReports(electron);
  expect(sent(element('<input type="text">'), 'focusin')).toBe(true);
  expect(sent(element('<input>'), 'focusin')).toBe(true);
  expect(sent(element('<textarea></textarea>'), 'focusin')).toBe(true);
  expect(sent(element('<input type="checkbox">'), 'focusin')).toBe(false);
  expect(sent(element('<button></button>'), 'focusin')).toBe(false);
  const editable = element('<div></div>');
  Object.defineProperty(editable, 'isContentEditable', { value: true });
  expect(sent(editable, 'focusin')).toBe(true);
  expect(sent(element('<input type="text">'), 'focusout')).toBe(false);
  const noTarget = new FocusEvent('focusin');
  noTarget.composedPath = () => [];
  window.dispatchEvent(noTarget);
  expect(electron.ipcRenderer.send).toHaveBeenLastCalledWith('text-focus', false);
}

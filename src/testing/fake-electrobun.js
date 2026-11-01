// A stand-in for Electrobun's 'electrobun/main' module, so src/main.js and the services it loads
// can be loaded and driven in plain Node. loadMain() gives a fresh copy of them wired to a fresh
// fake every time. It also plays the browser UI's part where main depends on it: when the state
// lists a tab with a page, the fake UI makes a view for it and reports it ('tabView'), like
// src/ui/browser/PageViews.svelte does with an <electrobun-webview> tag.
import Module from 'node:module';
import { createRequire } from 'node:module';
import path from 'node:path';
import { vi } from 'vitest';

const require = createRequire(import.meta.url);
const SRC = path.resolve(import.meta.dirname, '..');
const MAIN = path.join(SRC, 'main.js');
const TESTING = import.meta.dirname + path.sep;

// Every module under src/ (but not these helpers) is loaded again, so none keeps the fake or the
// state of an earlier test.
function forgetSrcModules() {
  for (const file of Object.keys(require.cache)) {
    if (file.startsWith(SRC + path.sep) && !file.startsWith(TESTING)) delete require.cache[file];
  }
}

class Emitter {
  constructor() {
    this.listeners = {};
  }
  on(event, fn) {
    (this.listeners[event] ||= []).push(fn);
    return this;
  }
  emit(event, ...args) {
    return (this.listeners[event] || []).map((fn) => fn(...args));
  }
}

// A native webview, as Electrobun's BrowserView. fire() plays one of its events.
class FakeView extends Emitter {
  constructor(id, url = '') {
    super();
    this.id = id;
    this.url = url;
    this.ptr = null;
    this.zoom = 1;
    this.loadURL = vi.fn((next) => (this.url = next));
    this.executeJavascript = vi.fn();
    this.findInPage = vi.fn();
    this.stopFindInPage = vi.fn();
    this.toggleDevTools = vi.fn();
    this.openDevTools = vi.fn();
    this.setPageZoom = vi.fn((zoom) => (this.zoom = zoom));
    this.getPageZoom = () => this.zoom;
  }
  fire(event, detail) {
    return this.emit(event, { data: { detail } });
  }
}

function createFakeElectrobun({ userData, downloads = path.join(userData, 'Downloads') }) {
  const views = new Map(); // webview id -> FakeView
  const windows = [];
  const appEvents = new Emitter();
  const menuEvents = new Emitter();
  let nextViewId = 2; // 1 is the window's own webview
  const sent = []; // [channel, payload] sent to the browser UI
  const ui = { auto: true, views: new Map() }; // the fake UI: tabId -> FakeView it made
  let rpcHandlers = null;

  // The fake UI follows the state: a view for each tab listed in pages, none for the others.
  function syncPages(state) {
    if (!ui.auto) return;
    const wanted = new Map(state.pages.map((page) => [page.id, page.src]));
    for (const tabId of ui.views.keys()) if (!wanted.has(tabId)) ui.views.delete(tabId);
    for (const [tabId, src] of wanted) {
      if (ui.views.has(tabId)) continue;
      const view = new FakeView(nextViewId++, src);
      views.set(view.id, view);
      ui.views.set(tabId, view);
      rpcHandlers.messages.tabView({ tabId, webviewId: view.id });
    }
  }

  const send = new Proxy(
    {},
    {
      get: (_target, channel) => (payload) => {
        sent.push([channel, payload]);
        if (channel === 'state') syncPages(payload);
      },
    },
  );

  class BrowserWindow extends Emitter {
    constructor(options) {
      super();
      this.options = options;
      this.webview = new FakeView(1, options.url);
      this.minimized = false;
      this.setTitle = vi.fn();
      this.focus = vi.fn();
      this.unminimize = vi.fn(() => (this.minimized = false));
      this.isMinimized = () => this.minimized;
      windows.push(this);
    }
  }

  const BrowserView = {
    defineRPC: ({ handlers }) => {
      rpcHandlers = handlers;
      return { send };
    },
    getById: (id) => views.get(id),
  };

  const Utils = {
    paths: { userData, downloads },
    quit: vi.fn(),
    openPath: vi.fn(() => true),
    showItemInFolder: vi.fn(),
    clipboardWriteText: vi.fn(),
  };

  const electrobun = {
    BrowserWindow,
    BrowserView,
    Utils,
    ApplicationMenu: { setApplicationMenu: vi.fn(), on: (event, fn) => menuEvents.on(event, fn) },
    ContextMenu: { showContextMenu: vi.fn(), on: (event, fn) => menuEvents.on(event, fn) },
    default: { events: appEvents },
  };

  return { electrobun, views, windows, appEvents, menuEvents, sent, ui, handlers: () => rpcHandlers };
}

// Loads a fresh src/main.js against a fresh fake. Nothing runs past setting up until ready()
// (the browser UI asking for the state).
export function loadMain(options) {
  const fake = createFakeElectrobun(options);
  const childProcess = { execFileSync: vi.fn(() => '21624.1.2\n'), spawn: vi.fn() };
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'electrobun/main') return fake.electrobun;
    if (request === 'child_process') return childProcess;
    return originalLoad.call(this, request, ...rest);
  };
  let ctx;
  try {
    forgetSrcModules();
    ({ ctx } = require(MAIN));
  } finally {
    Module._load = originalLoad;
  }

  const win = () => fake.windows[0];
  const messages = () => fake.handlers().messages;

  return {
    ...fake,
    ctx,
    childProcess,
    win,
    ready: () => messages().ready(),
    cmd: (name, arg) => messages().cmd({ name, arg }),
    suggest: (query) => fake.handlers().requests.suggest(query),
    // The view the fake UI made for a tab.
    viewOf: (tabId) => fake.ui.views.get(tabId),
    // What the preload in a tab's page (or the browser UI, tabId null) reports.
    pageMessage: (tabId, message) => (tabId === null ? win().webview : fake.ui.views.get(tabId)).fire('host-message', message),
    // Clicks an item of the application menu or a context menu.
    menuClick: (action, data) => fake.menuEvents.emit('application-menu-clicked', { data: { action, data } }),
    contextClick: (action, data) => fake.menuEvents.emit('context-menu-clicked', { data: { action, data } }),
    // The last state sent to the UI.
    state: () => fake.sent.filter(([channel]) => channel === 'state').at(-1)?.[1],
  };
}

const KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', tab: 'Tab', escape: 'Escape', space: ' ' };

// "ctrl+shift+t" -> the key message a page's preload sends ({ key, code, control, ... }).
export function keyInput(chord, extra = {}) {
  const parts = chord.split('+');
  const name = parts.pop() || '+';
  const mods = new Set(parts);
  const key = KEYS[name] || (name.length > 1 ? name.toUpperCase() : name);
  const code = name === 'space' ? 'Space' : /^\d$/.test(name) ? `Digit${name}` : `Key${name.toUpperCase()}`;
  return {
    type: 'key',
    key,
    code,
    control: mods.has('ctrl'),
    alt: mods.has('alt'),
    meta: mods.has('cmd'),
    shift: mods.has('shift'),
    ...extra,
  };
}

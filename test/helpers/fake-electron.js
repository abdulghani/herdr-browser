// A stand-in for the 'electron' module, so src/main.js can be loaded and driven in plain Node.
// loadMain() gives a fresh copy of main.js wired to a fresh fake every time.
import Module from 'node:module';
import { createRequire } from 'node:module';
import { vi } from 'vitest';

const require = createRequire(import.meta.url);
const MAIN = require.resolve('../../src/main.js');

class Emitter {
  constructor() {
    this.listeners = {};
  }
  on(event, fn) {
    (this.listeners[event] ||= []).push({ fn });
    return this;
  }
  once(event, fn) {
    (this.listeners[event] ||= []).push({ fn, once: true });
    return this;
  }
  emit(event, ...args) {
    const list = this.listeners[event] || [];
    this.listeners[event] = list.filter((l) => !l.once);
    return list.map((l) => l.fn(...args));
  }
}

let nextWcId = 1;

class FakeWebContents extends Emitter {
  constructor() {
    super();
    this.id = nextWcId++;
    this.url = '';
    this.title = '';
    this.loading = false;
    this.zoom = 0;
    this.entries = [];
    this.activeIndex = 0;
    this.mainFrame = { url: '' };
    this.loadURL = vi.fn(async (url) => {
      this.url = url;
      this.mainFrame.url = url;
    });
    this.loadFile = vi.fn(async () => {});
    this.send = vi.fn();
    this.focus = vi.fn();
    this.close = vi.fn();
    this.reload = vi.fn();
    this.reloadIgnoringCache = vi.fn();
    this.stop = vi.fn();
    this.findInPage = vi.fn();
    this.stopFindInPage = vi.fn();
    this.toggleDevTools = vi.fn();
    this.inspectElement = vi.fn();
    this.setZoomLevel = vi.fn((level) => (this.zoom = level));
    this.getZoomLevel = () => this.zoom;
    this.getURL = () => this.url;
    this.getTitle = () => this.title;
    this.isLoading = () => this.loading;
    this.isCurrentlyAudible = () => false;
    this.isCrashed = () => false;
    this.setWindowOpenHandler = vi.fn((fn) => (this.windowOpenHandler = fn));
    this.navigationHistory = {
      canGoBack: () => this.activeIndex > 0,
      canGoForward: () => this.activeIndex < this.entries.length - 1,
      goBack: vi.fn(),
      goForward: vi.fn(),
      length: () => this.entries.length,
      getAllEntries: () => this.entries,
      getActiveIndex: () => this.activeIndex,
      restore: vi.fn(async ({ entries, index }) => {
        this.entries = entries;
        this.activeIndex = index;
      }),
    };
  }
}

function createFakeElectron({ userData, home = userData, singleInstance = true, isPackaged = false }) {
  const paths = { userData, home };
  const handlers = { app: new Emitter(), ipcOn: {}, ipcHandle: {}, protocol: {} };
  const views = [];
  const windows = [];
  const menus = [];
  let readyCallback;

  class WebContentsView {
    constructor(options) {
      this.options = options;
      this.webContents = new FakeWebContents();
      this.visible = true;
      this.setBounds = vi.fn((bounds) => (this.bounds = bounds));
      this.setBackgroundColor = vi.fn((color) => (this.background = color));
      this.setVisible = vi.fn((visible) => (this.visible = visible));
      this.getVisible = () => this.visible;
      views.push(this);
    }
  }

  class BrowserWindow extends Emitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new FakeWebContents();
      this.children = [];
      this.contentView = {
        addChildView: vi.fn((view) => {
          this.children = this.children.filter((v) => v !== view).concat(view);
        }),
        removeChildView: vi.fn((view) => {
          this.children = this.children.filter((v) => v !== view);
        }),
      };
      this.minimized = false;
      this.loadFile = vi.fn();
      this.setTitle = vi.fn();
      this.focus = vi.fn();
      this.restore = vi.fn(() => (this.minimized = false));
      this.isMinimized = () => this.minimized;
      this.isDestroyed = () => false;
      this.getContentSize = () => [1400, 900];
      windows.push(this);
    }
  }

  const app = {
    userAgentFallback: 'Mozilla/5.0 Chrome/140.0 herdr-browser/0.3.3 Electron/45.1.0 Safari/537.36',
    isPackaged,
    setName: vi.fn(),
    setPath: vi.fn((name, value) => (paths[name] = value)),
    getPath: (name) => paths[name],
    getVersion: () => '0.3.3',
    requestSingleInstanceLock: () => singleInstance,
    quit: vi.fn(),
    configureHostResolver: vi.fn(),
    on: (event, fn) => handlers.app.on(event, fn),
    whenReady: () => ({ then: (fn) => (readyCallback = fn) }),
  };

  const electron = {
    app,
    BrowserWindow,
    WebContentsView,
    ipcMain: {
      on: (channel, fn) => (handlers.ipcOn[channel] = fn),
      handle: (channel, fn) => (handlers.ipcHandle[channel] = fn),
    },
    session: {
      defaultSession: {
        resolveHost: vi.fn(),
        clearHostResolverCache: vi.fn(),
        closeAllConnections: vi.fn(),
        setPermissionRequestHandler: vi.fn((fn) => (handlers.permission = fn)),
      },
    },
    Menu: {
      setApplicationMenu: vi.fn(),
      buildFromTemplate: vi.fn((template) => {
        const menu = { template, popup: vi.fn() };
        menus.push(menu);
        return menu;
      }),
    },
    clipboard: { writeText: vi.fn() },
    protocol: {
      registerSchemesAsPrivileged: vi.fn(),
      handle: vi.fn((scheme, fn) => (handlers.protocol[scheme] = fn)),
    },
    net: { fetch: vi.fn() },
  };

  return { electron, handlers, views, windows, menus, runReady: () => readyCallback() };
}

// Loads a fresh src/main.js against a fresh fake electron. Nothing runs past module load until
// ready() (app.whenReady) and finishLoad() (the window's UI finished loading).
export function loadMain(options) {
  const fake = createFakeElectron(options);
  const childProcess = { spawn: vi.fn(() => ({ unref: vi.fn() })) };
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'electron') return fake.electron;
    if (request === 'child_process') return childProcess;
    return originalLoad.call(this, request, ...rest);
  };
  try {
    delete require.cache[MAIN];
    require(MAIN);
  } finally {
    Module._load = originalLoad;
  }

  const { handlers } = fake;
  const win = () => fake.windows[0];
  const pageViews = () => fake.views.filter((v) => v.options.webPreferences.preload.endsWith('page-preload.js'));

  return {
    ...fake,
    childProcess,
    win,
    pageViews,
    ready: () => fake.runReady(),
    // The UI page finished loading; argv is what the app was launched with.
    finishLoad(argv = ['electron', '.']) {
      const saved = process.argv;
      process.argv = argv;
      try {
        win().webContents.emit('did-finish-load');
      } finally {
        process.argv = saved;
      }
    },
    cmd: (name, arg) => handlers.ipcOn.cmd({}, name, arg),
    ipc: (channel, event, ...args) => handlers.ipcOn[channel](event, ...args),
    invoke: (channel, event, ...args) => handlers.ipcHandle[channel](event, ...args),
    // The last state sent to the UI.
    state() {
      const calls = win().webContents.send.mock.calls.filter(([channel]) => channel === 'state');
      return calls.at(-1)?.[1];
    },
    // The page view currently shown in the window.
    shownView: () =>
      win()
        .children.filter((v) => pageViews().includes(v))
        .at(-1),
  };
}

const KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', tab: 'Tab', escape: 'Escape', space: ' ' };

// "cmd+shift+t" -> a before-input-event input object.
function keyInput(chord, extra = {}) {
  const parts = chord.split('+');
  const name = parts.pop() || '+';
  const mods = new Set(parts);
  const key = KEYS[name] || (name.length > 1 ? name.toUpperCase() : name);
  const code = name === 'space' ? 'Space' : /^\d$/.test(name) ? `Digit${name}` : `Key${name.toUpperCase()}`;
  return {
    type: 'keyDown',
    key,
    code,
    control: mods.has('ctrl'),
    alt: mods.has('alt'),
    meta: mods.has('cmd'),
    shift: mods.has('shift'),
    ...extra,
  };
}

// Sends a key press to a webContents' before-input-event listeners; returns the event.
export function press(wc, chord, extra) {
  const event = { preventDefault: vi.fn() };
  wc.emit('before-input-event', event, keyInput(chord, extra));
  return event;
}

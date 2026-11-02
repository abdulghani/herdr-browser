// A stand-in for the 'electron' module, so src/main.ts and the services it loads can be loaded
// and driven in plain Node. loadMain() gives a fresh copy of them wired to a fresh fake every time.
import fs from 'node:fs';
import path from 'node:path';
import { vi, type Mock } from 'vitest';
import packageJson from '../../package.json';
import type { NavigationEntry } from 'electron';
import type { UiState } from '../types';

// The listeners take whatever the event passes; the code under test registers them with
// Electron's own types.
type Listener = (...args: unknown[]) => unknown;

class Emitter {
  listeners: Record<string, { fn: Listener; once?: boolean }[]> = {};
  on(event: string, fn: (...args: never[]) => unknown) {
    (this.listeners[event] ||= []).push({ fn: fn as Listener });
    return this;
  }
  once(event: string, fn: (...args: never[]) => unknown) {
    (this.listeners[event] ||= []).push({ fn: fn as Listener, once: true });
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    const list = this.listeners[event] || [];
    this.listeners[event] = list.filter((l) => !l.once);
    return list.map((l) => l.fn(...args));
  }
}

let nextWcId = 1;

class FakeWebContents extends Emitter {
  id = nextWcId++;
  url = '';
  title = '';
  loading = false;
  zoom = 0;
  entries: NavigationEntry[] = [];
  activeIndex = 0;
  mainFrame = { url: '' };
  windowOpenHandler?: (details: { url: string }) => { action: string };
  loadURL = vi.fn(async (url: string) => {
    this.url = url;
    this.mainFrame.url = url;
  });
  loadFile = vi.fn(async (_file: string) => {});
  send = vi.fn((_channel: string, ..._args: unknown[]) => {});
  focus = vi.fn();
  close = vi.fn();
  reload = vi.fn();
  reloadIgnoringCache = vi.fn();
  stop = vi.fn();
  findInPage = vi.fn((_text: string, _options?: { forward?: boolean; findNext?: boolean }) => {});
  stopFindInPage = vi.fn((_action: string) => {});
  toggleDevTools = vi.fn();
  inspectElement = vi.fn((_x: number, _y: number) => {});
  copyImageAt = vi.fn((_x: number, _y: number) => {});
  downloadURL = vi.fn((_url: string) => {});
  setZoomLevel = vi.fn((level: number) => (this.zoom = level));
  getZoomLevel = () => this.zoom;
  getURL = () => this.url;
  getTitle = () => this.title;
  isLoading = () => this.loading;
  isCurrentlyAudible = () => false;
  isCrashed = () => false;
  setWindowOpenHandler = vi.fn((fn: (details: { url: string }) => { action: string }) => (this.windowOpenHandler = fn));
  navigationHistory = {
    canGoBack: () => this.activeIndex > 0,
    canGoForward: () => this.activeIndex < this.entries.length - 1,
    goBack: vi.fn(),
    goForward: vi.fn(),
    length: () => this.entries.length,
    getAllEntries: () => this.entries,
    getActiveIndex: () => this.activeIndex,
    restore: vi.fn(async ({ entries, index }: { entries: NavigationEntry[]; index: number }) => {
      this.entries = entries;
      this.activeIndex = index;
    }),
  };
}

type DownloadState = 'progressing' | 'completed' | 'cancelled' | 'interrupted';

// A file being downloaded. progress() and finish() play what Chromium reports as it goes.
export class FakeDownloadItem extends Emitter {
  filename: string;
  url: string;
  totalBytes: number;
  startTime: number;
  receivedBytes = 0;
  state: DownloadState = 'progressing';
  paused = false;
  resumable = false;
  savePath = '';
  getFilename = () => this.filename;
  getURL = () => this.url;
  getTotalBytes = () => this.totalBytes;
  getReceivedBytes = () => this.receivedBytes;
  getState = () => this.state;
  getStartTime = () => this.startTime;
  getSavePath = () => this.savePath;
  isPaused = () => this.paused;
  canResume = () => this.resumable;
  setSavePath = vi.fn((savePath: string) => (this.savePath = savePath));
  setSaveDialogOptions = vi.fn((_options: { defaultPath?: string }) => {});
  pause = vi.fn(() => (this.paused = true));
  resume = vi.fn(() => {
    this.paused = false;
    this.state = 'progressing';
  });
  cancel = vi.fn(() => this.finish('cancelled'));

  constructor({ filename = 'file.zip', url = 'https://example.com/file.zip', totalBytes = 1000, startTime = 1700000000 } = {}) {
    super();
    this.filename = filename;
    this.url = url;
    this.totalBytes = totalBytes;
    this.startTime = startTime;
  }
  progress(receivedBytes: number, state: DownloadState = 'progressing') {
    this.receivedBytes = receivedBytes;
    this.state = state;
    this.emit('updated', {}, state);
  }
  // A completed download leaves its file where it was saved.
  finish(state: DownloadState = 'completed') {
    this.state = state;
    if (state === 'completed') {
      this.receivedBytes = this.totalBytes || this.receivedBytes;
      fs.writeFileSync(this.savePath, '');
    }
    this.emit('done', {}, state);
  }
}

// One item of a menu the code under test built, with what the tests read.
export interface MenuItem {
  label?: string;
  role?: string;
  type?: string;
  enabled?: boolean;
  click?: () => void;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FakeOptions {
  userData: string;
  home?: string;
  downloads?: string;
  singleInstance?: boolean;
  isPackaged?: boolean;
}

// What the code under test passes to IPC handlers; tests pass only what each handler reads.
type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

function createFakeElectron({
  userData,
  home = userData,
  downloads = path.join(userData, 'Downloads'),
  singleInstance = true,
  isPackaged = false,
}: FakeOptions) {
  const paths: Record<string, string> = { userData, home, downloads };
  const handlers = {
    app: new Emitter(),
    ipcOn: {} as Record<string, IpcHandler>,
    ipcHandle: {} as Record<string, IpcHandler>,
    protocol: {} as Record<string, (request: { url: string }) => Promise<Response>>,
    permission: undefined as
      undefined | ((wc: unknown, perm: string, cb: (allowed: boolean) => void, details: { mediaTypes?: string[] }) => void),
  };
  const views: WebContentsView[] = [];
  const windows: BrowserWindow[] = [];
  const menus: { template: MenuItem[]; popup: Mock }[] = [];
  let readyCallback: () => void;

  class WebContentsView {
    options: { webPreferences: { preload: string } };
    webContents = new FakeWebContents();
    visible = true;
    bounds?: Bounds;
    background?: string;
    setBounds = vi.fn((bounds: Bounds) => (this.bounds = bounds));
    setBackgroundColor = vi.fn((color: string) => (this.background = color));
    setVisible = vi.fn((visible: boolean) => (this.visible = visible));
    getVisible = () => this.visible;
    constructor(options: { webPreferences: { preload: string } }) {
      this.options = options;
      views.push(this);
    }
  }

  class BrowserWindow extends Emitter {
    options: { titleBarStyle?: string; trafficLightPosition?: { x: number; y: number } };
    webContents = new FakeWebContents();
    children: WebContentsView[] = [];
    contentView = {
      addChildView: vi.fn((view: WebContentsView) => {
        this.children = this.children.filter((v) => v !== view).concat(view);
      }),
      removeChildView: vi.fn((view: WebContentsView) => {
        this.children = this.children.filter((v) => v !== view);
      }),
    };
    minimized = false;
    loadFile = vi.fn();
    setTitle = vi.fn();
    focus = vi.fn();
    restore = vi.fn(() => (this.minimized = false));
    isMinimized = () => this.minimized;
    isDestroyed = () => false;
    getContentSize = () => [1400, 900];
    constructor(options: BrowserWindow['options']) {
      super();
      this.options = options;
      windows.push(this);
    }
  }

  const app = {
    userAgentFallback: 'Mozilla/5.0 Chrome/140.0 herdr-browser/0.3.3 Electron/45.1.0 Safari/537.36',
    isPackaged,
    setName: vi.fn(),
    setPath: vi.fn((name: string, value: string) => (paths[name] = value)),
    getPath: (name: string) => paths[name],
    // Like the real app: the version in package.json, which the release workflow bumps.
    getVersion: () => packageJson.version,
    requestSingleInstanceLock: () => singleInstance,
    quit: vi.fn(),
    configureHostResolver: vi.fn(),
    on: (event: string, fn: (...args: never[]) => unknown) => handlers.app.on(event, fn),
    whenReady: () => ({ then: (fn: () => void) => (readyCallback = fn) }),
  };

  const electron = {
    app,
    BrowserWindow,
    WebContentsView,
    ipcMain: {
      on: (channel: string, fn: IpcHandler) => (handlers.ipcOn[channel] = fn),
      handle: (channel: string, fn: IpcHandler) => (handlers.ipcHandle[channel] = fn),
    },
    session: {
      defaultSession: Object.assign(new Emitter(), {
        resolveHost: vi.fn(),
        clearHostResolverCache: vi.fn(),
        closeAllConnections: vi.fn(),
        setPermissionRequestHandler: vi.fn((fn: NonNullable<typeof handlers.permission>) => (handlers.permission = fn)),
        downloadURL: vi.fn(),
      }),
    },
    shell: { openPath: vi.fn(async (_path: string) => ''), showItemInFolder: vi.fn() },
    Menu: {
      setApplicationMenu: vi.fn(),
      buildFromTemplate: vi.fn((template: (typeof menus)[number]['template']) => {
        const menu = { template, popup: vi.fn() };
        menus.push(menu);
        return menu;
      }),
    },
    clipboard: { writeText: vi.fn() },
    protocol: {
      registerSchemesAsPrivileged: vi.fn(),
      handle: vi.fn((scheme: string, fn: (typeof handlers.protocol)[string]) => (handlers.protocol[scheme] = fn)),
    },
    net: { fetch: vi.fn() },
  };

  return { electron, handlers, views, windows, menus, runReady: () => readyCallback() };
}

// Loads a fresh src/main.ts against a fresh fake electron. Nothing runs past module load until
// ready() (app.whenReady) and finishLoad() (the window's UI finished loading).
export async function loadMain(options: FakeOptions) {
  const fake = createFakeElectron(options);
  const childProcess = { spawn: vi.fn((_cmd: string, _args: string[], _options?: object) => ({ unref: vi.fn() })) };
  // Every module under src/ is loaded again, so none keeps the electron fake or the state of an
  // earlier test.
  vi.resetModules();
  vi.doMock('electron', () => fake.electron);
  vi.doMock('child_process', () => childProcess);
  try {
    await import('../main');
  } finally {
    vi.doUnmock('electron');
    vi.doUnmock('child_process');
  }

  const { handlers } = fake;
  const win = () => fake.windows[0];
  const pageViews = () => fake.views.filter((v) => v.options.webPreferences.preload.endsWith('page-preload.cjs'));

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
    cmd: (name: string, arg?: unknown) => handlers.ipcOn.cmd({}, name, arg),
    // A page starts downloading a file; returns the item to play its progress on.
    download(options?: ConstructorParameters<typeof FakeDownloadItem>[0], webContents = {}) {
      const item = new FakeDownloadItem(options);
      fake.electron.session.defaultSession.emit('will-download', { preventDefault: vi.fn() }, item, webContents);
      return item;
    },
    ipc: (channel: string, event: unknown, ...args: unknown[]) => handlers.ipcOn[channel](event, ...args),
    invoke: (channel: string, event: unknown, ...args: unknown[]) => handlers.ipcHandle[channel](event, ...args),
    // The last state sent to the UI.
    state() {
      const calls = win().webContents.send.mock.calls.filter(([channel]) => channel === 'state');
      return calls.at(-1)?.[1] as UiState | undefined;
    },
    // The page view currently shown in the window.
    shownView: () =>
      win()
        .children.filter((v) => pageViews().includes(v))
        .at(-1),
  };
}

const KEYS: Record<string, string> = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  tab: 'Tab',
  escape: 'Escape',
  space: ' ',
};

// "cmd+shift+t" -> a before-input-event input object.
function keyInput(chord: string, extra = {}) {
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
export function press(wc: Emitter, chord: string, extra?: object) {
  const event = { preventDefault: vi.fn() };
  wc.emit('before-input-event', event, keyInput(chord, extra));
  return event;
}

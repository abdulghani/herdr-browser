// Shared setup for the tests that drive the whole main process (src/main.js and the services)
// through the electron fake. Call useMain() at the top of a test file; `m` and `dir` are the
// loaded main process and its profile folder in the current test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';
import { loadMain } from './fake-electron.js';

const realPlatform = process.platform;
const realPath = process.env.PATH;

export let dir;
export let m;

export const setPlatform = (value) => Object.defineProperty(process, 'platform', { value, configurable: true });

// Loads main.js against a fresh fake, with the test's profile folder unless options say otherwise.
export function load(options = {}) {
  m = loadMain({ userData: dir, ...options });
  return m;
}

// Loads main.js, runs app.whenReady and lets the UI page finish loading.
export function start(options = {}, argv) {
  load(options);
  m.ready();
  m.finishLoad(argv);
  return m;
}

export const state = () => m.state();
export const ws = (i = state().activeWs) => state().workspaces[i];
export const tab = () => ws().tabs[ws().activeTab];
export const wc = () => m.shownView().webContents;
export const ui = () => m.win().webContents;
export const uiSent = (channel) => ui().send.mock.calls.filter(([c]) => c === channel);
export const sessionFile = () => path.join(dir, 'session.json');
export const writeSession = (data) => fs.writeFileSync(sessionFile(), JSON.stringify(data));
export const settingsEvent = (url = 'herdr://settings/') => {
  const frame = { url };
  return { sender: { mainFrame: frame }, senderFrame: frame };
};

export function useMain() {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-main-'));
    vi.useFakeTimers();
    setPlatform('linux');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setPlatform(realPlatform);
    process.env.PATH = realPath;
    delete process.env.HERDR_BROWSER_PROFILE;
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

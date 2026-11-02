// Shared setup for the tests that drive the whole main process (src/main.ts and the services)
// through the electron fake. Call useMain() at the top of a test file; `m` and `dir` are the
// loaded main process and its profile folder in the current test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';
import { loadMain } from './fake-electron';

type Main = Awaited<ReturnType<typeof loadMain>>;
type Options = Partial<Parameters<typeof loadMain>[0]>;

const realPlatform = process.platform;
const realPath = process.env.PATH;

export let dir: string;
export let m: Main;

export const setPlatform = (value: NodeJS.Platform) => Object.defineProperty(process, 'platform', { value, configurable: true });

// Loads main.ts against a fresh fake, with the test's profile folder unless options say otherwise.
export async function load(options: Options = {}) {
  m = await loadMain({ userData: dir, ...options });
  return m;
}

// Loads main.ts, runs app.whenReady and lets the UI page finish loading.
export async function start(options: Options = {}, argv?: string[]) {
  await load(options);
  m.ready();
  m.finishLoad(argv);
  return m;
}

export const state = () => m.state()!;
export const ws = (i = state().activeWs) => state().workspaces[i];
export const tab = () => ws().tabs[ws().activeTab];
// The page view shown in the window; the tests only ask once there is one.
export const view = () => m.shownView()!;
export const wc = () => view().webContents;
export const ui = () => m.win().webContents;
export const uiSent = (channel: string) => ui().send.mock.calls.filter(([c]) => c === channel);
export const sessionFile = () => path.join(dir, 'session.json');
export const writeSession = (data: unknown) => fs.writeFileSync(sessionFile(), JSON.stringify(data));
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

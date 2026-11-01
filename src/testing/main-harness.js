// Shared setup for the tests that drive the whole main process (src/main.js and the services)
// through the Electrobun fake. Call useMain() at the top of a test file; `m` and `dir` are the
// loaded main process and its profile folder in the current test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';
import { keyInput, loadMain } from './fake-electrobun.js';

export let dir;
export let m;

// Loads main.js against a fresh fake, with the test's profile folder unless options say otherwise.
export function load(options = {}) {
  m = loadMain({ userData: dir, ...options });
  return m;
}

// Loads main.js and lets the browser UI ask for the state.
export function start(options = {}) {
  load(options);
  m.ready();
  return m;
}

export const state = () => m.state();
export const ws = (i = state().activeWs) => state().workspaces[i];
export const tab = () => ws().tabs[ws().activeTab];
// The view of the tab on screen.
export const view = () => m.viewOf(state().shown);
export const uiSent = (channel) => m.sent.filter(([c]) => c === channel);
export const sessionFile = () => path.join(dir, 'session.json');
export const writeSession = (data) => fs.writeFileSync(sessionFile(), JSON.stringify(data));

// A key press: with Cmd through the application menu, otherwise passed on by the preload of the
// browser UI (or of the shown page, with { from: 'page' }).
export function press(chord, { from = 'ui', ...extra } = {}) {
  if (chord.split('+').includes('cmd') && !Object.keys(extra).length) return m.menuClick(chord);
  m.pageMessage(from === 'page' ? state().shown : null, keyInput(chord, extra));
}

export function useMain() {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-main-'));
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.HERDR_BROWSER_PROFILE;
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

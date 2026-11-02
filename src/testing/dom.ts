// Runs under the jsdom test environment.
import path from 'node:path';
import { expect, vi } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');

type Fake = ReturnType<typeof fakeElectron>;
type ApiName = 'herdr' | 'downloads' | 'suggestions' | 'herdrSettings';
// What contextBridge.executeInMainWorld gets: a function to run in the page and its arguments.
interface MainWorldScript {
  func: (...args: never[]) => unknown;
  args?: unknown[];
}

// A stand-in for the parts of Electron the preloads use. `emit` plays a message from main.
export function fakeElectron() {
  const listeners: Record<string, ((event: object, payload: unknown) => void)[]> = {};
  // What the preload put on window, by name. Each test reads the API it checks.
  const exposed: Partial<Pick<Window, ApiName>> = {};
  const electron = {
    exposed,
    // The API the preload put on window under `name`; fails the test if there is none.
    api<K extends ApiName>(name: K): Window[K] {
      const api = exposed[name];
      if (!api) throw new Error(`the preload exposed no window.${name}`);
      return api as Window[K];
    },
    contextBridge: {
      exposeInMainWorld: vi.fn((name: ApiName, api: never) => (exposed[name] = api)),
      executeInMainWorld: vi.fn((_script: MainWorldScript) => {}),
    },
    ipcRenderer: {
      send: vi.fn((_channel: string, ..._args: unknown[]) => {}),
      invoke: vi.fn((...args: unknown[]) => Promise.resolve(args)),
      on: vi.fn((channel: string, fn: (event: object, payload: unknown) => void) => (listeners[channel] ??= []).push(fn)),
    },
    emit: (channel: string, payload?: unknown) => (listeners[channel] ?? []).forEach((fn) => fn({}, payload)),
  };
  return electron;
}

// Run a preload fresh with `electron` resolving to the fake.
export async function runPreload(file: string, electron: Fake) {
  vi.resetModules();
  vi.doMock('electron', () => electron);
  try {
    await import(/* @vite-ignore */ path.join(root, file));
  } finally {
    vi.doUnmock('electron');
  }
}

// Runs the function the preload passed to executeInMainWorld (the first one), with its arguments,
// as the page would.
export function runInMainWorld(electron: Fake) {
  const { func, args = [] } = electron.contextBridge.executeInMainWorld.mock.calls[0]![0];
  // The preload's func takes the arguments it was given in args; the fake can't know their types.
  return (func as (...args: unknown[]) => unknown)(...args);
}

// Focus events reach the preload's window listeners; this returns what it last sent for them.
function focusReports(electron: Fake) {
  const sent = (target: EventTarget, type: string) => {
    target.dispatchEvent(new FocusEvent(type, { bubbles: true }));
    return electron.ipcRenderer.send.mock.calls.filter(([channel]) => channel === 'text-focus').at(-1)![1];
  };
  return sent;
}

function element(html: string) {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const node = holder.firstChild as HTMLElement;
  document.body.append(node);
  return node;
}

// Checks that a preload reports text field focus to the main process.
export function checkTextFocus(electron: Fake) {
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

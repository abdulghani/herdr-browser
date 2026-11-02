import { contextBridge, ipcRenderer } from 'electron';
import type { Commands } from '../../ipc';
import type { DownloadsSummary, Suggestion, UiState } from '../../types';

// The messages from the main process the UI may listen to, and what each one carries.
interface Messages {
  state: UiState;
  rename: { kind: 'tab' | 'workspace'; id: string };
  'focus-address': void;
  'toggle-help': void;
  'focus-find': void;
  'suggest-hover': number;
  'suggest-pick': number;
  'suggest-close': void;
  downloads: DownloadsSummary;
  'show-downloads': void;
}
const CHANNELS: string[] = [
  'state',
  'rename',
  'focus-address',
  'toggle-help',
  'focus-find',
  'suggest-hover',
  'suggest-pick',
  'suggest-close',
  'downloads',
  'show-downloads',
] satisfies (keyof Messages)[];

// window.herdr in the browser UI (src/ui/browser).
export interface HerdrApi {
  platform: NodeJS.Platform;
  // A command for src/ipc.ts, with the argument that command takes.
  cmd<K extends keyof Commands>(name: K, ...arg: Parameters<Commands[K]>): void;
  ready(): void;
  suggest(query: string): Promise<Suggestion[]>;
  on<C extends keyof Messages>(channel: C, fn: (payload: Messages[C]) => void): void;
}

declare global {
  interface Window {
    herdr: HerdrApi;
  }
}

contextBridge.exposeInMainWorld('herdr', {
  platform: process.platform,
  cmd: (name: string, arg?: unknown) => ipcRenderer.send('cmd', name, arg),
  ready: () => ipcRenderer.send('ready'),
  suggest: (query: string) => ipcRenderer.invoke('suggest', query),
  on: <C extends keyof Messages>(channel: C, fn: (payload: Messages[C]) => void) => {
    if (!CHANNELS.includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => fn(payload));
  },
} satisfies HerdrApi);

// Tell the main process when a text field has focus, so Option+arrow moves the cursor
// by word there instead of switching tabs.
const isTextField = (el: HTMLElement | undefined) =>
  !!el &&
  (el.isContentEditable ||
    el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' &&
      !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(
        (el as HTMLInputElement).type,
      )));
const reportTextFocus = (e: FocusEvent) =>
  ipcRenderer.send('text-focus', e.type === 'focusin' && isTextField(e.composedPath()[0] as HTMLElement | undefined));
window.addEventListener('focusin', reportTextFocus, true);
window.addEventListener('focusout', reportTextFocus, true);

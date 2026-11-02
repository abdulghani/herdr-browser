// Preload for the address bar suggestions overlay (src/ui/suggestions/index.html).
import { contextBridge, ipcRenderer } from 'electron';
import type { SuggestionRow } from '../../types';

// window.suggestions in the suggestions overlay.
export interface SuggestionsApi {
  onRows(fn: (payload: { rows: SuggestionRow[]; selected: number }) => void): void;
  onSelect(fn: (index: number) => void): void;
  hover(index: number): void;
  pick(index: number): void;
}

declare global {
  interface Window {
    suggestions: SuggestionsApi;
  }
}

contextBridge.exposeInMainWorld('suggestions', {
  onRows: (fn) => ipcRenderer.on('suggest-rows', (_e, payload) => fn(payload)),
  onSelect: (fn) => ipcRenderer.on('suggest-select', (_e, index) => fn(index)),
  hover: (index) => ipcRenderer.send('suggest-hover', index),
  pick: (index) => ipcRenderer.send('suggest-pick', index),
} satisfies SuggestionsApi);

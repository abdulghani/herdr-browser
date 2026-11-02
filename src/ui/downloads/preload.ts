// Preload for the downloads panel (src/ui/downloads/index.html).
import { contextBridge, ipcRenderer } from 'electron';
import type { DownloadAction, DownloadRow } from '../../types';

// window.downloads in the downloads panel.
export interface DownloadsApi {
  onRows(fn: (rows: DownloadRow[]) => void): void;
  action(name: DownloadAction, id: number): void;
  clear(): void;
  openFolder(): void;
  pointer(): void;
}

declare global {
  interface Window {
    downloads: DownloadsApi;
  }
}

contextBridge.exposeInMainWorld('downloads', {
  onRows: (fn) => ipcRenderer.on('downloads-rows', (_e, rows) => fn(rows)),
  action: (name, id) => ipcRenderer.send('downloads-action', name, id),
  clear: () => ipcRenderer.send('downloads-clear'),
  openFolder: () => ipcRenderer.send('downloads-folder'),
  pointer: () => ipcRenderer.send('downloads-pointer'),
} satisfies DownloadsApi);

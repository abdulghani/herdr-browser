// Preload for the downloads panel (src/ui/downloads/index.html).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('downloads', {
  onRows: (fn) => ipcRenderer.on('downloads-rows', (_e, rows) => fn(rows)),
  action: (name, id) => ipcRenderer.send('downloads-action', name, id),
  clear: () => ipcRenderer.send('downloads-clear'),
  openFolder: () => ipcRenderer.send('downloads-folder'),
  pointer: () => ipcRenderer.send('downloads-pointer'),
});

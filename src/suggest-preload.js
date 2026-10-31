// Preload for the address bar suggestions overlay (src/ui/suggest.html).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('suggestions', {
  onRows: (fn) => ipcRenderer.on('suggest-rows', (_e, payload) => fn(payload)),
  onSelect: (fn) => ipcRenderer.on('suggest-select', (_e, index) => fn(index)),
  hover: (index) => ipcRenderer.send('suggest-hover', index),
  pick: (index) => ipcRenderer.send('suggest-pick', index),
});

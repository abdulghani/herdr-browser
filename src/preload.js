const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('herdr', {
  platform: process.platform,
  cmd: (name, arg) => ipcRenderer.send('cmd', name, arg),
  ready: () => ipcRenderer.send('ready'),
  suggest: (query) => ipcRenderer.invoke('suggest', query),
  on: (channel, fn) => {
    if (!['state', 'rename', 'focus-address', 'toggle-help', 'focus-find', 'suggest-hover', 'suggest-pick'].includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => fn(payload));
  },
});

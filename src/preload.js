const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('herdr', {
  cmd: (name, arg) => ipcRenderer.send('cmd', name, arg),
  ready: () => ipcRenderer.send('ready'),
  on: (channel, fn) => {
    if (!['state', 'rename', 'focus-address', 'toggle-help'].includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => fn(payload));
  },
});

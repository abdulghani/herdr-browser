const { contextBridge, ipcRenderer } = require('electron');

// The messages from the main process the UI may listen to.
const CHANNELS = [
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
];

contextBridge.exposeInMainWorld('herdr', {
  platform: process.platform,
  cmd: (name, arg) => ipcRenderer.send('cmd', name, arg),
  ready: () => ipcRenderer.send('ready'),
  suggest: (query) => ipcRenderer.invoke('suggest', query),
  on: (channel, fn) => {
    if (!CHANNELS.includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => fn(payload));
  },
});

// Tell the main process when a text field has focus, so Option+arrow moves the cursor
// by word there instead of switching tabs.
const isTextField = (el) =>
  !!el &&
  (el.isContentEditable ||
    el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' &&
      !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(el.type)));
const reportTextFocus = (e) => ipcRenderer.send('text-focus', e.type === 'focusin' && isTextField(e.composedPath()[0]));
window.addEventListener('focusin', reportTextFocus, true);
window.addEventListener('focusout', reportTextFocus, true);

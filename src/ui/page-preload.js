// Runs in every web page. Electron has no passkey (WebAuthn) UI, so passkey requests
// hang forever (electron/electron#24573). Report passkeys as unavailable so sites
// offer other sign-in methods, and fail any request that still comes in right away
// instead of hanging, letting the browser offer to open the page in Chrome.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.executeInMainWorld({
  args: [(kind) => ipcRenderer.send('passkey-request', kind)],
  func: (notify) => {
    const credentials = navigator.credentials;
    if (!credentials || typeof PublicKeyCredential === 'undefined') return;

    const refuse = (kind, options) => {
      // Conditional (autofill) requests are passive, so they don't warrant the bar.
      if (options?.mediation !== 'conditional') notify(kind);
      return Promise.reject(new DOMException('Passkeys are not available in this browser.', 'NotAllowedError'));
    };

    const wrap = (name) => {
      const original = credentials[name].bind(credentials);
      const replacement = {
        [name](options) {
          return options?.publicKey ? refuse(name, options) : original(options);
        },
      }[name];
      Object.defineProperty(credentials, name, { value: replacement, configurable: true, writable: true });
    };
    wrap('get');
    wrap('create');

    for (const name of ['isUserVerifyingPlatformAuthenticatorAvailable', 'isConditionalMediationAvailable']) {
      Object.defineProperty(PublicKeyCredential, name, {
        value: { [name]: () => Promise.resolve(false) }[name],
        configurable: true,
        writable: true,
      });
    }
    if (PublicKeyCredential.getClientCapabilities) {
      Object.defineProperty(PublicKeyCredential, 'getClientCapabilities', {
        value: function getClientCapabilities() {
          return Promise.resolve({
            conditionalGet: false,
            conditionalCreate: false,
            hybridTransport: false,
            passkeyPlatformAuthenticator: false,
            userVerifyingPlatformAuthenticator: false,
          });
        },
        configurable: true,
        writable: true,
      });
    }
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

// The settings page (herdr://settings) reads and changes settings; no other page gets this.
if (location.protocol === 'herdr:' && location.host === 'settings') {
  contextBridge.exposeInMainWorld('herdrSettings', {
    get: () => ipcRenderer.invoke('settings-get'),
    setDns: (dns) => ipcRenderer.invoke('settings-set-dns', dns),
    resolve: (host) => ipcRenderer.invoke('settings-resolve', host),
  });
}

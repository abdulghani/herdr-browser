// Electron has no passkey (WebAuthn) UI. When a page asks for a passkey (see
// src/ui/page-preload.js), a notice bar offers to open the page in a real browser.
const { app, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Passkeys need a real browser (Google Password Manager, iCloud Keychain, phone QR codes), so hand the page over.
const EXTERNAL_BROWSERS = {
  linux: [
    { name: 'Chrome', bin: 'google-chrome-stable' },
    { name: 'Chrome', bin: 'google-chrome' },
    { name: 'Chromium', bin: 'chromium' },
    { name: 'Chromium', bin: 'chromium-browser' },
  ],
  // Safari ships with macOS, so there is always a fallback.
  darwin: [
    { name: 'Chrome', app: 'Google Chrome' },
    { name: 'Brave', app: 'Brave Browser' },
    { name: 'Edge', app: 'Microsoft Edge' },
    { name: 'Chromium', app: 'Chromium' },
    { name: 'Safari', app: 'Safari' },
  ],
};

function openInBrowser(browser, url) {
  const [cmd, args] = browser.app ? ['open', ['-a', browser.app, url]] : [browser.bin, [url]];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

function createPasskeys(ctx) {
  let externalBrowserCache;

  function externalBrowser() {
    if (externalBrowserCache === undefined) {
      const candidates = EXTERNAL_BROWSERS[process.platform] || [];
      const dirs =
        process.platform === 'darwin'
          ? ['/Applications', path.join(app.getPath('home'), 'Applications'), '/System/Volumes/Preboot/Cryptexes/App/System/Applications']
          : (process.env.PATH || '').split(path.delimiter);
      externalBrowserCache =
        candidates.find(({ bin, app: name }) => dirs.some((dir) => fs.existsSync(path.join(dir, bin || `${name}.app`)))) || null;
    }
    return externalBrowserCache;
  }

  // The notice bar shown under the toolbar of one tab; null hides it.
  function setNotice(tabId, notice) {
    const found = ctx.workspaces.findTab(tabId);
    if (!found || (!found.tab.notice && !notice)) return;
    found.tab.notice = notice || undefined;
    if (tabId === ctx.views.shown()) ctx.views.layout();
    ctx.workspaces.broadcast();
  }

  const dismiss = () => setNotice(ctx.workspaces.activeTab().id, null);

  function openExternally() {
    const tab = ctx.workspaces.activeTab();
    const browser = externalBrowser();
    if (!browser) return;
    openInBrowser(browser, tab.url);
    setNotice(tab.id, null);
  }

  ipcMain.on('passkey-request', (e) => {
    const tabId = ctx.views.tabIdOf(e.sender);
    if (tabId) setNotice(tabId, { kind: 'passkey', browser: externalBrowser()?.name ?? null });
  });

  return { setNotice, dismiss, openExternally };
}

module.exports = { createPasskeys };

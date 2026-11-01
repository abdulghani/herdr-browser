// What the settings page (herdr://settings, through src/ui/page-preload.js) may ask for.
const { app, ipcMain, session } = require('electron');
const { DNS_PROVIDERS, applyDns } = require('./settings');

// Only the settings page itself may use these.
const fromSettingsPage = (e) => e.senderFrame === e.sender.mainFrame && e.senderFrame.url.startsWith('herdr://settings');

const about = () => ({
  version: app.getVersion(),
  chrome: process.versions.chrome,
  electron: process.versions.electron,
  platform: process.platform,
  profile: app.getPath('userData'),
});

function handleSettingsIpc(ctx) {
  ipcMain.handle(
    'settings-get',
    (e) => fromSettingsPage(e) && { settings: ctx.settings.get(), providers: DNS_PROVIDERS.map(({ url, ...p }) => p), about: about() },
  );
  ipcMain.handle('settings-set-dns', (e, dns) => {
    if (!fromSettingsPage(e)) return;
    applyDns(app, session.defaultSession, ctx.settings.setDns(dns));
  });
  ipcMain.handle('settings-resolve', async (e, host) => {
    if (!fromSettingsPage(e)) return;
    try {
      const { endpoints } = await session.defaultSession.resolveHost(String(host).trim(), { cacheUsage: 'disallowed' });
      return { addresses: endpoints };
    } catch (err) {
      return { error: err.message.replace(/^net::/, '') };
    }
  });
}

module.exports = { handleSettingsIpc };

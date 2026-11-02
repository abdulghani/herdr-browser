// What the settings page (herdr://settings, through src/ui/page-preload.ts) may ask for.
import { app, ipcMain, session, type IpcMainInvokeEvent } from 'electron';
import { DNS_PROVIDERS, applyDns } from './settings';
import type { Ctx, DnsSettings, SettingsData } from '../../types';

// Only the settings page itself may use these.
const fromSettingsPage = (e: IpcMainInvokeEvent) =>
  e.senderFrame === e.sender.mainFrame && e.senderFrame.url.startsWith('herdr://settings');

const about = (): SettingsData['about'] => ({
  version: app.getVersion(),
  chrome: process.versions.chrome,
  electron: process.versions.electron,
  platform: process.platform,
  profile: app.getPath('userData'),
});

export function handleSettingsIpc(ctx: Ctx) {
  ipcMain.handle(
    'settings-get',
    (e): false | SettingsData =>
      fromSettingsPage(e) && { settings: ctx.settings.get(), providers: DNS_PROVIDERS.map(({ url, ...p }) => p), about: about() },
  );
  ipcMain.handle('settings-set-dns', (e, dns: Partial<DnsSettings> | undefined) => {
    if (!fromSettingsPage(e)) return;
    applyDns(app, session.defaultSession, ctx.settings.setDns(dns));
  });
  ipcMain.handle('settings-resolve', async (e, host: unknown) => {
    if (!fromSettingsPage(e)) return;
    try {
      const { endpoints } = await session.defaultSession.resolveHost(String(host).trim(), { cacheUsage: 'disallowed' });
      return { addresses: endpoints };
    } catch (err) {
      return { error: (err as Error).message.replace(/^net::/, '') };
    }
  });
}

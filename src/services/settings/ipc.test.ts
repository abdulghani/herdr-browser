import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { press } from '../../testing/fake-electron';
import { dir, m, settingsEvent, start, tab, ui, useMain, view, ws } from '../../testing/main-harness';
import type { SettingsData } from '../../types';

// The About tab must show the version the release workflow writes to package.json.
const packageVersion = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../../package.json'), 'utf8')).version;

useMain();

describe('settings', () => {
  beforeEach(() => start());

  it('opens settings in a tab, or switches to the open one', () => {
    press(ui(), 'cmd+,');
    expect(tab().url).toBe('herdr://settings/');
    expect(ws().activeTab).toBe(1);
    expect(view().background).toBe('#0b0d10');
    m.cmd('selectTab', ws().tabs[0].id);
    press(ui(), 'ctrl+,');
    m.cmd('openSettings');
    expect(ws().tabs).toHaveLength(2);
    expect(ws().activeTab).toBe(1);
  });

  it('only answers the settings page itself', async () => {
    const other = settingsEvent('https://evil.example/');
    const subframe = { sender: { mainFrame: { url: 'herdr://settings/' } }, senderFrame: { url: 'herdr://settings/' } };
    expect(m.invoke('settings-get', other)).toBe(false);
    expect(m.invoke('settings-get', subframe)).toBe(false);
    expect(m.invoke('settings-set-dns', other, { provider: 'google' })).toBeUndefined();
    expect(await m.invoke('settings-resolve', other, 'example.com')).toBeUndefined();
    expect(m.electron.session.defaultSession.resolveHost).not.toHaveBeenCalled();
  });

  it('gives the settings page the settings, providers and app info', () => {
    const result = m.invoke('settings-get', settingsEvent()) as SettingsData;
    expect(result.settings).toEqual({ dns: { provider: 'system', customUrl: '' } });
    expect(result.providers.map((p) => p.id)).toContain('cloudflare');
    expect(result.providers.every((p) => !('url' in p))).toBe(true);
    expect(result.about).toMatchObject({ version: packageVersion, platform: 'linux', profile: dir });
  });

  it('saves and applies a DNS choice', () => {
    m.invoke('settings-set-dns', settingsEvent(), { provider: 'quad9' });
    expect(m.electron.app.configureHostResolver).toHaveBeenLastCalledWith({
      secureDnsMode: 'secure',
      secureDnsServers: ['https://dns.quad9.net/dns-query'],
    });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).dns.provider).toBe('quad9');
  });

  it('looks up a host for the settings page', async () => {
    const { resolveHost } = m.electron.session.defaultSession;
    resolveHost.mockResolvedValueOnce({ endpoints: [{ address: '1.2.3.4' }] });
    expect(await m.invoke('settings-resolve', settingsEvent(), ' example.com ')).toEqual({ addresses: [{ address: '1.2.3.4' }] });
    expect(resolveHost).toHaveBeenCalledWith('example.com', { cacheUsage: 'disallowed' });

    resolveHost.mockRejectedValueOnce(new Error('net::ERR_NAME_NOT_RESOLVED'));
    expect(await m.invoke('settings-resolve', settingsEvent(), 'nope.invalid')).toEqual({ error: 'ERR_NAME_NOT_RESOLVED' });
  });
});

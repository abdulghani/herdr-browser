import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DNS_PROVIDERS, applyDns, createSettings } from '../src/settings.js';

describe('createSettings', () => {
  let dir;
  let file;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-settings-'));
    file = path.join(dir, 'settings.json');
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('starts with the system DNS', () => {
    expect(createSettings(file).get()).toEqual({ dns: { provider: 'system', customUrl: '' } });
  });

  it('saves a DNS choice and loads it back', () => {
    createSettings(file).setDns({ provider: 'cloudflare' });
    expect(createSettings(file).get().dns).toEqual({ provider: 'cloudflare', customUrl: '' });
  });

  it('accepts a custom https server, trimmed', () => {
    const settings = createSettings(file);
    expect(settings.setDns({ provider: 'custom', customUrl: '  https://dns.example.com/dns-query{?dns} ' })).toEqual({
      provider: 'custom',
      customUrl: 'https://dns.example.com/dns-query{?dns}',
    });
  });

  it('refuses a custom server that is not https', () => {
    const settings = createSettings(file);
    expect(() => settings.setDns({ provider: 'custom', customUrl: 'http://dns.example.com' })).toThrow('https://');
    expect(() => settings.setDns({ provider: 'custom', customUrl: '' })).toThrow('https://');
    expect(settings.get().dns.provider).toBe('system');
  });

  it('refuses an unknown provider', () => {
    expect(() => createSettings(file).setDns({ provider: 'nope' })).toThrow('Unknown DNS provider');
  });

  it('falls back to the defaults when the saved file is broken or invalid', () => {
    fs.writeFileSync(file, '{ broken');
    expect(createSettings(file).get().dns.provider).toBe('system');
    fs.writeFileSync(file, JSON.stringify({ dns: { provider: 'custom', customUrl: 'ftp://x' } }));
    expect(createSettings(file).get().dns.provider).toBe('system');
  });

  it("doesn't let callers change the stored settings by editing what get() returns", () => {
    const settings = createSettings(file);
    settings.get().dns.provider = 'google';
    expect(settings.get().dns.provider).toBe('system');
  });
});

describe('applyDns', () => {
  const fakes = () => ({
    app: { configureHostResolver: vi.fn() },
    ses: { clearHostResolverCache: vi.fn(), closeAllConnections: vi.fn() },
  });

  it('uses only the chosen secure server', () => {
    const { app, ses } = fakes();
    applyDns(app, ses, { provider: 'quad9', customUrl: '' });
    const quad9 = DNS_PROVIDERS.find((p) => p.id === 'quad9').url;
    expect(app.configureHostResolver).toHaveBeenCalledWith({ secureDnsMode: 'secure', secureDnsServers: [quad9] });
  });

  it('uses the custom address for a custom server', () => {
    const { app, ses } = fakes();
    applyDns(app, ses, { provider: 'custom', customUrl: 'https://dns.example.com/dns-query' });
    expect(app.configureHostResolver).toHaveBeenCalledWith({
      secureDnsMode: 'secure',
      secureDnsServers: ['https://dns.example.com/dns-query'],
    });
  });

  it('goes back to the default behavior for the system DNS', () => {
    const { app, ses } = fakes();
    applyDns(app, ses, { provider: 'system', customUrl: '' });
    expect(app.configureHostResolver).toHaveBeenCalledWith({ secureDnsMode: 'automatic', secureDnsServers: [] });
  });

  it('drops old lookups and connections', () => {
    const { app, ses } = fakes();
    applyDns(app, ses, { provider: 'google', customUrl: '' });
    expect(ses.clearHostResolverCache).toHaveBeenCalled();
    expect(ses.closeAllConnections).toHaveBeenCalled();
  });

  it('has an https address for every provider except system and custom', () => {
    for (const p of DNS_PROVIDERS) {
      if (p.id === 'system' || p.id === 'custom') expect(p.url).toBeUndefined();
      else expect(p.url).toMatch(/^https:\/\//);
    }
  });
});

// User settings (settings.json in the profile) and applying them. The settings page itself is
// served from src/settings/ as herdr://settings.
const fs = require('fs');

// DNS-over-HTTPS servers. Lookups through them are encrypted, so the network can't read or
// change which sites are looked up.
const DNS_PROVIDERS = [
  { id: 'system', name: 'System default', detail: 'Use the DNS servers your computer is set to.' },
  { id: 'cloudflare', name: 'Cloudflare', detail: '1.1.1.1', url: 'https://cloudflare-dns.com/dns-query' },
  { id: 'google', name: 'Google', detail: '8.8.8.8', url: 'https://dns.google/dns-query{?dns}' },
  { id: 'quad9', name: 'Quad9', detail: '9.9.9.9, blocks known harmful sites', url: 'https://dns.quad9.net/dns-query' },
  { id: 'adguard', name: 'AdGuard', detail: 'Blocks ads and trackers', url: 'https://dns.adguard-dns.com/dns-query' },
  { id: 'custom', name: 'Custom', detail: 'Any DNS-over-HTTPS server' },
];

const DEFAULTS = { dns: { provider: 'system', customUrl: '' } };

const isDohUrl = (url) => {
  try {
    return new URL(url.replace(/\{\?dns\}$/, '')).protocol === 'https:';
  } catch {
    return false;
  }
};

// Returns the cleaned dns settings, or throws a message for the settings page to show.
function checkDns(dns) {
  const provider = DNS_PROVIDERS.find((p) => p.id === dns?.provider);
  if (!provider) throw new Error('Unknown DNS provider.');
  const customUrl = String(dns.customUrl || '').trim();
  if (provider.id === 'custom' && !isDohUrl(customUrl)) throw new Error('Enter a server address that starts with https://');
  return { provider: provider.id, customUrl };
}

function createSettings(file) {
  let settings = structuredClone(DEFAULTS);
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    settings.dns = checkDns({ ...settings.dns, ...saved.dns });
  } catch {}

  const save = () => {
    try {
      fs.writeFileSync(file, JSON.stringify(settings, null, 2));
    } catch (err) {
      console.error('settings save failed', err);
    }
  };

  return {
    get: () => structuredClone(settings),
    setDns(dns) {
      settings.dns = checkDns(dns);
      save();
      return settings.dns;
    },
  };
}

// Point Chromium's DNS lookups at the chosen server. A chosen server is used for every lookup
// ("secure" mode, like Chrome's "Use secure DNS"); the system default keeps Chromium's own
// behavior of upgrading to secure DNS when the system's server supports it.
function applyDns(app, ses, dns) {
  const provider = DNS_PROVIDERS.find((p) => p.id === dns.provider);
  const url = provider.id === 'custom' ? dns.customUrl : provider.url;
  app.configureHostResolver(
    url ? { secureDnsMode: 'secure', secureDnsServers: [url] } : { secureDnsMode: 'automatic', secureDnsServers: [] },
  );
  // Drop what was looked up or connected through the old server.
  ses.clearHostResolverCache();
  ses.closeAllConnections();
}

module.exports = { DNS_PROVIDERS, createSettings, applyDns };

// The settings page (herdr://settings, built from src/ui/settings and loaded as
// views://ui/settings/index.html) asks for what it shows through its preload ('settings-get');
// the answer goes back into the page as window.__herdrSettingsReply(...). Nothing on it changes
// settings any more: with WebKit the browser can't pick its own DNS server, so the DNS section of
// the Electron build is gone.
const { execFileSync } = require('child_process');
const { Utils } = require('electrobun/main');
const { SETTINGS_URL } = require('../../lib/url');
const pkg = require('../../../package.json');

// The version of the system's WebKit, which renders the pages.
function webkitVersion() {
  try {
    const plist = '/System/Library/Frameworks/WebKit.framework/Resources/Info.plist';
    return execFileSync('plutil', ['-extract', 'CFBundleVersion', 'raw', plist], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function createSettingsPage(ctx) {
  let webkit;

  const about = () => ({
    version: pkg.version,
    webkit: (webkit ??= webkitVersion()),
    electrobun: pkg.devDependencies.electrobun,
    bun: process.versions.bun || 'unknown',
    platform: process.platform,
    profile: ctx.profile,
    downloads: Utils.paths.downloads,
  });

  // Only the settings page itself gets an answer. (The tab's URL follows what its view reports
  // it navigated to, which a page can't fake.)
  function reply(tabId) {
    const view = ctx.views.get(tabId);
    const url = ctx.workspaces.findTab(tabId)?.tab.url || '';
    if (!view || !url.startsWith(SETTINGS_URL)) return;
    view.executeJavascript(`window.__herdrSettingsReply?.(${JSON.stringify({ about: about() })})`);
  }

  return { reply };
}

module.exports = { createSettingsPage };

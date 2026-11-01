// The herdr:// scheme: herdr://settings/ serves the built settings page (dist-ui/settings/, see
// src/lib/ui-build.js) and herdr://settings/assets/<file> the files the built pages share
// (dist-ui/assets/). Nothing else is served.
const { protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { UI_BUILD } = require('../../lib/ui-build');

const PAGE = path.join(UI_BUILD, 'settings');
const ASSETS = path.join(UI_BUILD, 'assets');

// herdr:// pages (the settings page) behave like https pages: own origin, fetch, storage.
// This must run before the app is ready.
function registerHerdrScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: 'herdr', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}

const notFound = () => new Response('Not found', { status: 404 });

// The file a herdr://settings path maps to, or null if it isn't one of the page's files. The page
// refers to the shared files as ../assets/<file>, which resolves to herdr://settings/assets/<file>.
function fileFor(pathname) {
  const wanted = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const [dir, rest] = wanted.startsWith('/assets/') ? [ASSETS, wanted.slice('/assets'.length)] : [PAGE, wanted];
  const file = path.join(dir, rest);
  const inside = path.relative(dir, file);
  // Only files in the folder (no ../ out of it), and no tests even if one ended up there.
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside) || file.endsWith('.test.js')) return null;
  return file;
}

function serveSettingsPage() {
  protocol.handle('herdr', async (request) => {
    const { host, pathname } = new URL(request.url);
    const file = host === 'settings' && fileFor(pathname);
    if (!file) return notFound();
    const response = await net.fetch(pathToFileURL(file).href).catch(notFound);
    // Other pages may link to settings but not frame it.
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', "frame-ancestors 'none'");
    return new Response(response.body, { status: response.status, headers });
  });
}

module.exports = { registerHerdrScheme, serveSettingsPage };

// The herdr:// scheme: herdr://settings/<file> serves the settings page from src/ui/settings/.
const { protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', '..', 'ui', 'settings');

// herdr:// pages (the settings page) behave like https pages: own origin, fetch, storage.
// This must run before the app is ready.
function registerHerdrScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: 'herdr', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}

const notFound = () => new Response('Not found', { status: 404 });

function serveSettingsPage() {
  protocol.handle('herdr', async (request) => {
    const { host, pathname } = new URL(request.url);
    const file = path.join(ROOT, decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    // Only the page's own files: its tests live in the same folder but are not part of it.
    if (host !== 'settings' || !file.startsWith(ROOT + path.sep) || file.endsWith('.test.js')) return notFound();
    const response = await net.fetch(pathToFileURL(file).href).catch(notFound);
    // Other pages may link to settings but not frame it.
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', "frame-ancestors 'none'");
    return new Response(response.body, { status: response.status, headers });
  });
}

module.exports = { registerHerdrScheme, serveSettingsPage };

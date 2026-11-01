import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { m, start, useMain } from '../../testing/main-harness.js';

const BUILD = path.resolve(import.meta.dirname, '../../../dist-ui');
const fileUrl = (...parts) => pathToFileURL(path.join(BUILD, ...parts)).href;

useMain();

describe('herdr:// protocol', () => {
  beforeEach(() => start());

  const serve = (url) => m.handlers.protocol.herdr({ url });

  it('serves the built settings page and forbids framing', async () => {
    m.electron.net.fetch.mockImplementation(async () => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    const response = await serve('herdr://settings/');
    expect(m.electron.net.fetch).toHaveBeenCalledWith(fileUrl('settings', 'index.html'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(response.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(await response.text()).toBe('<html>');

    await serve('herdr://settings/index.html');
    expect(m.electron.net.fetch).toHaveBeenLastCalledWith(fileUrl('settings', 'index.html'));
  });

  it('serves the shared built files from the assets folder', async () => {
    m.electron.net.fetch.mockImplementation(async () => new Response('', { status: 200 }));
    await serve('herdr://settings/assets/settings-abc123.js');
    expect(m.electron.net.fetch).toHaveBeenLastCalledWith(fileUrl('assets', 'settings-abc123.js'));
    await serve('herdr://settings/assets/icon-x.svg');
    expect(m.electron.net.fetch).toHaveBeenLastCalledWith(fileUrl('assets', 'icon-x.svg'));
  });

  it('answers 404 for other hosts, paths outside the page or its assets, and missing files', async () => {
    expect((await serve('herdr://other/')).status).toBe(404);
    expect((await serve('herdr://other/assets/settings-abc123.js')).status).toBe(404);
    expect((await serve('herdr://settings/..%2f..%2fmain.js')).status).toBe(404);
    expect((await serve('herdr://settings/..%2fbrowser%2findex.html')).status).toBe(404);
    expect((await serve('herdr://settings/assets/..%2f..%2fpackage.json')).status).toBe(404);
    expect((await serve('herdr://settings/assets/..%2fsettings%2findex.html')).status).toBe(404);
    expect((await serve('herdr://settings/assets/')).status).toBe(404);
    expect(m.electron.net.fetch).not.toHaveBeenCalled();
    m.electron.net.fetch.mockRejectedValue(new Error('missing'));
    const response = await serve('herdr://settings/missing.html');
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
  });

  it("doesn't serve tests", async () => {
    expect((await serve('herdr://settings/App.test.js')).status).toBe(404);
    expect((await serve('herdr://settings/assets/App.test.js')).status).toBe(404);
    expect(m.electron.net.fetch).not.toHaveBeenCalled();
  });
});

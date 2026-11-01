import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { m, start, useMain } from '../../testing/main-harness.js';

const SETTINGS_DIR = path.resolve(import.meta.dirname, '../../ui/settings');

useMain();

describe('herdr:// protocol', () => {
  beforeEach(() => start());

  const serve = (url) => m.handlers.protocol.herdr({ url });

  it('serves files from src/ui/settings and forbids framing', async () => {
    m.electron.net.fetch.mockImplementation(async () => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    const response = await serve('herdr://settings/');
    expect(m.electron.net.fetch).toHaveBeenCalledWith(pathToFileURL(path.join(SETTINGS_DIR, 'index.html')).href);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(response.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(await response.text()).toBe('<html>');

    await serve('herdr://settings/settings.css');
    expect(m.electron.net.fetch).toHaveBeenLastCalledWith(pathToFileURL(path.join(SETTINGS_DIR, 'settings.css')).href);
  });

  it('answers 404 for other hosts, paths outside src/ui/settings and missing files', async () => {
    expect((await serve('herdr://other/')).status).toBe(404);
    expect((await serve('herdr://settings/..%2f..%2fmain.js')).status).toBe(404);
    expect(m.electron.net.fetch).not.toHaveBeenCalled();
    m.electron.net.fetch.mockRejectedValue(new Error('missing'));
    const response = await serve('herdr://settings/missing.html');
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
  });

  it("doesn't serve the settings page's tests", async () => {
    expect((await serve('herdr://settings/settings.test.js')).status).toBe(404);
    expect(m.electron.net.fetch).not.toHaveBeenCalled();
  });
});

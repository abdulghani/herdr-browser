import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { dir, m, setPlatform, start, state, tab, ui, useMain, wc } from '../../testing/main-harness.js';

useMain();

describe('passkeys', () => {
  function withBrowser(bin) {
    const bindir = path.join(dir, 'bin');
    fs.mkdirSync(bindir, { recursive: true });
    if (bin) fs.writeFileSync(path.join(bindir, bin), '');
    process.env.PATH = bindir;
  }

  it('offers to open the page in a browser that has passkeys', () => {
    withBrowser('chromium');
    start();
    m.cmd('navigate', 'login.example');
    m.ipc('passkey-request', { sender: wc() });
    expect(tab().notice).toEqual({ kind: 'passkey', browser: 'Chromium' });
    expect(state().workspaces[0].tabs[0].notice).toEqual({ kind: 'passkey', browser: 'Chromium' });
    expect(m.shownView().bounds.y).toBe(76 + 36);

    m.cmd('openExternally');
    expect(m.childProcess.spawn).toHaveBeenCalledWith('chromium', ['https://login.example'], { detached: true, stdio: 'ignore' });
    expect(m.childProcess.spawn.mock.results[0].value.unref).toHaveBeenCalled();
    expect(tab().notice).toBeUndefined();
    expect(m.shownView().bounds.y).toBe(76);
  });

  it('uses open -a on macOS', () => {
    setPlatform('darwin');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === '/Applications/Brave Browser.app');
    start();
    m.ipc('passkey-request', { sender: wc() });
    expect(tab().notice.browser).toBe('Brave');
    m.cmd('openExternally');
    expect(m.childProcess.spawn).toHaveBeenCalledWith('open', ['-a', 'Brave Browser', 'about:blank'], expect.any(Object));
  });

  it('shows the notice without a browser, and can be dismissed', () => {
    withBrowser(null);
    start();
    m.ipc('passkey-request', { sender: wc() });
    expect(tab().notice).toEqual({ kind: 'passkey', browser: null });
    m.cmd('openExternally');
    expect(m.childProcess.spawn).not.toHaveBeenCalled();
    m.cmd('dismissNotice');
    expect(tab().notice).toBeUndefined();
    m.cmd('dismissNotice');
  });

  it('clears the notice when the page navigates, also for a background tab', () => {
    withBrowser(null);
    start();
    const page = wc();
    m.ipc('passkey-request', { sender: page });
    m.cmd('newTab');
    page.emit('did-navigate', {}, 'https://elsewhere.example/');
    expect(state().workspaces[0].tabs[0].notice).toBeUndefined();
  });

  it('works without a PATH and on other platforms', () => {
    delete process.env.PATH;
    start();
    m.ipc('passkey-request', { sender: wc() });
    expect(tab().notice.browser).toBeNull();

    setPlatform('win32');
    start();
    m.ipc('passkey-request', { sender: wc() });
    expect(tab().notice.browser).toBeNull();
  });

  it('ignores requests from something that is not a tab', () => {
    start();
    m.ipc('passkey-request', { sender: ui() });
    expect(tab().notice).toBeUndefined();
  });
});

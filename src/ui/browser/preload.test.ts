// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { checkTextFocus, fakeElectron, runPreload } from '../../testing/dom';

describe('browser/preload.ts (browser window UI)', () => {
  it('exposes the herdr API over IPC', async () => {
    const electron = fakeElectron();
    await runPreload('src/ui/browser/preload.ts', electron);
    const herdr = electron.api('herdr');
    expect(herdr.platform).toBe(process.platform);

    herdr.cmd('navigate', 'example.com');
    expect(electron.ipcRenderer.send).toHaveBeenCalledWith('cmd', 'navigate', 'example.com');
    herdr.ready();
    expect(electron.ipcRenderer.send).toHaveBeenCalledWith('ready');
    await expect(herdr.suggest('git')).resolves.toEqual(['suggest', 'git']);
  });

  it('only passes on the known channels', async () => {
    const electron = fakeElectron();
    await runPreload('src/ui/browser/preload.ts', electron);
    const onState = vi.fn();
    const onOther = vi.fn();
    const herdr = electron.api('herdr');
    herdr.on('state', onState);
    // A channel the UI may not listen to, which the types rule out.
    (herdr.on as (channel: string, fn: () => void) => void)('secret', onOther);
    electron.emit('state', { a: 1 });
    electron.emit('secret', 'x');
    expect(onState).toHaveBeenCalledWith({ a: 1 });
    expect(onOther).not.toHaveBeenCalled();
    expect(electron.ipcRenderer.on).toHaveBeenCalledTimes(1);
  });

  it('passes on download progress and the request to open the panel', async () => {
    const electron = fakeElectron();
    await runPreload('src/ui/browser/preload.ts', electron);
    const onDownloads = vi.fn();
    const onShow = vi.fn();
    const herdr = electron.api('herdr');
    herdr.on('downloads', onDownloads);
    herdr.on('show-downloads', onShow);
    electron.emit('downloads', { active: 1 });
    electron.emit('show-downloads');
    expect(onDownloads).toHaveBeenCalledWith({ active: 1 });
    expect(onShow).toHaveBeenCalled();
  });

  it('reports when a text field has focus', async () => {
    const electron = fakeElectron();
    await runPreload('src/ui/browser/preload.ts', electron);
    checkTextFocus(electron);
  });
});

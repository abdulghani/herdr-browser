// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { checkTextFocus, fakeElectron, runPreload } from '../../testing/dom.js';

describe('browser/preload.js (browser window UI)', () => {
  it('exposes the herdr API over IPC', async () => {
    const electron = fakeElectron();
    runPreload('src/ui/browser/preload.js', electron);
    const herdr = electron.exposed.herdr;
    expect(herdr.platform).toBe(process.platform);

    herdr.cmd('navigate', 'example.com');
    expect(electron.ipcRenderer.send).toHaveBeenCalledWith('cmd', 'navigate', 'example.com');
    herdr.ready();
    expect(electron.ipcRenderer.send).toHaveBeenCalledWith('ready');
    await expect(herdr.suggest('git')).resolves.toEqual(['suggest', 'git']);
  });

  it('only passes on the known channels', () => {
    const electron = fakeElectron();
    runPreload('src/ui/browser/preload.js', electron);
    const onState = vi.fn();
    const onOther = vi.fn();
    electron.exposed.herdr.on('state', onState);
    electron.exposed.herdr.on('secret', onOther);
    electron.emit('state', { a: 1 });
    electron.emit('secret', 'x');
    expect(onState).toHaveBeenCalledWith({ a: 1 });
    expect(onOther).not.toHaveBeenCalled();
    expect(electron.ipcRenderer.on).toHaveBeenCalledTimes(1);
  });

  it('passes on download progress and the request to open the panel', () => {
    const electron = fakeElectron();
    runPreload('src/ui/browser/preload.js', electron);
    const onDownloads = vi.fn();
    const onShow = vi.fn();
    electron.exposed.herdr.on('downloads', onDownloads);
    electron.exposed.herdr.on('show-downloads', onShow);
    electron.emit('downloads', { active: 1 });
    electron.emit('show-downloads');
    expect(onDownloads).toHaveBeenCalledWith({ active: 1 });
    expect(onShow).toHaveBeenCalled();
  });

  it('reports when a text field has focus', () => {
    const electron = fakeElectron();
    runPreload('src/ui/browser/preload.js', electron);
    checkTextFocus(electron);
  });
});

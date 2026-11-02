// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fakeElectron, runPreload } from '../../testing/dom';

describe('downloads/preload.ts (downloads panel)', () => {
  it('passes rows in, and clicks out', async () => {
    const electron = fakeElectron();
    await runPreload('src/ui/downloads/preload.ts', electron);
    const api = electron.api('downloads');
    const onRows = vi.fn();
    api.onRows(onRows);
    electron.emit('downloads-rows', [{ id: 1 }]);
    expect(onRows).toHaveBeenCalledWith([{ id: 1 }]);
    api.action('pause', 1);
    api.clear();
    api.openFolder();
    api.pointer();
    const sent = electron.ipcRenderer.send.mock.calls;
    expect(sent).toEqual([['downloads-action', 'pause', 1], ['downloads-clear'], ['downloads-folder'], ['downloads-pointer']]);
  });
});

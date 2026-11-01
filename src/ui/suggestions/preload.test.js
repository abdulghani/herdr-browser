// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fakeElectron, runPreload } from '../../testing/dom.js';

describe('suggestions/preload.js (suggestions overlay)', () => {
  it('passes rows and selection in, hover and picks out', () => {
    const electron = fakeElectron();
    runPreload('src/ui/suggestions/preload.js', electron);
    const api = electron.exposed.suggestions;
    const onRows = vi.fn();
    const onSelect = vi.fn();
    api.onRows(onRows);
    api.onSelect(onSelect);
    electron.emit('suggest-rows', { rows: [], selected: 0 });
    electron.emit('suggest-select', 2);
    expect(onRows).toHaveBeenCalledWith({ rows: [], selected: 0 });
    expect(onSelect).toHaveBeenCalledWith(2);
    api.hover(1);
    api.pick(3);
    expect(electron.ipcRenderer.send).toHaveBeenCalledWith('suggest-hover', 1);
    expect(electron.ipcRenderer.send).toHaveBeenCalledWith('suggest-pick', 3);
  });
});

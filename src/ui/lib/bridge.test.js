// @vitest-environment jsdom
import { Electroview } from 'electrobun/view';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBridge } from './bridge.js';

let bridge;
let rpc;

beforeEach(() => {
  bridge = createBridge(Electroview, 'darwin');
  rpc = Electroview.last.rpc;
});

describe('bridge to the main process', () => {
  it('gives the UI window.herdr: commands, ready, suggestions and the tab views', async () => {
    const { herdr } = bridge;
    expect(herdr.platform).toBe('darwin');
    herdr.cmd('newTab');
    herdr.cmd('navigate', 'example.com');
    expect(rpc.send.cmd.mock.calls).toEqual([[{ name: 'newTab', arg: undefined }], [{ name: 'navigate', arg: 'example.com' }]]);
    herdr.ready();
    expect(rpc.send.ready).toHaveBeenCalled();
    expect(await herdr.suggest('ex')).toEqual([{ query: 'ex' }]);
    herdr.tabView('t1', 7);
    expect(rpc.send.tabView).toHaveBeenCalledWith({ tabId: 't1', webviewId: 7 });
  });

  it('passes messages from main to their listeners, until they stop listening', () => {
    const fn = vi.fn();
    const stop = bridge.herdr.on('rename', fn);
    rpc.receive('rename', { kind: 'tab', id: 't1' });
    rpc.receive('nobody-listens', 1);
    stop();
    rpc.receive('rename', { kind: 'tab', id: 't2' });
    expect(fn.mock.calls).toEqual([[{ kind: 'tab', id: 't1' }]]);
  });

  it('keeps the keys the page passes on from the state', () => {
    rpc.receive('state', { keys: ['ctrl+t'] });
    expect(window.__herdrKeys).toEqual(['ctrl+t']);
  });

  it('draws the suggestion list here, under the address bar', () => {
    const { herdr, suggestions } = bridge;
    const overlay = vi.fn();
    const rows = vi.fn();
    const select = vi.fn();
    herdr.on('suggest-overlay', overlay);
    suggestions.onRows(rows);
    suggestions.onSelect(select);
    herdr.cmd('showSuggestions', { rows: [{}, {}], selected: 0, rect: { x: 1, y: 2, width: 3 } });
    expect(rows).toHaveBeenCalledWith({ rows: [{}, {}], selected: 0 });
    expect(overlay).toHaveBeenLastCalledWith({ x: 1, y: 2, width: 3, height: 2 * 32 + 10 });
    herdr.cmd('selectSuggestion', 1);
    expect(select).toHaveBeenCalledWith(1);
    herdr.cmd('hideSuggestions');
    expect(overlay).toHaveBeenLastCalledWith(null);
    herdr.cmd('showSuggestions', { rows: [{}], selected: 0, rect: {} });
    rpc.receive('suggest-close');
    expect(overlay).toHaveBeenLastCalledWith(null);
    expect(rpc.send.cmd).not.toHaveBeenCalled();
  });

  it('passes hovers and picks in the list to the address bar', () => {
    const hover = vi.fn();
    const pick = vi.fn();
    bridge.herdr.on('suggest-hover', hover);
    bridge.herdr.on('suggest-pick', pick);
    bridge.suggestions.hover(2);
    bridge.suggestions.pick(3);
    expect(hover).toHaveBeenCalledWith(2);
    expect(pick).toHaveBeenCalledWith(3);
  });

  it('gives the downloads panel its rows and sends its clicks to main', () => {
    const rows = vi.fn();
    bridge.downloads.onRows(rows);
    rpc.receive('downloads-rows', [{ id: 1 }]);
    expect(rows).toHaveBeenCalledWith([{ id: 1 }]);
    bridge.downloads.action('show', 1);
    bridge.downloads.clear();
    bridge.downloads.openFolder();
    bridge.downloads.pointer();
    expect(rpc.send.cmd.mock.calls.map(([c]) => c)).toEqual([
      { name: 'downloadsAction', arg: { action: 'show', id: 1 } },
      { name: 'downloadsClear', arg: undefined },
      { name: 'downloadsFolder', arg: undefined },
      { name: 'downloadsPointer', arg: undefined },
    ]);
  });
});

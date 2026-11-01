import { beforeEach, describe, expect, it } from 'vitest';
import { m, start, tab, useMain, view, ws } from '../../testing/main-harness.js';

useMain();

describe('context menu', () => {
  beforeEach(() => start());

  const openMenu = (params) => {
    m.pageMessage(tab().id, { type: 'context-menu', ...params });
    return m.electrobun.ContextMenu.showContextMenu.mock.calls.at(-1)[0];
  };
  const item = (menu, label) => menu.find((i) => i.label === label);

  it('offers link actions for web links only', () => {
    const menu = openMenu({ linkURL: 'https://link.example/' });
    m.contextClick(item(menu, 'Copy Link Address').action, item(menu, 'Copy Link Address').data);
    expect(m.electrobun.Utils.clipboardWriteText).toHaveBeenCalledWith('https://link.example/');
    m.contextClick(item(menu, 'Open Link in New Tab').action, item(menu, 'Open Link in New Tab').data);
    expect(ws().tabs.map((t) => t.url)).toEqual(['about:blank', 'https://link.example/']);
    expect(item(openMenu({ linkURL: 'javascript:alert(1)' }), 'Copy Link Address')).toBeUndefined();
    expect(item(openMenu({ linkURL: 42 }), 'Copy Link Address')).toBeUndefined();
  });

  it('offers editing for fields and copy for selected text', () => {
    const roles = (menu) => menu.map((i) => i.role).filter(Boolean);
    expect(roles(openMenu({ isEditable: true }))).toEqual(['cut', 'copy', 'paste']);
    expect(roles(openMenu({ selectionText: 'hi' }))).toEqual(['copy']);
    expect(roles(openMenu({}))).toEqual([]);
    expect(roles(m.ctx.contextMenu.show(tab().id) ?? openMenu())).toEqual([]);
  });

  it('navigates and inspects the page', () => {
    const page = view();
    openMenu({});
    for (const action of ['back', 'forward', 'reload', 'inspect', 'nope']) m.contextClick(action);
    m.menuEvents.emit('context-menu-clicked', {});
    expect(m.sent.filter(([c]) => c === 'page-action').map(([, p]) => p.action)).toEqual(['goBack', 'goForward', 'reload']);
    expect(page.openDevTools).toHaveBeenCalled();
  });
});

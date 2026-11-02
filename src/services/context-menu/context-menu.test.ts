import { beforeEach, describe, expect, it } from 'vitest';
import type { ContextMenuParams } from 'electron';
import type { MenuItem } from '../../testing/fake-electron';
import { m, start, useMain, wc, ws } from '../../testing/main-harness';

useMain();

describe('context menu', () => {
  beforeEach(() => start());

  const openMenu = (params: Partial<ContextMenuParams>) => {
    wc().emit('context-menu', {}, { x: 10, y: 20, ...params });
    const menu = m.menus.at(-1)!;
    expect(menu.popup).toHaveBeenCalledWith({ window: m.win() });
    return menu.template;
  };
  const item = (template: MenuItem[], label: string) => template.find((i) => i.label === label);

  it('offers link actions', () => {
    const template = openMenu({ linkURL: 'https://link.example/' });
    item(template, 'Copy Link Address')!.click!();
    expect(m.electron.clipboard.writeText).toHaveBeenCalledWith('https://link.example/');
    item(template, 'Open Link in New Tab')!.click!();
    expect(ws().tabs.map((t) => t.url)).toEqual(['about:blank', 'https://link.example/']);
  });

  it('offers image actions', () => {
    const page = wc();
    const src = 'https://img.example/cat.png';
    const template = openMenu({ mediaType: 'image', srcURL: src });
    expect(template.slice(0, 4).map((i) => i.label)).toEqual([
      'Open Image in New Tab',
      'Save Image As…',
      'Copy Image',
      'Copy Image Address',
    ]);
    item(template, 'Save Image As…')!.click!();
    expect(page.downloadURL).toHaveBeenCalledWith(src);
    item(template, 'Copy Image')!.click!();
    expect(page.copyImageAt).toHaveBeenCalledWith(10, 20);
    item(template, 'Copy Image Address')!.click!();
    expect(m.electron.clipboard.writeText).toHaveBeenCalledWith(src);
    item(template, 'Open Image in New Tab')!.click!();
    expect(ws().tabs.map((t) => t.url)).toEqual(['about:blank', src]);
    expect(item(openMenu({ mediaType: 'video', srcURL: 'https://v.example/a.mp4' }), 'Save Image As…')).toBeUndefined();
  });

  it('offers editing for fields and copy for selected text', () => {
    expect(
      openMenu({ isEditable: true })
        .map((i) => i.role)
        .filter(Boolean),
    ).toEqual(['cut', 'copy', 'paste']);
    expect(
      openMenu({ selectionText: 'hi' })
        .map((i) => i.role)
        .filter(Boolean),
    ).toEqual(['copy']);
    expect(
      openMenu({})
        .map((i) => i.role)
        .filter(Boolean),
    ).toEqual([]);
  });

  it('navigates and inspects the page', () => {
    const page = wc();
    Object.assign(page, { entries: [{}, {}], activeIndex: 1 });
    const template = openMenu({});
    expect(item(template, 'Back')!.enabled).toBe(true);
    expect(item(template, 'Forward')!.enabled).toBe(false);
    for (const label of ['Back', 'Forward', 'Reload', 'Inspect']) item(template, label)!.click!();
    expect(page.navigationHistory.goBack).toHaveBeenCalled();
    expect(page.navigationHistory.goForward).toHaveBeenCalled();
    expect(page.reload).toHaveBeenCalled();
    expect(page.inspectElement).toHaveBeenCalledWith(10, 20);
  });
});

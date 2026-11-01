import { describe, expect, it } from 'vitest';
import { m, start, state, useMain, ws } from '../../testing/main-harness.js';

useMain();

// Every item in the menu, flattened.
const items = (menu) => menu.flatMap((item) => [item, ...items(item.submenu || [])]);

describe('application menu', () => {
  it('lists the Cmd shortcuts, with the edit roles that make copy and paste work', () => {
    start();
    const [menu] = m.electrobun.ApplicationMenu.setApplicationMenu.mock.calls[0];
    expect(menu.map((top) => top.label)).toEqual(['Herdr Browser', 'File', 'Edit', 'View', 'History', 'Tab', 'Window']);
    const all = items(menu);
    expect(all.filter((i) => i.role).map((i) => i.role)).toEqual(
      expect.arrayContaining(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']),
    );
    for (const item of all.filter((i) => i.action)) {
      // An item runs the chord it shows (or shows none for keys without Cmd).
      const keys = (chord) => chord.split('+').sort();
      if (item.accelerator) expect(keys(item.accelerator)).toEqual(keys(item.action));
      expect(m.ctx.keyboard.run(item.action), item.label).toBe(true);
    }
  });

  it('runs the clicked item', () => {
    start();
    m.menuClick('cmd+t');
    m.menuClick('');
    m.menuClick(undefined);
    expect(ws().tabs).toHaveLength(2);
    expect(state().activeWs).toBe(0);
  });
});

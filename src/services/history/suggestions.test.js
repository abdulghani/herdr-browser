import { beforeEach, describe, expect, it } from 'vitest';
import { m, start, tab, useMain, view } from '../../testing/main-harness.js';

useMain();

describe('address bar suggestions', () => {
  beforeEach(() => start());

  it('suggests other open tabs and history', () => {
    m.cmd('navigate', 'example.com');
    view().fire('did-navigate', 'https://example.com/');
    m.pageMessage(tab().id, { type: 'title', title: 'Example' });
    m.cmd('navigate', 'other.example');
    m.cmd('newTab');
    m.cmd('navigate', 'github.com');
    m.cmd('renameTab', { id: tab().id, name: 'Code' });
    m.cmd('newTab');
    expect(m.suggest('code')).toEqual([expect.objectContaining({ kind: 'tab', title: 'Code', url: 'https://github.com' })]);
    expect(m.suggest(null)).toEqual([expect.objectContaining({ kind: 'history', url: 'https://example.com/', title: 'Example' })]);
  });
});

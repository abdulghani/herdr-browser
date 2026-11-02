import { describe, expect, it } from 'vitest';
import { chordOf, type KeyPress } from './keys';

describe('chordOf', () => {
  const key = (k: string, mods: Partial<KeyPress> = {}): KeyPress => ({ key: k, code: '', ...mods });

  it('names plain keys in lowercase', () => {
    expect(chordOf(key('T'))).toBe('t');
    expect(chordOf(key('F3'))).toBe('f3');
  });

  it('puts modifiers in the order ctrl, alt, cmd, shift', () => {
    expect(chordOf(key('T', { shift: true, meta: true }))).toBe('cmd+shift+t');
    expect(chordOf(key('ArrowLeft', { shift: true, alt: true }))).toBe('alt+shift+left');
    expect(chordOf(key('a', { control: true, alt: true, meta: true, shift: true }))).toBe('ctrl+alt+cmd+shift+a');
  });

  it('maps arrows, space and shifted symbols', () => {
    expect(chordOf(key('ArrowUp', { alt: true }))).toBe('alt+up');
    expect(chordOf({ key: ' ', code: 'Space', control: true })).toBe('ctrl+space');
    expect(chordOf(key('+', { control: true, shift: true }))).toBe('ctrl+shift+=');
    expect(chordOf(key('{', { control: true }))).toBe('ctrl+[');
  });

  it('treats ? as its own key whatever the modifiers', () => {
    expect(chordOf(key('?', { shift: true }))).toBe('?');
  });
});

import { describe, expect, it } from 'vitest';
import { fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches a substring and marks its letters', () => {
    expect(fuzzyMatch('hub', 'github.com')).toEqual({ score: 12, positions: [3, 4, 5] });
  });

  it('scores a match at the start or at a word start higher', () => {
    const start = fuzzyMatch('git', 'github.com')!.score;
    const wordStart = fuzzyMatch('com', 'github.com')!.score;
    const middle = fuzzyMatch('ith', 'github.com')!.score;
    expect(start).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(middle);
  });

  it('ignores case', () => {
    expect(fuzzyMatch('git', 'GitHub')).not.toBeNull();
  });

  it('matches scattered letters that start at a word', () => {
    const m = fuzzyMatch('ytb', 'youtube.com')!;
    expect(m.positions).toEqual([0, 3, 5]);
  });

  it('needs every letter in order', () => {
    expect(fuzzyMatch('xyz', 'youtube.com')).toBeNull();
    expect(fuzzyMatch('ebu', 'youtube.com')).toBeNull();
  });

  it("doesn't match letters scattered over a long text from the middle of a word", () => {
    expect(fuzzyMatch('oeo', 'youtube.com')).toBeNull();
  });
});

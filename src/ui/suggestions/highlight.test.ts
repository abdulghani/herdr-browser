import { describe, expect, it } from 'vitest';
import { highlighted, looksLikeUrl } from './highlight';

describe('highlighted', () => {
  it('splits text into bold and plain runs', () => {
    expect(highlighted('github', [0, 1, 4])).toEqual([
      { text: 'gi', bold: true },
      { text: 'th', bold: false },
      { text: 'u', bold: true },
      { text: 'b', bold: false },
    ]);
    expect(highlighted('', [])).toEqual([]);
  });
});

describe('looksLikeUrl', () => {
  it.each([
    ['example.com', true],
    ['example.com:8080/x', true],
    ['localhost:3000', true],
    ['about:blank', true],
    ['cats and dogs', false],
    ['readme', false],
  ])('%s -> %s', (text, url) => expect(looksLikeUrl(text)).toBe(url));
});

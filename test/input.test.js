import { describe, expect, it } from 'vitest';
import { HOME_URL, SEARCH_URL, chordOf, normalizeUrl } from '../src/input.js';

describe('normalizeUrl', () => {
  it('goes home for empty input', () => {
    expect(normalizeUrl('   ')).toBe(HOME_URL);
  });

  it('keeps URLs that have a scheme', () => {
    expect(normalizeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(normalizeUrl('herdr://settings')).toBe('herdr://settings');
    expect(normalizeUrl('about:blank')).toBe('about:blank');
    expect(normalizeUrl('mailto:someone@example.com')).toBe('mailto:someone@example.com');
  });

  it('adds https:// to things that look like a host', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('  github.com/abdulghani  ')).toBe('https://github.com/abdulghani');
    expect(normalizeUrl('example.com:8080/x')).toBe('https://example.com:8080/x');
  });

  it('uses http:// for localhost and IP addresses', () => {
    expect(normalizeUrl('localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeUrl('192.168.1.1/admin')).toBe('http://192.168.1.1/admin');
  });

  it('searches for anything else', () => {
    expect(normalizeUrl('how to cook rice')).toBe(SEARCH_URL + 'how%20to%20cook%20rice');
    expect(normalizeUrl('example.com is down')).toBe(SEARCH_URL + 'example.com%20is%20down');
    expect(normalizeUrl('rice')).toBe(SEARCH_URL + 'rice');
  });
});

describe('chordOf', () => {
  const key = (k, mods = {}) => ({ key: k, code: '', ...mods });

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

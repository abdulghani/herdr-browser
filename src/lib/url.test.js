import { describe, expect, it } from 'vitest';
import { HOME_URL, SEARCH_URL, displayUrl, normalizeUrl } from './url.js';

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

describe('displayUrl', () => {
  it('drops the scheme, www. and a trailing slash', () => {
    expect(displayUrl('https://www.github.com/')).toBe('github.com');
    expect(displayUrl('http://example.com/a/b')).toBe('example.com/a/b');
  });
});

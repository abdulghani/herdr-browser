import { describe, expect, it } from 'vitest';
import { formatBytes } from './format.js';

describe('formatBytes', () => {
  it('shows bytes as they are', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(undefined)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
  });

  it('uses one decimal below 10 and none above', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(3.2 * 1024 * 1024)).toBe('3.2 MB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
    expect(formatBytes(123.4 * 1024 * 1024 * 1024)).toBe('123 GB');
  });

  it('stops at terabytes', () => {
    expect(formatBytes(2048 * 1024 ** 4)).toBe('2048 TB');
  });
});

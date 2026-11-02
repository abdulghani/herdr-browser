import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHistory } from './history';

describe('createHistory', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-history-'));
    file = path.join(dir, 'history.json');
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('only records web pages', () => {
    const history = createHistory(file);
    history.visit('about:blank', 'New Tab');
    history.visit('herdr://settings/', 'Settings');
    history.visit('https://example.com/', 'Example');
    expect(history.suggest('', []).map((r) => r.url)).toEqual(['https://example.com/']);
  });

  it('finds pages by title or address and marks the matched letters', () => {
    const history = createHistory(file);
    history.visit('https://www.wikipedia.org/', 'Wikipedia');
    history.visit('https://news.ycombinator.com/', 'Hacker News');
    const [hit, ...rest] = history.suggest('hacker', []);
    expect(rest).toEqual([]);
    expect(hit).toMatchObject({ kind: 'history', url: 'https://news.ycombinator.com/', displayUrl: 'news.ycombinator.com' });
    expect(hit.highlight.title).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('needs every word of the query to match', () => {
    const history = createHistory(file);
    history.visit('https://example.com/docs', 'Example docs');
    expect(history.suggest('example docs', [])).toHaveLength(1);
    expect(history.suggest('example blog', [])).toHaveLength(0);
  });

  it('ranks pages visited more often higher', () => {
    const history = createHistory(file);
    history.visit('https://a.example.com/', 'Example A');
    history.visit('https://b.example.com/', 'Example B');
    for (let i = 0; i < 5; i++) history.visit('https://b.example.com/', 'Example B');
    expect(history.suggest('example', [])[0].url).toBe('https://b.example.com/');
  });

  it('lists open tabs, and not the same page again from history', () => {
    const history = createHistory(file);
    history.visit('https://example.com/', 'Example');
    const tabs = [{ tabId: 't1', url: 'https://example.com/', title: 'Example', favicon: null }];
    const results = history.suggest('example', tabs);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: 'tab', tabId: 't1' });
  });

  it('leaves open tabs out when the query is empty', () => {
    const history = createHistory(file);
    const tabs = [{ tabId: 't1', url: 'https://example.com/', title: 'Example', favicon: null }];
    expect(history.suggest('', tabs)).toEqual([]);
  });

  it('returns at most 8 results', () => {
    const history = createHistory(file);
    for (let i = 0; i < 20; i++) history.visit(`https://site${i}.example.com/`, `Example ${i}`);
    expect(history.suggest('example', [])).toHaveLength(8);
  });

  it('fills in titles and favicons that arrive later', () => {
    const history = createHistory(file);
    history.visit('https://example.com/', '');
    history.update('https://example.com/', { title: 'Example', favicon: 'https://example.com/icon.png' });
    expect(history.suggest('example', [])[0]).toMatchObject({ title: 'Example', favicon: 'https://example.com/icon.png' });
  });

  it('saves to disk and loads it back', () => {
    const history = createHistory(file);
    history.visit('https://example.com/', 'Example');
    history.saveNow();
    expect(createHistory(file).suggest('example', [])).toHaveLength(1);
  });

  it('saves on its own shortly after a visit', () => {
    vi.useFakeTimers();
    const history = createHistory(file);
    history.visit('https://example.com/', 'Example');
    expect(fs.existsSync(file)).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toHaveLength(1);
  });

  it('starts empty when the file is missing or broken', () => {
    fs.writeFileSync(file, 'not json');
    expect(createHistory(file).suggest('', [])).toEqual([]);
  });
});

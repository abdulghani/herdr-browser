// Browsing history for address bar suggestions, ranked by fuzzy matching over it and the open tabs.
import fs from 'fs';
import { displayUrl } from '../../lib/url';
import { fuzzyMatch, type FuzzyMatch } from '../../lib/fuzzy';
import type { Suggestion } from '../../types';

interface HistoryEntry {
  url: string;
  title: string;
  visits: number;
  last: number;
  favicon?: string;
}

// An open tab offered as a suggestion.
export interface OpenTab {
  tabId: string;
  url: string;
  title: string;
  favicon: string | null;
}

type Highlight = Suggestion['highlight'];

const MAX_HISTORY = 2000;
const MAX_RESULTS = 8;
const DAY = 24 * 60 * 60 * 1000;

// Every token must match the title or the URL; positions are kept per field for highlighting.
function matchItem(tokens: string[], item: { title?: string; url: string }): { score: number; highlight: Highlight } | null {
  const fields: Record<keyof Highlight, string> = { title: item.title || '', url: displayUrl(item.url) };
  const highlight: Highlight = { title: [], url: [] };
  let score = 0;
  for (const token of tokens) {
    let best: (FuzzyMatch & { field: keyof Highlight }) | null = null;
    for (const field of ['url', 'title'] as const) {
      const m = fuzzyMatch(token, fields[field]);
      if (m && (!best || m.score > best.score)) best = { ...m, field };
    }
    if (!best) return null;
    score += best.score;
    highlight[best.field].push(...best.positions);
  }
  return { score, highlight };
}

export function createHistory(file: string) {
  const entries = new Map<string, HistoryEntry>(); // url -> { url, title, visits, last }
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    for (const e of JSON.parse(fs.readFileSync(file, 'utf8')) as HistoryEntry[]) entries.set(e.url, e);
  } catch {}

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 2000);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    try {
      fs.writeFileSync(file, JSON.stringify([...entries.values()]));
    } catch (err) {
      console.error('history save failed', err);
    }
  }

  function visit(url: string, title?: string) {
    if (!/^https?:/i.test(url)) return;
    const entry = entries.get(url) || { url, title: '', visits: 0, last: 0 };
    entry.visits++;
    entry.last = Date.now();
    if (title) entry.title = title;
    entries.delete(url); // re-insert so the map stays oldest-first
    entries.set(url, entry);
    if (entries.size > MAX_HISTORY) entries.delete(entries.keys().next().value!);
    save();
  }

  // Title and favicon arrive after the visit is recorded.
  function update(url: string, fields: { title?: string; favicon?: string }) {
    const entry = entries.get(url);
    if (!entry) return;
    for (const [key, value] of Object.entries(fields) as [keyof typeof fields, string | undefined][]) if (value) entry[key] = value;
    save();
  }

  // Frequent and recent pages rank higher.
  function frecency(entry: HistoryEntry) {
    const age = Date.now() - entry.last;
    return Math.log2(1 + entry.visits) * 2 + (age < DAY ? 4 : age < 7 * DAY ? 2 : 0);
  }

  // openTabs: [{ tabId, url, title, favicon }]. With an empty query, the most frecent pages.
  function suggest(query: string, openTabs: OpenTab[]): Suggestion[] {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const tabUrls = new Set(openTabs.map((t) => t.url));
    const items = [
      ...openTabs.map((t) => ({ ...t, kind: 'tab' as const, boost: 3 })),
      ...[...entries.values()]
        .filter((e) => !tabUrls.has(e.url))
        .map((e) => ({ ...e, tabId: undefined, kind: 'history' as const, boost: frecency(e) })),
    ];
    const results: Suggestion[] = [];
    for (const item of items) {
      const m = tokens.length ? matchItem(tokens, item) : { score: 0, highlight: { title: [], url: [] } };
      if (!m) continue;
      results.push({
        kind: item.kind,
        tabId: item.tabId,
        url: item.url,
        title: item.title || '',
        favicon: item.favicon || null,
        displayUrl: displayUrl(item.url),
        highlight: m.highlight,
        rank: m.score + item.boost,
      });
    }
    if (!tokens.length)
      return results
        .filter((r) => r.kind === 'history')
        .sort((a, b) => b.rank - a.rank)
        .slice(0, MAX_RESULTS);
    return results.sort((a, b) => b.rank - a.rank).slice(0, MAX_RESULTS);
  }

  return { visit, update, suggest, saveNow };
}

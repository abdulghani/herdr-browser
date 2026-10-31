// Address bar suggestions: a small browsing history plus fuzzy matching over it and the open tabs.
const fs = require('fs');

const MAX_HISTORY = 2000;
const MAX_RESULTS = 8;
const DAY = 24 * 60 * 60 * 1000;

// What the address bar shows for a URL: no scheme, "www." or trailing slash.
const displayUrl = (url) => url.replace(/^[a-z]+:\/\//i, '').replace(/^www\./, '').replace(/\/$/, '');

// Fuzzy-match one lowercase token against text: every token character must appear in order.
// Returns { score, positions } or null. Runs of consecutive characters and matches at the start
// of a word score higher; too many breaks between matched characters is no match at all, so a
// short token doesn't match every long URL.
function fuzzyMatch(token, text) {
  const lower = text.toLowerCase();
  // A plain substring match beats any scattered one.
  const at = lower.indexOf(token);
  if (at !== -1) {
    const wordStart = at === 0 || !/[a-z0-9]/.test(lower[at - 1]);
    return {
      score: token.length * 4 + (at === 0 ? 10 : wordStart ? 5 : 0),
      positions: Array.from({ length: token.length }, (_, i) => at + i),
    };
  }
  const positions = [];
  let score = 0;
  let breaks = 0;
  let from = 0;
  for (const ch of token) {
    const i = lower.indexOf(ch, from);
    if (i === -1) return null;
    const prev = positions[positions.length - 1];
    if (prev !== undefined && i !== prev + 1) breaks++;
    score += 1 + (prev !== undefined && i === prev + 1 ? 2 : 0) + (i === 0 || !/[a-z0-9]/.test(lower[i - 1]) ? 3 : 0);
    positions.push(i);
    from = i + 1;
  }
  // Scattered letters only count when the first one starts a word ("ytb" -> youtube).
  const firstAtWordStart = positions[0] === 0 || !/[a-z0-9]/.test(lower[positions[0] - 1]);
  if (breaks > (firstAtWordStart ? Math.max(2, Math.ceil(token.length / 2)) : 1)) return null;
  return { score, positions };
}

// Every token must match the title or the URL; positions are kept per field for highlighting.
function matchItem(tokens, item) {
  const fields = { title: item.title || '', url: displayUrl(item.url) };
  const highlight = { title: [], url: [] };
  let score = 0;
  for (const token of tokens) {
    let best = null;
    for (const field of ['url', 'title']) {
      const m = fuzzyMatch(token, fields[field]);
      if (m && (!best || m.score > best.score)) best = { ...m, field };
    }
    if (!best) return null;
    score += best.score;
    highlight[best.field].push(...best.positions);
  }
  return { score, highlight };
}

function createHistory(file) {
  let entries = new Map(); // url -> { url, title, visits, last }
  let saveTimer = null;
  try {
    for (const e of JSON.parse(fs.readFileSync(file, 'utf8'))) entries.set(e.url, e);
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

  function visit(url, title) {
    if (!/^https?:/i.test(url)) return;
    const entry = entries.get(url) || { url, title: '', visits: 0, last: 0 };
    entry.visits++;
    entry.last = Date.now();
    if (title) entry.title = title;
    entries.delete(url); // re-insert so the map stays oldest-first
    entries.set(url, entry);
    if (entries.size > MAX_HISTORY) entries.delete(entries.keys().next().value);
    save();
  }

  // Title and favicon arrive after the visit is recorded.
  function update(url, fields) {
    const entry = entries.get(url);
    if (!entry) return;
    for (const [key, value] of Object.entries(fields)) if (value) entry[key] = value;
    save();
  }

  // Frequent and recent pages rank higher.
  function frecency(entry) {
    const age = Date.now() - entry.last;
    return Math.log2(1 + entry.visits) * 2 + (age < DAY ? 4 : age < 7 * DAY ? 2 : 0);
  }

  // openTabs: [{ tabId, url, title, favicon }]. With an empty query, the most frecent pages.
  function suggest(query, openTabs) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const tabUrls = new Set(openTabs.map((t) => t.url));
    const items = [
      ...openTabs.map((t) => ({ ...t, kind: 'tab', boost: 3 })),
      ...[...entries.values()].filter((e) => !tabUrls.has(e.url)).map((e) => ({ ...e, kind: 'history', boost: frecency(e) })),
    ];
    const results = [];
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
    if (!tokens.length) return results.filter((r) => r.kind === 'history').sort((a, b) => b.rank - a.rank).slice(0, MAX_RESULTS);
    return results.sort((a, b) => b.rank - a.rank).slice(0, MAX_RESULTS);
  }

  return { visit, update, suggest, saveNow };
}

module.exports = { createHistory, fuzzyMatch };

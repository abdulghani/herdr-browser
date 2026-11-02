// Fuzzy-match one lowercase token against text: every token character must appear in order.
// Returns { score, positions } or null. Runs of consecutive characters and matches at the start
// of a word score higher; too many breaks between matched characters is no match at all, so a
// short token doesn't match every long URL.
export interface FuzzyMatch {
  score: number;
  positions: number[];
}

export function fuzzyMatch(token: string, text: string): FuzzyMatch | null {
  const lower = text.toLowerCase();
  return substringMatch(token, lower) || scatteredMatch(token, lower);
}

const isWordStart = (lower: string, i: number) => i === 0 || !/[a-z0-9]/.test(lower[i - 1]);

// A plain substring match beats any scattered one.
function substringMatch(token: string, lower: string): FuzzyMatch | null {
  const at = lower.indexOf(token);
  if (at === -1) return null;
  return {
    score: token.length * 4 + (at === 0 ? 10 : isWordStart(lower, at) ? 5 : 0),
    positions: Array.from({ length: token.length }, (_, i) => at + i),
  };
}

function scatteredMatch(token: string, lower: string): FuzzyMatch | null {
  const positions: number[] = [];
  let score = 0;
  let breaks = 0;
  for (const ch of token) {
    const prev = positions.at(-1);
    const i = lower.indexOf(ch, prev === undefined ? 0 : prev + 1);
    if (i === -1) return null;
    const adjacent = prev !== undefined && i === prev + 1;
    if (prev !== undefined && !adjacent) breaks++;
    score += 1 + (adjacent ? 2 : 0) + (isWordStart(lower, i) ? 3 : 0);
    positions.push(i);
  }
  // Scattered letters only count when the first one starts a word ("ytb" -> youtube).
  const maxBreaks = isWordStart(lower, positions[0]) ? Math.max(2, Math.ceil(token.length / 2)) : 1;
  return breaks > maxBreaks ? null : { score, positions };
}

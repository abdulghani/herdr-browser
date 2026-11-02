// Helpers for drawing suggestion rows.

export const looksLikeUrl = (text: string): boolean =>
  /^[a-z][a-z0-9+.-]*:/i.test(text) || /^localhost(:\d+)?(\/|$)/.test(text) || (!/\s/.test(text) && /\.[a-z]{2,}(:\d+)?(\/|$)/i.test(text));

// Text split into runs, with the fuzzy-matched characters marked bold: [{ text, bold }].
export function highlighted(text: string, positions: number[]): { text: string; bold: boolean }[] {
  const marks = new Set(positions);
  const runs: { text: string; bold: boolean }[] = [];
  for (let i = 0; i < text.length;) {
    const bold = marks.has(i);
    let j = i;
    while (j < text.length && marks.has(j) === bold) j++;
    runs.push({ text: text.slice(i, j), bold });
    i = j;
  }
  return runs;
}

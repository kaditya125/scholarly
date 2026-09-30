/**
 * Lexical matching for global search (GET /api/search).
 *
 * A server-side port of frontend/src/lib/search/paletteSearch.ts so that results the API returns
 * and results the command palette scores locally land on the same scale and can be merged:
 *   - every query token must match some field (AND semantics, any order);
 *   - whole-word > word-prefix > mid-word substring > small typo (edit distance) matches;
 *   - fields carry weights so a title hit outranks a subject hit.
 * Keep the two in step when changing the scoring.
 */

export interface SearchField {
  text: string;
  weight: number;
}

export interface IndexedField {
  norm: string;
  words: string[];
  weight: number;
}

export interface MatchResult {
  score: number;
  /** Indices of the fields that matched at least one token. */
  hitFields: Set<number>;
}

// Latin diacritics only — Devanagari matras are combining marks too and must survive.
const LATIN_MARKS = /[̀-ͯ]/g;
const NON_WORD = /[^\p{L}\p{M}\p{N}]+/gu;
const NUMERIC = /^\d+$/;

export function normalize(s: string): string {
  return (s || '').normalize('NFKD').replace(LATIN_MARKS, '').toLowerCase().replace(NON_WORD, ' ').trim();
}

export function tokenize(query: string): string[] {
  const norm = normalize(query);
  return norm ? Array.from(new Set(norm.split(' '))) : [];
}

export function indexFields(fields: SearchField[]): IndexedField[] {
  return fields.map((f) => {
    const norm = normalize(f.text);
    return { norm, words: norm ? norm.split(' ') : [], weight: f.weight };
  });
}

/** Bounded Levenshtein distance; returns max + 1 as soon as the distance must exceed `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Quality (0..1) of the best match of one token inside one field. */
function tokenQuality(token: string, field: IndexedField): number {
  if (!field.norm) return 0;
  let best = 0;
  for (const w of field.words) {
    if (w === token) return 1;
    if (w.startsWith(token)) best = Math.max(best, 0.8);
  }
  if (best) return best;
  const numeric = NUMERIC.test(token);
  // "2" must not match "12": numbers only match whole words or word prefixes.
  if (!numeric && token.length >= 2 && field.norm.includes(token)) return 0.5;
  if (numeric || token.length < 4) return 0;
  const maxEdits = token.length >= 7 ? 2 : 1;
  for (const w of field.words) {
    if (w.length < 3) continue;
    if (editDistance(token, w, maxEdits) <= maxEdits) return 0.35;
    // Typo while still typing: compare against the word's prefix of the same length.
    if (w.length > token.length && editDistance(token, w.slice(0, token.length), maxEdits) <= maxEdits) best = 0.3;
  }
  return best;
}

/**
 * Whether a chapter is what the query is about, rather than only its book. Chapter fields are
 * [label, concepts/keywords/headings, book name, subject, class]. Without this, "physics",
 * "class 10" or "science" listed dozens of chapters whose keywords merely repeat their subject,
 * and typo matches against keyword lists flooded results (measured on production data).
 */
export function chapterMatches(tokens: string[], fields: IndexedField[]): boolean {
  const [label, concepts, ...book] = fields;
  const whole = tokens.join(' ');
  if (label.norm && (label.norm === whole || label.norm.startsWith(whole))) return true;
  // Every token names the book (subject, class, title): the book result already covers it.
  if (tokens.every((t) => book.some((f) => tokenQuality(t, f) >= 0.8))) return false;
  // A word (not just a number) must hit the chapter's own name, or its concepts without a typo.
  return tokens.some((t) => !NUMERIC.test(t) && (tokenQuality(t, label) > 0 || tokenQuality(t, concepts) >= 0.5));
}

/**
 * Scores `tokens` against an indexed item. Returns null unless every token matches some field.
 * `primary` (default 0) is the field compared against the whole query for exact/prefix bonuses.
 */
export function scoreItem(tokens: string[], fields: IndexedField[], primary = 0): MatchResult | null {
  if (!tokens.length) return null;
  let score = 0;
  const hitFields = new Set<number>();
  for (const t of tokens) {
    let bestScore = 0;
    let bestField = -1;
    fields.forEach((f, i) => {
      const s = tokenQuality(t, f) * f.weight;
      if (s > bestScore) { bestScore = s; bestField = i; }
    });
    if (bestField < 0) return null;
    score += bestScore;
    hitFields.add(bestField);
  }
  const whole = tokens.join(' ');
  const p = fields[primary]?.norm || '';
  if (p === whole) score += 3;
  else if (p.startsWith(whole)) score += 1.5;
  return { score, hitFields };
}

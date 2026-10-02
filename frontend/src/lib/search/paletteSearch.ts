/**
 * Search primitives for the global command palette (CommandPalette.tsx).
 *
 * Everything here is pure and client-side: the palette searches data that is already in memory
 * (the book catalog, cached book details, static page/action lists). Fields are normalised once
 * into an index, and each keystroke only scores tokens against that index:
 *   - every query token must match some field (AND semantics, any order: "physics 9" works);
 *   - whole-word > word-prefix > mid-word substring > small typo (edit distance) matches;
 *   - fields carry weights so a title hit outranks a subject hit.
 */

export interface SearchField {
  text: string;
  weight: number;
}

export interface IndexedField {
  raw: string;
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
    return { raw: f.text, norm, words: norm ? norm.split(' ') : [], weight: f.weight };
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

/** Every token names one of the given book fields (title, subject, class) — whole word or prefix. */
export function namesBook(tokens: string[], bookFields: IndexedField[]): boolean {
  return tokens.length > 0 && tokens.every((t) => bookFields.some((f) => tokenQuality(t, f) >= 0.8));
}

/**
 * Whether a chapter is what the query is about, rather than only its book. Chapter fields are
 * [label, concepts/keywords/headings, book name, subject, class]. Without this, "physics",
 * "class 10" or "science" listed dozens of chapters whose keywords merely repeat their subject,
 * and typo matches against keyword lists flooded results (measured on production data).
 */
export function chapterMatches(tokens: string[], fields: IndexedField[], queryNamesABook = false): boolean {
  const [label, concepts, ...book] = fields;
  const whole = tokens.join(' ');
  if (label.norm && (label.norm === whole || label.norm.startsWith(whole))) return true;
  // Every token names the book (subject, class, title): the book result already covers it.
  if (namesBook(tokens, book)) return false;
  // The query names some book ("science", "class 10"): other books' chapters only count when
  // their own name contains it, not a keyword ("science fiction") or a near-miss ("Scientist").
  if (queryNamesABook) return tokens.some((t) => !NUMERIC.test(t) && tokenQuality(t, label) >= 0.5);
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

export interface HighlightPart {
  text: string;
  match: boolean;
}

/** Splits `text` into matched/unmatched parts for the literal occurrences of `tokens`. */
export function highlight(text: string, tokens: string[]): HighlightPart[] {
  if (!text || !tokens.length) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const tok of tokens) {
    if (!tok) continue;
    // "kinetics" should still mark "Kinetic": fall back to the singular when the plural isn't there.
    const t = !lower.includes(tok) && tok.length > 4 && tok.endsWith('s') ? tok.slice(0, -1) : tok;
    let from = 0;
    let at: number;
    while ((at = lower.indexOf(t, from)) !== -1) {
      ranges.push([at, at + t.length]);
      from = at + t.length;
    }
  }
  if (!ranges.length) return [{ text, match: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const parts: HighlightPart[] = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (s > pos) parts.push({ text: text.slice(pos, s), match: false });
    parts.push({ text: text.slice(s, e), match: true });
    pos = e;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), match: false });
  return parts;
}

/** "Class 12" → 12, for numeric ordering of class labels. Unknown sorts last. */
export function classNumber(className?: string): number {
  const m = (className || '').match(/\d+/);
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
}

// ── Recents (per-browser convenience; never required for the palette to work) ──

export interface RecentItem {
  kind: 'book' | 'chapter';
  notebookId: string;
  sourceId?: string;
  title: string;
  bookName: string;
  subject: string;
  className?: string;
  ts: number;
}

const RECENT_ITEMS_KEY = 'palette:recentItems';
const RECENT_QUERIES_KEY = 'palette:recentQueries';
const MAX_RECENT_ITEMS = 6;
const MAX_RECENT_QUERIES = 5;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode, quota) — recents are optional */
  }
}

export function loadRecentItems(): RecentItem[] {
  return readJson<RecentItem[]>(RECENT_ITEMS_KEY, []).filter((r) => r && r.notebookId && r.title);
}

export function pushRecentItem(item: Omit<RecentItem, 'ts'>): RecentItem[] {
  const key = (r: Pick<RecentItem, 'notebookId' | 'sourceId'>) => `${r.notebookId}:${r.sourceId || ''}`;
  const next = [{ ...item, ts: Date.now() }, ...loadRecentItems().filter((r) => key(r) !== key(item))]
    .slice(0, MAX_RECENT_ITEMS);
  writeJson(RECENT_ITEMS_KEY, next);
  return next;
}

export function loadRecentQueries(): string[] {
  return readJson<string[]>(RECENT_QUERIES_KEY, []).filter((q) => typeof q === 'string' && q.trim());
}

export function pushRecentQuery(query: string): string[] {
  const q = query.trim();
  if (!q) return loadRecentQueries();
  const next = [q, ...loadRecentQueries().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT_QUERIES);
  writeJson(RECENT_QUERIES_KEY, next);
  return next;
}

export function clearRecentQueries(): void {
  writeJson(RECENT_QUERIES_KEY, []);
}

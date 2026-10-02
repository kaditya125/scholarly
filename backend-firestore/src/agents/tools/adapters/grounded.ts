/**
 * Grounded generation (Phase 6) — questions, flashcards and notes that a model writes FROM a source
 * text, each carrying a quote from that text as evidence, and kept only when the quote really is in
 * the text and supports the answer.
 *
 * The brief forbids "just ask an LLM for 20 questions", and the question bank cannot fill the gap
 * honestly: for NEET "Cell Structure" every one of its 62 questions is a replayed template wearing
 * official labels. So the source is the most trusted text Sadhya holds for the task — the NCERT
 * chapter itself, or the student's own document — and verification is deterministic string work,
 * the same stance as the formula chart: a question whose evidence cannot be found is dropped, never
 * repaired or guessed.
 */

import { titleCase } from './curriculumMatch';

export interface SourceSection {
  id: string;
  heading: string;
  text: string;
  pages: number[];
}

// ── Evidence matching ──────────────────────────────────────────────────────────────────────

/** Robust to what PDF text extraction does: line breaks, hyphenation, spacing, quotes, case. */
export function evidenceKey(text: string): string {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/-\s*\n\s*/g, '')
    .toLowerCase()
    .replace(/[‘’“”`´]/g, "'")
    .replace(/[^a-z0-9Ͱ-Ͽ]+/g, '');
}

const STOP = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'with', 'that', 'this', 'from', 'into', 'its', 'their', 'which', 'what', 'when', 'where', 'who',
  'has', 'have', 'had', 'been', 'being', 'also', 'such', 'than', 'then', 'these', 'those', 'they', 'them', 'there', 'not', 'but', 'all', 'any',
  'can', 'may', 'will', 'one', 'two', 'called', 'known', 'termed', 'as', 'of', 'in', 'on', 'to', 'by', 'at', 'an', 'a', 'is', 'it', 'or', 'be',
]);

/** Content words: lower-cased, 3+ characters (or any number), stop words out. */
export function contentWords(text: string): string[] {
  return (String(text ?? '').normalize('NFKC').toLowerCase().match(/[a-zͰ-Ͽ]{3,}|\d+(?:\.\d+)?/g) ?? []).filter((w) => !STOP.has(w));
}

/** A word's comparable form: long words by their first six letters (delivery/delivered, membrane/membranes). */
const stem = (w: string) => (w.length >= 6 ? w.slice(0, 6) : w.replace(/s$/, ''));

/** How much of `claim` the evidence states: 1 when its key is inside the evidence, else word recall. */
export function supportOf(claim: string, evidence: string): number {
  const c = evidenceKey(claim);
  if (c.length >= 3 && evidenceKey(evidence).includes(c)) return 1;
  const words = contentWords(claim);
  if (words.length === 0) return 0;
  const ev = new Set(contentWords(evidence).map(stem));
  return words.filter((w) => ev.has(stem(w))).length / words.length;
}

/**
 * One option restating another ("Schwann" inside "Theodor Schwann") — two keys for one fact.
 * Compared on whole words, compounds kept whole: "Sub-metacentric" is not "Metacentric", and
 * "chromatin" is not "chromatid" (so no prefix stemming here, only plurals).
 */
function overlaps(a: string, b: string): boolean {
  const words = (s: string) => new Set(contentWords(String(s).replace(/(\w)-(\w)/g, '$1$2')).map((w) => w.replace(/s$/, '')));
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return false;
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  return [...small].every((w) => large.has(w));
}

// ── Sources ────────────────────────────────────────────────────────────────────────────────

const SKIP_HEADING = /^(\d+(\.\d+)*\s+)?(summary|exercises?|points to ponder|additional exercises|appendix|answers?)\b/i;
const MAX_SECTION_CHARS = 6_000;

/**
 * A chapter's text cut at its own section headings (each found at its LAST occurrence, so the
 * contents list at the top is skipped). Summary and exercises are left out: questions come from
 * the teaching text.
 */
export function sectionsFromPages(pages: Array<{ pageNumber: number; text: string }>, headings: string[] = []): SourceSection[] {
  let raw = '';
  const pageAt: Array<{ page: number; at: number }> = [];
  for (const p of pages) {
    pageAt.push({ page: p.pageNumber, at: raw.length });
    raw += `${p.text ?? ''}\n`;
  }
  const lower = raw.toLowerCase().replace(/\s+/g, ' ');
  // Positions in `lower` differ from `raw` only by collapsed whitespace; map back through a table.
  const map: number[] = [];
  {
    let inSpace = false;
    for (let i = 0; i < raw.length; i++) {
      const ws = /\s/.test(raw[i]);
      if (ws && inSpace) continue;
      map.push(i);
      inSpace = ws;
    }
  }
  const found: Array<{ heading: string; at: number }> = [];
  for (const h of headings) {
    const key = String(h ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (key.length < 6) continue;
    const at = lower.lastIndexOf(key);
    if (at >= 0) found.push({ heading: String(h).replace(/\s+/g, ' ').trim(), at: map[at] ?? 0 });
  }
  found.sort((a, b) => a.at - b.at);

  const pagesOf = (from: number, to: number) => {
    const out: number[] = [];
    for (let i = 0; i < pageAt.length; i++) {
      const start = pageAt[i].at;
      const end = i + 1 < pageAt.length ? pageAt[i + 1].at : raw.length;
      if (start < to && end > from) out.push(pageAt[i].page);
    }
    return out;
  };

  if (found.length === 0) return chunkText(raw, pagesOf);
  const sections: SourceSection[] = [];
  found.forEach((f, i) => {
    const end = i + 1 < found.length ? found[i + 1].at : raw.length;
    if (SKIP_HEADING.test(f.heading)) return;
    const text = raw.slice(f.at, end).trim();
    if (text.length < 200) return;
    const heading = f.heading.replace(/^\d+(\.\d+)*\s+/, '');
    sections.push({
      id: `s${sections.length + 1}`,
      heading: heading === heading.toUpperCase() ? titleCase(heading) : heading,
      text: text.slice(0, MAX_SECTION_CHARS),
      pages: pagesOf(f.at, end),
    });
  });
  return sections.length ? sections : chunkText(raw, pagesOf);
}

/** Text with no usable headings (most uploads) in page-aligned chunks of a few thousand characters. */
function chunkText(raw: string, pagesOf: (from: number, to: number) => number[], size = 4_000): SourceSection[] {
  const out: SourceSection[] = [];
  for (let at = 0; at < raw.length; at += size) {
    const text = raw.slice(at, at + size).trim();
    if (text.length < 200) continue;
    const pages = pagesOf(at, at + size);
    out.push({ id: `s${out.length + 1}`, heading: pages.length ? `Pages ${pages[0]}${pages.length > 1 ? `–${pages[pages.length - 1]}` : ''}` : `Part ${out.length + 1}`, text, pages });
  }
  return out;
}

// ── Checking generated items ───────────────────────────────────────────────────────────────

export interface McqDraft {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  evidence: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  sectionId: string;
}

const LAZY_OPTIONS = /\b(all|none|both|neither)\s+(of\s+)?(the\s+)?(above|these|a\s+and\s+b)\b/i;
const NEGATIVE_STEM = /\b(not|except|incorrect|false|wrong|untrue)\b/i;
/** A quote must say something: under this many letters it matches too easily. */
const MIN_EVIDENCE_KEY = 24;

/**
 * Why a generated question is rejected, or null when it passes. The checks, in order: structure;
 * no option restating another; no NOT/EXCEPT stems (their answer is precisely the option the
 * evidence does NOT state, so they cannot be checked this way); the evidence is really in the
 * source; and it states the marked answer.
 *
 * Whether another option is ALSO right cannot be decided by string matching — good distractors
 * often come from the very sentence that proves the answer ("the outermost glycocalyx followed by
 * the cell wall…"). That is the independent solver's job (validate_questions), not this function's.
 */
export function checkMcq(d: McqDraft, sourceKey: string): string | null {
  const q = String(d.question ?? '').trim();
  const options = (d.options ?? []).map((o) => String(o ?? '').trim());
  if (q.length < 12) return 'malformed';
  if (options.length !== 4 || options.some((o) => !o)) return 'malformed';
  if (!Number.isInteger(d.correctIndex) || d.correctIndex < 0 || d.correctIndex > 3) return 'malformed';
  if (new Set(options.map(evidenceKey)).size !== 4) return 'duplicate_options';
  if (options.some((o, i) => options.some((p, j) => j > i && overlaps(o, p)))) return 'overlapping_options';
  if (options.some((o) => LAZY_OPTIONS.test(o))) return 'lazy_option';
  if (NEGATIVE_STEM.test(q)) return 'negative_stem';
  const ev = evidenceKey(d.evidence);
  if (ev.length < MIN_EVIDENCE_KEY || !sourceKey.includes(ev)) return 'evidence_not_in_source';
  if (supportOf(options[d.correctIndex], d.evidence) < 0.6) return 'answer_not_supported';
  return null;
}

/**
 * The independent answer check: a second model call that sees each question, its options and the
 * quoted evidence — never the key — and answers from the evidence alone. A question survives only
 * when the solver lands on the same option; "cannot tell" and a different answer both reject it.
 * This is what catches a mis-keyed question or two defensible options, which strings cannot.
 */
export async function solveFromEvidence(
  items: Array<{ id: string; question: string; options: string[]; evidence: string }>,
  opts: { userId: string; operation: string; sleep?: (ms: number) => Promise<void> },
): Promise<{ answers: Map<string, number>; usage: ModelUsage }> {
  const answers = new Map<string, number>();
  let tokens = 0;
  let costUsd = 0;
  for (let start = 0; start < items.length; start += 25) {
    const chunk = items.slice(start, start + 25);
    const prompt = [
      'For each question, use ONLY its quoted evidence to choose the correct option.',
      'Answer "NONE" when the evidence does not settle it, or when more than one option fits.',
      'Reply with JSON only: {"answers":[{"id":"…","answer":"A|B|C|D|NONE"}]}',
      '',
      ...chunk.map((q) => [`id: ${q.id}`, `Evidence: “${q.evidence}”`, `Question: ${q.question}`, ...q.options.map((o, i) => `${'ABCD'[i]}. ${o}`), ''].join('\n')),
    ].join('\n');
    const { json, usage } = await callJson(prompt, 'You check exam questions against quoted evidence and reply with JSON only.', opts);
    tokens += usage.tokens;
    costUsd += usage.costUsd;
    for (const a of Array.isArray(json?.answers) ? json.answers : []) {
      const letter = String(a?.answer ?? '').trim().toUpperCase();
      answers.set(String(a?.id), 'ABCD'.includes(letter) && letter.length === 1 ? 'ABCD'.indexOf(letter) : -1);
    }
  }
  return { answers, usage: { tokens, costUsd } };
}

export interface CardDraft {
  front: string;
  back: string;
  evidence: string;
  sectionId: string;
}

/** A flashcard passes when its quote is in the source and states its answer. */
export function checkCard(c: CardDraft, sourceKey: string): string | null {
  const front = String(c.front ?? '').trim();
  const back = String(c.back ?? '').trim();
  if (front.length < 6 || back.length < 1) return 'malformed';
  const ev = evidenceKey(c.evidence);
  if (ev.length < MIN_EVIDENCE_KEY || !sourceKey.includes(ev)) return 'evidence_not_in_source';
  if (supportOf(back, c.evidence) < 0.6) return 'answer_not_supported';
  return null;
}

export interface NoteDraft {
  point: string;
  evidence: string;
  sectionId: string;
}

/** A revision note passes when its quote is in the source and states most of the note's content. */
export function checkNote(n: NoteDraft, sourceKey: string): string | null {
  const point = String(n.point ?? '').trim();
  if (point.length < 12) return 'malformed';
  const ev = evidenceKey(n.evidence);
  if (ev.length < MIN_EVIDENCE_KEY || !sourceKey.includes(ev)) return 'evidence_not_in_source';
  if (supportOf(point, n.evidence) < 0.5) return 'claim_not_supported';
  return null;
}

// ── Duplicates ─────────────────────────────────────────────────────────────────────────────

const shingles = (text: string) => {
  const words = contentWords(text);
  const out = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) out.add(words.slice(i, i + 3).join(' '));
  if (words.length < 3 && words.length) out.add(words.join(' '));
  return out;
};

/** 3-word-shingle Jaccard over content words — the QuestionMixer's near-duplicate measure. */
export function similarity(a: string, b: string): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (!sa.size || !sb.size) return evidenceKey(a) === evidenceKey(b) ? 1 : 0;
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export const NEAR_DUPLICATE = 0.6;

// ── Model calls ────────────────────────────────────────────────────────────────────────────

/** List prices per million tokens for the model the tools use (gemini-2.5-flash), for the run budget. */
const PRICE_IN = 0.3;
const PRICE_OUT = 2.5;
export const GROUNDING_MODEL = 'gemini-2.5-flash';

export interface ModelUsage {
  tokens: number;
  costUsd: number;
}

/** Vertex answers a burst with 429 RESOURCE_EXHAUSTED (and sometimes 503); both pass in seconds. */
const isThrottle = (e: any) => /\b(429|503)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded/i.test(`${e?.status ?? ''} ${e?.code ?? ''} ${e?.message ?? ''}`);
const THROTTLE_BACKOFF_MS = [2_000, 5_000, 10_000];

/**
 * One JSON-mode call through the repo's GeminiProvider. Returns the parsed object and its cost.
 * The provider's own retry is short; a throttle gets a longer, spaced second chance here.
 */
export async function callJson(
  prompt: string,
  system: string,
  opts: { userId: string; operation: string; sleep?: (ms: number) => Promise<void> },
): Promise<{ json: any; usage: ModelUsage }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GeminiProvider } = require('../../../services/ai/gemini.provider');
  const provider = new GeminiProvider(GROUNDING_MODEL);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let res: any;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await provider.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }], system, {
        userId: opts.userId,
        operation: opts.operation,
        temperature: 0.3,
        responseJson: true,
      });
      break;
    } catch (e) {
      if (!isThrottle(e) || attempt >= THROTTLE_BACKOFF_MS.length) throw e;
      await sleep(THROTTLE_BACKOFF_MS[attempt] + Math.floor(Math.random() * 500));
    }
  }
  const inTok = Number(res?.usage?.promptTokens ?? 0);
  const outTok = Number(res?.usage?.completionTokens ?? 0);
  const usage = { tokens: inTok + outTok, costUsd: (inTok * PRICE_IN + outTok * PRICE_OUT) / 1_000_000 };
  let text = String(res?.reply ?? '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.search(/[[{]/);
  if (start > 0) text = text.slice(start);
  try {
    return { json: JSON.parse(text), usage };
  } catch {
    return { json: null, usage };
  }
}

/**
 * Sections grouped into a few model calls — at most `maxChars` of passage text and `maxItems` items
 * asked for per call — so a 17-section chapter costs four or five requests, not seventeen, and the
 * instructions are paid for once per batch. Chapter order is kept.
 */
export function batchSections<T extends { section: SourceSection; count: number }>(items: T[], maxChars = 12_000, maxItems = 14): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let chars = 0;
  let asked = 0;
  for (const item of items) {
    const size = item.section.text.length;
    if (current.length && (chars + size > maxChars || asked + item.count > maxItems)) {
      batches.push(current);
      current = [];
      chars = 0;
      asked = 0;
    }
    current.push(item);
    chars += size;
    asked += item.count;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** The section whose own text holds a quote — the question's real topic, whatever label it came with. */
export function sectionOfEvidence(sections: SourceSection[], evidence: string): SourceSection | undefined {
  const ev = evidenceKey(evidence);
  if (ev.length < MIN_EVIDENCE_KEY) return undefined;
  return sections.find((s) => evidenceKey(s.text).includes(ev));
}

/** Runs `tasks` with at most `limit` in flight — a few sections at a time, not all at once. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

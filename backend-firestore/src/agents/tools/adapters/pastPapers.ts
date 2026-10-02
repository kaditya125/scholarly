/**
 * What may be shown to a student as a past-year question. Shared by PYQ practice and by the
 * past-year portion of a question set, so the two can never disagree.
 *
 * The labels on a record are not enough. Measured 26 Sep 2026:
 *   - ~4,000 template questions carry TIER_A_OFFICIAL / OFFICIAL_CONFIRMED (origin 'template');
 *   - SSC CGL's "authentic" import is a community transcription whose own records say its answers
 *     were never checked against an SSC-published key;
 *   - 2,815 JEE Main records labelled authentic, tier-A and officially confirmed answer (A) to
 *     2,239 of their 2,241 lettered questions. The real JEE Main import (8,220) spreads its answers
 *     evenly across A–D. Machine-written questions, labelled as real papers.
 * So besides the labels, each source (one paper sitting) is judged by its own answer key: a real
 * exam's key is spread across the options, and one nearly all a single letter is not a real paper.
 */

const pyqRepo = () => require('../../../repositories/pyq.repository').pyqRepository;

/**
 * Why a question may NOT be presented as a past-year question, or null when its labels allow it:
 * an authentic import of a real paper, in the official bucket, neither archived nor quarantined,
 * answer confirmed against the official key from a tier-A source, four options.
 */
export function provenanceRefusal(q: any): string | null {
  if (q?.origin === 'template') return 'template';
  if (q?.ingestionState === 'ARCHIVED_DUPLICATE') return 'archived_duplicate';
  if (q?.ingestionState === 'QUARANTINED') return 'quarantined';
  if (q?.origin !== 'authentic_import' || q?.corpusBucket !== 'OFFICIAL_PYQ') return 'unverified_provenance';
  if (q?.verificationStatus !== 'OFFICIAL_CONFIRMED' || q?.sourceType !== 'TIER_A_OFFICIAL') return 'answers_not_officially_verified';
  if (!Array.isArray(q?.options) || q.options.length !== 4 || !q?.questionText) return 'not_multiple_choice';
  return null;
}

/** Past-year questions whose labels allow calling them past-year questions. */
export function hasRealProvenance(q: any): boolean {
  return provenanceRefusal(q) === null;
}

/** The official answer as an option index, or -1 when the record has none (then: no key, no answer). */
export function answerIndex(q: any): number {
  const a = String(q?.correctAnswer ?? '').trim();
  if (/^[A-D]$/i.test(a)) return a.toUpperCase().charCodeAt(0) - 65;
  return (q?.options ?? []).findIndex((o: string) => String(o).trim().toLowerCase() === a.toLowerCase());
}

// ── Markup ──────────────────────────────────────────────────────────────────────────────────────

// Only real HTML tags, attributes in name="value" form: "a<b and c>d" in a physics question is not markup.
const TAG_NAMES = 'p|br|div|span|b|i|u|strong|em|small|big|font|center|hr|table|thead|tbody|tr|td|th|ul|ol|li';
const TAGS = new RegExp(`</?(?:${TAG_NAMES})(?:\\s+[a-z-]+\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))*\\s*/?>`, 'gi');
const BREAKS = /<br\s*\/?>|<\/(?:p|div|li|tr)>/gi;

/**
 * Imported questions carry some HTML. Plain text keeps the maths (`$…$` is rendered as LaTeX by
 * the quiz player): superscripts become ^, subscripts read inline (H2O), images are dropped.
 */
export function plainText(html: unknown): string {
  return String(html ?? '')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<sup>([^<]*)<\/sup>/gi, (_m, s: string) => (s.trim().length > 1 ? `^(${s.trim()})` : `^${s.trim()}`))
    .replace(/<sub>([^<]*)<\/sub>/gi, (_m, s: string) => s.trim())
    .replace(BREAKS, '\n')
    .replace(TAGS, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim();
}

/** A question that depends on a picture the quiz can't show: an image, or a figure it refers to. */
export function needsFigure(q: any): boolean {
  const parts = [String(q?.questionText ?? ''), ...(Array.isArray(q?.options) ? q.options.map(String) : [])];
  if (parts.some((p) => /<img\b/i.test(p))) return true;
  const text = parts[0].replace(/significant\s+figures?/gi, ' ');
  return /\b(figure|fig\.|diagram|graph)\b/i.test(text);
}

/** Two records of the same question compare equal: markup, case and punctuation ignored. */
export function textKey(text: unknown): string {
  return plainText(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 200);
}

// ── Answer-key plausibility ─────────────────────────────────────────────────────────────────────

const JUDGE_MIN = 12;
const JUDGE_MAX_SHARE = 0.75;
const VERDICT_TTL_MS = 6 * 60 * 60 * 1000;

export type SourceVerdict = 'plausible' | 'implausible' | 'unchecked';

/**
 * From a source's lettered answers: nearly all one letter → implausible. At 12 real questions the
 * chance of 9+ sharing a letter is about 1 in 700; at 20, about 1 in 100,000.
 */
export function answerKeyVerdict(rows: any[]): SourceVerdict {
  const counts = [0, 0, 0, 0];
  for (const q of rows) {
    const k = answerIndex(q);
    if (k >= 0 && k <= 3) counts[k]++;
  }
  const n = counts[0] + counts[1] + counts[2] + counts[3];
  if (n < JUDGE_MIN) return 'unchecked';
  return Math.max(...counts) / n >= JUDGE_MAX_SHARE ? 'implausible' : 'plausible';
}

export const sourceKey = (q: any): string => String(q?.sourceId || `${q?.examId}|${q?.year}|${q?.shift}`);

const verdicts = new Map<string, { verdict: SourceVerdict; at: number }>();

/** For tests: forget cached verdicts. */
export function clearSourceVerdicts(): void {
  verdicts.clear();
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * A verdict for the source of every question in `candidates`. Judged from `context` (everything
 * fetched) when that holds enough of the source's questions; otherwise from the source's whole
 * sitting, looked up — at most `maxLookups` sittings, the rest 'unchecked'.
 */
export async function judgeSources(candidates: any[], context: any[], maxLookups = 8): Promise<Map<string, SourceVerdict>> {
  const wanted = new Map<string, any>();
  for (const q of candidates) if (!wanted.has(sourceKey(q))) wanted.set(sourceKey(q), q);
  const bySource = new Map<string, any[]>();
  for (const q of context) {
    const k = sourceKey(q);
    if (!wanted.has(k)) continue;
    const list = bySource.get(k);
    if (list) list.push(q);
    else bySource.set(k, [q]);
  }
  const out = new Map<string, SourceVerdict>();
  const remember = (k: string, v: SourceVerdict) => {
    out.set(k, v);
    if (v !== 'unchecked') verdicts.set(k, { verdict: v, at: Date.now() });
  };
  const lookups: Array<[string, any]> = [];
  for (const [k, q] of wanted) {
    const cached = verdicts.get(k);
    if (cached && Date.now() - cached.at < VERDICT_TTL_MS) {
      out.set(k, cached.verdict);
      continue;
    }
    const v = answerKeyVerdict(bySource.get(k) ?? []);
    if (v !== 'unchecked') remember(k, v);
    else if (q?.examId && q?.year && q?.shift && lookups.length < maxLookups) lookups.push([k, q]);
    else out.set(k, 'unchecked');
  }
  await mapLimit(lookups, 4, async ([k, q]) => {
    const sitting: any[] = await pyqRepo()
      .listQuestions({ examId: q.examId, year: q.year, shift: q.shift, limit: 300 })
      .catch(() => []);
    remember(k, answerKeyVerdict(sitting.filter((r) => sourceKey(r) === k)));
  });
  return out;
}

// ── Screening ───────────────────────────────────────────────────────────────────────────────────

export interface ScreenResult {
  usable: any[];
  /** Why the rest were refused, by reason. */
  excluded: Record<string, number>;
}

/**
 * Keeps the questions that may be shown as past-year questions, in their original order, and
 * counts the rest by why: labels first, then an official answer, a figure the quiz can't show, the
 * topic asked for, the source's answer key, and repeats of a question already kept.
 */
export async function screenPastQuestions(rows: any[], opts: { onTopic?: (q: any) => boolean; maxLookups?: number } = {}): Promise<ScreenResult> {
  const excluded: Record<string, number> = {};
  const count = (k: string) => (excluded[k] = (excluded[k] ?? 0) + 1);
  const candidates: any[] = [];
  for (const q of rows) {
    const refusal = provenanceRefusal(q);
    if (refusal) count(refusal);
    else if (answerIndex(q) < 0 || answerIndex(q) > 3) count('no_answer_key');
    else if (needsFigure(q)) count('needs_figure');
    else if (opts.onTopic && !opts.onTopic(q)) count('other_topics');
    else candidates.push(q);
  }
  const verdictOf = await judgeSources(candidates, rows, opts.maxLookups);
  const seen = new Set<string>();
  const usable: any[] = [];
  for (const q of candidates) {
    const verdict = verdictOf.get(sourceKey(q)) ?? 'unchecked';
    if (verdict === 'implausible') count('implausible_answer_key');
    else if (verdict === 'unchecked') count('answer_key_unchecked');
    else if (seen.has(textKey(q.questionText))) count('duplicate');
    else {
      seen.add(textKey(q.questionText));
      usable.push(q);
    }
  }
  return { usable, excluded };
}

/** How each refusal reason reads in a summary: "Not used: 36 practice templates stamped as …". */
export const REFUSAL_TEXT: Record<string, string> = {
  template: 'practice templates stamped as official papers',
  unverified_provenance: 'without a verified source',
  answers_not_officially_verified: 'whose answers were never checked against the official key',
  not_multiple_choice: 'not four-option multiple choice',
  archived_duplicate: 'archived duplicates',
  quarantined: 'quarantined',
  no_answer_key: 'without an official answer',
  needs_figure: 'that need a figure the quiz can’t show',
  implausible_answer_key: 'from sources whose answer key is almost all one letter (machine-written, not real papers)',
  answer_key_unchecked: 'from sources too small to check',
  duplicate: 'repeats',
  other_topics: 'on other topics',
};

export function refusalSummary(excluded: Record<string, number> | undefined): string {
  const entries = Object.entries(excluded ?? {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return entries.map(([k, n]) => `${n} ${REFUSAL_TEXT[k] ?? k.replace(/_/g, ' ')}`).join(', ');
}

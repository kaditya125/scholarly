/**
 * Book question parser — turns a reference book's OCR'd pages into its exercise MCQs, each paired
 * with the book's own answer key (and worked solution when the book prints one).
 *
 * Pure functions over OCR markdown: no I/O, no model calls, so it is unit-testable on fixtures and
 * deterministic across re-runs (the ingestion job relies on that for idempotent ids).
 *
 * Layouts handled (measured on S. Chand Quantitative Aptitude and Verbal & Non-Verbal Reasoning):
 *   - one EXERCISE numbered 1..N, then an ANSWERS table ("1. (c) | 2. (d) | …"), then SOLUTIONS;
 *   - several EXERCISE sets (3A, 3B, …), each followed by ANSWERS written inline as
 *     "n. (x): explanation" (optionally bold "**n.** (x):").
 * Questions are anchored on SEQUENTIAL numbering within a set, so a stray "12." inside a stem or an
 * explanation can never start a question. Anything that can't be parsed cleanly is returned with a
 * quarantine reason rather than dropped — the ingestion job stores it as QUARANTINED.
 */
import { createHash } from 'crypto';

export const EXTRACTION_VERSION = 'bookextract-v1.1'; // v1.1: two-column recovery (recoverByNumber), duplicate_options quarantine, single-page re-OCR of truncated slices

export interface OcrPage {
  pdfPageStart: number;
  pdfPageEnd: number;
  markdown: string;
}

export type QuarantineReason =
  | 'needs_figure'
  | 'options_incomplete'
  | 'empty_stem'
  | 'no_answer_key'
  | 'answer_not_in_options'
  | 'empty_option'
  | 'answer_key_mismatch'
  | 'oversize_text'
  | 'answer_mismatch'
  | 'duplicate_options'
  | 'references_other_question';

export interface ParsedBookQuestion {
  chapterName: string;
  /** 1-based order of the chapter in the book — disambiguates repeated names (a Verbal and a
   *  Non-Verbal "Analogy"). */
  chapterOrdinal: number;
  sourceSection: string;
  /** 1-based position of this exercise set within the chapter — two sets can share a label
   *  ("EXERCISE" twice, each restarting at 1), so the label alone isn't an identity. */
  sourceSectionIndex: number;
  questionNumber: number;
  /** Printed book page the question starts on, when the OCR carries it. */
  sourcePage?: number;
  stem: string;
  options: string[];
  answerKey?: string;
  answerIndex?: number;
  solution?: string;
  /** The book's solution ran past FIELD_LIMITS.solution and was cut (a parse bleed at a section end). */
  solutionTruncated?: boolean;
  sharedDirections?: string;
  /** True when the options came from the set's directions (fixed-choice formats), not the question. */
  optionsFromDirections?: boolean;
  examTag?: string;
  /** English exercises: the exercise type, its instruction, and the book's answer when it is text
   *  rather than an option (fill-in word, corrected sentence). Absent for option-based MCQs. */
  format?: 'ERROR_SPOTTING' | 'FILL_BLANK' | 'SENTENCE_CORRECTION' | 'TRANSFORMATION';
  instruction?: string;
  answerText?: string;
  quarantineReason?: QuarantineReason;
  /** sha256 of the normalised stem + options — stable identity for dedupe and takedown. */
  originalQuestionHash: string;
}

export interface ParseOptions {
  /** Whitelist of this book's chapter names (contract.ts `chapterHeading`). */
  chapterHeading: RegExp;
  /** Running page headers to drop, e.g. /^(QUANTITATIVE APTITUDE|Reasoning)$/i. */
  runningHeader?: RegExp;
  /**
   * 'exercise' (default): questions live under EXERCISE headings inside chapters.
   * 'answer-blocks': a run of questions 1..N is followed by an "Answers" block, with no EXERCISE
   * heading and section headings scattered through the run (Lucent's General Science). Each block
   * becomes one set, named after the nearest `partHeading` above it.
   */
  layout?: 'exercise' | 'answer-blocks' | 'english-exercises';
  /** For 'answer-blocks': the book's top-level parts, e.g. /^(Physics|Chemistry|Biology)$/. */
  partHeading?: RegExp;
  /**
   * The chapters of the previous ingestion, in order. A chapter found again keeps its ordinal (which
   * question ids, taxonomies and syllabus mappings are keyed on); a newly detected chapter gets the
   * next free ordinal instead of shifting every chapter after it.
   */
  previousChapters?: { name: string; ordinal: number }[];
  /** A heading repeating one of the previous two chapters continues it (S. Chand Quant's stray
   *  "Volume" sub-heading inside Volume And Surface Areas). Off by default. */
  mergeRecentRepeats?: boolean;
}

const PAGE = (n: number) => `\u0001P${n}\u0001`;
const PAGE_RE = /\u0001P(\d+)\u0001/g;
const stripPages = (s: string) => s.replace(PAGE_RE, ' ');
const squash = (s: string) => stripPages(s).replace(/\s+/g, ' ').trim();

/** OCR clean-up shared by every layout. */
export function cleanMarkdown(md: string, runningHeader?: RegExp): string {
  let t = md
    .replace(/<!--\s*book-page:\s*(\d+)\s*-->/g, (_, n) => `\n${PAGE(Number(n))}\n`)
    .replace(/<!--.*?-->/gs, '\n')
    .replace(/\*\*/g, '')
    // OCR reads option "(a)" as Greek alpha / accented a on some pages.
    .replace(/\((?:α|à|á|ạ)\)/g, '(a)');
  return t
    .split('\n')
    .filter((ln) => {
      const s = ln.trim();
      if (/^\d{1,4}$/.test(s)) return false; // bare printed page number
      if (runningHeader && runningHeader.test(s.replace(/^#+\s*/, ''))) return false;
      return true;
    })
    .join('\n');
}

const headingText = (line: string) => line.replace(/^[#>\s]*/, '').replace(/\s+$/, '');

/** Title-case display name from a matched heading ("3. SERIES COMPLETION" → "Series Completion"). */
function displayName(heading: string): string {
  return heading
    .replace(/^\d{1,2}[.)]?\s*/, '')
    // "Statement — Arguments" / "Statement - Arguments" / "STATEMENT – ARGUMENTS" are one chapter.
    .replace(/\s+[-–—]\s+/g, ' - ')
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Split the book into chapters on whitelisted chapter headings. A heading only switches chapter
 * when it's formatted like one (markdown heading, numbered, or ALL CAPS) — a chapter name that
 * merely appears as a sentence elsewhere doesn't. Running headers repeating the current chapter
 * are no-ops.
 */
export function segmentChapters(pages: OcrPage[], opts: ParseOptions): { name: string; ordinal: number; text: string }[] {
  const chapters: { name: string; ordinal: number; lines: string[] }[] = [];
  let current: { name: string; ordinal: number; lines: string[] } | null = null;

  for (const page of pages) {
    for (const raw of cleanMarkdown(page.markdown, opts.runningHeader).split('\n')) {
      const h = headingText(raw);
      const looksLikeHeading = /^#/.test(raw.trim()) || /^\d{1,2}[.)]?\s+\S/.test(h) || (h.length > 3 && h === h.toUpperCase() && /[A-Z]/.test(h));
      if (h && h.length <= 70 && looksLikeHeading && opts.chapterHeading.test(h)) {
        const name = displayName(h);
        if (current && sameChapter(current.name, name)) continue;
        // A heading repeating one of the last two chapters ("Volume And Surface Areas" after a stray
        // "Volume" sub-heading, "Bar Graphs" / "Bar Graph") continues that chapter.
        // Opt-in: books like Lucent English legitimately repeat a heading two chapters apart.
        const back = opts.mergeRecentRepeats ? chapters.slice(-3, -1).reverse().find((c) => sameChapter(c.name, name)) : undefined;
        if (back) { current = back; continue; }
        current = { name, ordinal: chapters.length + 1, lines: [] };
        chapters.push(current);
        continue;
      }
      if (current) current.lines.push(raw);
    }
  }
  assignStableOrdinals(chapters, opts.previousChapters);
  return chapters.map((c) => ({ name: c.name, ordinal: c.ordinal, text: c.lines.join('\n') }));
}

const chapterKey = (name: string) => name.toLowerCase().replace(/&/g, ' and ').replace(/s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sameChapter = (a: string, b: string) => chapterKey(a) === chapterKey(b);

/** See ParseOptions.previousChapters. Repeated names (a verbal and a non-verbal "Analogy") pair up in order. */
function assignStableOrdinals(chapters: { name: string; ordinal: number }[], previous?: { name: string; ordinal: number }[]): void {
  if (!previous?.length) return;
  const pool = [...previous].sort((a, b) => a.ordinal - b.ordinal);
  let next = Math.max(...pool.map((p) => p.ordinal)) + 1;
  for (const c of chapters) {
    const i = pool.findIndex((p) => sameChapter(p.name, c.name));
    c.ordinal = i >= 0 ? pool.splice(i, 1)[0].ordinal : next++;
  }
}

const MARK = /^[ \t]*(?:#+[ \t]*)?(EXERCISE\b[^\n]*|ANSWERS[ \t]*|(?:HINTS[ \t]*(?:&|AND)[ \t]*)?SOLUTIONS[ \t]*|TYPE[ \t]*\d+[ \t]*:[^\n]*)[ \t]*$/gm;
const TAG = /\[([^\]]{3,120})\]|\(((?:[A-Z][A-Za-z.&]*\s*){1,6}(?:\([^)]*\))?[^()]{0,40}?(?:19|20)\d{2})\)/;
const TAG_G = new RegExp(TAG.source, 'g');
// A real directions block: "Directions:" / "Directions (Questions 5 to 9):" / "Direction —". A line
// merely starting with the word ("Direction of current is …") is question text, not directions.
const DIRECTIONS = /\n\s*Directions?\s*(?:\([^)\n]{0,60}\))?\s*[:—–-][\s\S]*$/i;

/** "(Questions 54–57)", "(Q. 1 to 5)", "(Qs. 6-10)", "(Question Nos. 11–15)" at the head of a directions block. */
const DIRECTIONS_RANGE = /\bQ(?:uestions?|s)?\.?\s*(?:Nos?\.?\s*)?(\d{1,3})\s*(?:[-–—]|to)\s*(\d{1,3})\b/i;
/** A stem that depends on another question: "For Q. 92, …", "shown in Q. 162", "the above question". */
const CROSS_REFERENCE = /\b(?:for|in|from|of|see|refer(?:ring)? to)\s+(?:the\s+)?(?:Q\.?|Qs\.?|question)\s*(?:no\.?\s*)?\d{1,3}\b|\b(?:previous|preceding|above|last)\s+question\b|\bQ\.\s*\d{1,3}\b/i;

/** Past these, a field means the parser bled into surrounding text — not a real question. */
export const FIELD_LIMITS = { stem: 1500, option: 300, solution: 3000, directions: 2000 };
const FIGURE = /!\[|\bfollowing (?:figure|diagram)\b|\bgiven (?:figure|diagram)\b|\bas shown\b/i;

/**
 * Sequentially-numbered blocks: 1., 2., 3., … (a "7." that isn't the next expected number is text).
 * `maxGap` tolerates OCR losing a few question numbers (e.g. 99 → 101); 0 = strict.
 */
export function splitSequential(body: string, maxGap = 0): Map<number, { text: string; offset: number }> {
  const re = /^[ \t>*-]*(\d{1,3})\.\s/gm;
  const picked: { pos: number; n: number }[] = [];
  let expect = 1;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const n = Number(m[1]);
    if (n === expect || (maxGap > 0 && picked.length > 0 && n > expect && n <= expect + maxGap)) { picked.push({ pos: m.index, n }); expect = n + 1; }
  }
  const out = new Map<number, { text: string; offset: number }>();
  picked.forEach((p, i) => {
    const end = i + 1 < picked.length ? picked[i + 1].pos : body.length;
    out.set(p.n, { text: body.slice(p.pos, end).replace(/^[ \t>*-]*\d{1,3}\.\s/, '').trim(), offset: p.pos });
  });
  return out;
}

/**
 * Two-column pages are OCR'd with their columns interleaved, so question numbers don't run in
 * order in the text ("20. … except" is followed by 9. and 10. from the other column). The
 * sequential pass stops there. This adds, for every number it missed, the block that starts with
 * that number — anywhere in the text — provided it has a real stem and all four options (a)–(d);
 * among several candidates for one number, the most complete wins. Never replaces a number the
 * sequential pass found, so its guarantees stand.
 */
export function recoverByNumber(body: string, found: Map<number, { text: string; offset: number }>, maxNumber: number): Map<number, { text: string; offset: number }> {
  const starts = [...body.matchAll(/^[ \t>*-]*(\d{1,3})\.\s/gm)].map((m) => ({ pos: m.index!, n: Number(m[1]) }));
  const out = new Map(found);
  const best = new Map<number, { text: string; offset: number; score: number }>();
  starts.forEach((s, k) => {
    if (s.n < 1 || s.n > maxNumber || found.has(s.n)) return;
    const text = body.slice(s.pos, starts[k + 1]?.pos ?? body.length).replace(/^[ \t>*-]*\d{1,3}\.\s/, '').trim();
    const stem = text.split(/\(a\)/)[0];
    const hasAll = ['a', 'b', 'c', 'd'].every((l) => new RegExp(`\\(${l}\\)`).test(text));
    if (!hasAll || stem.replace(/\s+/g, ' ').trim().length < 8) return;
    const score = stem.length + (/\(e\)/.test(text) ? 1 : 0);
    const prev = best.get(s.n);
    if (!prev || score > prev.score) best.set(s.n, { text, offset: s.pos, score });
  });
  for (const [n, b] of best) out.set(n, { text: b.text, offset: b.offset });
  return new Map([...out.entries()].sort((a, b) => a[0] - b[0]));
}

function lastPageBefore(text: string, offset: number): number | undefined {
  let page: number | undefined;
  PAGE_RE.lastIndex = 0;
  for (let m = PAGE_RE.exec(text); m && m.index <= offset; m = PAGE_RE.exec(text)) page = Number(m[1]);
  return page;
}

export function hashQuestion(stem: string, options: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return createHash('sha256').update([norm(stem), ...options.map(norm)].join('|')).digest('hex');
}

/** Parse one chapter's text into its exercise questions. */
export function parseChapter(chapter: { name: string; ordinal: number; text: string; maxGap?: number; keyMismatch?: boolean }): ParsedBookQuestion[] {
  const text = chapter.text;
  const marks: { start: number; end: number; label: string }[] = [];
  MARK.lastIndex = 0;
  for (let m = MARK.exec(text); m; m = MARK.exec(text)) marks.push({ start: m.index, end: m.index + m[0].length, label: m[1].trim() });
  const section = (i: number) => ({ body: text.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : text.length), base: marks[i].end });
  const isAnswers = (l: string) => /^(ANSWERS|(?:HINTS.*)?SOLUTIONS)/i.test(l);

  const out: ParsedBookQuestion[] = [];
  let setIndex = 0;
  marks.forEach((mark, si) => {
    if (!/^EXERCISE/i.test(mark.label)) return;
    setIndex++;
    const { body, base } = section(si);
    let questions = splitSequential(body, chapter.maxGap ?? 0);
    // The set's preamble ends where the in-order run starts (a recovered Q1 could sit anywhere).
    const firstOffset = questions.size ? [...questions.values()][0].offset : body.length;

    // This set's answers: the first ANSWERS/SOLUTIONS mark after it.
    const key = new Map<number, string>();
    const expl = new Map<number, string>();
    const ai = marks.findIndex((m, k) => k > si && isAnswers(m.label));
    if (ai >= 0 && !marks.slice(si + 1, ai).some((m) => /^EXERCISE/i.test(m.label))) {
      const a = section(ai).body;
      for (const m of a.matchAll(/(\d{1,3})\.\s*\(([a-e])\)/g)) if (!key.has(Number(m[1]))) key.set(Number(m[1]), m[2]);
      for (const [n, blk] of splitSequential(a, chapter.maxGap ?? 0)) {
        const m = blk.text.match(/^\(([a-e])\)\s*:?\s*([\s\S]*)$/);
        // In the table layout ("1. (c) | 2. (d) | …") the text after a key is more keys, not an
        // explanation — taking it would also block the real SOLUTIONS entry for that number.
        if (m && m[2].trim().length > 3 && !/\d{1,3}\.\s*\([a-e]\)/.test(m[2])) expl.set(n, squash(m[2]));
      }
      // Separate SOLUTIONS section after an ANSWERS table (Quant layout).
      if (ai + 1 < marks.length && /SOLUTIONS/i.test(marks[ai + 1].label)) {
        for (const [n, blk] of splitSequential(section(ai + 1).body)) if (!expl.has(n)) expl.set(n, squash(blk.text));
      }
    }
    // Two-column pages: recover questions the in-order pass lost, up to the key's last number.
    if (key.size) questions = recoverByNumber(body, questions, Math.max(...key.keys()));

    // Directions carry FORWARD: a block printed before question 1 (the set's preamble) or cut from
    // the end of a question applies to every following question until the next one. Formats like
    // syllogisms and assertion–reason print their fixed answer choices only there, so questions
    // with no options of their own inherit that choice list.
    const preamble = body.slice(0, firstOffset).match(/Directions?\s*(?:\([^)\n]{0,60}\))?\s*[:—–-][\s\S]*/i);
    // An implausibly long "directions" block is surrounding text the parser swallowed — drop it
    // rather than carry it onto every following question.
    const sane = (d: string | undefined) => (d && d.length <= FIELD_LIMITS.directions ? d : undefined);
    // Directions that name their questions ("Directions (Questions 54–57):") cover only that range;
    // after it, questions fall back to the set's general directions instead of inheriting a puzzle
    // or chart that isn't theirs.
    let general: string | undefined;
    let ranged: { text: string; from: number; to: number } | undefined;
    const setDirections = (d: string | undefined) => {
      if (!d) return;
      const r = d.slice(0, 120).match(DIRECTIONS_RANGE);
      if (r && Number(r[1]) <= Number(r[2])) ranged = { text: d, from: Number(r[1]), to: Number(r[2]) };
      else { general = d; ranged = undefined; }
    };
    setDirections(sane(preamble ? squash(preamble[0]) : undefined));

    for (const [n, q] of questions) {
      let block = q.text;
      if (ranged && n > ranged.to) ranged = undefined;
      const directions = ranged && n >= ranged.from ? ranged.text : general;
      const d = block.match(DIRECTIONS);
      if (d && d.index !== undefined) { setDirections(sane(squash(d[0]))); block = block.slice(0, d.index); }
      const tagM = block.match(TAG);
      const parts = block.replace(TAG_G, ' ').split(/\(([a-e])\)/);
      const stem = squash(parts[0]);
      const opts = new Map<string, string>();
      for (let k = 1; k < parts.length - 1; k += 2) if (!opts.has(parts[k])) opts.set(parts[k], squash(parts[k + 1]).replace(/^[|*\-\s]+|[|*\-\s]+$/g, ''));
      const inherit = opts.size === 0 && !!directions;
      if (inherit && directions) {
        const dp = directions.split(/\(([a-e])\)/);
        for (let k = 1; k < dp.length - 1; k += 2) if (!opts.has(dp[k])) opts.set(dp[k], squash(dp[k + 1]).replace(/^[|*\-\s:;,.]+|[|*\-\s;,]+$/g, ''));
      }
      const letters = [...opts.keys()].sort().join('');
      const options = [...opts.keys()].sort().map((l) => opts.get(l)!);
      const answerKey = key.get(n);
      const answerIndex = answerKey ? [...opts.keys()].sort().indexOf(answerKey) : -1;

      let quarantineReason: QuarantineReason | undefined;
      if (chapter.keyMismatch) quarantineReason = 'answer_key_mismatch';
      else if (stem.length > FIELD_LIMITS.stem || options.some((o) => o.length > FIELD_LIMITS.option)) quarantineReason = 'oversize_text';
      else if (FIGURE.test(block)) quarantineReason = 'needs_figure';
      else if (letters !== 'abcd' && letters !== 'abcde') quarantineReason = 'options_incomplete';
      else if (stem.length < 4 && !options.some((o) => o.length > 1)) quarantineReason = 'empty_stem';
      else if (!answerKey) quarantineReason = 'no_answer_key';
      else if (answerIndex < 0) quarantineReason = 'answer_not_in_options';
      else if (options.some((o) => !o)) quarantineReason = 'empty_option';
      // OCR dropping signs turns "−3, −1, 1, 3" into "3, 1, 1, 3": an ambiguous item, not a seed.
      else if (new Set(options.map((o) => o.toLowerCase().replace(/\s+/g, ''))).size < options.length) quarantineReason = 'duplicate_options';
      // "For Q. 92, …" / "the above question" can't stand alone as a seed.
      else if (CROSS_REFERENCE.test(stem)) quarantineReason = 'references_other_question';

      out.push({
        chapterName: chapter.name,
        chapterOrdinal: chapter.ordinal,
        sourceSection: mark.label,
        sourceSectionIndex: setIndex,
        questionNumber: n,
        sourcePage: lastPageBefore(text, base + q.offset),
        // A bled record is kept (for audit) but not with pages of runaway text in it.
        stem: quarantineReason === 'oversize_text' ? stem.slice(0, FIELD_LIMITS.stem) : stem,
        options: quarantineReason === 'oversize_text' ? options.map((o) => o.slice(0, FIELD_LIMITS.option)) : options,
        answerKey,
        answerIndex: answerIndex >= 0 ? answerIndex : undefined,
        // The last solution in a chapter can run on into whatever follows; keep the useful start.
        solution: expl.get(n)?.slice(0, FIELD_LIMITS.solution),
        solutionTruncated: (expl.get(n)?.length ?? 0) > FIELD_LIMITS.solution ? true : undefined,
        sharedDirections: directions,
        optionsFromDirections: inherit && options.length > 0 ? true : undefined,
        examTag: tagM ? (tagM[1] || tagM[2]).replace(/\s+/g, ' ').trim() : undefined,
        quarantineReason,
        originalQuestionHash: hashQuestion(stem, options),
      });
    }
  });
  return out;
}

/**
 * 'answer-blocks' layout → synthetic chapters, one per Answers block, each shaped as
 * "EXERCISE / questions / ANSWERS / key" so parseChapter handles it unchanged.
 */
/** Answer-block books are long unbroken runs where OCR sometimes drops a question number. */
const ANSWER_BLOCK_GAP = 3;

export function segmentAnswerBlocks(pages: OcrPage[], opts: ParseOptions): { name: string; ordinal: number; text: string; maxGap?: number; keyMismatch?: boolean }[] {
  const text = pages.map((p) => cleanMarkdown(p.markdown, opts.runningHeader)).join('\n');
  const answers = [...text.matchAll(/^[ \t]*#*[ \t]*Answers?\b[^\n]*$/gim)].map((m) => ({ start: m.index!, end: m.index! + m[0].length }));
  const out: { name: string; ordinal: number; text: string; maxGap?: number; keyMismatch?: boolean }[] = [];
  let from = 0;
  answers.forEach((a, k) => {
    const region = text.slice(from, a.start);
    // The run is the LAST line-start "1." whose first item carries options — earlier "1."s in the
    // region are prose lists from the reading sections.
    // The question run is the LONGEST sequential run starting at a "1." whose first item has
    // options — the other "1."s are numbered statements inside individual questions.
    // A key table ("1. (c) 2. (c) …") also has "(a)"-style text; a real question has a stem first.
    // Its FIRST item must itself carry options, so a prose list ("1. Light is fast 2. …") can't
    // chain into the questions that follow it.
    const ones = [...region.matchAll(/^[ \t>*-]*1\.\s/gm)].map((m) => m.index!)
      .filter((i) => /^[ \t>*-]*1\.\s+[^(\n]{10,}/.test(region.slice(i, i + 200)) && /\(a\)/.test(splitSequential(region.slice(i), ANSWER_BLOCK_GAP).get(1)?.text || ''));
    const start = ones.map((i) => ({ i, len: splitSequential(region.slice(i), ANSWER_BLOCK_GAP).size })).sort((x, y) => y.len - x.len)[0]?.i;
    // The key: pairs right after the heading, up to the next markdown heading (or a sane cap).
    const after = text.slice(a.end, answers[k + 1]?.start ?? text.length);
    const keyEnd = after.search(/^[ \t]*#/m);
    const keyText = after.slice(0, keyEnd > 0 ? Math.min(keyEnd, 8000) : 8000);
    if (start !== undefined) {
      const before = text.slice(0, from + start);
      const parts = opts.partHeading ? [...before.split('\n')].map(headingText).filter((l) => opts.partHeading!.test(l)) : [];
      const name = parts.length ? displayName(parts[parts.length - 1]) : `Question set ${out.length + 1}`;
      // Headings inside the run are page/section headers, not question text — drop them so they
      // don't get glued onto the previous question's last option.
      const run = region.slice(start).replace(/^[ \t]*#.*$/gm, '');
      // A key is only trusted for the run it was printed for: if the key's highest number is far
      // from the run's length, the run we found isn't the keyed one (OCR broke its numbering), and
      // pairing by number would store wrong answers. Quarantine the set instead.
      const runSize = splitSequential(region.slice(start), ANSWER_BLOCK_GAP).size;
      const keyMax = Math.max(0, ...[...keyText.matchAll(/(\d{1,3})\.\s*\(?[a-e]\)/g)].map((m) => Number(m[1])));
      // A SHORTER run is still the keyed set's own start (1..n align with key 1..n) when no part
      // heading separates it from the Answers block; one that sits in a different part isn't.
      // (Pages repeat their own part as a running heading — only a DIFFERENT part counts.)
      const partBetween = !!opts.partHeading && region.slice(start).split('\n').map(headingText)
        .some((l) => opts.partHeading!.test(l) && displayName(l).toLowerCase() !== name.toLowerCase());
      const keyMismatch = keyMax === 0 || runSize > keyMax * 1.2 || (runSize < keyMax * 0.8 && partBetween);
      out.push({ name, ordinal: out.length + 1, maxGap: ANSWER_BLOCK_GAP, keyMismatch, text: `EXERCISE\n${run}\nANSWERS\n${keyText}` });
    }
    from = a.end + (keyEnd > 0 ? keyEnd : 0);
  });
  return out;
}

/** Whole book → every exercise question, in book order. */
export function parseBook(pages: OcrPage[], opts: ParseOptions): { chapters: { name: string; ordinal: number }[]; questions: ParsedBookQuestion[] } {
  const chapters = opts.layout === 'answer-blocks' ? segmentAnswerBlocks(pages, opts) : segmentChapters(pages, opts);
  return {
    chapters: chapters.map(({ name, ordinal }) => ({ name, ordinal })),
    questions: chapters.flatMap((c) => parseChapter(c)),
  };
}

/**
 * English exercise parser (Lucent's English layout) for the private book bank.
 *
 * Unlike Quant/Reasoning, English exercises are mostly not option-based MCQs:
 *   "## Q.2. Find out the error part of the following sentences:"  — parts (1)…(4) + No error (5)
 *   "## Q.1. Fill in the blanks …"                                  — a blank, often "(was/were)"
 *   "Correct the following sentences:" / "Change into Passive Voice" — a rewritten sentence
 * and the answers come later under "Answers With Explanation", in a "### Q. N." sub-block per
 * exercise ("1. owns | 2. is" tables, or "1. (2) are की जगह is …" lines).
 *
 * Items become book questions with a `format`; option-less formats carry `answerText` instead of an
 * option index — they're private seeds only (variants are always generated as fresh MCQs later).
 */
import type { OcrPage, ParsedBookQuestion, ParseOptions, QuarantineReason } from './bookQuestionParser';
import { segmentChapters, splitSequential, hashQuestion, FIELD_LIMITS } from './bookQuestionParser';

export type EnglishFormat = 'ERROR_SPOTTING' | 'FILL_BLANK' | 'SENTENCE_CORRECTION' | 'TRANSFORMATION';

const Q_HEAD = /^[ \t]*#*[ \t]*Q\.?\s*(\d{1,2})\.?[ \t]*(.*)$/gm;
const ANSWERS_HEAD = /^[ \t]*#*[ \t]*Answers?\s+With\s+Explanation.*$/gim;
const squash = (s: string) => s.replace(/\u0001P\d+\u0001/g, ' ').replace(/\s+/g, ' ').trim();

export function detectFormat(instruction: string, items: string[]): EnglishFormat | null {
  const i = instruction.toLowerCase();
  const partsLike = items.filter((t) => /\(\s*1\s*\)/.test(t) && /\(\s*4\s*\)/.test(t)).length;
  if (/error part|find out the error|spot the error/.test(i) || (items.length > 0 && partsLike > items.length / 2)) return 'ERROR_SPOTTING';
  if (/fill in|fill up|blank/.test(i)) return 'FILL_BLANK';
  if (/correct the/.test(i)) return 'SENTENCE_CORRECTION';
  if (/change|combine|join|passive|active|indirect|direct speech|narration|do as directed|rewrite|transform/.test(i)) return 'TRANSFORMATION';
  return null;
}

/** "1. owns | 2. is" tables and "1. (2) are की जगह is …" lines → number → answer text. */
export function parseAnswerBlock(body: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const m of body.matchAll(/(?:^|\|)[ \t>*-]*(\d{1,3})\.\s*([^|\n]*)/gm)) {
    const n = Number(m[1]);
    const v = m[2].trim();
    if (v && !out.has(n)) out.set(n, v);
  }
  return out;
}

/** Share of the answer's words that also appear in the original sentence. */
export function wordOverlap(original: string, answer: string): number {
  const w = (s: string) => new Set(s.toLowerCase().match(/[a-z']+/g) || []);
  const a = w(answer), o = w(original);
  if (a.size === 0) return 0;
  let hit = 0;
  for (const x of a) if (o.has(x)) hit++;
  return hit / a.size;
}

/** Split "A (1)/ B (2)/ C (3)/ D (4)/ No error (5)" into its parts. */
export function errorParts(item: string): string[] {
  const segs = item.split(/\(\s*([1-5])\s*\)/);
  const parts: string[] = [];
  for (let k = 0; k < segs.length - 1; k += 2) parts.push(segs[k].replace(/^[\s/|]+|[\s/|]+$/g, '').trim());
  return parts;
}

/** One exercise + its answer block → its items as book questions. */
export function parseEnglishExercise(
  ex: { qn: number; instruction: string; body: string },
  answerBody: string,
  chapterName: string,
  chapterOrdinal: number,
  setIndex: number,
): ParsedBookQuestion[] {
  // The instruction is sometimes on the line after the "Q.N." heading.
  const firstLine = ex.body.split('\n').find((l) => l.trim()) || '';
  const instruction = squash(ex.instruction || firstLine);
  const numbered = [...splitSequential(ex.body)];
  const format = detectFormat(instruction, numbered.map(([, v]) => v.text));
  if (!format) return [];
  const key = parseAnswerBlock(answerBody);

  return numbered.map(([n, v]) => {
    const raw = squash(v.text);
    const ansRaw = key.get(n);
    let stem = raw;
    let options: string[] = [];
    let answerIndex: number | undefined;
    let answerText: string | undefined;
    let solution: string | undefined;
    let quarantineReason: QuarantineReason | undefined;

    if (format === 'ERROR_SPOTTING') {
      options = errorParts(raw);
      stem = `Find the part of the sentence that contains an error. ${raw}`;
      const m = ansRaw?.match(/\(\s*([1-5])\s*\)\s*(.*)/);
      if (m) { answerIndex = Number(m[1]) - 1; solution = m[2].trim() || undefined; }
      if (options.length < 4) quarantineReason = 'options_incomplete';
      else if (!m) quarantineReason = 'no_answer_key';
      else if (answerIndex! >= options.length) quarantineReason = 'answer_not_in_options';
    } else {
      // "(was/were)" at the end of a fill-in item: the book's own choices become options.
      const choice = format === 'FILL_BLANK' ? raw.match(/\(([^()]{1,60}\/[^()]{1,60})\)\s*$/) : null;
      if (choice) {
        options = choice[1].split('/').map((s) => s.trim()).filter(Boolean);
        stem = raw.slice(0, choice.index).trim();
      }
      answerText = ansRaw?.replace(/\s*\((?:कोई एक|any one)\)\s*$/i, '').trim() || undefined;
      if (answerText && options.length) {
        const idx = options.findIndex((o) => o.toLowerCase() === answerText!.toLowerCase());
        if (idx >= 0) answerIndex = idx;
      }
      if (!answerText) quarantineReason = 'no_answer_key';
      // Plausibility: a mis-paired answer block (another exercise's answers) must not be stored as
      // the book's key. Printed choices must contain the answer; a fill-in is a word or short
      // phrase; a corrected/rewritten sentence shares most of its words with the original.
      else if (options.length && answerIndex === undefined) quarantineReason = 'answer_mismatch';
      else if (format === 'FILL_BLANK' && !options.length && answerText.length > 40) quarantineReason = 'answer_mismatch';
      else if ((format === 'SENTENCE_CORRECTION' || format === 'TRANSFORMATION') && wordOverlap(raw, answerText) < 0.3) quarantineReason = 'answer_mismatch';
    }
    if (!quarantineReason && (stem.length > FIELD_LIMITS.stem || options.some((o) => o.length > FIELD_LIMITS.option))) quarantineReason = 'oversize_text';
    if (!quarantineReason && raw.length < 4) quarantineReason = 'empty_stem';

    return {
      chapterName,
      chapterOrdinal,
      sourceSection: `Q.${ex.qn}`,
      sourceSectionIndex: setIndex,
      questionNumber: n,
      stem: stem.slice(0, FIELD_LIMITS.stem),
      options: options.map((o) => o.slice(0, FIELD_LIMITS.option)),
      answerKey: answerIndex !== undefined ? 'abcde'[answerIndex] : undefined,
      answerIndex,
      solution: solution?.slice(0, FIELD_LIMITS.solution),
      format,
      instruction,
      answerText,
      quarantineReason,
      originalQuestionHash: hashQuestion(raw, options),
    };
  });
}

/**
 * Whole-book pairing. Answer sections contain sub-headings that look like chapter names
 * ("Adjective"), so per-chapter segmentation splits a chapter's exercises from its own answers.
 * Instead, walk the book in order:
 *   - an exercise heading carries its instruction on the line ("Q.2. Find out the error …");
 *   - after "Answers With Explanation", bare headings ("### Q. 2.") are that group's answers;
 *   - the next exercise heading closes the answer section and starts a new group;
 *   - a group with one exercise and answers printed without "Q." sub-heads gets those answers.
 * Each exercise is named after the nearest real chapter heading above it (segmentChapters rules).
 */
export function parseEnglishBook(pages: OcrPage[], opts: ParseOptions): { chapters: { name: string; ordinal: number }[]; questions: ParsedBookQuestion[] } {
  const chapterStarts: { pos: number; name: string; ordinal: number }[] = [];
  const texts: string[] = [];
  let offset = 0;
  for (const c of segmentChapters(pages, opts)) {
    chapterStarts.push({ pos: offset, name: c.name, ordinal: c.ordinal });
    texts.push(c.text);
    offset += c.text.length + 1;
  }
  const text = texts.join('\n');
  const chapterAt = (pos: number) => [...chapterStarts].reverse().find((c) => c.pos <= pos) || chapterStarts[0];

  type Ex = { qn: number; instruction: string; body: string; pos: number };
  type Group = { exercises: Ex[]; answers: Map<number, string>; looseAnswers?: string };
  const groups: Group[] = [];
  let group: Group = { exercises: [], answers: new Map() };
  let inAnswers = false;

  const marks = [
    ...[...text.matchAll(Q_HEAD)].map((m) => ({ kind: 'Q' as const, pos: m.index!, end: m.index! + m[0].length, n: Number(m[1]), instr: squash(m[2] || '') })),
    ...[...text.matchAll(ANSWERS_HEAD)].map((m) => ({ kind: 'A' as const, pos: m.index!, end: m.index! + m[0].length, n: 0, instr: '' })),
  ].sort((a, b) => a.pos - b.pos);

  marks.forEach((mk, k) => {
    const body = text.slice(mk.end, marks[k + 1]?.pos ?? text.length);
    if (mk.kind === 'A') {
      inAnswers = true;
      if (/^\s*[-*>]*\s*1\.\s/m.test(body)) group.looseAnswers = body;
      return;
    }
    const isExercise = mk.instr.length >= 10 || !inAnswers;
    if (isExercise) {
      if (inAnswers) { groups.push(group); group = { exercises: [], answers: new Map() }; inAnswers = false; }
      group.exercises.push({ qn: mk.n, instruction: mk.instr, body, pos: mk.pos });
    } else if (!group.answers.has(mk.n)) {
      group.answers.set(mk.n, body);
    }
  });
  groups.push(group);

  // Set index counts per chapter across the whole book, so two groups in one chapter can't
  // produce the same (chapter, section, set, number) identity.
  const setCounter = new Map<number, number>();
  const questions: ParsedBookQuestion[] = [];
  for (const g of groups) {
    // If a chapter printed no answers, its exercises fall into the next chapter's group and the
    // group holds two "Q.1"s. Only the LAST one (the one the answers follow) may take Q.1's answers.
    const lastWithQn = new Map<number, Ex>();
    for (const ex of g.exercises) lastWithQn.set(ex.qn, ex);
    for (const ex of g.exercises) {
      const ch = chapterAt(ex.pos);
      const setIndex = (setCounter.get(ch.ordinal) || 0) + 1;
      setCounter.set(ch.ordinal, setIndex);
      const owns = lastWithQn.get(ex.qn) === ex;
      const answerBody = owns ? (g.answers.get(ex.qn) ?? (g.exercises.length === 1 ? g.looseAnswers : undefined) ?? '') : '';
      questions.push(...parseEnglishExercise(ex, answerBody, ch.name, ch.ordinal, setIndex));
    }
  }
  return { chapters: chapterStarts.map(({ name, ordinal }) => ({ name, ordinal })), questions };
}

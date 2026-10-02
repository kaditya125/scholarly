/**
 * 'typed-sections' layout — Rakesh Yadav's SSC Reasoning (bilingual).
 *
 * A chapter here is one or more CYCLES of
 *     questions in "TYPE-I / TYPE-II …" sections (numbering restarts per type)
 *     → "ANSWER KEYS" grids, one per type ("(Type -I)", "Type -II", …)
 *     → "SOLUTION" entries "n. (k) explanation", again per type.
 * The chapter's theory pages come first and use the same "TYPE-1/2/3" markers for worked
 * examples (which carry an inline "Ans: (c)" / "Sol."), so a cycle's EXERCISE sections are the
 * last K sections before its keys, K = the number of key grids.
 *
 * This rebuilds each chapter as "EXERCISE … / ANSWERS … / SOLUTIONS …" blocks, one per type, so
 * parseChapter handles pairing, quarantine and ids unchanged.
 *
 * The book prints every answer twice — in the grid and at the head of its solution — so the two
 * are cross-checked: a question whose grid key and solution key disagree gets NO key (and is
 * quarantined as no_answer_key). A section whose question count doesn't match its key grid gets no
 * keys at all: the pairing itself is then in doubt.
 */
import type { OcrPage, ParseOptions, ParsedBookQuestion } from './bookQuestionParser';
import { segmentChapters, parseChapter } from './bookQuestionParser';

const KEYS_START = /^[#\s]*ANSWER\s*KEYS?\b/i;
const SOLUTIONS_START = /^[#\s]*SOLUTIONS?\b\s*$/i;
const TYPE_MARK = /^[#\s]*\(?\s*TYPE\s*[-–]?\s*([IVX]+|\d{1,2})\b[^\n]*$/i;
// "12. (c)" — or "12. | (c)" when the grid came out as table cells (Syllogism).
const KEY_PAIR = /(\d{1,3})\s*\.\s*\|?\s*\(\s*([a-e])\s*\)/gi;
const SOLUTION_LINE = /^\s*(\d{1,3})\s*\.\s*\(\s*([a-e])\s*\)/i;
// "12. text" — or "12." alone on its line, as for Missing Number's number-grid questions (the grid
// follows on the next lines). Matches what parseChapter's own splitter accepts.
const QUESTION_LINE = /^\s*(\d{1,3})\s*\.(?:\s*\S|\s*$)/;

interface Section { label: string; lines: string[]; continuation?: boolean }
const PAGE_MARK = /^\u0001P\d+\u0001$/;
// "EXERCISE", "# EXERCISE-1", or with a word before it: "ARGUMENTS EXERCISE".
const EXERCISE_MARK = /^[#\s]*(?:[A-Z]+\s+)?EXERCISE\b/i;
/** A directions line opening a question set straight after solutions: "Direction (Q.1-63):- …". */
const DIRECTIONS_LINE = /^[#\s]*Directions?\s*[\s(:—–-]/i;
const GRID_LABEL = /^[#\s]*\(\s*(?:Exercise|Type)\b[^)]*\)\s*$|^[#\s]*Exercise\s*[-–]?\s*(?:\d{1,2}|[IVX]+)\s*$/i;
interface Cycle { sections: Section[]; keys: { label: string; map: Map<number, string> }[]; solutions: Section[] }

export interface TypedSectionsReport {
  chapter: string;
  cycles: number;
  sectionsPaired: number;
  sectionsKeyCountMismatch: string[];
  keyConflicts: number;
}

/** Printed page = PDF page − offset (piecewise when inserted pages shift the numbering), stamped onto
 *  each page so sourcePage is the printed page. */
function withPrintedPages(pages: OcrPage[], offset: number, offsets?: [number, number][]): OcrPage[] {
  const at = (pdf: number) => {
    let o = offset;
    for (const [from, off] of offsets ?? []) if (pdf >= from) o = off;
    return o;
  };
  return pages.map((p) => ({
    ...p,
    markdown: `<!-- book-page: ${p.pdfPageStart - at(p.pdfPageStart)} -->\n` + p.markdown.replace(/<!--\s*book-page:\s*\d+\s*-->/g, ''),
  }));
}

/**
 * "n. (k) explanation" is a solution — but an odd-one-out question with no stem also starts
 * "n. (a) Heat | (b) Light", so it is a solution only if no "(b)" follows on the same or next line.
 */
function isSolutionAt(lines: string[], i: number): boolean {
  const m = lines[i].match(SOLUTION_LINE);
  if (!m) return false;
  // Look for "(b)" only AFTER the line's own key — "1. (b) 6 : 2 …" is a solution whose key is b.
  const rest = lines[i].slice(m[0].length);
  return !/\(\s*b\s*\)/i.test(rest) && !/^\s*\(\s*b\s*\)/i.test(lines[i + 1] ?? '');
}

/** First numbered line after `from`: a solution ("n. (k) text") or a question? */
function nextNumberedIsSolution(lines: string[], from: number): boolean {
  for (let i = from; i < Math.min(lines.length, from + 12); i++) {
    if (isSolutionAt(lines, i)) return true;
    if (QUESTION_LINE.test(lines[i])) return false;
  }
  return false;
}

function splitCycles(lines: string[]): Cycle[] {
  const cycles: Cycle[] = [];
  let cur: Cycle = { sections: [], keys: [], solutions: [] };
  let mode: 'q' | 'k' | 's' = 'q';
  const push = () => { if (cur.keys.length) cycles.push(cur); cur = { sections: [], keys: [], solutions: [] }; };

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (KEYS_START.test(line)) {
      if (mode === 's') push();
      mode = 'k';
      const rest = line.replace(KEYS_START, '');
      cur.keys.push({ label: rest.trim() || 'Type', map: new Map() });
      return;
    }
    if (mode === 'k') {
      if (SOLUTIONS_START.test(line)) { mode = 's'; return; }
      const pairs = [...line.matchAll(KEY_PAIR)];
      // A grid header: "(Type -I)", "Type -II", "(Exercise-3)", "(Exercise)" — each starts a new grid.
      if ((TYPE_MARK.test(line) || GRID_LABEL.test(line)) && !pairs.length) {
        const last = cur.keys[cur.keys.length - 1];
        // "ANSWER KEYS" immediately followed by "(Type -I)": that header names the first grid.
        if (last && last.map.size === 0) last.label = line.replace(/[#()]/g, '').trim();
        else cur.keys.push({ label: line.replace(/[#()]/g, '').trim(), map: new Map() });
        return;
      }
      if (pairs.length) {
        const last = cur.keys[cur.keys.length - 1];
        for (const m of pairs) if (!last.map.has(Number(m[1]))) last.map.set(Number(m[1]), m[2].toLowerCase());
        return;
      }
      // A plain heading between grids ("NUMBER BASED") names the next one; anything else is ignored.
      return;
    }
    if (mode === 's') {
      // A TYPE or EXERCISE heading after solutions: more solutions, or (if questions follow) the
      // next cycle — e.g. Number Series' "EXERCISE" set straight after the first set's solutions.
      if (TYPE_MARK.test(line) || EXERCISE_MARK.test(line)) {
        if (nextNumberedIsSolution(lines, i + 1)) { cur.solutions.push({ label: line, lines: [] }); return; }
        push();          // a TYPE marker followed by questions: the next cycle starts
        mode = 'q';
        cur.sections.push({ label: line.replace(/^[#\s]+/, ''), lines: [] });
        return;
      }
      // A directions line followed by QUESTIONS (not "n. (k)" solutions) opens the next set even
      // with no TYPE/EXERCISE heading (Statement chapter: "Direction (Q.1-63):- In each …").
      if (DIRECTIONS_LINE.test(line) && !nextNumberedIsSolution(lines, i + 1)) {
        push();
        mode = 'q';
        cur.sections.push({ label: 'Directions', lines: [raw] });
        return;
      }
      if (!cur.solutions.length) cur.solutions.push({ label: 'SOLUTION', lines: [] });
      // Solutions without TYPE markers: a numbering restart at 1 starts the next type's block.
      const m = line.match(SOLUTION_LINE);
      const block = cur.solutions[cur.solutions.length - 1];
      if (m && Number(m[1]) === 1 && block.lines.some((l) => SOLUTION_LINE.test(l))) cur.solutions.push({ label: 'SOLUTION', lines: [] });
      cur.solutions[cur.solutions.length - 1].lines.push(raw);
      return;
    }
    // mode 'q'
    if (TYPE_MARK.test(line) || EXERCISE_MARK.test(line)) { cur.sections.push({ label: line.replace(/^[#\s]+/, ''), lines: [] }); return; }
    // Chapters without TYPE markers (Number Series): the first numbered item opens an implicit
    // section. Theory items land in it too, but runs are paired with key grids by size, so the
    // worked examples are never chosen.
    if (!cur.sections.length && QUESTION_LINE.test(line)) cur.sections.push({ label: 'Questions', lines: [] });
    // A page break starts a new FRAGMENT: on pages that mix the theory's worked examples with the
    // exercise start, the OCR can emit columns out of order (PDF p.11 put theory TYPE-2 after
    // exercise Q1), so what follows a page break is placed by its numbering, not by position.
    if (PAGE_MARK.test(line) && cur.sections.length) {
      const prev = cur.sections[cur.sections.length - 1];
      cur.sections.push({ label: prev.label, lines: [raw], continuation: true });
      return;
    }
    if (cur.sections.length) cur.sections[cur.sections.length - 1].lines.push(raw);
  });
  push();
  return cycles;
}

const numbersOf = (lines: string[]) => lines.map((l) => l.match(QUESTION_LINE)).filter(Boolean).map((m) => Number(m![1]));

const highest = (lines: string[]) => Math.max(0, ...numbersOf(lines));

/**
 * Sections and page fragments → RUNS of one numbered sequence each.
 *   - a piece whose first number is 1 opens a new run (every type, and every set of worked examples);
 *   - any other piece continues the run it follows NUMERICALLY: the run with the highest number still
 *     below the piece's first number. That puts p.12's "2, 3, …" after exercise Q1 rather than after
 *     theory example 5, and joins the year sub-sections ("TYPE-I (I), 2010", "TYPE-I (II)", …) that
 *     share one key grid.
 * Numbers may still arrive out of order within a run; parseChapter's recoverByNumber handles that.
 */
function buildRuns(pieces: Section[]): Section[] {
  const runs: Section[] = [];
  for (const s of pieces) {
    const nums = numbersOf(s.lines);
    if (!nums.length) { if (runs.length) runs[runs.length - 1].lines.push(...s.lines); continue; }
    const first = nums[0];
    if (first === 1) { runs.push({ label: s.label, lines: [...s.lines] }); continue; }
    // Host: a run that does NOT already hold this number, with the closest number below it (ties →
    // the later run). Out-of-order pieces (48 arriving after 50) still find their run, and a set of
    // worked examples — which already holds 2, 3, … — can never absorb exercise questions.
    let host: Section | undefined;
    let best = 0;
    for (const r of runs) {
      const have = new Set(numbersOf(r.lines));
      if (have.has(first)) continue;
      const below = Math.max(0, ...[...have].filter((n) => n < first));
      if (below > 0 && below >= best) { best = below; host = r; }
    }
    if (host) host.lines.push(...s.lines);
    else runs.push({ label: s.label, lines: [...s.lines] });
  }
  return runs;
}

/**
 * Pair runs with key grids BY SIZE, in order: grid j (keys 1..N) takes the run whose highest number
 * is N, searching backwards from the end so the theory's short example runs (1–5, 1–3) that precede
 * the exercises are never chosen. Returns runs aligned to grids (undefined = no run of that size).
 */
function pairBySize(runs: Section[], grids: { map: Map<number, string> }[]): (Section | undefined)[] {
  const out: (Section | undefined)[] = new Array(grids.length).fill(undefined);
  const sizeOf = (g: { map: Map<number, string> }) => Math.max(0, ...g.map.keys());
  const used = new Set<Section>();
  // 1) A grid whose size is unique among the grids AND matched by exactly one run pairs with it,
  //    wherever it sits — Coding-Decoding prints its grids in a different order from its sections
  //    ("Exercise-V", 95 keys, belongs to the second section).
  grids.forEach((g, j) => {
    const size = sizeOf(g);
    if (grids.filter((h) => sizeOf(h) === size).length !== 1) return;
    const cands = runs.filter((r) => highest(r.lines) === size);
    if (cands.length === 1) { out[j] = cands[0]; used.add(cands[0]); }
  });
  // 2) The rest (repeated sizes, or several candidate runs): in order, searching backwards from the
  //    end so the theory's short example runs that precede the exercises are never chosen.
  let r = runs.length - 1;
  for (let j = grids.length - 1; j >= 0; j--) {
    if (out[j]) continue;
    const size = sizeOf(grids[j]);
    for (let k = r; k >= 0; k--) {
      if (!used.has(runs[k]) && highest(runs[k].lines) === size) { out[j] = runs[k]; used.add(runs[k]); r = k - 1; break; }
    }
  }
  // 3) Off by one or two: the OCR split or dropped a question number at the end of a set (Venn
  //    Diagrams: questions to 79, keys to 80). Only for sets of 20+, and only when exactly one unused
  //    run is that close — worked-example runs (≤10) can never qualify. Keys still attach by number,
  //    so a lost question simply goes unkeyed; nothing shifts.
  grids.forEach((g, j) => {
    if (out[j]) return;
    const size = sizeOf(g);
    if (size < 20) return;
    const near = runs.filter((run) => !used.has(run) && Math.abs(highest(run.lines) - size) <= 2 && highest(run.lines) >= 20);
    if (near.length === 1) { out[j] = near[0]; used.add(near[0]); }
  });
  return out;
}

/** Debug view: each cycle's sections (label, first/last number) and key grids (label, size). */
export function describeCycles(pages: OcrPage[], opts: ParseOptions): string[] {
  const out: string[] = [];
  for (const ch of segmentChapters(withPrintedPages(pages, opts.bookPageOffset ?? 0, opts.bookPageOffsets), opts)) {
    splitCycles(ch.text.split('\n')).forEach((cy, i) => {
      const secs = buildRuns(cy.sections).map((s) => { const n = numbersOf(s.lines); return `${s.label.slice(0, 22)}[${n[0] ?? '-'}..${highest(s.lines)}; ${new Set(n).size} distinct]`; });
      const keys = cy.keys.map((k) => `${k.label.slice(0, 18)}(${k.map.size})`);
      out.push(`${ch.name} #${i + 1}: sections ${secs.join(', ')} | keys ${keys.join(', ')} | solutions ${cy.solutions.length}`);
    });
  }
  return out;
}

const maxQuestion = (lines: string[]) => {
  let expect = 1;
  for (const l of lines) { const m = l.match(QUESTION_LINE); if (m && Number(m[1]) === expect) expect++; }
  return expect - 1;
};

/** Whole book → every exercise question (see parseBook). */
export function parseTypedBook(pages: OcrPage[], opts: ParseOptions, report?: TypedSectionsReport[]):
  { chapters: { name: string; ordinal: number }[]; questions: ParsedBookQuestion[] } {
  const chapters = segmentTypedSections(pages, opts, report);
  // The book repeats a chapter title in its non-verbal part ("Analogy And Similarity" is chapter 1
  // and chapter 21, the figure analogies). Ordinals keep them apart in ids; the name should too.
  const seen = new Set<string>();
  for (const c of chapters) {
    if (seen.has(c.name)) c.name = `${c.name} (Non-Verbal)`;
    seen.add(c.name);
  }
  // Odd-one-out questions (Classification) are printed as four options with no stem.
  const questions = chapters.flatMap((c) => parseChapter({ ...c, allowStemless: true }));
  // A set where most questions ran into each other (the OCR scrambled its column order) can still
  // let a few through every per-question check with another question's text in their options
  // (Statement Arguments, set 1: 55 of 61 run-on, and its Q1 "usable" with bled options). Past 30%
  // run-on, the whole set's survivors are quarantined too — kept for review, never served.
  const bySet = new Map<string, ParsedBookQuestion[]>();
  for (const q of questions) {
    const k = `${q.chapterOrdinal}|${q.sourceSectionIndex}`;
    bySet.set(k, [...(bySet.get(k) ?? []), q]);
  }
  for (const set of bySet.values()) {
    const runOn = set.filter((q) => q.quarantineReason === 'oversize_text').length;
    if (set.length >= 5 && runOn / set.length > 0.3) {
      for (const q of set) if (!q.quarantineReason) q.quarantineReason = 'unreliable_section';
    }
  }
  return { chapters: chapters.map(({ name, ordinal }) => ({ name, ordinal })), questions };
}

export function segmentTypedSections(pages: OcrPage[], opts: ParseOptions, report?: TypedSectionsReport[]):
  { name: string; ordinal: number; text: string }[] {
  const chapters = segmentChapters(withPrintedPages(pages, opts.bookPageOffset ?? 0, opts.bookPageOffsets), opts);
  return chapters.map((ch) => {
    const cycles = splitCycles(ch.text.split('\n'));
    const out: string[] = [];
    const rep: TypedSectionsReport = { chapter: ch.name, cycles: cycles.length, sectionsPaired: 0, sectionsKeyCountMismatch: [], keyConflicts: 0 };
    for (const cy of cycles) {
      const paired = pairBySize(buildRuns(cy.sections), cy.keys);
      // Solution blocks align with grids only when there is one per grid (and the same size).
      const solutions = cy.solutions.length === cy.keys.length ? cy.solutions : [];
      cy.keys.forEach((key, j) => {
        const sec = paired[j];
        const kMax = Math.max(0, ...key.map.keys());
        // No run of this grid's size: the grid's questions weren't found intact. Nothing is emitted
        // for it (those questions simply aren't extracted) — never pair a grid with the wrong run.
        if (!sec) { rep.sectionsKeyCountMismatch.push(`${key.label}: no question run of ${kMax}`); return; }
        let sol: Section | undefined = solutions[j];
        if (sol && highest(sol.lines) !== kMax) sol = undefined;
        const solKeys = new Map<number, string>();
        for (const l of sol?.lines ?? []) { const m = l.match(SOLUTION_LINE); if (m && !solKeys.has(Number(m[1]))) solKeys.set(Number(m[1]), m[2].toLowerCase()); }
        const trusted = true;
        const keyLines: string[] = [];
        if (trusted) {
          rep.sectionsPaired++;
          for (const [n, k] of [...key.map].sort((a, b) => a[0] - b[0])) {
            const s = solKeys.get(n);
            if (s && s !== k) { rep.keyConflicts++; continue; }   // printed twice, disagrees → no key
            keyLines.push(`${n}. (${k})`);
          }
        }
        // "Direction (Questions no. 1 – 21)" with no colon: parseChapter only treats a directions
        // block as one when ":" or a dash follows, so the fixed choices printed there (syllogism's
        // "(a) If only conclusion I follows …") never reached their questions. Add the colon.
        const lines = sec.lines.map((l) => l.replace(/^(\s*#*\s*Directions?\s*\([^)\n]{0,60}\))\s*$/i, '$1:'));
        out.push(`EXERCISE ${sec.label}`, ...lines, 'ANSWERS', ...keyLines);
        if (trusted && sol) out.push('SOLUTIONS', ...sol.lines);
      });
    }
    report?.push(rep);
    return { name: ch.name, ordinal: ch.ordinal, text: out.join('\n') };
  });
}

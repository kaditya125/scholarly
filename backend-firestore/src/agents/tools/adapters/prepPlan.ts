import { StudyPlanSpec } from '../../artifacts/artifact.types';
import { titleCase } from './curriculumMatch';
import { addDays } from './plan.adapter';
import { syllabusMatchScore, WEAK_BELOW } from './progress.adapter';

/**
 * "Prepare me for X" — the plan itself (Phase 7). Pure and deterministic, like the existing
 * studyPlanner.service it borrows its time model from: a plan a student organises months around
 * must be repeatable and explainable from its inputs, so no model writes any part of it.
 *
 *   structureFromSyllabus   the exam's OFFICIAL structure (stages, papers, sections, subjects, with
 *                           the marks, question counts and times the syllabus records) and its study
 *                           units — fragments of the official text, never invented topic names
 *   horizonFromGoal         "in 90 days", "by 10 December" → days; nothing found → nothing assumed
 *   buildExamPrepPlan       phases → weeks → milestones, time split by the official marks, first
 *                           week day by day, and honest arithmetic about whether it all fits
 */

// ── Time model (the existing planner's, studyPlanner.service ACTIVITY_MINUTES) ─────────────────
export const MINUTES = { LEARN: 25, PRACTICE: 20, REVISE: 15, QUIZ: 15 } as const;
/** A first pass over a topic: learn it, then practise it. */
export const FIRST_PASS = MINUTES.LEARN + MINUTES.PRACTICE;
/** Share of each learning day kept for reviewing earlier topics. */
export const REVIEW_SHARE = 0.2;

export type UnitState = 'UNTOUCHED' | 'LEARNING' | 'WEAK' | 'STRONG' | 'MASTERED';

export interface StudyUnit {
  /** Stable within an exam: the normalised label. */
  key: string;
  label: string;
  /** The syllabus leaves the unit's text comes from. */
  nodeIds: string[];
  /** True when the unit IS a whole leaf (its coverage state can be read directly). */
  wholeLeaf: boolean;
}

export interface ExamPart {
  path: string;
  questionCount?: number;
  marks?: number;
  durationMinutes?: number;
}

export interface ExamSubject {
  name: string;
  /** Official marks summed over the parts in scope; absent when the syllabus records none. */
  marks?: number;
  parts: ExamPart[];
  units: StudyUnit[];
  /** A skill test (typing, say) is practised, not studied: its official description. */
  skillTest?: string;
}

export interface ExamStructure {
  examId: string;
  examName: string;
  syllabusId: string;
  source: { title?: string; url?: string; hash?: string; verifiedAt?: number };
  /** The stages / papers the plan covers, with their recorded pattern. */
  scope: ExamPart[];
  /** Papers the syllabus lists that the plan leaves out unless asked. */
  notIncluded: string[];
  subjects: ExamSubject[];
}

// ── Official structure ─────────────────────────────────────────────────────────────────────────

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
const pattern = (n: any): Omit<ExamPart, 'path'> => ({
  ...(num(n.questionCount) ? { questionCount: num(n.questionCount) } : {}),
  ...(num(n.marks) ? { marks: num(n.marks) } : {}),
  ...(num(n.durationMinutes) ? { durationMinutes: num(n.durationMinutes) } : {}),
});

/** One name per discipline across stages, so Tier-I "Quantitative Aptitude" and Tier-II "Mathematical Abilities" are planned once. */
const DISCIPLINES: Array<[RegExp, string]> = [
  [/reason|intelligence/i, 'Reasoning'],
  [/quantitative|mathematical abilit|numerical abilit|arithmetic/i, 'Quantitative Aptitude'],
  [/english/i, 'English'],
  [/general awareness|general knowledge/i, 'General Awareness'],
  [/computer/i, 'Computer Knowledge'],
  [/data entry|typing/i, 'Data Entry Speed Test'],
];
export function disciplineOf(subjectName: string): string {
  const name = String(subjectName ?? '').replace(/^\s*[A-Z]\s*[:.)]\s*/, '').trim();
  const hit = DISCIPLINES.find(([re]) => re.test(name));
  if (hit) return hit[1];
  return name.length > 3 && name === name.toUpperCase() ? name.charAt(0) + name.slice(1).toLowerCase() : name;
}

// Framing words in the notice's sentences, removed so what is left is what to study.
const BOILERPLATE: RegExp[] = [
  /^the questions? will be designed to test\s+/i,
  /^questions?\s+(?:in this component\s+)?(?:will|are)\s+(?:also\s+)?(?:be\s+)?(?:aimed at testing|designed to test)\s+/i,
  /^questions? of both verbal and non-verbal type\.?\s*/i,
  /^these will include questions on\s+/i,
  /^the scope of the test will be\s+/i,
  /^the test will also include questions relating to\s+/i,
  /^(?:the\s+)?candidates['‟’]?\s+/i,
  /^familiarity with\s+/i,
  /^to test\s+/i,
];
const JUNK_ITEM = /\b(would be tested|will be tested|will be asked|at least|candidates?|questions based on)\b|^(his|her|their|the)\s|^(other sub-?topics?|if any|and so on|etc)$/i;
/** A sentence about the test rather than what to study ("the ability of appropriate use of numbers…"). */
const ABOUT_THE_TEST = /\b(ability|abilities|candidates?|will be (?:given|asked|tested))\b/i;
/** Beyond this many units a subject is listed at the syllabus's own leaves instead (JEE's lists run to 280 items a subject). */
export const MAX_UNITS_PER_SUBJECT = 60;

/** Splits on commas and semicolons outside brackets: "threats (like hacking, virus, worms)" stays whole. */
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    const sentenceEnd = ch === '.' && depth === 0 && /\s/.test(text[i + 1] ?? '') && /[A-Za-z)]/.test(text[i - 1] ?? '');
    if (depth === 0 && (ch === ',' || ch === ';' || sentenceEnd)) {
      out.push(current);
      current = '';
    } else current += ch;
  }
  out.push(current);
  return out;
}

/** Word sets for near-duplicate detection: Tier-I and Tier-II word the same topic slightly differently. */
const wordSet = (s: string) => new Set(normalize(s).split(' ').filter((w) => w.length > 2));
export function sameTopic(a: string, b: string): boolean {
  const A = wordSet(a);
  const B = wordSet(b);
  if (!A.size || !B.size) return false;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / (A.size + B.size - common) >= 0.75;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');

const sentenceCase = (s: string) => {
  const t = s.trim().replace(/\s+/g, ' ').replace(/[.;:,]+$/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * Study units from one leaf of the syllabus. A leaf that lists topics ("Percentages, Ratio and
 * Proportion, Square roots, …") becomes one unit per listed topic, verbatim; a leaf that is a
 * plain name ("Semantic Analogy") is one unit. A leaf that only describes the section ("…aimed at
 * testing the candidates' general awareness…") becomes one unit named by its description.
 */
export function unitsFromLeaf(text: string): { labels: string[]; enumerated: boolean } {
  const raw = String(text ?? '').replace(/\s+/g, ' ').replace(/[‟’]/g, "'").trim();
  if (!raw) return { labels: [], enumerated: false };
  if (raw.length <= 60 && !/[,;]/.test(raw)) return { labels: [sentenceCase(raw)], enumerated: false };

  const items: string[] = [];
  for (let sentence of raw.split(/(?<=[.;])\s+(?=[A-Z])/)) {
    for (const re of BOILERPLATE) sentence = sentence.replace(re, '');
    // "…figures and facts: Triangle, …" — the list is what follows the colon.
    const colon = sentence.indexOf(':');
    if (colon > 0 && colon < sentence.length - 1 && /,/.test(sentence.slice(colon))) sentence = sentence.slice(colon + 1);
    for (const piece of splitTopLevel(sentence)) {
      // "…(like hacking, virus, worms, Trojan etc.)" keeps its item; only the "etc." goes.
      const item = piece.replace(/,?\s*\betc\b\.?/gi, '').replace(/^\s*(and|or)\s+/i, '').replace(/\s*\.\s*$/, '').trim();
      if (item.length >= 3 && !JUNK_ITEM.test(item)) items.push(item);
    }
  }
  const lengths = items.map((i) => i.length).sort((a, b) => a - b);
  const median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0;
  if (items.length >= 3 && median <= 45) return { labels: items.map((i) => clip(sentenceCase(i), 120)), enumerated: true };

  // A description, not a list: its first clause, framing removed.
  let first = raw.split(/(?<=[.;])\s+/)[0];
  for (const re of BOILERPLATE) first = first.replace(re, '');
  return { labels: [clip(sentenceCase(first || raw), 120)], enumerated: false };
}

const SKILL_TEST = /\b(speed test|skill test|typing test|key depressions)\b/i;

/**
 * A leaf's name as a unit when the syllabus is too finely listed to split: its unit's name
 * ("UNIT 3: Laws of Motion" → "Laws of Motion"), with the leaf's own first topic when the unit has
 * several leaves ("Laws of Motion: Static and kinetic friction").
 */
export function leafLabel(leafText: string, parentName: string, siblings: number): string {
  const bare = parentName.replace(/^\s*unit\s*[\divxlc]+\s*[:.\-–]\s*/i, '').trim();
  // "SETS, RELATIONS AND FUNCTIONS" reads better as "Sets, Relations and Functions".
  const parent = bare && bare === bare.toUpperCase() ? titleCase(bare.toLowerCase()) : bare;
  const text = leafText.replace(/\s+/g, ' ').trim();
  const head = (text.match(/^([^:;]{3,60}):/)?.[1] ?? splitTopLevel(text)[0] ?? text).replace(/^[A-Z]\s+(?=[A-Z])/, '').trim();
  if (parent && parent.length <= 70) return clip(siblings > 1 ? `${parent}: ${sentenceCase(head)}` : parent, 120);
  return clip(sentenceCase(head || text), 120);
}

/**
 * The exam's structure from its current official syllabus graph. Every stage is covered; where a
 * stage offers several papers, the first is covered and the others are listed as not included —
 * unless the student's own words name them (`wantsPaper`).
 */
export function structureFromSyllabus(
  syllabus: any,
  opts: { examId: string; examName: string; wantsPaper?: (paperName: string) => boolean },
): ExamStructure {
  const scope: ExamPart[] = [];
  const notIncluded: string[] = [];
  const subjects = new Map<string, ExamSubject>();

  const addSubject = (node: any, path: string[], inherited: Omit<ExamPart, 'path'>) => {
    const name = disciplineOf(node.name);
    const subject = subjects.get(name) ?? { name, parts: [], units: [] };
    const own = pattern(node);
    const part = { path: [...path, String(node.name)].join(' › '), ...inherited, ...own };
    subject.parts.push(part);
    const marks = own.marks ?? inherited.marks;
    if (marks) subject.marks = (subject.marks ?? 0) + marks;

    const leaves: Array<{ leaf: any; parent: any; siblings: number }> = [];
    const collect = (n: any, parent: any) => {
      const kids: any[] = n.children ?? [];
      if (kids.length) kids.forEach((k) => collect(k, n));
      else leaves.push({ leaf: n, parent, siblings: (parent?.children ?? []).length });
    };
    (node.children ?? []).forEach((k: any) => collect(k, node));

    // Candidate units: each leaf's listed topics; too many for a plan → the leaves themselves.
    const candidates: Array<{ label: string; nodeId: string; wholeLeaf: boolean; enumerated: boolean }> = [];
    for (const { leaf } of leaves) {
      const text = String(leaf.name ?? '');
      if (SKILL_TEST.test(text)) {
        subject.skillTest = clip(text.replace(/\s+/g, ' ').trim(), 600);
        continue;
      }
      const { labels, enumerated } = unitsFromLeaf(text);
      for (const label of labels) candidates.push({ label, nodeId: String(leaf.id), wholeLeaf: !enumerated && labels.length === 1, enumerated });
    }
    // A sentence describing the test is not a topic — unless it is all the syllabus says.
    const topical = candidates.filter((c) => c.enumerated || !ABOUT_THE_TEST.test(c.label));
    if (topical.length) candidates.splice(0, candidates.length, ...topical);
    const perLeaf = candidates.length > MAX_UNITS_PER_SUBJECT;
    const chosen = perLeaf
      ? leaves
          .filter(({ leaf }) => !SKILL_TEST.test(String(leaf.name ?? '')))
          .map(({ leaf, parent, siblings }) => ({ label: leafLabel(String(leaf.name ?? ''), parent && parent !== node ? String(parent.name) : '', siblings), nodeId: String(leaf.id), wholeLeaf: true }))
      : candidates;

    for (const c of chosen) {
      const key = normalize(c.label);
      if (!key) continue;
      // The same topic worded twice (Tier-I and Tier-II) is one unit, found under both leaves.
      const existing = subject.units.find((u) => u.key === key || sameTopic(u.label, c.label));
      if (existing) {
        if (!existing.nodeIds.includes(c.nodeId)) existing.nodeIds.push(c.nodeId);
        existing.wholeLeaf = existing.wholeLeaf && c.wholeLeaf && existing.nodeIds.length === 1;
        continue;
      }
      subject.units.push({ key, label: c.label, nodeIds: [c.nodeId], wholeLeaf: c.wholeLeaf });
    }
    subjects.set(name, subject);
  };

  // A section or paper with exactly one subject lends it its marks when the subject records none.
  const walk = (node: any, path: string[], inherited: Omit<ExamPart, 'path'>) => {
    const type = String(node.type ?? '').toUpperCase();
    const kids: any[] = node.children ?? [];
    if (type === 'SUBJECT') return addSubject(node, path, inherited);
    const here = [...path, String(node.name)];
    const lend = kids.filter((k) => String(k.type).toUpperCase() === 'SUBJECT').length === 1 ? pattern(node) : {};
    if (type === 'PAPER' || type === 'SECTION' || type === 'STAGE') {
      // A paper with topics directly under it (Statistics) is a subject of its own.
      if (type === 'PAPER' && kids.length && kids.every((k) => String(k.type).toUpperCase() !== 'SUBJECT' && String(k.type).toUpperCase() !== 'SECTION')) {
        return addSubject(node, path, {});
      }
    }
    for (const k of kids) walk(k, here, { ...inherited, ...lend });
  };

  for (const stage of syllabus?.nodes ?? []) {
    const stageType = String(stage.type ?? '').toUpperCase();
    if (stageType !== 'STAGE') {
      walk(stage, [], {});
      continue;
    }
    const papers = (stage.children ?? []).filter((c: any) => String(c.type).toUpperCase() === 'PAPER');
    if (papers.length > 1) {
      papers.forEach((paper: any, i: number) => {
        const label = `${stage.name} › ${paper.name}`;
        if (i === 0 || opts.wantsPaper?.(String(paper.name))) {
          scope.push({ path: label, ...pattern(paper) });
          walk(paper, [String(stage.name)], {});
        } else notIncluded.push(label);
      });
      for (const other of (stage.children ?? []).filter((c: any) => String(c.type).toUpperCase() !== 'PAPER')) walk(other, [String(stage.name)], {});
    } else {
      scope.push({ path: String(stage.name), ...pattern(stage) });
      for (const c of stage.children ?? []) walk(c, [String(stage.name)], {});
    }
  }

  // Across tiers: a sentence about the test itself goes once the subject has real topics to study.
  for (const s of subjects.values()) {
    const topical = s.units.filter((u) => !(u.label.length > 40 && ABOUT_THE_TEST.test(u.label)));
    if (topical.length >= 3) s.units = topical;
  }

  return {
    examId: opts.examId,
    examName: opts.examName,
    syllabusId: String(syllabus?.syllabusId ?? ''),
    source: {
      ...(syllabus?.sourceDocumentTitle ? { title: String(syllabus.sourceDocumentTitle) } : {}),
      ...(syllabus?.sourceDocumentUrl ? { url: String(syllabus.sourceDocumentUrl) } : {}),
      ...(syllabus?.sourceDocumentHash ? { hash: String(syllabus.sourceDocumentHash) } : {}),
      ...(num(syllabus?.verifiedAt) ? { verifiedAt: Number(syllabus.verifiedAt) } : {}),
    },
    scope,
    notIncluded,
    subjects: [...subjects.values()].filter((s) => s.units.length || s.skillTest),
  };
}

// ── Time ───────────────────────────────────────────────────────────────────────────────────────

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MAX_HORIZON = 400;

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const addMonths = (iso: string, months: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
};

/**
 * How long the student has, from their own words: a span ("in 90 days", "next 12 weeks", "for 3
 * months") or a date ("by 10 December", "on 2026-12-10"). The plan runs from today to the day
 * before a named date. Nothing recognisable → undefined: an exam date is never assumed.
 */
export function horizonFromGoal(goal: string, today: string): { days: number; endDate: string } | undefined {
  const g = String(goal ?? '').toLowerCase();
  const span =
    g.match(/\b(?:in|within|next|coming|for|over)\s+(?:the\s+)?(?:next\s+|coming\s+)?(\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*[- ]?\s*(days?|weeks?|months?)\b/) ??
    g.match(/\b(\d{1,3})[\s-]*(days?|weeks?|months?)[\s-]+(?:plan|programme|program|schedule|prep|preparation|challenge)\b/);
  if (span) {
    const n = /^\d+$/.test(span[1]) ? Number(span[1]) : WORDS[span[1]];
    if (n > 0) {
      const unit = span[2];
      const days = unit.startsWith('month') ? daysBetween(today, addMonths(today, n)) : unit.startsWith('week') ? n * 7 : n;
      if (days >= 1 && days <= MAX_HORIZON) return { days, endDate: addDays(today, days - 1) };
    }
  }
  const year = Number(today.slice(0, 4));
  const at = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let target: string | undefined;
  const iso = g.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) target = at(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dm = g.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+(20\d{2}))?\b/);
  const md = g.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/);
  const pick = dm ? { d: Number(dm[1]), m: MONTHS.indexOf(dm[2]) + 1, y: dm[3] } : md ? { d: Number(md[2]), m: MONTHS.indexOf(md[1]) + 1, y: md[3] } : undefined;
  if (!target && pick && pick.d >= 1 && pick.d <= 31) {
    target = at(pick.y ? Number(pick.y) : year, pick.m, pick.d);
    if (!pick.y && target <= today) target = at(year + 1, pick.m, pick.d);
  }
  if (target && !Number.isNaN(Date.parse(`${target}T00:00:00Z`))) {
    const days = daysBetween(today, target);
    if (days >= 1 && days <= MAX_HORIZON) return { days, endDate: addDays(today, days - 1) };
  }
  return undefined;
}

// ── The plan ───────────────────────────────────────────────────────────────────────────────────

export interface PrepPlanInput {
  exam: { examId: string; name: string; shortName: string };
  startDate: string;
  horizon: { days: number; endDate: string; source: 'goal' | 'saved_goal' | 'default' };
  dailyMinutes: { value: number; source: 'goal' | 'profile' | 'saved_goal' | 'default' };
  structure: ExamStructure;
  /** Coverage state per syllabus leaf the student has touched (absent = untouched). */
  leafStates: Record<string, UnitState>;
  /** The grader's weak topics for this exam (names; used to prioritise, never as identity). */
  weakTopics: Array<{ topic: string; accuracy: number; confidence: number; syllabusNodeId?: string }>;
  history: { quizzes: number; tests: number; questionsAnswered: number; averageAccuracy: number | null } | null;
  pastPapers?: { available: boolean; papers: number; note: string } | null;
}

export interface PrepPlanResult {
  spec: StudyPlanSpec;
  unscheduled: Array<{ subject: string; unit: string }>;
  phases: { learn: number; practise: number; revise: number };
  subjectShares: Array<{ subject: string; share: number; basis: 'marks' | 'equal' }>;
}

interface PlannedUnit extends StudyUnit {
  subject: string;
  state: UnitState;
  weakAccuracy?: number;
  cost: number;
}

const COST: Record<UnitState, number> = {
  UNTOUCHED: FIRST_PASS,
  LEARNING: MINUTES.PRACTICE + MINUTES.QUIZ,
  WEAK: MINUTES.REVISE + MINUTES.PRACTICE + MINUTES.QUIZ,
  STRONG: MINUTES.QUIZ,
  MASTERED: MINUTES.REVISE,
};
const STATE_ORDER: Record<UnitState, number> = { WEAK: 0, UNTOUCHED: 1, LEARNING: 2, STRONG: 3, MASTERED: 4 };

const list = (items: string[], max: number) => (items.length > max ? `${items.slice(0, max).join(', ')} and ${items.length - max} more` : items.join(', '));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Phases by share of the days: learn first, then timed practice, then full tests and revision. */
export function phasesFor(days: number): { learn: number; practise: number; revise: number } {
  if (days >= 21) {
    const learn = Math.floor(days * 0.6);
    const practise = Math.floor(days * 0.25);
    return { learn, practise, revise: days - learn - practise };
  }
  if (days >= 7) {
    const learn = Math.floor(days * 0.7);
    return { learn, practise: 0, revise: days - learn };
  }
  return { learn: days, practise: 0, revise: 0 };
}

export function buildExamPrepPlan(input: PrepPlanInput): PrepPlanResult {
  const { structure, horizon, startDate } = input;
  const daily = input.dailyMinutes.value;
  const phases = phasesFor(horizon.days);

  // Units with the student's state: a whole-leaf unit reads its leaf's coverage; a unit named in
  // the grader's weak topics (by node, else by a close name match) is weak.
  const weakFor = (u: StudyUnit) =>
    input.weakTopics.find((w) => (w.syllabusNodeId && u.nodeIds.includes(w.syllabusNodeId)) || syllabusMatchScore(w.topic, u.label) >= 0.8);
  const units: PlannedUnit[] = structure.subjects.flatMap((s) =>
    s.units.map((u) => {
      const weak = weakFor(u);
      const leafState = u.wholeLeaf ? input.leafStates[u.nodeIds[0]] : undefined;
      const state: UnitState = weak && weak.accuracy < WEAK_BELOW ? 'WEAK' : leafState ?? 'UNTOUCHED';
      return { ...u, subject: s.name, state, ...(weak ? { weakAccuracy: weak.accuracy } : {}), cost: COST[state] };
    }),
  );

  // Time per subject by the official marks when every studied subject has them; else equally.
  const studied = structure.subjects.filter((s) => s.units.length);
  const byMarks = studied.length > 0 && studied.every((s) => (s.marks ?? 0) > 0);
  const totalMarks = studied.reduce((n, s) => n + (s.marks ?? 0), 0);
  const shares = studied.map((s) => ({
    subject: s.name,
    share: byMarks ? (s.marks ?? 0) / totalMarks : 1 / studied.length,
    basis: (byMarks ? 'marks' : 'equal') as 'marks' | 'equal',
  }));

  // Fit the learning phase: each subject's share of the time, weakest and untouched first.
  const capacity = Math.floor(phases.learn * daily * (1 - REVIEW_SHARE));
  const scheduled = new Map<string, PlannedUnit[]>();
  const unscheduled: PlannedUnit[] = [];
  let spare = 0;
  for (const { subject, share } of shares) {
    const mine = units
      .filter((u) => u.subject === subject)
      .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (a.weakAccuracy ?? 100) - (b.weakAccuracy ?? 100));
    let budget = Math.floor(capacity * share);
    const taken: PlannedUnit[] = [];
    for (const u of mine) {
      if (u.cost <= budget) {
        taken.push(u);
        budget -= u.cost;
      } else unscheduled.push(u);
    }
    spare += budget;
    scheduled.set(subject, taken);
  }
  // Time one subject didn't need goes to the others' next units, in order.
  for (const u of [...unscheduled]) {
    if (u.cost > spare) continue;
    spare -= u.cost;
    scheduled.get(u.subject)!.push(u);
    unscheduled.splice(unscheduled.indexOf(u), 1);
  }

  const weekCount = Math.ceil(horizon.days / 7);
  const learnWeeks = Math.max(1, Math.ceil(phases.learn / 7));
  const phaseOfDay = (d: number) => (d < phases.learn ? 'learn' : d < phases.learn + phases.practise ? 'practise' : 'revise') as 'learn' | 'practise' | 'revise';

  // Spread each subject's units evenly over the learning weeks.
  const perWeek: Array<Map<string, PlannedUnit[]>> = Array.from({ length: learnWeeks }, () => new Map());
  for (const [subject, list_] of scheduled) {
    list_.forEach((u, i) => {
      const w = Math.min(learnWeeks - 1, Math.floor((i * learnWeeks) / Math.max(1, list_.length)));
      const m = perWeek[w];
      m.set(subject, [...(m.get(subject) ?? []), u]);
    });
  }

  // The recorded pattern of the first stage in scope, for the practice and test milestones.
  const firstStage = structure.scope[0];
  // Paths share one format ("Tier-II › Paper-I › …"), so a boundary check tells Tier-I from Tier-II.
  const inFirstStage = (p: ExamPart) => Boolean(firstStage) && (p.path === firstStage.path || p.path.startsWith(`${firstStage.path} › `));
  const firstStageSubjects = structure.subjects.map((s) => s.parts.find(inFirstStage)).filter(Boolean) as ExamPart[];
  const sectionPattern =
    firstStageSubjects.length && firstStageSubjects.every((p) => p.questionCount && p.durationMinutes) && new Set(firstStageSubjects.map((p) => `${p.questionCount}/${p.durationMinutes}`)).size === 1
      ? `${firstStageSubjects[0].questionCount} questions in ${firstStageSubjects[0].durationMinutes} minutes per subject, as in ${firstStage.path}`
      : undefined;
  const fullPattern = firstStage?.questionCount && firstStage?.durationMinutes ? `${firstStage.path} pattern: ${firstStage.questionCount} questions in ${firstStage.durationMinutes} minutes` : undefined;

  const weeks: NonNullable<StudyPlanSpec['weeks']> = [];
  for (let w = 0; w < weekCount; w++) {
    const first = w * 7;
    const last = Math.min(horizon.days, first + 7) - 1;
    const phase = phaseOfDay(first);
    const days = last - first + 1;
    let focus: NonNullable<StudyPlanSpec['weeks']>[number]['focus'] = [];
    let milestone: string;
    if (phase === 'learn') {
      const m = perWeek[Math.min(w, learnWeeks - 1)] ?? new Map();
      focus = [...m.entries()].map(([subject, us]) => ({ subject, minutes: us.reduce((n, u) => n + u.cost, 0), units: us.slice(0, 24).map((u) => u.label) }));
      const names = focus.flatMap((f) => f.units);
      // In a sentence, a long topic reads better shortened; the week's full list is in `focus`.
      const short = names.map((n) => (n.length > 48 ? `${n.slice(0, 47).replace(/\s+\S*$/, '').trimEnd()}…` : n));
      milestone = names.length
        ? `Finish ${plural(names.length, 'topic')}: ${list(short, 4)}. End the week with a 20-question check quiz on them; any topic under ${WEAK_BELOW}% comes back next week.`
        : 'Catch up on anything unfinished, then take a 20-question check quiz on the weeks so far.';
    } else if (phase === 'practise') {
      focus = shares.map(({ subject, share }) => ({ subject, minutes: Math.round(days * daily * share), units: [] }));
      milestone = `Timed practice: ${sectionPattern ?? 'one timed section per subject'} — one section per subject this week, and review every mistake the same day.`;
    } else {
      focus = shares.map(({ subject, share }) => ({ subject, minutes: Math.round(days * daily * share), units: [] }));
      milestone = `${days >= 5 ? 'Two full-length tests' : 'One full-length test'}${fullPattern ? ` (${fullPattern})` : ''}; then revise every topic you scored under ${WEAK_BELOW}% on.`;
    }
    weeks.push({ week: w + 1, startDate: addDays(startDate, first), endDate: addDays(startDate, last), phase, focus, milestone });
  }

  // The first week, day by day: subjects in turn, learn then practise each topic, review from day 3.
  const week1 = [...(perWeek[0] ?? new Map()).entries()].map(([subject, us]) => ({ subject, queue: [...us] }));
  const dayCount = Math.min(7, horizon.days);
  const days: StudyPlanSpec['days'] = [];
  let turn = 0;
  for (let d = 0; d < dayCount; d++) {
    const tasks: StudyPlanSpec['days'][number]['tasks'] = [];
    let used = 0;
    const reviewMinutes = d >= 2 ? Math.min(MINUTES.REVISE, Math.floor(daily * REVIEW_SHARE)) : 0;
    const room = daily - reviewMinutes;
    let guard = 0;
    while (week1.some((s) => s.queue.length) && guard++ < 50) {
      const s = week1[turn % week1.length];
      turn++;
      const u = s.queue[0];
      if (!u) continue;
      if (used + u.cost > room) {
        turn--; // tomorrow starts with the subject whose topic didn't fit today
        break;
      }
      s.queue.shift();
      used += u.cost;
      if (u.state === 'UNTOUCHED') {
        tasks.push({ kind: 'learn', title: `Learn: ${u.label}`, minutes: MINUTES.LEARN, topic: u.label, ref: s.subject });
        tasks.push({ kind: 'practice', title: `Practise: ${u.label}`, minutes: MINUTES.PRACTICE, topic: u.label, ref: s.subject });
      } else if (u.state === 'WEAK') {
        tasks.push({ kind: 'revise', title: `Revise: ${u.label}${u.weakAccuracy !== undefined ? ` (${u.weakAccuracy}% so far)` : ''}`, minutes: MINUTES.REVISE, topic: u.label, ref: s.subject });
        tasks.push({ kind: 'practice', title: `Practise: ${u.label}`, minutes: MINUTES.PRACTICE, topic: u.label, ref: s.subject });
        tasks.push({ kind: 'test', title: `Check-quiz: ${u.label}`, minutes: MINUTES.QUIZ, topic: u.label, ref: s.subject });
      } else {
        tasks.push({ kind: u.state === 'LEARNING' ? 'practice' : 'review', title: `${u.state === 'LEARNING' ? 'Practise' : 'Review'}: ${u.label}`, minutes: Math.max(5, Math.min(u.cost, 240)), topic: u.label, ref: s.subject });
      }
    }
    if (reviewMinutes >= 5) tasks.push({ kind: 'review', title: 'Review what you studied two days ago', minutes: reviewMinutes });
    if (!tasks.length) tasks.push({ kind: 'review', title: 'Review this week’s topics', minutes: Math.max(5, Math.min(daily, 240)) });
    days.push({ date: addDays(startDate, d), tasks: tasks.slice(0, 8) });
  }

  // Honest arithmetic.
  const totalCost = units.reduce((n, u) => n + u.cost, 0);
  const scheduledCount = units.length - unscheduled.length;
  const fits = unscheduled.length === 0;
  const neededDaily = Math.ceil(totalCost / Math.max(1, phases.learn * (1 - REVIEW_SHARE)) / 15) * 15;
  const outlook = {
    units: units.length,
    scheduled: scheduledCount,
    firstPassHours: Math.round((totalCost / 60) * 10) / 10,
    availableHours: Math.round((capacity / 60) * 10) / 10,
    fitsInTime: fits,
    ...(fits
      ? {}
      : { note: `At ${daily} minutes a day, the learning weeks cover ${scheduledCount} of the ${units.length} topics, weakest and highest-marks subjects first. About ${neededDaily} minutes a day would cover all of them.` }),
  };

  // What to focus on first: where the marks are, and where the student is weakest.
  const focus: StudyPlanSpec['focus'] = [];
  const weakest = units.filter((u) => u.state === 'WEAK').sort((a, b) => (a.weakAccuracy ?? 100) - (b.weakAccuracy ?? 100)).slice(0, 4);
  for (const u of weakest) focus.push({ topic: clip(u.label, 200), reason: clip(`Weak in your quizzes${u.weakAccuracy !== undefined ? ` (${u.weakAccuracy}%)` : ''} — first in ${u.subject}`, 300) });
  for (const s of [...shares].sort((a, b) => b.share - a.share).slice(0, 4)) {
    const subject = structure.subjects.find((x) => x.name === s.subject)!;
    focus.push({
      topic: s.subject,
      reason: clip(
        s.basis === 'marks'
          ? `${Math.round(s.share * 100)}% of the marks in the plan's scope (${subject.marks} of ${totalMarks}) — ${plural(subject.units.length, 'topic')}`
          : `${plural(subject.units.length, 'topic')}; the syllabus records no marks, so subjects share the time equally`,
        300,
      ),
    });
  }

  const learnWeeksLabel = `${learnWeeks === 1 ? 'Week 1' : `Weeks 1–${learnWeeks}`}`;
  const practiseWeeks = weeks.filter((w) => w.phase === 'practise').map((w) => w.week);
  const reviseWeeks = weeks.filter((w) => w.phase === 'revise').map((w) => w.week);
  const span = (ws: number[]) => (ws.length === 1 ? `week ${ws[0]}` : `weeks ${ws[0]}–${ws[ws.length - 1]}`);
  const strategy: NonNullable<StudyPlanSpec['strategy']> = [
    {
      title: 'Every day',
      detail: `${learnWeeksLabel}: learn a topic, then practise it straight away. From the third day, spend the last ${MINUTES.REVISE} minutes on what you studied two days earlier — weak material comes back after two days in Sadhya's planner.`,
    },
    {
      title: 'Every week',
      detail: `End each learning week with a 20-question check quiz on its topics (“Quiz me on …”). A topic under ${WEAK_BELOW}% goes back into the next week; ask me “Analyze my quiz mistakes” to see which.`,
    },
  ];
  if (practiseWeeks.length) strategy.push({ title: 'Timed practice', detail: `${span(practiseWeeks)[0].toUpperCase()}${span(practiseWeeks).slice(1)}: ${sectionPattern ?? 'one timed section per subject'}. Speed comes after accuracy: review every mistake the same day.` });
  if (reviseWeeks.length) strategy.push({ title: 'Full-length tests', detail: `${span(reviseWeeks)[0].toUpperCase()}${span(reviseWeeks).slice(1)}: two full tests a week${fullPattern ? ` (${fullPattern})` : ''}. After each, ask me “Analyze my last test” and fix the weakest topics before the next one.` });
  if (input.pastPapers) strategy.push({ title: 'Past papers', detail: clip(input.pastPapers.note, 700) });
  for (const s of structure.subjects.filter((x) => x.skillTest)) strategy.push({ title: s.name, detail: clip(`A skill test, practised rather than studied. The notice: “${s.skillTest}”`, 700) });
  strategy.push({ title: 'Falling behind', detail: 'Ask me to plan again: the plan is rebuilt from where you are, not from where it expected you to be.' });

  const sources: NonNullable<StudyPlanSpec['sources']> = [];
  if (structure.source.title) {
    sources.push({
      label: clip(`Official syllabus: ${structure.source.title}`, 240),
      ...(structure.source.url && /^https?:\/\//.test(structure.source.url) ? { url: structure.source.url } : {}),
      detail: clip(`Structure, marks and timings as the syllabus records them${structure.source.hash ? `; document ${structure.source.hash.slice(0, 12)}` : ''}.`, 300),
    });
  }
  sources.push({
    label: 'Your practice in Sadhya',
    detail: input.history
      ? `${plural(input.history.quizzes, 'quiz', 'quizzes')} and ${plural(input.history.tests, 'test')} so far${input.weakTopics.length ? `; ${plural(input.weakTopics.length, 'weak topic')} recorded for this exam` : ''}.`
      : 'Not available when this plan was made.',
  });
  sources.push({ label: 'Time estimates', detail: `Sadhya's study planner: ${MINUTES.LEARN} minutes to learn a topic and ${MINUTES.PRACTICE} to practise it.` });

  const spec: StudyPlanSpec = {
    title: clip(`${input.exam.shortName} — ${horizon.days}-day plan`, 120),
    startDate,
    dailyMinutes: Math.max(10, Math.min(600, daily)),
    days,
    focus: focus.length ? focus.slice(0, 20) : [{ topic: input.exam.shortName, reason: 'The whole syllabus, in order' }],
    exam: {
      examId: input.exam.examId,
      name: clip(input.exam.name, 200),
      scope: structure.scope.map((p) => clip(p.path, 200)).slice(0, 8),
      notIncluded: structure.notIncluded.map((p) => clip(p, 200)).slice(0, 8),
    },
    horizon,
    outlook,
    weeks,
    strategy: strategy.slice(0, 10),
    sources: sources.slice(0, 8),
  };
  return {
    spec,
    unscheduled: unscheduled.map((u) => ({ subject: u.subject, unit: u.label })),
    phases,
    subjectShares: shares,
  };
}

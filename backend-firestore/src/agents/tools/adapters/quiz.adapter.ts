import { z } from 'zod';
import { featureFlags } from '../../../config/featureFlags';
import { DocumentSpec, MAX_PAPER_QUESTIONS, MAX_QUIZ_QUESTIONS, QuizSpec } from '../../artifacts/artifact.types';
import { ToolDefinition, ToolRegistry } from '../ToolRegistry';
import { ToolError } from '../toolErrors';
import { normalizeStrict } from './formulaVerify';

/**
 * Quizzes (Phase 6).
 *
 * "Create a 20-question quiz from it" — from a formula chart the student already has. Like the
 * flashcards, the quiz is built from the chart's STORED, verified content with no model call:
 * every correct answer is the chart's own formula, symbol or statement, and every wrong option is
 * another real entry from the same chapter. So the answer key cannot be wrong in a way the chart
 * is not, and each explanation carries the page the chart cites.
 *
 * A quiz is saved as the student's quiz attempt (QuizAttemptsService — the record the existing
 * quiz page takes and scores server-side, and which feeds their stats and weak topics), plus a
 * `quiz` artifact that points at it. The artifact never holds the answer key.
 */

const artifacts = () => require('../../artifacts/artifacts.service').getArtifactsService();
const usage = () => require('../../../services/usage.service').usageService;
const quizAttempts = () => require('../../../services/tests/quizAttempts.service').quizAttemptsService;

export const DEFAULT_QUIZ_QUESTIONS = 20;
const OPTIONS = 4;

/** The stored question shape (quizAttempt.types StoredQuizQuestion), as far as a quiz tool fills it. */
export interface QuizQuestionDraft {
  id: string;
  text: string;
  topic: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  questionOrigin: 'AUTHENTIC_PYQ' | 'PYQ_INSPIRED' | 'CURRICULUM_SYNTHESIZED' | 'GENERAL_KNOWLEDGE';
  identityStatus: 'CANONICAL' | 'UNANCHORED';
  examId?: string;
  syllabusNodeId?: string;
  sourcePyqId?: string;
  sourceYear?: number;
  sourceShift?: string;
  sourcePaper?: string;
}

export const quizQuestionSchema = z.object({
  id: z.string().min(1).max(80),
  text: z.string().trim().min(5).max(1_500),
  topic: z.string().trim().min(1).max(200),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
  correctAnswerIndex: z.number().int().min(0).max(5),
  explanation: z.string().trim().max(1_200),
  questionOrigin: z.enum(['AUTHENTIC_PYQ', 'PYQ_INSPIRED', 'CURRICULUM_SYNTHESIZED', 'GENERAL_KNOWLEDGE']),
  identityStatus: z.enum(['CANONICAL', 'UNANCHORED']),
  examId: z.string().optional(),
  syllabusNodeId: z.string().optional(),
  sourcePyqId: z.string().optional(),
  sourceYear: z.number().int().optional(),
  sourceShift: z.string().optional(),
  sourcePaper: z.string().optional(),
});

/**
 * "Create a 20-question quiz" → 20, "30 NEET Biology questions" → 30: the number nearest before
 * the word "questions", skipping class numbers ("Class 11") and years; clamped to one quiz's size.
 */
export function questionCountFromGoal(goal: string, fallback = DEFAULT_QUIZ_QUESTIONS): number {
  const g = String(goal ?? '');
  let n = fallback;
  for (const noun of g.matchAll(/\b(?:questions?|qs|mcqs?|pyqs?|problems?|items?)\b/gi)) {
    const before = g.slice(Math.max(0, (noun.index ?? 0) - 45), noun.index);
    const numbers = [...before.matchAll(/(?<![\w.])(\d{1,3})(?![\w.])/g)].filter(
      (m) => !/\b(class|grade|std|standard)\s*$/i.test(before.slice(0, m.index)),
    );
    if (numbers.length) {
      n = Number(numbers[numbers.length - 1][1]);
      break;
    }
  }
  return Math.min(MAX_QUIZ_QUESTIONS, Math.max(5, Number.isFinite(n) ? n : fallback));
}

// ── Deterministic choice ───────────────────────────────────────────────────────────────────

/** Small seeded PRNG, so the same chart always yields the same quiz (reproducible, testable). */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Reading a chart ────────────────────────────────────────────────────────────────────────

interface ChartFormula { formula: string; meaning?: string; note?: string; topic: string }
interface ChartSymbol { symbol: string; name: string; unit: string }
interface ChartStatement { label: string; statement: string; page?: number }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
/** "Eq. (4.16) · §4.10 Circular motion · p. 15 of the chapter PDF" → "Circular motion". */
const sectionOfNote = (note?: string) => note?.match(/§[\d.]+\s+([^·]+)/)?.[1]?.trim();

export function readChart(spec: DocumentSpec): { formulae: ChartFormula[]; symbols: ChartSymbol[]; statements: ChartStatement[] } {
  const formulae: ChartFormula[] = [];
  const symbols: ChartSymbol[] = [];
  const statements: ChartStatement[] = [];
  for (const section of spec.sections ?? []) {
    const heading = section.heading ?? '';
    for (const block of section.blocks ?? []) {
      if (block.type === 'formulae') {
        const fallback = heading.replace(/^Formulae:\s*/i, '').trim() || 'Formulae';
        for (const item of block.items) {
          formulae.push({ formula: item.formula, meaning: item.meaning, note: item.note, topic: sectionOfNote(item.note) ?? fallback });
        }
      } else if (block.type === 'keyValue' && /symbols?\b/i.test(heading)) {
        for (const item of block.items) {
          const [name, unit] = item.value.split(/\s+—\s+/);
          if (name && unit) symbols.push({ symbol: item.label, name: name.trim(), unit: unit.trim() });
        }
      } else if (block.type === 'keyValue' && /laws?|definitions?/i.test(heading)) {
        for (const item of block.items) {
          const page = Number(item.value.match(/\(p\. (\d+)\)\s*$/)?.[1]);
          statements.push({ label: item.label, statement: item.value.replace(/\s*\(p\. \d+\)\s*$/, '').trim(), ...(page ? { page } : {}) });
        }
      }
    }
  }
  return { formulae, symbols, statements };
}

/** The first relation splits a formula: "f_c = mv^2/R" → ["f_c", "=", "mv^2/R"]; chains are not split. */
function splitRelation(formula: string): { lhs: string; op: string; rhs: string } | null {
  const ops = formula.match(/=|≤|≥|<=|>=/g) ?? [];
  if (ops.length !== 1) return null;
  const m = formula.match(/^(.*?)\s*(=|≤|≥|<=|>=)\s*(.*)$/);
  if (!m || !m[1].trim() || !m[3].trim()) return null;
  return { lhs: m[1].trim(), op: m[2], rhs: m[3].trim() };
}

/** Units that name the same thing must never be offered against each other. */
function unitKey(unit: string): string {
  return unit
    .replace(/\(about[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

type Kind = 'recognise' | 'complete' | 'unit' | 'symbol' | 'statement';
interface Candidate { kind: Kind; key: string; topic: string; text: string; correct: string; pool: string[]; equivalent: (a: string, b: string) => boolean; explanation: string }

const formulaEq = (a: string, b: string) => normalizeStrict(a) === normalizeStrict(b);
const textEq = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

export interface ComposedQuiz {
  title: string;
  questions: QuizQuestionDraft[];
  topics: QuizSpec['topics'];
  origin: QuizSpec['origin'];
  validation: NonNullable<QuizSpec['validation']>;
  sourceArtifactId: string;
  sourceNote: string;
  durationMinutes: number;
}

/**
 * A multiple-choice quiz from a stored chart. Topic coverage follows the chart's sections (round
 * robin, in chapter order), each candidate is validated — four distinct options, none equivalent to
 * the answer, no repeated question — and the rest are reported as rejected with a reason.
 */
export function composeQuizFromDocument(
  source: { artifactId: string; title: string; spec: DocumentSpec },
  count = DEFAULT_QUIZ_QUESTIONS,
  /** Only these chart topics ("quiz me on my weak areas"); all topics when absent. */
  focusTopics?: string[],
): ComposedQuiz {
  const chart = readChart(source.spec);
  const focus = focusTopics?.length ? new Set(focusTopics.map((t) => t.trim().toLowerCase())) : null;
  // Wrong options still come from the whole chart; only the questions are narrowed.
  const formulae = focus ? chart.formulae.filter((f) => focus.has(f.topic.toLowerCase())) : chart.formulae;
  const symbols = focus ? [] : chart.symbols;
  const statements = focus ? [] : chart.statements;
  const random = rng(source.artifactId);
  const candidates: Candidate[] = [];

  const allFormulae = chart.formulae.map((f) => f.formula);
  const rhsPool = chart.formulae.map((f) => splitRelation(f.formula)?.rhs).filter((x): x is string => Boolean(x));
  // Every right-hand side the chart gives for a left-hand side: "F = ?" has three true answers in a
  // chart holding F = ma, F = kma and F = -kx, so none of them may be offered as a wrong option.
  const rhsByLhs = new Map<string, string[]>();
  for (const f of chart.formulae) {
    const parts = splitRelation(f.formula);
    if (parts) rhsByLhs.set(normalizeStrict(parts.lhs), [...(rhsByLhs.get(normalizeStrict(parts.lhs)) ?? []), parts.rhs]);
  }
  for (const f of formulae) {
    const cite = f.note ? ` (${f.note})` : '';
    const explanation = clip(`${f.formula}${f.meaning ? ` — ${f.meaning.replace(/\.$/, '')}` : ''}. From your formula chart${cite}.`, 1_200);
    if (f.meaning) {
      candidates.push({
        kind: 'recognise',
        key: `formula:${normalizeStrict(f.formula)}`,
        topic: f.topic,
        text: `Which formula expresses this: ${clip(f.meaning.replace(/\.$/, ''), 400)}?`,
        correct: f.formula,
        pool: allFormulae.filter((o) => o !== f.formula),
        equivalent: formulaEq,
        explanation,
      });
    }
    const parts = splitRelation(f.formula);
    if (parts && parts.lhs.length <= 24) {
      const alsoTrue = rhsByLhs.get(normalizeStrict(parts.lhs)) ?? [];
      candidates.push({
        kind: 'complete',
        key: `formula:${normalizeStrict(f.formula)}`,
        topic: f.topic,
        text: `Complete the relation: ${parts.lhs} ${parts.op} ?`,
        correct: parts.rhs,
        pool: rhsPool.filter((o) => !formulaEq(o, parts.lhs) && !alsoTrue.some((t) => formulaEq(o, t))),
        equivalent: formulaEq,
        explanation,
      });
    }
  }

  const unitsByKey = new Map<string, string>();
  for (const s of symbols) if (!unitsByKey.has(unitKey(s.unit))) unitsByKey.set(unitKey(s.unit), s.unit);
  for (const s of symbols) {
    const explanation = `${s.symbol} is ${s.name.charAt(0).toLowerCase()}${s.name.slice(1)}, measured in ${s.unit}. From your formula chart.`;
    candidates.push({
      kind: 'unit',
      key: `symbol:${s.symbol}`,
      topic: 'Symbols and SI units',
      text: `What is the SI unit of ${s.name.charAt(0).toLowerCase()}${s.name.slice(1)} (${s.symbol})?`,
      correct: s.unit,
      pool: [...unitsByKey.entries()].filter(([k]) => k !== unitKey(s.unit)).map(([, u]) => u),
      equivalent: (a, b) => unitKey(a) === unitKey(b),
      explanation,
    });
    candidates.push({
      kind: 'symbol',
      key: `symbol:${s.symbol}`,
      topic: 'Symbols and SI units',
      text: `In this chapter, what does ${s.symbol} stand for?`,
      correct: s.name,
      pool: symbols.filter((o) => o !== s && !textEq(o.name, s.name)).map((o) => o.name),
      equivalent: textEq,
      explanation,
    });
  }

  for (const st of statements) {
    candidates.push({
      kind: 'statement',
      key: `statement:${st.label.toLowerCase()}`,
      topic: 'Laws and definitions',
      text: `Which of these does the chapter state as follows? “${clip(st.statement, 600)}”`,
      correct: st.label,
      pool: statements.filter((o) => o !== st).map((o) => o.label),
      equivalent: textEq,
      explanation: clip(`${st.label}: ${st.statement}${st.page ? ` (p. ${st.page} of the chapter PDF)` : ''}`, 1_200),
    });
  }

  // Validate every candidate; the survivors become questions.
  const rejected: Record<string, number> = {};
  const reject = (reason: string) => (rejected[reason] = (rejected[reason] ?? 0) + 1);
  const seenStems = new Set<string>();
  const valid: Array<Candidate & { options: string[]; correctAnswerIndex: number }> = [];
  for (const c of candidates) {
    const stem = c.text.toLowerCase();
    if (seenStems.has(stem)) {
      reject('duplicate_question');
      continue;
    }
    const distractors: string[] = [];
    for (const option of shuffle(c.pool, random)) {
      if (distractors.length === OPTIONS - 1) break;
      if (c.equivalent(option, c.correct) || distractors.some((d) => c.equivalent(d, option))) continue;
      if (c.kind === 'complete' && c.text.includes(option)) continue;
      distractors.push(option);
    }
    if (distractors.length < OPTIONS - 1) {
      reject('not_enough_distinct_options');
      continue;
    }
    const options = shuffle([c.correct, ...distractors], random);
    seenStems.add(stem);
    valid.push({ ...c, options, correctAnswerIndex: options.indexOf(c.correct) });
  }
  if (valid.length === 0) {
    throw new ToolError(
      'not_found',
      focus ? 'The chart has no formulae on those topics to build a quiz from.' : 'That document has no formulae, symbols or statements to build a quiz from.',
    );
  }

  // Topic coverage: round robin over topics in chart order, one item per question where possible,
  // preferring recognition over completion over units, symbols and statements.
  const priority: Record<Kind, number> = { recognise: 0, complete: 1, unit: 2, symbol: 3, statement: 4 };
  const topics: string[] = [];
  for (const c of valid) if (!topics.includes(c.topic)) topics.push(c.topic);
  const queues = new Map(topics.map((t) => [t, valid.filter((c) => c.topic === t).sort((a, b) => priority[a.kind] - priority[b.kind])]));
  const wanted = Math.min(count, valid.length);
  const picked: typeof valid = [];
  const usedKeys = new Set<string>();
  for (const allowRepeatItem of [false, true]) {
    let progress = true;
    while (picked.length < wanted && progress) {
      progress = false;
      for (const t of topics) {
        if (picked.length >= wanted) break;
        const queue = queues.get(t)!;
        const i = queue.findIndex((c) => allowRepeatItem || !usedKeys.has(c.key));
        if (i < 0) continue;
        const [c] = queue.splice(i, 1);
        picked.push(c);
        usedKeys.add(c.key);
        progress = true;
      }
    }
  }

  const questions: QuizQuestionDraft[] = picked.map((c, i) => ({
    id: `aq_${i + 1}`,
    text: c.text,
    topic: c.topic,
    options: c.options,
    correctAnswerIndex: c.correctAnswerIndex,
    explanation: c.explanation,
    questionOrigin: 'CURRICULUM_SYNTHESIZED',
    identityStatus: 'UNANCHORED',
  }));
  const topicCounts = new Map<string, number>();
  for (const q of questions) topicCounts.set(q.topic, (topicCounts.get(q.topic) ?? 0) + 1);

  const base = source.title.replace(/\s+—\s+(Formula Chart|Flashcards)$/i, '').trim() || source.title;
  return {
    title: clip(`${base} — ${focus ? 'Weak-area quiz' : 'Quiz'}`, 120),
    questions,
    topics: [...topicCounts.entries()].map(([topic, n]) => ({ topic: clip(topic, 200), count: n })),
    origin: [{ label: 'From your formula chart (verified against the chapter)', count: questions.length }],
    validation: { checked: candidates.length, accepted: valid.length, rejected },
    sourceArtifactId: source.artifactId,
    sourceNote: `Built from “${clip(source.title, 150)}”: every answer is the chart’s own verified entry, and every wrong option is another real entry from the same chapter.`,
    durationMinutes: Math.max(5, questions.length),
  };
}

// ── Tools ──────────────────────────────────────────────────────────────────────────────────

export function registerQuizTools(registry: ToolRegistry): ToolRegistry {
  const findMaterial: ToolDefinition<any, any> = {
    name: 'find_my_study_material',
    description:
      "Finds the student's most recent formula chart or document to build on. A flashcard deck made from a chart leads back to that chart, " +
      'since the chart holds the verified material.',
    category: 'artifact',
    inputSchema: z.object({
      titleContains: z.string().max(80).optional(),
      /** A specific artifact of theirs (e.g. the chart an analysis came from). */
      artifactId: z.string().max(120).optional(),
    }),
    outputSchema: z
      .object({ found: z.boolean(), artifactId: z.string().optional(), title: z.string().optional(), spec: z.any().optional(), via: z.string().optional() })
      .passthrough(),
    permissions: ['read:own-artifact'],
    costClass: 'free',
    timeoutMs: 15_000,
    retry: { maxAttempts: 2, baseBackoffMs: 400 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'GENERATED',
    isEnabled: () => featureFlags.agentArtifacts,
    async execute(input, ctx) {
      const service = artifacts();
      const phrase = input.titleContains?.toLowerCase();
      // Owner-checked either way: a named artifact through getForUser, the latest through listForUser.
      const latest = input.artifactId
        ? await service.getForUser(input.artifactId, ctx.userId).catch(() => null)
        : ((await service.listForUser(ctx.userId, 30)) as any[]).find(
            (a) => a.status === 'ready' && (a.kind === 'document' || a.kind === 'flashcards') && (!phrase || String(a.title).toLowerCase().includes(phrase)),
          );
      if (!latest || latest.status !== 'ready' || (latest.kind !== 'document' && latest.kind !== 'flashcards')) {
        return { data: { found: false }, provenance: 'GENERATED' };
      }
      let doc = latest;
      let via: string | undefined;
      if (latest.kind === 'flashcards') {
        const sourceId = latest.spec?.sourceArtifactId;
        const source = sourceId ? await service.getForUser(sourceId, ctx.userId).catch(() => null) : null;
        if (!source || source.kind !== 'document') return { data: { found: false }, provenance: 'GENERATED' };
        doc = source;
        via = latest.title;
      }
      return { data: { found: true, artifactId: doc.artifactId, title: doc.title, spec: doc.spec, ...(via ? { via } : {}) }, provenance: doc.provenance ?? 'GENERATED' };
    },
    summarize: (out: any) => (out?.found ? { found: true, title: out.title } : { found: false }),
  };

  const compose: ToolDefinition<any, any> = {
    name: 'compose_quiz_from_document',
    description:
      'Builds a multiple-choice quiz from a stored formula chart: answers are the chart’s own verified entries, wrong options are other real entries. ' +
      'Validates every question (four distinct, non-equivalent options; no repeats). No retrieval, no model call.',
    category: 'document',
    inputSchema: z.object({
      artifactId: z.string(),
      title: z.string(),
      spec: z.object({ sections: z.array(z.any()) }).passthrough(),
      count: z.number().int().min(5).max(MAX_QUIZ_QUESTIONS).optional(),
      /** Narrow the questions to these topics — plain names, or an analysis's weak areas. */
      focusTopics: z.array(z.union([z.string(), z.object({ topic: z.string() }).passthrough()])).max(30).optional(),
    }),
    outputSchema: z.object({
      title: z.string(),
      questions: z.array(quizQuestionSchema).min(1),
      topics: z.array(z.object({ topic: z.string(), count: z.number() })),
      origin: z.array(z.object({ label: z.string(), count: z.number() })),
      validation: z.object({ checked: z.number(), accepted: z.number(), rejected: z.record(z.string(), z.number()) }),
      sourceArtifactId: z.string(),
      sourceNote: z.string(),
      durationMinutes: z.number(),
    }),
    permissions: ['read:own-artifact'],
    costClass: 'free',
    timeoutMs: 5_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'GENERATED',
    async execute(input) {
      const focus = (input.focusTopics ?? []).map((t: any) => (typeof t === 'string' ? t : t.topic));
      return { data: composeQuizFromDocument(input as any, input.count, focus.length ? focus : undefined), provenance: 'GENERATED' };
    },
    // Never the questions: run events are visible to the student before they take the quiz.
    summarize: (out: any) => ({ questions: out?.questions?.length ?? 0, topics: out?.topics?.length ?? 0, checked: out?.validation?.checked ?? 0 }),
  };

  const create: ToolDefinition<any, any> = {
    name: 'create_quiz_artifact',
    description:
      'Saves a validated quiz as the student’s quiz attempt (scored server-side when they submit, feeding their stats and weak topics) and as a quiz artifact they can open.',
    category: 'artifact',
    inputSchema: z.object({
      title: z.string().trim().min(1).max(120),
      questions: z.array(quizQuestionSchema).min(1).max(MAX_PAPER_QUESTIONS),
      topics: z.array(z.object({ topic: z.string(), count: z.number().int().min(1) })).min(1),
      origin: z.array(z.object({ label: z.string(), count: z.number().int().min(1) })).min(1),
      durationMinutes: z.number().int().min(1).max(300).optional(),
      validation: z.object({ checked: z.number(), accepted: z.number(), rejected: z.record(z.string(), z.number()) }).optional(),
      sourceArtifactId: z.string().optional(),
      sourceNote: z.string().max(300).optional(),
      /** The attempt's source label in the student's history. */
      source: z.enum(['topic', 'notebook', 'pyq-paper', 'weak-areas']).optional(),
      topic: z.string().max(200).optional(),
    }),
    outputSchema: z.object({ artifactId: z.string(), title: z.string(), questionCount: z.number(), attemptId: z.string() }).passthrough(),
    permissions: ['write:own-artifact'],
    costClass: 'low',
    timeoutMs: 20_000,
    // Writes: never retried (a retry would bill twice and leave two quizzes).
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: false,
    requiresApproval: false,
    provenance: 'GENERATED',
    isEnabled: () => featureFlags.agentArtifacts,
    async execute(input, ctx) {
      try {
        await usage().consumeQuota(ctx.userId, 'artifactGenerations', 1);
      } catch (e: any) {
        if (e?.code === 'QUOTA_EXHAUSTED') throw new ToolError('permission', e.message || 'You have used all your generations for this period.');
        throw e;
      }
      const durationMinutes = input.durationMinutes ?? Math.max(5, input.questions.length);
      const attempt = await quizAttempts().createFromQuestions(ctx.userId, input.questions, {
        title: input.title,
        source: input.source ?? 'topic',
        topic: input.topic ?? input.topics[0]?.topic,
        mode: 'exam',
        durationMinutes,
      });
      const spec: QuizSpec = {
        title: input.title,
        attemptId: attempt.id,
        questionCount: input.questions.length,
        durationMinutes,
        topics: input.topics,
        origin: input.origin,
        ...(input.sourceArtifactId ? { sourceArtifactId: input.sourceArtifactId } : {}),
        ...(input.validation ? { validation: input.validation } : {}),
        ...(input.sourceNote ? { sourceNote: input.sourceNote } : {}),
      };
      const doc = await artifacts().createStructured('quiz', { userId: ctx.userId, runId: ctx.runId, spec });
      return {
        data: { artifactId: doc.artifactId, title: doc.title, questionCount: spec.questionCount, attemptId: attempt.id, kind: 'quiz' },
        provenance: 'GENERATED',
      };
    },
    summarize: (out: any) => ({ artifactId: out?.artifactId, questions: out?.questionCount }),
  };

  for (const tool of [findMaterial, compose, create]) registry.register(tool);
  return registry;
}

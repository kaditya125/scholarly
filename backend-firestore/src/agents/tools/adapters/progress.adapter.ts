import { z } from 'zod';
import { featureFlags } from '../../../config/featureFlags';
import { DocumentSpec, ReportSpec, reportSpecSchema } from '../../artifacts/artifact.types';
import { ToolDefinition, ToolRegistry } from '../ToolRegistry';
import { ToolError } from '../toolErrors';
import { readChart } from './quiz.adapter';
import { tokenize } from './curriculumMatch';

/**
 * Performance analysis (Phase 6): "Analyze my quiz mistakes and tell me what I should revise" and
 * "Analyze my last 5 tests".
 *
 * Reads what the student actually did — their scored quiz attempts (QuizAttemptsService, graded
 * server-side at submit) and test attempts (test series, graded by ResultAnalysisService) — and
 * never re-grades: a quiz attempt's per-topic breakdown is the one its own submit computed. The
 * analysis adds what a single attempt cannot: aggregation across attempts, how much evidence stands
 * behind each weak area, the exact questions missed, and, for a quiz built from a formula chart, the
 * chart pages to go back to. No model call anywhere.
 */

const artifacts = () => require('../../artifacts/artifacts.service').getArtifactsService();
const quizAttempts = () => require('../../../services/tests/quizAttempts.service').quizAttemptsService;
const testsRepo = () => require('../../../repositories/tests.repository').testsRepository;
const syllabusGraph = () => require('../../../services/exam/syllabusGraph.service').syllabusGraphService;
const userStats = () => new (require('../../../services/userStats.service').UserStatsService)();
const examIndex = () => require('../../../services/pyq/examIndex');
const examMaster = () => require('../../../services/exam/examMaster.service').examMasterService;

/** Same thresholds as the quiz attempt grader (quizAttempts.service.ts), so a topic the student's own
 *  result page calls weak is weak here too. */
export const WEAK_BELOW = 60;
export const STRONG_FROM = 80;
/** Evidence saturates here, as in the grader's sampleConfidence: 8 questions on a topic is a finding. */
const CONFIDENT_SAMPLE_SIZE = 8;
export const confidenceFor = (total: number) => Math.max(0, Math.min(1, total / CONFIDENT_SAMPLE_SIZE));

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export interface TopicRow {
  topic: string;
  correct: number;
  incorrect: number;
  unattempted: number;
  total: number;
  examId?: string;
  syllabusNodeId?: string;
}

export interface Mistake {
  question: string;
  topic: string;
  yourAnswer?: string;
  correctAnswer: string;
  note?: string;
}

/** One scored attempt, reduced to what the analysis needs. */
export interface AttemptEvidence {
  attemptId: string;
  kind: 'quiz' | 'test';
  title: string;
  completedAt?: string;
  accuracy: number;
  questions: number;
  rows: TopicRow[];
  mistakes: Mistake[];
  /** The chart a quiz was built from, when it was (for page references). */
  sourceArtifactId?: string;
}

const attemptEvidenceSchema = z.object({
  attemptId: z.string(),
  kind: z.enum(['quiz', 'test']),
  title: z.string(),
  completedAt: z.string().optional(),
  accuracy: z.number(),
  questions: z.number(),
  rows: z.array(
    z.object({
      topic: z.string(),
      correct: z.number(),
      incorrect: z.number(),
      unattempted: z.number(),
      total: z.number(),
      examId: z.string().optional(),
      syllabusNodeId: z.string().optional(),
    }),
  ),
  mistakes: z.array(z.object({ question: z.string(), topic: z.string(), yourAnswer: z.string().optional(), correctAnswer: z.string(), note: z.string().optional() })),
  sourceArtifactId: z.string().optional(),
});

/** The citation a chart-built question carries in its explanation: "(Eq. (4.16) · §4.10 … · p. 15 …)". */
const citationOf = (explanation?: string) => explanation?.match(/From your formula chart \(([^)]*(?:\([^)]*\)[^)]*)*)\)/)?.[1];

export function evidenceFromQuizAttempt(attempt: any, sourceArtifactId?: string): AttemptEvidence {
  const answers: Record<string, number> = attempt.answers ?? {};
  const mistakes: Mistake[] = [];
  for (const q of attempt.questions ?? []) {
    const chosen = answers[q.id];
    if (chosen === q.correctAnswerIndex) continue;
    const correct = q.options?.[q.correctAnswerIndex];
    if (!correct) continue;
    mistakes.push({
      question: clip(String(q.text), 600),
      topic: clip(String(q.topic || 'General'), 200),
      ...(chosen !== undefined && chosen !== null && q.options?.[chosen] ? { yourAnswer: clip(String(q.options[chosen]), 400) } : {}),
      correctAnswer: clip(String(correct), 400),
      ...(citationOf(q.explanation) || q.explanation ? { note: clip(citationOf(q.explanation) ?? String(q.explanation), 300) } : {}),
    });
  }
  return {
    attemptId: attempt.id,
    kind: 'quiz',
    title: String(attempt.title || 'Quiz'),
    completedAt: attempt.completedAt,
    accuracy: Number(attempt.accuracy ?? 0),
    questions: Number(attempt.totalQuestions ?? attempt.questions?.length ?? 0),
    // The breakdown the attempt's own submit computed — never re-graded here.
    rows: (attempt.topicBreakdown ?? []).map((r: any) => ({
      topic: String(r.topic || 'General'),
      correct: Number(r.correct || 0),
      incorrect: Number(r.incorrect || 0),
      unattempted: Number(r.unattempted || 0),
      total: Number(r.total || 0),
      ...(r.examId ? { examId: r.examId } : {}),
      ...(r.syllabusNodeId ? { syllabusNodeId: r.syllabusNodeId } : {}),
    })),
    mistakes,
    ...(sourceArtifactId ? { sourceArtifactId } : {}),
  };
}

/** Test attempts store no per-topic breakdown, so rows are counted from the test's own questions. */
export function evidenceFromTestAttempt(attempt: any, test: any, questions: any[]): AttemptEvidence {
  const answers: Record<string, number> = attempt.answers ?? {};
  const byTopic = new Map<string, TopicRow>();
  const mistakes: Mistake[] = [];
  for (const q of questions) {
    const topic = String(q.topic || q.subject || 'General');
    const row = byTopic.get(topic) ?? { topic, correct: 0, incorrect: 0, unattempted: 0, total: 0, ...(q.syllabusNodeId ? { syllabusNodeId: q.syllabusNodeId } : {}) };
    row.total++;
    const chosen = answers[q.id];
    if (chosen === undefined || chosen === null) row.unattempted++;
    else if (chosen === q.correctAnswerIndex) row.correct++;
    else row.incorrect++;
    byTopic.set(topic, row);
    if (chosen !== q.correctAnswerIndex && q.options?.[q.correctAnswerIndex]) {
      mistakes.push({
        question: clip(String(q.text ?? q.questionText ?? ''), 600) || 'Question',
        topic: clip(topic, 200),
        ...(chosen !== undefined && chosen !== null && q.options?.[chosen] ? { yourAnswer: clip(String(q.options[chosen]), 400) } : {}),
        correctAnswer: clip(String(q.options[q.correctAnswerIndex]), 400),
        ...(q.explanation ? { note: clip(String(q.explanation), 300) } : {}),
      });
    }
  }
  return {
    attemptId: attempt.id,
    kind: 'test',
    title: String(test?.title || 'Test'),
    completedAt: attempt.completedAt,
    accuracy: Math.round(Number(attempt.accuracy ?? 0)),
    questions: questions.length,
    rows: [...byTopic.values()],
    mistakes,
  };
}

/** Topic → the pages and formulae a formula chart gives for it. */
export function chartIndex(spec: DocumentSpec): Map<string, { refs: Array<{ label: string; page?: number }>; formulae: string[] }> {
  const index = new Map<string, { refs: Array<{ label: string; page?: number }>; formulae: string[] }>();
  for (const f of readChart(spec).formulae) {
    const entry = index.get(f.topic.toLowerCase()) ?? { refs: [], formulae: [] };
    const section = f.note?.match(/§[\d.]+\s+[^·]+/)?.[0]?.trim();
    const page = Number(f.note?.match(/p\. (\d+)/)?.[1]) || undefined;
    if (section && !entry.refs.some((r) => r.label === section && r.page === page)) entry.refs.push({ label: section, ...(page ? { page } : {}) });
    if (!entry.formulae.includes(f.formula)) entry.formulae.push(f.formula);
    index.set(f.topic.toLowerCase(), entry);
  }
  return index;
}

const pagesText = (refs: Array<{ label: string; page?: number }>) => {
  const pages = [...new Set(refs.map((r) => r.page).filter((p): p is number => Boolean(p)))].sort((a, b) => a - b);
  return pages.length === 0 ? '' : pages.length === 1 ? `p. ${pages[0]}` : `pp. ${pages.slice(0, 4).join(', ')}`;
};

/**
 * Aggregates attempts into weak and strong areas (keyed like the grader's mastery: exam + syllabus
 * node, else exam + topic label), lists the questions missed, and turns the weakest areas into
 * concrete revision actions.
 */
export function analyzePerformance(input: { evidence: AttemptEvidence[]; charts?: Array<{ artifactId: string; spec: DocumentSpec }>; title?: string }): ReportSpec {
  const evidence = input.evidence ?? [];
  if (evidence.length === 0) throw new ToolError('not_found', 'There are no scored attempts to analyse.');

  const rows = new Map<string, TopicRow>();
  for (const e of evidence) {
    for (const r of e.rows) {
      const key = `${r.examId ?? 'x'}::${r.syllabusNodeId ? `node:${r.syllabusNodeId}` : `label:${r.topic.toLowerCase()}`}`;
      const acc = rows.get(key) ?? { topic: r.topic, correct: 0, incorrect: 0, unattempted: 0, total: 0, ...(r.examId ? { examId: r.examId } : {}), ...(r.syllabusNodeId ? { syllabusNodeId: r.syllabusNodeId } : {}) };
      acc.correct += r.correct;
      acc.incorrect += r.incorrect;
      acc.unattempted += r.unattempted;
      acc.total += r.total;
      rows.set(key, acc);
    }
  }

  // Page references from any chart a quiz was built from.
  const refsFor = new Map<string, { refs: Array<{ label: string; page?: number }>; formulae: string[] }>();
  for (const chart of input.charts ?? []) for (const [topic, entry] of chartIndex(chart.spec)) if (!refsFor.has(topic)) refsFor.set(topic, entry);

  const scored = [...rows.values()]
    .filter((r) => r.total > 0)
    .map((r) => ({ ...r, accuracy: Math.round((r.correct / r.total) * 100), confidence: Math.round(confidenceFor(r.total) * 100) / 100 }));
  const weak = scored
    .filter((r) => r.accuracy < WEAK_BELOW)
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
    .slice(0, 12);
  const strong = scored
    .filter((r) => r.accuracy >= STRONG_FROM)
    .sort((a, b) => b.accuracy - a.accuracy || b.total - a.total)
    .slice(0, 12);

  const weakAreas: ReportSpec['weakAreas'] = weak.map((r) => {
    const chart = refsFor.get(r.topic.toLowerCase());
    return {
      topic: clip(r.topic, 200),
      accuracy: r.accuracy,
      correct: r.correct,
      total: r.total,
      confidence: r.confidence,
      ...(r.examId ? { examId: r.examId } : {}),
      ...(r.syllabusNodeId ? { syllabusNodeId: r.syllabusNodeId } : {}),
      ...(chart?.refs.length ? { refs: chart.refs.slice(0, 8) } : {}),
    };
  });

  const recommendations: ReportSpec['recommendations'] = [];
  for (const area of weak.slice(0, 5)) {
    const chart = refsFor.get(area.topic.toLowerCase());
    const where = chart ? pagesText(chart.refs) : '';
    const formulae = chart?.formulae.slice(0, 3) ?? [];
    recommendations.push({
      topic: clip(area.topic, 200),
      action: clip(
        `Revise ${area.topic}${where ? ` (${where} of the chapter)` : ''}${formulae.length ? ` — re-derive ${formulae.join(', ')}` : ''}, then redo the ${area.total - area.correct} question${area.total - area.correct === 1 ? '' : 's'} you missed on it.`,
        300,
      ),
    });
  }
  const blanks = evidence.reduce((n, e) => n + e.rows.reduce((m, r) => m + r.unattempted, 0), 0);
  if (blanks > 0) recommendations.push({ action: `You left ${blanks} question${blanks === 1 ? '' : 's'} blank; they are counted as missed in the topics above.` });
  if (weak.length > 0) recommendations.push({ action: 'After revising, take a short quiz on just these topics to check they have moved.' });
  else recommendations.push({ action: `No weak areas: every topic is at ${WEAK_BELOW}% or above. Keep strong topics warm with a quick weekly review.` });

  const questionsAnswered = evidence.reduce((n, e) => n + e.rows.reduce((m, r) => m + r.correct + r.incorrect, 0), 0);
  const single = evidence.length === 1;
  const title = input.title ?? (single ? `Mistake analysis — ${evidence[0].title}` : `Performance analysis — your last ${evidence.length} tests`);
  return reportSpecSchema.parse({
    title: clip(title, 120),
    basis: {
      attempts: evidence.map((e) => ({
        attemptId: e.attemptId,
        title: clip(e.title, 200),
        ...(e.completedAt ? { completedAt: e.completedAt } : {}),
        accuracy: Math.max(0, Math.min(100, e.accuracy)),
        questions: e.questions,
      })),
      questionsAnswered,
    },
    weakAreas,
    strongAreas: strong.map((r) => ({ topic: clip(r.topic, 200), accuracy: r.accuracy, total: r.total })),
    mistakes: evidence.flatMap((e) => e.mistakes).slice(0, 60),
    recommendations: recommendations.slice(0, 20),
    ...(input.charts?.length ? { sourceArtifactIds: input.charts.map((c) => c.artifactId).slice(0, 10) } : {}),
  });
}

/** Word-overlap score between a topic label and a syllabus node label (0–1, topic-side recall). */
export function syllabusMatchScore(topic: string, label: string): number {
  const t = new Set(tokenize(topic));
  const l = new Set(tokenize(label));
  if (t.size === 0 || l.size === 0) return 0;
  let hit = 0;
  for (const w of t) if (l.has(w)) hit++;
  return hit / t.size;
}

// ── Tools ──────────────────────────────────────────────────────────────────────────────────

export function registerProgressTools(registry: ToolRegistry): ToolRegistry {
  const loadCharts = async (userId: string, ids: string[]) => {
    const charts: Array<{ artifactId: string; spec: DocumentSpec }> = [];
    for (const id of [...new Set(ids)].slice(0, 5)) {
      const doc = await artifacts().getForUser(id, userId).catch(() => null);
      if (doc?.kind === 'document') charts.push({ artifactId: doc.artifactId, spec: doc.spec });
    }
    return charts;
  };

  const latestQuiz: ToolDefinition<any, any> = {
    name: 'find_my_latest_quiz_result',
    description:
      "Finds the student's most recent quiz and, if they have submitted it, its scored result (their answers, the key, the per-topic breakdown). " +
      'A quiz Sadhya made for them comes first; one still in progress is reported as pending, never analysed.',
    category: 'student',
    inputSchema: z.object({}),
    outputSchema: z
      .object({
        found: z.boolean(),
        pending: z.object({ title: z.string(), attemptId: z.string(), artifactId: z.string().optional() }).optional(),
        evidence: z.array(attemptEvidenceSchema).optional(),
        charts: z.array(z.object({ artifactId: z.string(), spec: z.any() })).optional(),
      })
      .passthrough(),
    permissions: ['read:own-history', 'read:own-artifact'],
    costClass: 'free',
    timeoutMs: 15_000,
    retry: { maxAttempts: 2, baseBackoffMs: 400 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'STUDENT_UPLOAD',
    async execute(_input, ctx) {
      // The quiz Sadhya made most recently, when there is one.
      const mine: any[] = featureFlags.agentArtifacts ? await artifacts().listForUser(ctx.userId, 30) : [];
      const quizArtifact = mine.find((a) => a.kind === 'quiz' && a.status === 'ready');
      if (quizArtifact) {
        const attempt = await quizAttempts().getAttempt(ctx.userId, quizArtifact.spec.attemptId).catch(() => null);
        if (attempt && attempt.status !== 'completed') {
          return { data: { found: false, pending: { title: attempt.title, attemptId: attempt.id, artifactId: quizArtifact.artifactId } }, provenance: 'STUDENT_UPLOAD' };
        }
        if (attempt) {
          const charts = quizArtifact.spec.sourceArtifactId ? await loadCharts(ctx.userId, [quizArtifact.spec.sourceArtifactId]) : [];
          return {
            data: { found: true, evidence: [evidenceFromQuizAttempt(attempt, quizArtifact.spec.sourceArtifactId)], charts },
            provenance: 'STUDENT_UPLOAD',
          };
        }
      }
      // Otherwise the latest quiz they completed anywhere in Sadhya.
      const summaries: any[] = await quizAttempts().listAttempts(ctx.userId);
      const done = summaries.find((s) => s.status === 'completed');
      if (!done) return { data: { found: false }, provenance: 'STUDENT_UPLOAD' };
      const attempt = await quizAttempts().getAttempt(ctx.userId, done.id);
      return { data: { found: true, evidence: [evidenceFromQuizAttempt(attempt)], charts: [] }, provenance: 'STUDENT_UPLOAD' };
    },
    summarize: (out: any) => (out?.found ? { found: true, attempt: out.evidence?.[0]?.title } : out?.pending ? { pending: out.pending.title } : { found: false }),
  };

  const history: ToolDefinition<any, any> = {
    name: 'get_my_test_history',
    description:
      "Reads the student's most recent scored attempts — Sadhya quizzes and test-series tests — newest first, with each attempt's per-topic results and the questions missed.",
    category: 'student',
    inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(5) }),
    outputSchema: z
      .object({ found: z.boolean(), evidence: z.array(attemptEvidenceSchema), charts: z.array(z.object({ artifactId: z.string(), spec: z.any() })), counts: z.object({ quizzes: z.number(), tests: z.number() }) })
      .passthrough(),
    permissions: ['read:own-history', 'read:own-artifact'],
    costClass: 'free',
    timeoutMs: 20_000,
    retry: { maxAttempts: 2, baseBackoffMs: 500 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'STUDENT_UPLOAD',
    async execute(input, ctx) {
      const limit = input.limit ?? 5;
      const summaries: any[] = (await quizAttempts().listAttempts(ctx.userId)).filter((s: any) => s.status === 'completed');
      // Test-series attempts need a composite index; without it they are skipped, not fatal.
      const tests: any[] = await testsRepo()
        .getRecentAttempts(ctx.userId)
        .catch(() => []);
      const timeline = [
        ...summaries.map((s) => ({ kind: 'quiz' as const, id: s.id, at: s.completedAt || s.createdAt || '' })),
        ...tests.map((t) => ({ kind: 'test' as const, id: t.id, at: t.completedAt || t.startedAt || '', attempt: t })),
      ]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit);

      // Which of the student's quizzes were built from one of their charts.
      const mine: any[] = featureFlags.agentArtifacts ? await artifacts().listForUser(ctx.userId, 50) : [];
      const chartOfAttempt = new Map<string, string>();
      for (const a of mine) if (a.kind === 'quiz' && a.spec?.sourceArtifactId) chartOfAttempt.set(a.spec.attemptId, a.spec.sourceArtifactId);

      const evidence: AttemptEvidence[] = [];
      for (const item of timeline) {
        if (item.kind === 'quiz') {
          const attempt = await quizAttempts().getAttempt(ctx.userId, item.id);
          evidence.push(evidenceFromQuizAttempt(attempt, chartOfAttempt.get(item.id)));
        } else {
          const test = await testsRepo().getTestById(item.attempt.testId).catch(() => null);
          const questions = test?.questionIds?.length ? await testsRepo().getQuestions(test.questionIds).catch(() => []) : [];
          evidence.push(evidenceFromTestAttempt(item.attempt, test, questions));
        }
      }
      const charts = await loadCharts(ctx.userId, evidence.map((e) => e.sourceArtifactId).filter((x): x is string => Boolean(x)));
      return {
        data: {
          found: evidence.length > 0,
          evidence,
          charts,
          counts: { quizzes: evidence.filter((e) => e.kind === 'quiz').length, tests: evidence.filter((e) => e.kind === 'test').length },
        },
        provenance: 'STUDENT_UPLOAD',
      };
    },
    summarize: (out: any) => ({ attempts: out?.evidence?.length ?? 0, quizzes: out?.counts?.quizzes ?? 0, tests: out?.counts?.tests ?? 0 }),
  };

  const analyze: ToolDefinition<any, any> = {
    name: 'analyze_performance',
    description:
      'Turns scored attempts into weak and strong areas (with how much evidence stands behind each), the questions missed, and concrete revision actions. No model call.',
    category: 'assessment',
    inputSchema: z.object({
      evidence: z.array(attemptEvidenceSchema).min(1),
      charts: z.array(z.object({ artifactId: z.string(), spec: z.object({ sections: z.array(z.any()) }).passthrough() })).optional(),
      title: z.string().max(120).optional(),
    }),
    outputSchema: reportSpecSchema,
    permissions: ['read:own-history'],
    costClass: 'free',
    timeoutMs: 5_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'STUDENT_UPLOAD',
    async execute(input) {
      return { data: analyzePerformance(input as any), provenance: 'STUDENT_UPLOAD' };
    },
    summarize: (out: any) => ({ weakAreas: out?.weakAreas?.length ?? 0, mistakes: out?.mistakes?.length ?? 0 }),
  };

  const mapToSyllabus: ToolDefinition<any, any> = {
    name: 'map_weak_areas_to_syllabus',
    description:
      "Places each weak area in the official syllabus of the student's exam: exactly, when the questions carried a syllabus node; by name otherwise, and only when the match is clear.",
    category: 'knowledge',
    inputSchema: z.object({ report: z.object({ weakAreas: z.array(z.any()) }).passthrough() }),
    outputSchema: reportSpecSchema.extend({
      mapping: z.object({ examId: z.string().optional(), examName: z.string().optional(), exact: z.number(), byName: z.number(), unmapped: z.number() }),
    }),
    permissions: ['read:shared-corpus', 'read:own-history'],
    costClass: 'free',
    timeoutMs: 20_000,
    retry: { maxAttempts: 2, baseBackoffMs: 500 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input, ctx) {
      const report = reportSpecSchema.parse(input.report);
      // The exam: what the attempts themselves say, else the student's own target exam.
      const counts = new Map<string, number>();
      for (const w of report.weakAreas) if (w.examId) counts.set(w.examId, (counts.get(w.examId) ?? 0) + 1);
      let examId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!examId) {
        const stats: any = await userStats().getUserStats(ctx.userId).catch(() => null);
        if (stats?.activeExam) examId = (await examIndex().detectExamId(String(stats.activeExam)).catch(() => null)) ?? undefined;
      }
      if (!examId) {
        return { data: { ...report, mapping: { exact: 0, byName: 0, unmapped: report.weakAreas.length } }, provenance: 'VERIFIED_CORPUS' };
      }
      const examName: string | undefined = (await examMaster().getExam(examId).catch(() => null))?.name;
      const nodes: any[] = await syllabusGraph().getSyllabusNodes({ examId }).catch(() => []);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const pathOf = (node: any) => {
        const path = [String(node.label)];
        const seen = new Set<string>();
        let cursor = node;
        while (cursor?.parentEntityId && !seen.has(cursor.id)) {
          seen.add(cursor.id);
          cursor = byId.get(cursor.parentEntityId);
          if (!cursor) break;
          path.unshift(String(cursor.label));
        }
        return path.slice(-4).map((p) => clip(p, 300));
      };
      let exact = 0;
      let byName = 0;
      const weakAreas = report.weakAreas.map((w) => {
        const node = w.syllabusNodeId ? byId.get(w.syllabusNodeId) : null;
        if (node) {
          exact++;
          return { ...w, syllabusPath: pathOf(node), syllabusMatch: 'exact' as const };
        }
        // By name: every word of the topic must appear in the node's label, and the matches must
        // all lie on ONE branch of the syllabus (a unit and its subtopic may both mention "circular
        // motion"); then the deepest is taken. Matches on two branches are ambiguous — a weak
        // "Algebra" row is never guessed onto one of several places.
        const matches = nodes.filter((n) => syllabusMatchScore(w.topic, String(n.label)) >= 1);
        const ancestorsOf = (node: any) => {
          const ids = new Set<string>();
          let cursor = node;
          while (cursor?.parentEntityId && !ids.has(cursor.parentEntityId)) {
            ids.add(cursor.parentEntityId);
            cursor = byId.get(cursor.parentEntityId);
          }
          return ids;
        };
        const deepest = matches.slice().sort((a, b) => ancestorsOf(b).size - ancestorsOf(a).size)[0];
        if (deepest && matches.every((m) => m.id === deepest.id || ancestorsOf(deepest).has(m.id))) {
          byName++;
          // A place to look, not an identity: the repo never infers a syllabusNodeId from a label
          // (quizGenerator refuses to), so a name match records the path and says how it was found.
          return { ...w, syllabusPath: pathOf(deepest), syllabusMatch: 'name' as const };
        }
        return w;
      });
      return {
        data: { ...report, weakAreas, mapping: { examId, ...(examName ? { examName } : {}), exact, byName, unmapped: report.weakAreas.length - exact - byName } },
        provenance: 'VERIFIED_CORPUS',
      };
    },
    summarize: (out: any) => ({ exam: out?.mapping?.examId, exact: out?.mapping?.exact ?? 0, byName: out?.mapping?.byName ?? 0 }),
  };

  const createReport: ToolDefinition<any, any> = {
    name: 'create_report_artifact',
    description: 'Saves a performance analysis the student owns, so a follow-up ("make a revision plan for those weak areas") plans from exactly these areas.',
    category: 'artifact',
    inputSchema: z.object({ report: z.object({ title: z.string(), weakAreas: z.array(z.any()) }).passthrough() }),
    outputSchema: z.object({ artifactId: z.string(), title: z.string(), weakAreaCount: z.number() }).passthrough(),
    permissions: ['write:own-artifact'],
    costClass: 'free',
    timeoutMs: 15_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: false,
    requiresApproval: false,
    provenance: 'STUDENT_UPLOAD',
    isEnabled: () => featureFlags.agentArtifacts,
    async execute(input, ctx) {
      // Whatever produced the report (analysis, or analysis + syllabus mapping), only the report's
      // own fields are stored; the schema strips the rest.
      const spec = reportSpecSchema.parse(input.report);
      const doc = await artifacts().createStructured('report', { userId: ctx.userId, runId: ctx.runId, spec, provenance: 'STUDENT_UPLOAD' });
      return { data: { artifactId: doc.artifactId, title: doc.title, weakAreaCount: spec.weakAreas.length, kind: 'report' }, provenance: 'STUDENT_UPLOAD' };
    },
    summarize: (out: any) => ({ artifactId: out?.artifactId, weakAreas: out?.weakAreaCount }),
  };

  for (const tool of [latestQuiz, history, analyze, mapToSyllabus, createReport]) registry.register(tool);
  return registry;
}

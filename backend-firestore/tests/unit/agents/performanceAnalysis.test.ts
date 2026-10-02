/**
 * Phase 6 — performance analysis: evidence comes from the student's scored attempts as graded,
 * weak areas carry the evidence behind them, chart-built quizzes point back to the chart's pages,
 * and syllabus mapping never guesses an identity.
 */
const mockArtifacts = { listForUser: jest.fn(), getForUser: jest.fn(), createStructured: jest.fn() };
const mockAttempts = { getAttempt: jest.fn(), listAttempts: jest.fn() };
const mockTests = { getRecentAttempts: jest.fn(), getTestById: jest.fn(), getQuestions: jest.fn() };
const mockNodes = jest.fn();
const mockStats = jest.fn();
const mockDetect = jest.fn();
jest.mock('../../../src/agents/artifacts/artifacts.service', () => ({ getArtifactsService: () => mockArtifacts }));
jest.mock('../../../src/services/tests/quizAttempts.service', () => ({ quizAttemptsService: mockAttempts }));
jest.mock('../../../src/repositories/tests.repository', () => ({ testsRepository: mockTests }));
jest.mock('../../../src/services/exam/syllabusGraph.service', () => ({ syllabusGraphService: { getSyllabusNodes: (...a: any[]) => mockNodes(...a) } }));
jest.mock('../../../src/services/userStats.service', () => ({
  UserStatsService: class {
    getUserStats(...a: any[]) {
      return mockStats(...a);
    }
  },
}));
jest.mock('../../../src/services/pyq/examIndex', () => ({ detectExamId: (...a: any[]) => mockDetect(...a) }));
jest.mock('../../../src/services/exam/examMaster.service', () => ({ examMasterService: { getExam: async (id: string) => (id === 'JEE_MAIN' ? { name: 'JEE Main' } : null) } }));

import {
  analyzePerformance,
  confidenceFor,
  evidenceFromQuizAttempt,
  evidenceFromTestAttempt,
  registerProgressTools,
  syllabusMatchScore,
} from '../../../src/agents/tools/adapters/progress.adapter';
import { composeQuizFromDocument } from '../../../src/agents/tools/adapters/quiz.adapter';
import { ToolRegistry } from '../../../src/agents/tools/ToolRegistry';
import { reportSpecSchema } from '../../../src/agents/artifacts/artifact.types';
import { CHART, CHART_SOURCE } from './fixtures/lawsOfMotionChart';

const ctx = { userId: 'student-1', runId: 'run-1', stepId: 's', signal: new AbortController().signal };

/** A scored attempt of a chart quiz: the given question ids answered wrongly, one left blank. */
function scoredChartAttempt(opts: { wrong: string[]; blank?: string[]; id?: string; completedAt?: string }) {
  const quiz = composeQuizFromDocument(CHART_SOURCE, 12);
  const answers: Record<string, number> = {};
  for (const q of quiz.questions) {
    if (opts.blank?.includes(q.id)) continue;
    answers[q.id] = opts.wrong.includes(q.id) ? (q.correctAnswerIndex + 1) % 4 : q.correctAnswerIndex;
  }
  // The breakdown the grader (quizAttempts.submitAttempt) would have stored.
  const byTopic = new Map<string, any>();
  for (const q of quiz.questions) {
    const row = byTopic.get(q.topic) ?? { topic: q.topic, correct: 0, incorrect: 0, unattempted: 0, total: 0, identityStatus: 'UNANCHORED' };
    row.total++;
    if (answers[q.id] === undefined) row.unattempted++;
    else if (answers[q.id] === q.correctAnswerIndex) row.correct++;
    else row.incorrect++;
    byTopic.set(q.topic, row);
  }
  const rows = [...byTopic.values()].map((r) => ({ ...r, accuracy: Math.round((r.correct / r.total) * 100) }));
  const correct = rows.reduce((n, r) => n + r.correct, 0);
  return {
    quiz,
    attempt: {
      id: opts.id ?? 'qa_1',
      userId: 'student-1',
      title: quiz.title,
      status: 'completed',
      completedAt: opts.completedAt ?? '2026-09-26T09:00:00.000Z',
      createdAt: '2026-09-26T08:40:00.000Z',
      questions: quiz.questions,
      totalQuestions: quiz.questions.length,
      answers,
      accuracy: Math.round((correct / quiz.questions.length) * 100),
      topicBreakdown: rows,
    },
  };
}

describe('evidenceFromQuizAttempt', () => {
  const { quiz, attempt } = scoredChartAttempt({ wrong: ['aq_2'], blank: ['aq_6'] });
  const evidence = evidenceFromQuizAttempt(attempt, 'chart-1');

  it('lists every question missed — wrong or blank — with the right answer and the chart citation', () => {
    expect(evidence.mistakes).toHaveLength(2);
    const wrong = evidence.mistakes.find((m) => m.question === quiz.questions[1].text)!;
    const q2 = quiz.questions[1];
    expect(wrong).toMatchObject({ correctAnswer: q2.options[q2.correctAnswerIndex], yourAnswer: q2.options[(q2.correctAnswerIndex + 1) % 4] });
    const blank = evidence.mistakes.find((m) => m.question === quiz.questions[5].text)!;
    expect(blank.yourAnswer).toBeUndefined();
    const formulaMistake = evidence.mistakes.find((m) => /p\. \d+ of the chapter PDF/.test(m.note ?? ''));
    if (formulaMistake) expect(formulaMistake.note).not.toMatch(/^From your formula chart/);
  });

  it('keeps the grader’s own per-topic breakdown instead of re-grading', () => {
    const tampered = { ...attempt, topicBreakdown: [{ topic: 'Circular motion', correct: 9, incorrect: 0, unattempted: 0, total: 9, accuracy: 100 }] };
    expect(evidenceFromQuizAttempt(tampered).rows).toEqual([{ topic: 'Circular motion', correct: 9, incorrect: 0, unattempted: 0, total: 9 }]);
  });

  it('remembers the chart the quiz came from', () => {
    expect(evidence.sourceArtifactId).toBe('chart-1');
  });
});

describe('evidenceFromTestAttempt', () => {
  it('counts rows from the test’s own questions, since test attempts store no breakdown', () => {
    const questions = [
      { id: 'q1', topic: 'Algebra', subject: 'Quant', text: 'Solve x', options: ['1', '2', '3', '4'], correctAnswerIndex: 1, explanation: 'x = 2' },
      { id: 'q2', topic: 'Algebra', subject: 'Quant', text: 'Solve y', options: ['1', '2', '3', '4'], correctAnswerIndex: 0, explanation: '' },
      { id: 'q3', topic: 'Geometry', subject: 'Quant', text: 'Angle?', options: ['30', '45', '60', '90'], correctAnswerIndex: 3, explanation: '' },
    ];
    const e = evidenceFromTestAttempt({ id: 't1', answers: { q1: 1, q2: 2 }, accuracy: 50, completedAt: '2026-09-20' }, { title: 'SSC Mock 1' }, questions);
    expect(e).toMatchObject({ kind: 'test', title: 'SSC Mock 1', questions: 3 });
    expect(e.rows).toEqual([
      { topic: 'Algebra', correct: 1, incorrect: 1, unattempted: 0, total: 2 },
      { topic: 'Geometry', correct: 0, incorrect: 0, unattempted: 1, total: 1 },
    ]);
    expect(e.mistakes.map((m) => m.question)).toEqual(['Solve y', 'Angle?']);
  });
});

describe('analyzePerformance', () => {
  const row = (topic: string, correct: number, total: number, examId?: string) => ({ topic, correct, incorrect: total - correct, unattempted: 0, total, ...(examId ? { examId } : {}) });
  const ev = (id: string, rows: any[], extra: any = {}) => ({ attemptId: id, kind: 'quiz' as const, title: `Quiz ${id}`, accuracy: 50, questions: 10, rows, mistakes: [], ...extra });

  it('merges a topic across attempts and scores it with the evidence behind it', () => {
    const report = analyzePerformance({ evidence: [ev('a', [row('Circular motion', 1, 3)]), ev('b', [row('Circular motion', 1, 3), row('Friction', 5, 5)])] });
    expect(reportSpecSchema.safeParse(report).success).toBe(true);
    expect(report.weakAreas).toEqual([expect.objectContaining({ topic: 'Circular motion', correct: 2, total: 6, accuracy: 33, confidence: confidenceFor(6) })]);
    expect(report.strongAreas).toEqual([{ topic: 'Friction', accuracy: 100, total: 5 }]);
    expect(report.title).toBe('Performance analysis — your last 2 tests');
  });

  it('never merges the same label across two exams', () => {
    const report = analyzePerformance({ evidence: [ev('a', [row('Algebra', 1, 4, 'SSC_CGL'), row('Algebra', 1, 4, 'JEE_MAIN')])] });
    expect(report.weakAreas.map((w) => w.examId).sort()).toEqual(['JEE_MAIN', 'SSC_CGL']);
  });

  it('uses the grader’s thresholds: below 60 is weak, 80 and above is strong, between is neither', () => {
    const report = analyzePerformance({ evidence: [ev('a', [row('A', 5, 10), row('B', 6, 10), row('C', 8, 10)])] });
    expect(report.weakAreas.map((w) => w.topic)).toEqual(['A']);
    expect(report.strongAreas.map((s) => s.topic)).toEqual(['C']);
  });

  it('points chart topics back to the chart’s pages and formulae', () => {
    const report = analyzePerformance({ evidence: [ev('a', [row('Circular motion', 0, 2)], { sourceArtifactId: 'chart-1' })], charts: [{ artifactId: 'chart-1', spec: CHART }] });
    expect(report.weakAreas[0].refs).toEqual(expect.arrayContaining([expect.objectContaining({ page: 15 }), expect.objectContaining({ page: 16 })]));
    const action = report.recommendations[0].action;
    expect(action).toMatch(/pp\. 15, 16 of the chapter/);
    expect(action).toContain('f_c = mv^2/R');
    expect(report.sourceArtifactIds).toEqual(['chart-1']);
  });

  it('says so plainly when nothing is weak, and mentions blanks', () => {
    const report = analyzePerformance({ evidence: [ev('a', [{ topic: 'A', correct: 9, incorrect: 0, unattempted: 1, total: 10 }])] });
    expect(report.weakAreas).toEqual([]);
    expect(report.recommendations.map((r) => r.action).join(' ')).toMatch(/1 question blank.*No weak areas/s);
    expect(report.title).toBe('Mistake analysis — Quiz a');
  });

  it('refuses to analyse nothing', () => {
    expect(() => analyzePerformance({ evidence: [] })).toThrow(/no scored attempts/);
  });
});

describe('syllabusMatchScore', () => {
  it('is the share of the topic’s words found in the label', () => {
    expect(syllabusMatchScore('Circular motion', 'Uniform circular motion; centripetal force')).toBe(1);
    expect(syllabusMatchScore('Circular motion', 'Rotational motion')).toBe(0.5);
  });
});

describe('progress tools', () => {
  const registry = registerProgressTools(new ToolRegistry());
  const run = async (name: string, input: any) => {
    const tool = registry.get(name)!;
    return (await tool.execute(tool.inputSchema.parse(input), ctx)).data as any;
  };

  beforeAll(() => {
    process.env.AGENT_MODE_ENABLED = 'true';
    process.env.AGENT_ARTIFACTS_ENABLED = 'true';
  });
  afterAll(() => {
    delete process.env.AGENT_MODE_ENABLED;
    delete process.env.AGENT_ARTIFACTS_ENABLED;
  });
  beforeEach(() => jest.clearAllMocks());

  describe('find_my_latest_quiz_result', () => {
    const quizArtifact = { kind: 'quiz', status: 'ready', artifactId: 'quiz-art', spec: { attemptId: 'qa_1', sourceArtifactId: 'chart-1' } };

    it('reports a quiz that is not yet submitted as pending, and analyses nothing', async () => {
      mockArtifacts.listForUser.mockResolvedValue([quizArtifact]);
      mockAttempts.getAttempt.mockResolvedValue({ id: 'qa_1', title: 'Laws of Motion — Quiz', status: 'in-progress' });
      const out = await run('find_my_latest_quiz_result', {});
      expect(out).toEqual({ found: false, pending: { title: 'Laws of Motion — Quiz', attemptId: 'qa_1', artifactId: 'quiz-art' } });
      expect(mockAttempts.getAttempt).toHaveBeenCalledWith('student-1', 'qa_1');
    });

    it('returns the scored attempt with the chart it was built from', async () => {
      const { attempt } = scoredChartAttempt({ wrong: ['aq_1'] });
      mockArtifacts.listForUser.mockResolvedValue([quizArtifact]);
      mockAttempts.getAttempt.mockResolvedValue(attempt);
      mockArtifacts.getForUser.mockResolvedValue({ kind: 'document', artifactId: 'chart-1', spec: CHART });
      const out = await run('find_my_latest_quiz_result', {});
      expect(out.found).toBe(true);
      expect(out.evidence[0]).toMatchObject({ attemptId: 'qa_1', sourceArtifactId: 'chart-1' });
      expect(out.charts[0].artifactId).toBe('chart-1');
      expect(mockArtifacts.getForUser).toHaveBeenCalledWith('chart-1', 'student-1');
    });

    it('falls back to the latest quiz completed anywhere in Sadhya', async () => {
      const { attempt } = scoredChartAttempt({ wrong: [] });
      mockArtifacts.listForUser.mockResolvedValue([]);
      mockAttempts.listAttempts.mockResolvedValue([{ id: 'qa_0', status: 'in-progress' }, { id: 'qa_1', status: 'completed' }]);
      mockAttempts.getAttempt.mockResolvedValue(attempt);
      const out = await run('find_my_latest_quiz_result', {});
      expect(out.found).toBe(true);
      expect(mockAttempts.getAttempt).toHaveBeenCalledWith('student-1', 'qa_1');
    });
  });

  describe('get_my_test_history', () => {
    it('merges quizzes and test-series tests, newest first, up to the limit', async () => {
      const a = scoredChartAttempt({ wrong: ['aq_1'], id: 'qa_old', completedAt: '2026-09-20T10:00:00Z' }).attempt;
      const b = scoredChartAttempt({ wrong: [], id: 'qa_new', completedAt: '2026-09-25T10:00:00Z' }).attempt;
      mockAttempts.listAttempts.mockResolvedValue([
        { id: 'qa_new', status: 'completed', completedAt: b.completedAt },
        { id: 'qa_old', status: 'completed', completedAt: a.completedAt },
        { id: 'qa_open', status: 'in-progress', createdAt: '2026-09-26T00:00:00Z' },
      ]);
      mockAttempts.getAttempt.mockImplementation(async (_u: string, id: string) => (id === 'qa_new' ? b : a));
      mockTests.getRecentAttempts.mockResolvedValue([{ id: 't1', testId: 'mock-1', completedAt: '2026-09-22T10:00:00Z', answers: {}, accuracy: 40 }]);
      mockTests.getTestById.mockResolvedValue({ title: 'Physics Mock', questionIds: ['x1'] });
      mockTests.getQuestions.mockResolvedValue([{ id: 'x1', topic: 'Friction', text: 'Q', options: ['a', 'b', 'c', 'd'], correctAnswerIndex: 0 }]);
      mockArtifacts.listForUser.mockResolvedValue([]);
      const out = await run('get_my_test_history', { limit: 2 });
      expect(out.evidence.map((e: any) => e.attemptId)).toEqual(['qa_new', 't1']);
      expect(out.counts).toEqual({ quizzes: 1, tests: 1 });
    });

    it('treats a missing test-series index as no tests, not as a failure', async () => {
      mockAttempts.listAttempts.mockResolvedValue([]);
      mockTests.getRecentAttempts.mockRejectedValue(Object.assign(new Error('requires an index'), { code: 9 }));
      mockArtifacts.listForUser.mockResolvedValue([]);
      expect(await run('get_my_test_history', {})).toMatchObject({ found: false, evidence: [] });
    });
  });

  describe('map_weak_areas_to_syllabus', () => {
    const NODES = [
      { id: 'root', label: 'JEE Main Physics', type: 'SUBJECT' },
      { id: 'u5', label: 'Laws of motion', type: 'TOPIC', parentEntityId: 'root' },
      { id: 'u5.3', label: 'Uniform circular motion, centripetal force', type: 'SUBTOPIC', parentEntityId: 'u5' },
      { id: 'u9', label: 'Friction in fluids', type: 'TOPIC', parentEntityId: 'root' },
      { id: 'u6', label: 'Friction and work', type: 'TOPIC', parentEntityId: 'root' },
      { id: 'n1', label: 'Newton’s laws', type: 'SUBTOPIC', parentEntityId: 'u5' },
    ];
    const report = (weakAreas: any[]) =>
      reportSpecSchema.parse({
        title: 'Analysis',
        basis: { attempts: [{ attemptId: 'a', title: 'Quiz', accuracy: 40, questions: 10 }], questionsAnswered: 10 },
        weakAreas,
        strongAreas: [],
        mistakes: [],
        recommendations: [],
      });
    const area = (topic: string, extra: any = {}) => ({ topic, accuracy: 30, correct: 1, total: 3, confidence: 0.38, ...extra });

    it('places exactly by node, clearly by name on one branch, and leaves ambiguity unmapped', async () => {
      mockNodes.mockResolvedValue(NODES);
      mockStats.mockResolvedValue({ activeExam: 'JEE Main' });
      mockDetect.mockResolvedValue('JEE_MAIN');
      const out = await run('map_weak_areas_to_syllabus', {
        report: report([area('Newton’s laws', { examId: 'JEE_MAIN', syllabusNodeId: 'n1' }), area('Circular motion'), area('Friction')]),
      });
      const [exact, named, ambiguous] = out.weakAreas;
      expect(exact).toMatchObject({ syllabusMatch: 'exact', syllabusNodeId: 'n1', syllabusPath: ['JEE Main Physics', 'Laws of motion', 'Newton’s laws'] });
      expect(named).toMatchObject({ syllabusMatch: 'name', syllabusPath: ['JEE Main Physics', 'Laws of motion', 'Uniform circular motion, centripetal force'] });
      // A name match is a place to look, never an identity.
      expect(named.syllabusNodeId).toBeUndefined();
      expect(ambiguous.syllabusPath).toBeUndefined();
      expect(out.mapping).toEqual({ examId: 'JEE_MAIN', examName: 'JEE Main', exact: 1, byName: 1, unmapped: 1 });
      expect(mockNodes).toHaveBeenCalledWith({ examId: 'JEE_MAIN' });
    });

    it('maps nothing when it cannot tell which exam the student is preparing for', async () => {
      mockStats.mockResolvedValue({});
      const out = await run('map_weak_areas_to_syllabus', { report: report([area('Circular motion')]) });
      expect(out.mapping).toEqual({ exact: 0, byName: 0, unmapped: 1 });
      expect(mockNodes).not.toHaveBeenCalled();
    });
  });

  it('create_report_artifact stores only the report’s own fields', async () => {
    mockArtifacts.createStructured.mockResolvedValue({ artifactId: 'rep-1', title: 'Analysis' });
    const r = { title: 'Analysis', basis: { attempts: [{ attemptId: 'a', title: 'Quiz', accuracy: 40, questions: 10 }], questionsAnswered: 10 }, weakAreas: [], strongAreas: [], mistakes: [], recommendations: [], mapping: { exact: 0 } };
    const out = await run('create_report_artifact', { report: r });
    expect(out).toMatchObject({ artifactId: 'rep-1', weakAreaCount: 0, kind: 'report' });
    const stored = mockArtifacts.createStructured.mock.calls[0];
    expect(stored[0]).toBe('report');
    expect(stored[1].spec.mapping).toBeUndefined();
    expect(stored[1]).toMatchObject({ userId: 'student-1', runId: 'run-1', provenance: 'STUDENT_UPLOAD' });
  });
});

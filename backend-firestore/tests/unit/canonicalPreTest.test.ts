/**
 * J.7.1 — the canonical pre-test contract.
 *
 * THE INVARIANT UNDER TEST: "generate a pre-test for EXAM X, CYCLE Y" either follows
 * exam+cycle → CURRENT verified syllabus → canonical graph → validated nodes → persisted questions,
 * or it returns NO_CANONICAL_SYLLABUS. There is no third path, and in particular no path from a
 * hardcoded question bank to a question presented as belonging to an exam.
 */
import { CanonicalSyllabusResolver } from '../../src/services/exam/canonicalSyllabusResolver';
import { CanonicalPreTestService, CanonicalQuestionGenerator } from '../../src/services/assessment/canonicalPreTest.service';
import { SyllabusUnavailableError } from '../../src/types/canonicalAssessment.types';
import type { SyllabusGraphNode } from '../../src/services/exam/syllabusGraph.service';
import fs from 'fs';
import path from 'path';

jest.mock('../../src/services/exam/examMaster.service', () => ({
  examMasterService: { getCurrentSyllabus: jest.fn() },
}));
jest.mock('../../src/services/exam/syllabusGraph.service', () => ({
  syllabusGraphService: {
    getSyllabusNodes: jest.fn(),
    getNodeParentPath: jest.fn(async () => ['Tier I', 'Paper', 'Quantitative Aptitude']),
    validateNodeForQuestion: jest.fn(),
  },
}));
jest.mock('../../src/services/tests/quizAttempts.service', () => ({
  quizAttemptsService: { createFromQuestions: jest.fn() },
}));
jest.mock('../../src/core/intelligence/MasteryEngine', () => ({
  masteryEngine: { listConcepts: jest.fn(async () => []) },
}));
jest.mock('../../src/services/tests/quizGenerator.service', () => ({
  quizGeneratorService: { generateWeakAreaQuiz: jest.fn() },
}));

import { examMasterService } from '../../src/services/exam/examMaster.service';
import { syllabusGraphService } from '../../src/services/exam/syllabusGraph.service';
import { quizAttemptsService } from '../../src/services/tests/quizAttempts.service';
import { masteryEngine } from '../../src/core/intelligence/MasteryEngine';

const EXAM = 'SSC_CGL';
const CYCLE = '2026';
const SYL = 'syl_ssc_cgl_2026_v1';

const node = (id: string, over: Partial<SyllabusGraphNode> = {}): SyllabusGraphNode => ({
  id, label: id, type: 'TOPIC', examId: EXAM, cycleId: CYCLE, syllabusId: SYL,
  parentEntityId: 'subject:quant', order: 1, ...over,
});

const GRAPH: SyllabusGraphNode[] = [
  node('subject:quant', { type: 'SUBJECT', parentEntityId: 'paper:1' }),
  node('topic:number_systems', { label: 'Number Systems', parentEntityId: 'subject:quant' }),
  node('topic:algebra', { label: 'Algebra', parentEntityId: 'subject:quant' }),
  node('topic:geometry', { label: 'Geometry', parentEntityId: 'subject:quant' }),
  node('topic:reasoning_series', { label: 'Series', parentEntityId: 'subject:reasoning' }),
  node('topic:reasoning_coding', { label: 'Coding-Decoding', parentEntityId: 'subject:reasoning' }),
];

const currentSyllabus = (over: any = {}) => ({
  syllabusId: SYL, examId: EXAM, cycleId: CYCLE, version: '2026-v1', status: 'CURRENT', ...over,
});

/** Content-only generator. Note it CANNOT express identity — that is the contract. */
const goodGenerator: CanonicalQuestionGenerator = {
  generate: jest.fn(async ({ node: n }) => [{
    text: `Question about ${n.label}`, options: ['a', 'b', 'c', 'd'],
    correctAnswerIndex: 0, explanation: 'because', topic: 'MODEL SAYS SOMETHING ELSE',
  }]),
};

beforeEach(() => {
  jest.clearAllMocks();
  (examMasterService.getCurrentSyllabus as jest.Mock).mockResolvedValue(currentSyllabus());
  (syllabusGraphService.getSyllabusNodes as jest.Mock).mockResolvedValue(GRAPH);
  (syllabusGraphService.getNodeParentPath as jest.Mock).mockResolvedValue(['Quant']);
  (syllabusGraphService.validateNodeForQuestion as jest.Mock).mockImplementation(
    async ({ nodeId, examId, cycleId, syllabusId }: any) => {
      const n = GRAPH.find((g) => g.id === nodeId);
      if (!n) return { valid: false, node: null, reason: 'NODE_NOT_FOUND_FOR_EXAM_OR_VERSION' };
      if (n.examId !== examId || n.cycleId !== cycleId || n.syllabusId !== syllabusId) {
        return { valid: false, node: n, reason: 'NODE_NOT_FOUND_FOR_EXAM_OR_VERSION' };
      }
      if (!['TOPIC', 'SUBTOPIC'].includes(n.type)) {
        return { valid: false, node: n, reason: `NODE_TYPE_NOT_VALID_FOR_QUESTION:${n.type}` };
      }
      return { valid: true, node: n };
    });
  (quizAttemptsService.createFromQuestions as jest.Mock).mockImplementation(
    async (_uid: string, qs: any[]) => ({ id: 'qa_test', questions: qs }));
  (masteryEngine.listConcepts as jest.Mock).mockResolvedValue([]);
});

// ═══ RESOLVER (1–10) ════════════════════════════════════════════════════════════════════════

describe('J.7.1 resolver', () => {
  const resolver = new CanonicalSyllabusResolver();

  it('1. a CURRENT syllabus with a graph resolves', async () => {
    const r = await resolver.resolve(EXAM, CYCLE);
    expect(r.outcome).toBe('RESOLVED');
    if (r.outcome !== 'RESOLVED') throw new Error('unreachable');
    expect(r.syllabusId).toBe(SYL);
    expect(r.version).toBe('2026-v1');
    expect(r.questionBearingNodes.map((n) => n.type)).toEqual(
      expect.arrayContaining(['TOPIC']));
    // SUBJECT is in the graph but is not question-bearing.
    expect(r.questionBearingNodes.some((n) => n.type === 'SUBJECT')).toBe(false);
  });

  it('2. no CURRENT syllabus → NO_CANONICAL_SYLLABUS', async () => {
    (examMasterService.getCurrentSyllabus as jest.Mock).mockResolvedValue(null);
    const r = await resolver.resolve(EXAM, CYCLE);
    expect(r).toMatchObject({ outcome: 'NO_CANONICAL_SYLLABUS', reason: 'NO_CURRENT_SYLLABUS' });
  });

  it('3. an INVALID syllabus is never returned (the repo filters on CURRENT)', async () => {
    // Production's exact shape: the record exists at INVALID, so the CURRENT query yields nothing.
    (examMasterService.getCurrentSyllabus as jest.Mock).mockResolvedValue(null);
    const r = await resolver.resolve(EXAM, CYCLE);
    expect(r.outcome).toBe('NO_CANONICAL_SYLLABUS');
  });

  it('4. a SUPERSEDED syllabus is never returned', async () => {
    (examMasterService.getCurrentSyllabus as jest.Mock).mockResolvedValue(null);
    expect((await resolver.resolve(EXAM, CYCLE)).outcome).toBe('NO_CANONICAL_SYLLABUS');
  });

  it('5. a record whose cycle disagrees is REJECTED, never used as a fallback', async () => {
    (examMasterService.getCurrentSyllabus as jest.Mock)
      .mockResolvedValue(currentSyllabus({ cycleId: '2025' }));
    const r = await resolver.resolve(EXAM, CYCLE);
    expect(r).toMatchObject({ outcome: 'NO_CANONICAL_SYLLABUS', reason: 'CYCLE_MISMATCH' });
  });

  it('5b. the cycle is never defaulted — a blank cycle does not resolve', async () => {
    const r = await resolver.resolve(EXAM, '');
    expect(r.outcome).toBe('NO_CANONICAL_SYLLABUS');
    expect(examMasterService.getCurrentSyllabus).not.toHaveBeenCalled();
  });

  it('6. a missing graph is rejected — zero nodes is NOT a valid empty syllabus', async () => {
    (syllabusGraphService.getSyllabusNodes as jest.Mock).mockResolvedValue([]);
    const r = await resolver.resolve(EXAM, CYCLE);
    expect(r).toMatchObject({ outcome: 'NO_CANONICAL_SYLLABUS', reason: 'GRAPH_NOT_BUILT' });
  });

  it('6b. a graph with no TOPIC/SUBTOPIC nodes is rejected', async () => {
    (syllabusGraphService.getSyllabusNodes as jest.Mock)
      .mockResolvedValue([node('stage:t1', { type: 'STAGE' }), node('paper:1', { type: 'PAPER' })]);
    const r = await resolver.resolve(EXAM, CYCLE);
    expect(r).toMatchObject({ outcome: 'NO_CANONICAL_SYLLABUS', reason: 'NO_QUESTION_BEARING_NODES' });
  });

  it('7. a repository failure THROWS — it never becomes NO_CANONICAL_SYLLABUS', async () => {
    (examMasterService.getCurrentSyllabus as jest.Mock)
      .mockRejectedValue(new Error('DEADLINE_EXCEEDED'));
    await expect(resolver.resolve(EXAM, CYCLE)).rejects.toBeInstanceOf(SyllabusUnavailableError);
  });

  it('7b. a graph-read failure THROWS rather than reporting an empty syllabus', async () => {
    (syllabusGraphService.getSyllabusNodes as jest.Mock).mockRejectedValue(new Error('UNAVAILABLE'));
    await expect(resolver.resolve(EXAM, CYCLE)).rejects.toBeInstanceOf(SyllabusUnavailableError);
  });

  it('8. there is no seed fallback in the resolver source', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/services/exam/canonicalSyllabusResolver.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of ['CANONICAL_EXAM_SEEDS', 'INSTANT_QUESTION_BANK', 'seed']) {
      expect(src).not.toContain(forbidden);
    }
  });

  it('9. the resolver makes no LLM or outbound call', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/services/exam/canonicalSyllabusResolver.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of ['axios', 'fetch(', 'Gemini', 'generateResponse', 'llm']) {
      expect(src).not.toContain(forbidden);
    }
  });

  it('10. concurrent resolution is deterministic', async () => {
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => resolver.resolve(EXAM, CYCLE)));
    const ids = rs.map((r) => (r.outcome === 'RESOLVED' ? r.syllabusId : r.outcome));
    expect(new Set(ids).size).toBe(1);
  });
});

// ═══ PRE-TEST REQUEST (11–18) ═══════════════════════════════════════════════════════════════

describe('J.7.1 CanonicalPreTestRequest', () => {
  const svc = new CanonicalPreTestService(goodGenerator);

  it('11-14. exact exam, cycle, syllabus and canonical node ids are preserved', async () => {
    const r = await svc.generatePreTest({ studentId: 'u1', examId: EXAM, cycleId: CYCLE, questionCount: 3 });
    expect(r.outcome).toBe('GENERATED');
    if (r.outcome !== 'GENERATED') throw new Error('unreachable');
    expect(r.request.examId).toBe(EXAM);
    expect(r.request.cycleId).toBe(CYCLE);
    expect(r.request.syllabusId).toBe(SYL);
    expect(r.request.syllabusVersion).toBe('2026-v1');
    expect(r.request.requestedNodeIds).toHaveLength(3);
    // Containment: every requested node came from the resolved graph.
    for (const id of r.request.requestedNodeIds) {
      expect(GRAPH.map((n) => n.id)).toContain(id);
    }
  });

  it('15. a node that fails validation aborts the whole request — never a partial test', async () => {
    (syllabusGraphService.validateNodeForQuestion as jest.Mock)
      .mockResolvedValue({ valid: false, node: null, reason: 'NODE_NOT_FOUND_FOR_EXAM_OR_VERSION' });
    const r = await svc.generatePreTest({ studentId: 'u1', examId: EXAM, cycleId: CYCLE, questionCount: 3 });
    expect(r).toMatchObject({ outcome: 'FAILED', reason: 'CANONICAL_VALIDATION_FAILED' });
    expect(quizAttemptsService.createFromQuestions).not.toHaveBeenCalled();
  });

  it('16/17. a node from another cycle or exam is rejected at the validation boundary', async () => {
    for (const wrong of [{ cycleId: '2027' }, { examId: 'JEE_MAIN' }]) {
      jest.clearAllMocks();
      (examMasterService.getCurrentSyllabus as jest.Mock).mockResolvedValue(currentSyllabus());
      (syllabusGraphService.getSyllabusNodes as jest.Mock)
        .mockResolvedValue([node('topic:foreign', wrong)]);
      (syllabusGraphService.validateNodeForQuestion as jest.Mock).mockImplementation(
        async ({ nodeId, examId, cycleId, syllabusId }: any) => {
          const n = node('topic:foreign', wrong);
          if (n.id !== nodeId) return { valid: false, node: null, reason: 'NOT_FOUND' };
          const ok = n.examId === examId && n.cycleId === cycleId && n.syllabusId === syllabusId;
          return ok ? { valid: true, node: n }
                    : { valid: false, node: n, reason: 'NODE_NOT_FOUND_FOR_EXAM_OR_VERSION' };
        });
      const r = await svc.generatePreTest({ studentId: 'u1', examId: EXAM, cycleId: CYCLE, questionCount: 1 });
      expect(r).toMatchObject({ outcome: 'FAILED', reason: 'CANONICAL_VALIDATION_FAILED' });
    }
  });

  it('18. STAGE/PAPER nodes are never selected for questions', async () => {
    (syllabusGraphService.getSyllabusNodes as jest.Mock).mockResolvedValue([
      ...GRAPH, node('stage:t1', { type: 'STAGE' }), node('paper:1', { type: 'PAPER' }),
    ]);
    const r = await svc.generatePreTest({ studentId: 'u1', examId: EXAM, cycleId: CYCLE, questionCount: 6 });
    if (r.outcome !== 'GENERATED') throw new Error('expected GENERATED');
    expect(r.request.requestedNodeIds).not.toContain('stage:t1');
    expect(r.request.requestedNodeIds).not.toContain('paper:1');
  });

  it('idempotency: the same request yields the same deterministic requestId', async () => {
    const a = await svc.generatePreTest({ studentId: 'u1', examId: EXAM, cycleId: CYCLE, questionCount: 3 });
    const b = await svc.generatePreTest({ studentId: 'u1', examId: EXAM, cycleId: CYCLE, questionCount: 3 });
    if (a.outcome !== 'GENERATED' || b.outcome !== 'GENERATED') throw new Error('unreachable');
    expect(a.request.requestId).toBe(b.request.requestId);
  });
});

// ═══ QUESTION GENERATION + IDENTITY (19–24) ═════════════════════════════════════════════════

describe('J.7.1 question identity is application-owned', () => {
  it('19/21. the application stamps identity from the validated node, not from the model', async () => {
    const liar: CanonicalQuestionGenerator = {
      generate: async () => [{
        text: 'q', options: ['a', 'b'], correctAnswerIndex: 0, explanation: 'e',
        // The model tries to claim a different topic label.
        topic: 'Organic Chemistry',
      }],
    };
    const svc = new CanonicalPreTestService(liar);
    await svc.generatePreTest({ studentId: 'u1', examId: EXAM, cycleId: CYCLE, questionCount: 1 });

    const [, stored] = (quizAttemptsService.createFromQuestions as jest.Mock).mock.calls[0];
    expect(stored[0].identityStatus).toBe('CANONICAL');
    expect(stored[0].examId).toBe(EXAM);
    expect(stored[0].cycleId).toBe(CYCLE);
    expect(stored[0].syllabusId).toBe(SYL);
    expect(GRAPH.map((n) => n.id)).toContain(stored[0].syllabusNodeId);
  });

  it('20. a generator cannot inject identity — the contract has no field for it', async () => {
    const attacker: CanonicalQuestionGenerator = {
      generate: async () => ([{
        text: 'q', options: ['a', 'b'], correctAnswerIndex: 0, explanation: 'e',
        // Deliberately smuggled through an untyped extra key.
        syllabusNodeId: 'topic:ATTACKER', examId: 'JEE_MAIN', cycleId: '2099',
        syllabusId: 'syl_evil', identityStatus: 'CANONICAL',
      } as any]),
    };
    const svc = new CanonicalPreTestService(attacker);
    await svc.generatePreTest({ studentId: 'u1', examId: EXAM, cycleId: CYCLE, questionCount: 1 });

    const [, stored] = (quizAttemptsService.createFromQuestions as jest.Mock).mock.calls[0];
    expect(stored[0].syllabusNodeId).not.toBe('topic:ATTACKER');
    expect(stored[0].examId).toBe(EXAM);
    expect(stored[0].cycleId).toBe(CYCLE);
    expect(stored[0].syllabusId).toBe(SYL);
  });

  it('an invalid node is rejected BEFORE generation, and reported as an identity failure', async () => {
    // Two things at once. The generator must not be called for a node we would reject (no wasted
    // model call), and the reason code must name the real fault: the production generator does its
    // own node check and throws, so validating afterwards would surface a syllabus-integrity
    // failure as GENERATION_PRODUCED_NO_QUESTIONS — blaming the model for a data problem.
    (syllabusGraphService.validateNodeForQuestion as jest.Mock)
      .mockResolvedValue({ valid: false, node: null, reason: 'NODE_NOT_FOUND_FOR_EXAM_OR_VERSION' });
    const gen = jest.fn();
    const svc = new CanonicalPreTestService({ generate: gen as any });

    const r = await svc.generatePreTest({ studentId: 'u1', examId: EXAM, cycleId: CYCLE, questionCount: 3 });

    expect(r).toMatchObject({ outcome: 'FAILED', reason: 'CANONICAL_VALIDATION_FAILED' });
    expect(gen).not.toHaveBeenCalled();
  });

  it('22/23. a failed canonical request is NEVER downgraded to UNANCHORED', async () => {
    (syllabusGraphService.validateNodeForQuestion as jest.Mock)
      .mockResolvedValue({ valid: false, node: null, reason: 'NODE_TYPE_NOT_VALID_FOR_QUESTION:STAGE' });
    const svc = new CanonicalPreTestService(goodGenerator);
    const r = await svc.generatePreTest({ studentId: 'u1', examId: EXAM, cycleId: CYCLE, questionCount: 2 });
    expect(r.outcome).toBe('FAILED');
    expect(JSON.stringify(r)).not.toContain('UNANCHORED');
    expect(quizAttemptsService.createFromQuestions).not.toHaveBeenCalled();
  });

  it('24. no canonical syllabus → zero questions written and no generic fallback', async () => {
    (examMasterService.getCurrentSyllabus as jest.Mock).mockResolvedValue(null);
    const gen = jest.fn();
    const svc = new CanonicalPreTestService({ generate: gen as any });
    const r = await svc.generatePreTest({ studentId: 'u1', examId: EXAM, cycleId: CYCLE });
    expect(r.outcome).toBe('NO_CANONICAL_SYLLABUS');
    if (r.outcome !== 'NO_CANONICAL_SYLLABUS') throw new Error('unreachable');
    expect(r.studentMessage).toMatch(/not currently available/i);
    expect(gen).not.toHaveBeenCalled();
    expect(quizAttemptsService.createFromQuestions).not.toHaveBeenCalled();
  });
});

// ═══ LEGACY BANK (25–27) ════════════════════════════════════════════════════════════════════

describe('J.7.1 the legacy bank cannot enter the canonical path', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '../../src', rel), 'utf8');
  const codeOnly = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('25. the canonical path never references AdaptiveCat or its bank', () => {
    for (const f of ['services/assessment/canonicalPreTest.service.ts',
                     'services/exam/canonicalSyllabusResolver.ts']) {
      const src = codeOnly(read(f));
      expect(src).not.toContain('INSTANT_QUESTION_BANK');
      expect(src).not.toContain('adaptiveCat');
      expect(src).not.toContain('AdaptiveCat');
    }
  });

  it('26. AdaptiveCat still works for its existing demo/onboarding consumer', () => {
    const src = read('services/adaptiveCat.service.ts');
    expect(src).toContain('generateAdaptiveBatch');
    expect(src).toContain('INSTANT_QUESTION_BANK');
  });

  it('26b. every legacy question is stamped UNANCHORED and flagged at source', () => {
    const src = codeOnly(read('services/adaptiveCat.service.ts'));
    expect(src).toContain(`identityStatus: 'UNANCHORED'`);
    expect(src).toContain('isLegacyDemo: true');
    expect(src).not.toContain(`identityStatus: 'CANONICAL'`);
  });

  it('27. no hardcoded exam syllabus exists in the canonical path', () => {
    const src = codeOnly(read('services/assessment/canonicalPreTest.service.ts'));
    for (const forbidden of ['Physics', 'Chemistry', 'Quantitative Aptitude', 'SSC_CGL', 'stages']) {
      expect(src).not.toContain(forbidden);
    }
  });
});

// ═══ PERSONALIZATION (28–30) ════════════════════════════════════════════════════════════════

describe('J.7.1 personalization stays inside the canonical syllabus', () => {
  const svc = new CanonicalPreTestService(goodGenerator);
  const idsFor = async (studentId: string, evidence: any[] = []) => {
    const r = await svc.generatePreTest({
      studentId, examId: EXAM, cycleId: CYCLE, questionCount: 3, evidenceOverride: evidence });
    if (r.outcome !== 'GENERATED') throw new Error('expected GENERATED');
    return r.request.requestedNodeIds;
  };

  it('28. two students with different evidence get different node selections', async () => {
    const a = await idsFor('studentA', [{ syllabusNodeId: 'topic:number_systems', masteryScore: 0.1 },
                                        { syllabusNodeId: 'topic:algebra', masteryScore: 0.1 }]);
    const b = await idsFor('studentB', [{ syllabusNodeId: 'topic:geometry', masteryScore: 0.1 },
                                        { syllabusNodeId: 'topic:reasoning_series', masteryScore: 0.1 }]);
    expect(a).not.toEqual(b);
  });

  it('28b. selection is deterministic per student and varies across students', async () => {
    // Two properties, and only these two are actually guaranteed:
    //
    //   (a) the SAME student always gets the SAME test — no clock, no RNG;
    //   (b) selection is seeded per student, so it varies across the population.
    //
    // Deliberately NOT "any two given students differ". With a small graph (5 topics in 2 parent
    // buckets) two particular students can legitimately draw the same set, and asserting otherwise
    // would be testing a coincidence rather than the design.
    const a1 = await idsFor('alice');
    const a2 = await idsFor('alice');
    expect(a1).toEqual(a2);

    const students = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank'];
    const selections = new Set<string>();
    for (const s of students) selections.add((await idsFor(s)).join('|'));
    expect(selections.size).toBeGreaterThan(1);
  });

  it('29. both students stay inside the same canonical syllabus', async () => {
    const all = [...await idsFor('studentA'), ...await idsFor('studentB')];
    const canonical = GRAPH.filter((n) => n.type === 'TOPIC').map((n) => n.id);
    for (const id of all) expect(canonical).toContain(id);
  });

  it('30. evidence naming a node OUTSIDE the syllabus cannot introduce it', async () => {
    const ids = await idsFor('studentC', [
      { syllabusNodeId: 'topic:FROM_ANOTHER_EXAM', masteryScore: 0 },
      { syllabusNodeId: 'topic:algebra', masteryScore: 0.9 },
    ]);
    expect(ids).not.toContain('topic:FROM_ANOTHER_EXAM');
    for (const id of ids) expect(GRAPH.map((n) => n.id)).toContain(id);
  });

  it('30b. unanchored (free-text) evidence is ignored entirely', async () => {
    const withJunk = await idsFor('studentD', [{ masteryScore: 0 } as any]);
    const without = await idsFor('studentD', []);
    expect(withJunk).toEqual(without);
  });

  it('personalization degrades safely when mastery is unreadable', async () => {
    (masteryEngine.listConcepts as jest.Mock).mockRejectedValue(new Error('UNAVAILABLE'));
    const r = await svc.generatePreTest({ studentId: 'u9', examId: EXAM, cycleId: CYCLE, questionCount: 2 });
    // Still canonical, just unpersonalized — the syllabus boundary is unaffected.
    expect(r.outcome).toBe('GENERATED');
  });
});

// ═══ HISTORICAL ISOLATION (31–32) ═══════════════════════════════════════════════════════════

describe('J.7.1 historical identity is immutable', () => {
  it('31/32. a 2026 question keeps its 2026 identity after a 2027 syllabus is published', async () => {
    const svc = new CanonicalPreTestService(goodGenerator);

    await svc.generatePreTest({ studentId: 'u1', examId: EXAM, cycleId: CYCLE, questionCount: 1 });
    const [, stored2026] = (quizAttemptsService.createFromQuestions as jest.Mock).mock.calls[0];
    const frozen = JSON.parse(JSON.stringify(stored2026[0]));

    // A new cycle is published with its own version and its own node ids.
    const SYL27 = 'syl_ssc_cgl_2027_v1';
    (examMasterService.getCurrentSyllabus as jest.Mock)
      .mockResolvedValue(currentSyllabus({ syllabusId: SYL27, cycleId: '2027', version: '2027-v1' }));
    const graph27 = [node('topic:algebra_2027',
      { cycleId: '2027', syllabusId: SYL27, parentEntityId: 'subject:quant' })];
    (syllabusGraphService.getSyllabusNodes as jest.Mock).mockResolvedValue(graph27);
    (syllabusGraphService.validateNodeForQuestion as jest.Mock)
      .mockImplementation(async ({ nodeId }: any) => {
        const n = graph27.find((g) => g.id === nodeId);
        return n ? { valid: true, node: n } : { valid: false, node: null, reason: 'NOT_FOUND' };
      });

    await svc.generatePreTest({ studentId: 'u1', examId: EXAM, cycleId: '2027', questionCount: 1 });
    const [, stored2027] = (quizAttemptsService.createFromQuestions as jest.Mock).mock.calls[1];

    // The 2026 question is untouched...
    expect(stored2026[0]).toEqual(frozen);
    expect(stored2026[0].cycleId).toBe('2026');
    expect(stored2026[0].syllabusId).toBe(SYL);
    // ...and the 2027 question references only 2027 nodes.
    expect(stored2027[0].cycleId).toBe('2027');
    expect(stored2027[0].syllabusId).toBe(SYL27);
    expect(stored2027[0].syllabusNodeId).not.toBe(stored2026[0].syllabusNodeId);
  });
});

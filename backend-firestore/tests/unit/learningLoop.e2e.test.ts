/**
 * Stage 5 — the closed learning loop, end to end.
 *
 * PLAN → PRACTICE → ATTEMPT → MASTERY → COVERAGE → NEXT PLAN, asserting that the canonical
 * syllabusNodeId survives every transition and that the plan visibly changes as a result.
 *
 * This exists because the loop was measurably OPEN before Stage 5: quiz grading grouped results
 * by the topic STRING and discarded the node the question carried (0 of 20 real breakdown rows
 * retained it), so a student could answer correctly and their coverage would not move. Nothing
 * errored — the evidence simply landed under a label key that coverage and the planner filter out.
 * A unit test of any single service would still have passed; only following one node the whole
 * way catches it.
 */

interface FakeNode { id: string; type: string; label: string; parentEntityId?: string }
const nodes: FakeNode[] = [];

const mockGraph = {
  async getSyllabusNodes(p: { examId: string; syllabusId?: string }) {
    return nodes.filter((n) => n.id.split(':')[1] === p.examId);
  },
  async getSyllabusNode(p: { examId: string; nodeId: string }) {
    return nodes.find((n) => n.id === p.nodeId && n.id.split(':')[1] === p.examId) ?? null;
  },
  async validateNodeForQuestion(p: { examId: string; nodeId: string; allowedTypes?: string[] }) {
    const node = await mockGraph.getSyllabusNode(p);
    const allowed = p.allowedTypes ?? ['TOPIC', 'SUBTOPIC'];
    if (!node) return { valid: false, node: null, reason: 'NODE_NOT_FOUND_FOR_EXAM_OR_VERSION' };
    if (!allowed.includes(node.type)) return { valid: false, node, reason: 'NODE_TYPE_NOT_VALID_FOR_QUESTION' };
    return { valid: true, node };
  },
};
jest.mock('../../src/services/exam/syllabusGraph.service', () => ({ syllabusGraphService: mockGraph }));

const mockStore = new Map<string, any>();
const k = (u: string, c: string) => `${u}::${c}`;
const mockBackend = {
  async get(u: string, c: string) { return mockStore.get(k(u, c)) ?? null; },
  async set(u: string, m: any) { mockStore.set(k(u, m.conceptId), m); },
  async list(u: string) { return [...mockStore.entries()].filter(([key]) => key.startsWith(`${u}::`)).map(([, v]) => v); },
  async transact(u: string, c: string, mutate: (prev: any) => any) {
    mockStore.set(k(u, c), mutate(mockStore.get(k(u, c)) ?? null));
  },
};
jest.mock('../../src/core/intelligence/MasteryEngine', () => {
  const actual = jest.requireActual('../../src/core/intelligence/MasteryEngine');
  return { ...actual, masteryEngine: new actual.MasteryEngine(mockBackend) };
});

import { recordAttemptMastery } from '../../src/services/learning/nodeMastery.service';
import { getSyllabusCoverage } from '../../src/services/learning/syllabusCoverage.service';
import { generateDailyPlan } from '../../src/services/learning/studyPlanner.service';

const JEE_SUBJ = 'subject:JEE_MAIN:2026:syl_j:physics:jjjjjj';
const JEE_NODE = 'topic:JEE_MAIN:2026:syl_j:current_electricity:aaaaaa';
const SSC_SUBJ = 'subject:SSC_CGL:2026:syl_s:quant:ssssss';
const SSC_NODE = 'topic:SSC_CGL:2026:syl_s:current_electricity:bbbbbb';   // same label, other exam

const USER = 'student-loop';
const TODAY = new Date('2026-09-01T09:00:00Z');

beforeEach(() => {
  mockStore.clear();
  nodes.length = 0;
  nodes.push(
    { id: JEE_SUBJ, type: 'SUBJECT', label: 'Physics' },
    { id: JEE_NODE, type: 'TOPIC', label: 'Current Electricity', parentEntityId: JEE_SUBJ },
    { id: SSC_SUBJ, type: 'SUBJECT', label: 'Quantitative Aptitude' },
    { id: SSC_NODE, type: 'TOPIC', label: 'Current Electricity', parentEntityId: SSC_SUBJ },
  );
});

const planFor = (examId: string) =>
  generateDailyPlan({ userId: USER, examId, dailyMinutes: 120, today: TODAY });

describe('the loop closes — JEE Main', () => {
  it('UNTOUCHED → practice → LEARNING → the plan changes what it recommends', async () => {
    // 1. PLAN. Nothing attempted, so the node is untouched and the plan teaches before testing.
    const first = await planFor('JEE_MAIN');
    const firstTask = first.tasks.find((t) => t.syllabusNodeId === JEE_NODE);
    expect(firstTask).toBeDefined();
    expect(firstTask!.state).toBe('UNTOUCHED');
    expect(first.tasks.filter((t) => t.syllabusNodeId === JEE_NODE).map((t) => t.activity))
      .toEqual(['LEARN', 'PRACTICE']);
    expect(firstTask!.reasons).toContain('Not started yet');

    // 2. COVERAGE agrees before any evidence.
    const before = await getSyllabusCoverage(USER, 'JEE_MAIN');
    expect(before.coveragePercent).toBe(0);

    // 3. PRACTICE → ATTEMPT. The node from the plan is what is recorded — not a label.
    const rec = await recordAttemptMastery({
      userId: USER, examId: 'JEE_MAIN', syllabusNodeId: firstTask!.syllabusNodeId,
      correct: true, attemptId: 'attempt-1',
    });
    expect(rec.recorded).toBe(true);

    // 4. MASTERY moved, and it is anchored to the same canonical node.
    expect((rec as any).mastery.syllabusNodeId).toBe(JEE_NODE);
    expect((rec as any).mastery.attempts).toBe(1);
    expect((rec as any).mastery.lastPracticed).toBeGreaterThan(0);

    // 5. COVERAGE reflects it without any recomputation elsewhere.
    const after = await getSyllabusCoverage(USER, 'JEE_MAIN');
    const node = after.subjects.flatMap((s) => s.children).find((n) => n.nodeId === JEE_NODE)!;
    expect(node.state).toBe('LEARNING');
    expect(after.coveragePercent).toBeGreaterThan(0);

    // 6. NEXT PLAN sees the new evidence and moves up the activity ladder.
    const second = await generateDailyPlan({
      userId: USER, examId: 'JEE_MAIN', dailyMinutes: 120,
      today: new Date('2026-09-10T09:00:00Z'),   // far enough on to be due for review
    });
    const secondActs = second.tasks.filter((t) => t.syllabusNodeId === JEE_NODE).map((t) => t.activity);
    expect(secondActs).toEqual(['PRACTICE', 'QUIZ']);   // no longer teaching from scratch
    expect(secondActs).not.toContain('LEARN');
  });
});

describe('the loop closes — SSC CGL, with no cross-exam bleed', () => {
  it('an identical label under another exam stays completely separate', async () => {
    await recordAttemptMastery({
      userId: USER, examId: 'JEE_MAIN', syllabusNodeId: JEE_NODE, correct: true, attemptId: 'j1',
    });

    // The SSC node has the SAME display label and must be untouched.
    const ssc = await getSyllabusCoverage(USER, 'SSC_CGL');
    expect(ssc.coveragePercent).toBe(0);
    const sscNode = ssc.subjects.flatMap((s) => s.children).find((n) => n.nodeId === SSC_NODE)!;
    expect(sscNode.label).toBe('Current Electricity');   // same words
    expect(sscNode.state).toBe('UNTOUCHED');             // different identity

    // And the SSC plan still teaches it from scratch.
    const plan = await planFor('SSC_CGL');
    expect(plan.tasks.filter((t) => t.syllabusNodeId === SSC_NODE).map((t) => t.activity))
      .toEqual(['LEARN', 'PRACTICE']);
  });

  it('a JEE node offered to an SSC attempt is refused before any read', async () => {
    const r = await recordAttemptMastery({
      userId: USER, examId: 'SSC_CGL', syllabusNodeId: JEE_NODE, correct: true, attemptId: 'x1',
    });
    expect(r).toEqual({ recorded: false, reason: 'WRONG_EXAM' });
  });
});

describe('loop integrity', () => {
  it('replaying one attempt does not move mastery twice', async () => {
    for (let i = 0; i < 3; i++) {
      await recordAttemptMastery({
        userId: USER, examId: 'JEE_MAIN', syllabusNodeId: JEE_NODE, correct: true, attemptId: 'same-event',
      });
    }
    const cov = await getSyllabusCoverage(USER, 'JEE_MAIN');
    const node = cov.subjects.flatMap((s) => s.children).find((n) => n.nodeId === JEE_NODE)!;
    expect(node.attempts).toBe(1);
  });

  it("one student's practice never appears in another's loop", async () => {
    await recordAttemptMastery({
      userId: USER, examId: 'JEE_MAIN', syllabusNodeId: JEE_NODE, correct: true, attemptId: 'a1',
    });
    const other = await getSyllabusCoverage('someone-else', 'JEE_MAIN');
    expect(other.coveragePercent).toBe(0);
    const otherPlan = await generateDailyPlan({
      userId: 'someone-else', examId: 'JEE_MAIN', dailyMinutes: 120, today: TODAY,
    });
    expect(otherPlan.tasks.filter((t) => t.syllabusNodeId === JEE_NODE).map((t) => t.activity))
      .toEqual(['LEARN', 'PRACTICE']);
  });

  it('an attempt with no canonical node is refused, and coverage stays honest', async () => {
    const r = await recordAttemptMastery({
      userId: USER, examId: 'JEE_MAIN', syllabusNodeId: null, correct: true, attemptId: 'n1',
    });
    expect(r).toEqual({ recorded: false, reason: 'MISSING_NODE_ID' });
    const cov = await getSyllabusCoverage(USER, 'JEE_MAIN');
    expect(cov.coveragePercent).toBe(0);   // no evidence invented from a label
  });

  it('parent state is derived from the child that actually moved', async () => {
    await recordAttemptMastery({
      userId: USER, examId: 'JEE_MAIN', syllabusNodeId: JEE_NODE, correct: true, attemptId: 'p1',
    });
    const cov = await getSyllabusCoverage(USER, 'JEE_MAIN');
    const subject = cov.subjects.find((s) => s.nodeId === JEE_SUBJ)!;
    expect(subject.isLeaf).toBe(false);
    expect(subject.children.find((c) => c.nodeId === JEE_NODE)!.state).toBe('LEARNING');
  });
});

/**
 * Stage 2 — per-node mastery.
 *
 * The engine is exercised for real (its pure applyEvent, its dedup logic) against an in-memory
 * store, so these assert on actual scoring and idempotency rather than on mocks agreeing with
 * themselves. The graph is faked because Firestore is not the thing under test.
 *
 * The cases that matter most are the refusals and the isolations: identical labels under
 * different exams, and one student's evidence never reaching another's record. Both are silent
 * failures — nothing errors, the numbers are simply wrong forever.
 */

interface FakeNode { id: string; type: string; label: string; parentEntityId?: string }
const nodes: FakeNode[] = [];

const mockGraph = {
  async getSyllabusNodes(p: { examId: string; cycleId?: string; syllabusId?: string }) {
    return nodes.filter((n) => n.id.split(':')[1] === p.examId
      && (!p.syllabusId || n.id.split(':')[3] === p.syllabusId));
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

/**
 * In-memory mastery store honouring the same transactional contract as Firestore's.
 *
 * `mock`-prefixed so jest allows it inside the hoisted factory below; the engine itself is
 * constructed IN the factory, because jest.mock is hoisted above any const and referencing one
 * from the factory throws before initialisation.
 */
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
  // The REAL engine over a fake store: scoring, dedup and trend logic are genuinely exercised.
  return { ...actual, masteryEngine: new actual.MasteryEngine(mockBackend) };
});

import {
  recordAttemptMastery, getNodeMastery, getUserMasteryForExam, getWeakNodes,
  getUncoveredNodes, aggregateForNode, masteryKeyForNode, legacyMasteryCount,
} from '../../src/services/learning/nodeMastery.service';

const SSC_SUBJ = 'subject:SSC_CGL:2026:syl_ssc_cgl_2026_2026_v1:quantitative_aptitude:aa11bb22cc33';
const SSC_ALGEBRA = 'topic:SSC_CGL:2026:syl_ssc_cgl_2026_2026_v1:algebra:48be7adeec5d';
const SSC_RATIO = 'topic:SSC_CGL:2026:syl_ssc_cgl_2026_2026_v1:ratio:99887766aabb';
const JEE_ALGEBRA = 'topic:JEE_MAIN:2026:syl_jee_main_2026_2026_v1:algebra:1974ab0d3f65';

const USER = 'student-a';
const OTHER = 'student-b';

beforeEach(() => {
  mockStore.clear();
  nodes.length = 0;
  nodes.push(
    { id: SSC_SUBJ, type: 'SUBJECT', label: 'Quantitative Aptitude' },
    { id: SSC_ALGEBRA, type: 'TOPIC', label: 'Algebra', parentEntityId: SSC_SUBJ },
    { id: SSC_RATIO, type: 'TOPIC', label: 'Ratio', parentEntityId: SSC_SUBJ },
    { id: JEE_ALGEBRA, type: 'TOPIC', label: 'Algebra' },
  );
});

const attempt = (over: Partial<Parameters<typeof recordAttemptMastery>[0]> = {}) =>
  recordAttemptMastery({ userId: USER, examId: 'SSC_CGL', syllabusNodeId: SSC_ALGEBRA, correct: true, ...over });

describe('recording attempts', () => {
  it('records a first correct attempt', async () => {
    const r = await attempt({ attemptId: 'a1' });
    expect(r.recorded).toBe(true);
    const m = await getNodeMastery(USER, SSC_ALGEBRA);
    expect(m!.attempts).toBe(1);
    expect(m!.successCount).toBe(1);
  });

  it('records a first incorrect attempt', async () => {
    await attempt({ correct: false, attemptId: 'a1' });
    const m = await getNodeMastery(USER, SSC_ALGEBRA);
    expect(m!.attempts).toBe(1);
    expect(m!.successCount).toBe(0);
    expect(m!.masteryScore).toBeLessThan(0.5);   // started neutral, moved down
  });

  it('accumulates across attempts and tracks accuracy separately', async () => {
    for (let i = 0; i < 4; i++) await attempt({ correct: i < 3, attemptId: `a${i}` });
    const m = await getNodeMastery(USER, SSC_ALGEBRA);
    expect(m!.attempts).toBe(4);
    expect(m!.successCount).toBe(3);
    expect(m!.successRate).toBeCloseTo(0.75, 5);
  });

  it('does not call one correct answer "mastered" — evidence is smoothed', async () => {
    await attempt({ attemptId: 'a1' });
    const m = await getNodeMastery(USER, SSC_ALGEBRA);
    // The distinction Stage 2 exists to make: raw accuracy is perfect, mastery is not.
    expect(m!.successRate).toBe(1);
    expect(m!.masteryScore).toBeLessThan(0.9);
  });

  it('grows confidence with evidence rather than asserting it', async () => {
    await attempt({ attemptId: 'a1' });
    const one = (await getNodeMastery(USER, SSC_ALGEBRA))!.confidence;
    for (let i = 2; i < 8; i++) await attempt({ attemptId: `a${i}` });
    const many = (await getNodeMastery(USER, SSC_ALGEBRA))!.confidence;
    expect(many).toBeGreaterThan(one);
    expect(many).toBeLessThanOrEqual(0.95);
  });

  it('stamps recency', async () => {
    const before = Date.now();
    await attempt({ attemptId: 'a1' });
    expect((await getNodeMastery(USER, SSC_ALGEBRA))!.lastPracticed).toBeGreaterThanOrEqual(before);
  });
});

describe('refusals — nothing without a validated node', () => {
  it('refuses a missing node id', async () => {
    const r = await attempt({ syllabusNodeId: null, attemptId: 'a1' });
    expect(r).toEqual({ recorded: false, reason: 'MISSING_NODE_ID' });
    expect(await getNodeMastery(USER, SSC_ALGEBRA)).toBeNull();
  });

  it('refuses a display name used as identity', async () => {
    const r = await attempt({ syllabusNodeId: 'Algebra', attemptId: 'a1' });
    expect(r).toEqual({ recorded: false, reason: 'MALFORMED_NODE_ID' });
  });

  it('refuses a node that does not exist', async () => {
    const ghost = 'topic:SSC_CGL:2026:syl_ssc_cgl_2026_2026_v1:invented:deadbeef1234';
    const r = await attempt({ syllabusNodeId: ghost, attemptId: 'a1' });
    expect(r).toEqual({ recorded: false, reason: 'NODE_NOT_FOUND' });
  });

  it('refuses a container node — mastery is not recorded at SUBJECT level', async () => {
    const r = await attempt({ syllabusNodeId: SSC_SUBJ, attemptId: 'a1' });
    expect(r).toEqual({ recorded: false, reason: 'NODE_TYPE_NOT_ALLOWED' });
  });

  it('refuses without a user', async () => {
    const r = await attempt({ userId: '', attemptId: 'a1' });
    expect(r).toEqual({ recorded: false, reason: 'NO_USER' });
  });
});

describe('exam isolation', () => {
  it("a JEE node presented as SSC's is refused, not silently recorded", async () => {
    const r = await attempt({ syllabusNodeId: JEE_ALGEBRA, attemptId: 'a1' });
    expect(r).toEqual({ recorded: false, reason: 'WRONG_EXAM' });
  });

  it('identical labels under two exams are two separate mastery records', async () => {
    await recordAttemptMastery({ userId: USER, examId: 'SSC_CGL', syllabusNodeId: SSC_ALGEBRA, correct: true, attemptId: 's1' });
    await recordAttemptMastery({ userId: USER, examId: 'JEE_MAIN', syllabusNodeId: JEE_ALGEBRA, correct: false, attemptId: 'j1' });

    const ssc = await getNodeMastery(USER, SSC_ALGEBRA);
    const jee = await getNodeMastery(USER, JEE_ALGEBRA);
    expect(ssc!.successCount).toBe(1);
    expect(jee!.successCount).toBe(0);
    // The exact collapse the old label-slug key produced: both were "algebra".
    expect(masteryKeyForNode(SSC_ALGEBRA)).not.toBe(masteryKeyForNode(JEE_ALGEBRA));
  });

  it('per-exam queries do not leak the other exam', async () => {
    await recordAttemptMastery({ userId: USER, examId: 'SSC_CGL', syllabusNodeId: SSC_ALGEBRA, correct: true, attemptId: 's1' });
    await recordAttemptMastery({ userId: USER, examId: 'JEE_MAIN', syllabusNodeId: JEE_ALGEBRA, correct: true, attemptId: 'j1' });
    expect((await getUserMasteryForExam(USER, 'SSC_CGL')).map((m) => m.syllabusNodeId)).toEqual([SSC_ALGEBRA]);
    expect((await getUserMasteryForExam(USER, 'JEE_MAIN')).map((m) => m.syllabusNodeId)).toEqual([JEE_ALGEBRA]);
  });
});

describe('user isolation', () => {
  it("one student's evidence never appears in another's", async () => {
    await recordAttemptMastery({ userId: USER, examId: 'SSC_CGL', syllabusNodeId: SSC_ALGEBRA, correct: true, attemptId: 'a1' });
    expect(await getNodeMastery(OTHER, SSC_ALGEBRA)).toBeNull();
    expect(await getUserMasteryForExam(OTHER, 'SSC_CGL')).toEqual([]);
  });
});

describe('idempotency and concurrency', () => {
  it('replaying the same attemptId does not double-count', async () => {
    await attempt({ attemptId: 'same' });
    await attempt({ attemptId: 'same' });
    await attempt({ attemptId: 'same' });
    expect((await getNodeMastery(USER, SSC_ALGEBRA))!.attempts).toBe(1);
  });

  it('distinct attempts still accumulate', async () => {
    await attempt({ attemptId: 'x1' });
    await attempt({ attemptId: 'x2' });
    expect((await getNodeMastery(USER, SSC_ALGEBRA))!.attempts).toBe(2);
  });

  it('concurrent delivery of one attempt applies once', async () => {
    await Promise.all([attempt({ attemptId: 'race' }), attempt({ attemptId: 'race' })]);
    expect((await getNodeMastery(USER, SSC_ALGEBRA))!.attempts).toBe(1);
  });
});

describe('queries for Stage 3', () => {
  it('weak nodes require enough evidence to be called weak', async () => {
    await attempt({ correct: false, attemptId: 'w1' });          // one bad answer
    expect(await getWeakNodes(USER, 'SSC_CGL')).toEqual([]);     // not yet a weakness
    await attempt({ correct: false, attemptId: 'w2' });
    await attempt({ correct: false, attemptId: 'w3' });
    const weak = await getWeakNodes(USER, 'SSC_CGL');
    expect(weak.map((m) => m.syllabusNodeId)).toEqual([SSC_ALGEBRA]);
  });

  it('uncovered nodes are the syllabus minus what has evidence', async () => {
    const before = await getUncoveredNodes(USER, 'SSC_CGL');
    expect(before.map((n) => n.nodeId).sort()).toEqual([SSC_ALGEBRA, SSC_RATIO].sort());
    await attempt({ attemptId: 'c1' });
    const after = await getUncoveredNodes(USER, 'SSC_CGL');
    expect(after.map((n) => n.nodeId)).toEqual([SSC_RATIO]);
  });

  it('parent mastery is derived, never stored', async () => {
    await attempt({ attemptId: 'p1' });
    const agg = await aggregateForNode(USER, 'SSC_CGL', SSC_SUBJ);
    expect(agg.descendants).toBe(2);
    expect(agg.withEvidence).toBe(1);
    expect(agg.masteryScore).not.toBeNull();
    // No document was written for the container itself.
    expect(await getNodeMastery(USER, SSC_SUBJ)).toBeNull();
  });

  it('a parent with no evidence returns null, not zero', async () => {
    const agg = await aggregateForNode(USER, 'SSC_CGL', SSC_SUBJ);
    expect(agg.withEvidence).toBe(0);
    expect(agg.masteryScore).toBeNull();   // "no data" is not "scored zero"
  });

  it('reports legacy records that carry no canonical node', async () => {
    mockStore.set(k(USER, 'algebra'), { conceptId: 'algebra', masteryScore: 0.5, attempts: 2 });
    await attempt({ attemptId: 'l1' });
    expect(await legacyMasteryCount(USER)).toEqual({ total: 2, nodeAnchored: 1, legacy: 1 });
  });
});

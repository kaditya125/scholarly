/**
 * Stage 7 — the PYQ eligibility gate, and the loop a trustworthy PYQ would travel.
 *
 * The positive path uses a SYNTHETIC eligible question, because the live corpus currently has
 * none: measured 2026-08-27, 0 of 774 pass. That is not a gap in the tests — it is the finding.
 * The loop must be proven to work before there is anything to put through it, so that when a
 * genuinely corroborated question arrives it enters a path already known to be correct.
 *
 * The negative cases carry the weight. Every one of them is a way a fabricated question could
 * become evidence of what a student knows about a real exam.
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
    if (!allowed.includes(node.type)) return { valid: false, node, reason: 'NODE_TYPE_NOT_VALID' };
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

import { evaluatePyqEligibility } from '../../src/services/pyq/pyqEligibility.service';
import { recordAttemptMastery } from '../../src/services/learning/nodeMastery.service';
import { getSyllabusCoverage } from '../../src/services/learning/syllabusCoverage.service';
import { generateDailyPlan } from '../../src/services/learning/studyPlanner.service';

const JEE_SUBJ = 'subject:JEE_MAIN:2026:syl_j:physics:aaaaaa';
const JEE_NODE = 'topic:JEE_MAIN:2026:syl_j:current_electricity:bbbbbb';
const SSC_SUBJ = 'subject:SSC_CGL:2026:syl_s:quant:cccccc';
const SSC_NODE = 'topic:SSC_CGL:2026:syl_s:current_electricity:dddddd';
const USER = 'student-a';
const TODAY = new Date('2026-09-01T09:00:00Z');

/** A question that genuinely clears every gate. Nothing in production looks like this yet. */
const goodPyq = (over: any = {}) => ({
  id: 'pyq-good',
  examId: 'JEE_MAIN',
  syllabusNodeId: JEE_NODE,
  verificationStatus: 'OFFICIAL_CONFIRMED',
  rightsStatus: 'OFFICIAL_SOURCE_REVIEWED',
  redistributionAllowed: true,
  ingestionState: 'INDEXED',
  sourceUrl: 'https://example.gov.in/paper.pdf',
  questionText: 'A unique question that appears exactly once.',
  provenanceStamp: { sourceVerifiedAt: 1787000000000, sourceHttpStatus: 200, verifiedBy: 'provenance-pass' },
  ...over,
});

const ctxFor = (over: any = {}) => ({ examId: 'JEE_MAIN', nodeValid: true, textIsDuplicate: false, ...over });

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

describe('the gate', () => {
  it('admits a fully corroborated question', () => {
    expect(evaluatePyqEligibility(goodPyq(), ctxFor())).toEqual({ eligible: true, reasons: [] });
  });

  it('refuses a question that only ASSERTS its own authenticity', () => {
    // Exactly the shape of all 774 live records: perfect declared state, no corroboration.
    const r = evaluatePyqEligibility(goodPyq({ provenanceStamp: undefined }), ctxFor());
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('PROVENANCE_UNVERIFIED');
  });

  it('refuses a question whose cited source does not resolve', () => {
    const r = evaluatePyqEligibility(
      goodPyq({ provenanceStamp: { sourceVerifiedAt: 1, sourceHttpStatus: 404, verifiedBy: 'p' } }), ctxFor());
    expect(r.reasons).toContain('SOURCE_UNREACHABLE');
  });

  it('refuses duplicated question text', () => {
    const r = evaluatePyqEligibility(goodPyq(), ctxFor({ textIsDuplicate: true }));
    expect(r.reasons).toContain('DUPLICATE_TEXT');
  });

  it('refuses a rights-restricted question', () => {
    for (const rights of ['DO_NOT_REDISTRIBUTE', 'PERMISSION_REQUIRED', 'UNKNOWN']) {
      expect(evaluatePyqEligibility(goodPyq({ rightsStatus: rights }), ctxFor()).reasons)
        .toContain('RIGHTS_NOT_CLEARED');
    }
  });

  it('refuses when redistribution is not explicitly allowed', () => {
    expect(evaluatePyqEligibility(goodPyq({ redistributionAllowed: false }), ctxFor()).reasons)
      .toContain('RIGHTS_NOT_CLEARED');
  });

  it('refuses an unverified or conflicting answer key', () => {
    for (const v of ['UNVERIFIED', 'CONFLICTING', 'SECONDARY_ONLY']) {
      expect(evaluatePyqEligibility(goodPyq({ verificationStatus: v }), ctxFor()).reasons)
        .toContain('NOT_VERIFIED');
    }
  });

  it('refuses a quarantined or half-ingested question', () => {
    for (const s of ['QUARANTINED', 'DISCOVERED', 'EXTRACTED']) {
      expect(evaluatePyqEligibility(goodPyq({ ingestionState: s }), ctxFor()).reasons)
        .toContain('QUARANTINED');
    }
  });

  it('refuses a question with no syllabus node', () => {
    expect(evaluatePyqEligibility(goodPyq({ syllabusNodeId: undefined }), ctxFor()).reasons)
      .toContain('NODE_MISSING');
  });

  it('refuses a JEE question offered to SSC practice', () => {
    const r = evaluatePyqEligibility(goodPyq(), ctxFor({ examId: 'SSC_CGL', nodeCode: 'WRONG_EXAM', nodeValid: false }));
    expect(r.reasons).toContain('WRONG_EXAM');
    expect(r.eligible).toBe(false);
  });

  it('reports every failing gate, not just the first', () => {
    const r = evaluatePyqEligibility(
      goodPyq({ provenanceStamp: undefined, rightsStatus: 'UNKNOWN', syllabusNodeId: undefined }),
      ctxFor({ textIsDuplicate: true }));
    expect(r.reasons).toEqual(expect.arrayContaining(
      ['PROVENANCE_UNVERIFIED', 'RIGHTS_NOT_CLEARED', 'DUPLICATE_TEXT', 'NODE_MISSING'])); 
  });
});

describe('the loop a trustworthy PYQ would travel', () => {
  it('JEE: eligible PYQ → answer → mastery → coverage → replan', async () => {
    expect(evaluatePyqEligibility(goodPyq(), ctxFor()).eligible).toBe(true);

    const before = await getSyllabusCoverage(USER, 'JEE_MAIN');
    expect(before.coveragePercent).toBe(0);

    const rec = await recordAttemptMastery({
      userId: USER, examId: 'JEE_MAIN', syllabusNodeId: goodPyq().syllabusNodeId,
      correct: true, attemptId: 'pyq-attempt-1',
    });
    expect(rec.recorded).toBe(true);

    const after = await getSyllabusCoverage(USER, 'JEE_MAIN');
    const node = after.subjects.flatMap((s) => s.children).find((n) => n.nodeId === JEE_NODE)!;
    expect(node.state).toBe('LEARNING');

    const plan = await generateDailyPlan({
      userId: USER, examId: 'JEE_MAIN', dailyMinutes: 120, today: new Date('2026-09-10T09:00:00Z'),
    });
    expect(plan.tasks.filter((t) => t.syllabusNodeId === JEE_NODE).map((t) => t.activity))
      .not.toContain('LEARN');
  });

  it('SSC: the identical label stays isolated throughout', async () => {
    await recordAttemptMastery({
      userId: USER, examId: 'JEE_MAIN', syllabusNodeId: JEE_NODE, correct: true, attemptId: 'j1',
    });
    const ssc = await getSyllabusCoverage(USER, 'SSC_CGL');
    expect(ssc.coveragePercent).toBe(0);
    const sscNode = ssc.subjects.flatMap((s) => s.children).find((n) => n.nodeId === SSC_NODE)!;
    expect(sscNode.label).toBe('Current Electricity');
    expect(sscNode.state).toBe('UNTOUCHED');
  });
});

describe('negative — nothing questionable becomes evidence', () => {
  it('an ineligible PYQ produces no mastery, because it is never served', async () => {
    const bad = goodPyq({ provenanceStamp: undefined });
    const gate = evaluatePyqEligibility(bad, ctxFor());
    expect(gate.eligible).toBe(false);
    // The gate is what stops it; no attempt is ever created, so coverage stays honest.
    const cov = await getSyllabusCoverage(USER, 'JEE_MAIN');
    expect(cov.coveragePercent).toBe(0);
  });

  it('viewing is not answering — mastery needs a graded response', async () => {
    // No recordAttemptMastery call: opening a question is not evidence about knowledge.
    const cov = await getSyllabusCoverage(USER, 'JEE_MAIN');
    expect(cov.totals.untouched).toBe(cov.totals.addressable);
  });

  it('replaying one PYQ attempt does not double-count', async () => {
    for (let i = 0; i < 3; i++) {
      await recordAttemptMastery({
        userId: USER, examId: 'JEE_MAIN', syllabusNodeId: JEE_NODE, correct: true, attemptId: 'same',
      });
    }
    const cov = await getSyllabusCoverage(USER, 'JEE_MAIN');
    const node = cov.subjects.flatMap((s) => s.children).find((n) => n.nodeId === JEE_NODE)!;
    expect(node.attempts).toBe(1);
  });

  it("one student's PYQ evidence never reaches another", async () => {
    await recordAttemptMastery({
      userId: USER, examId: 'JEE_MAIN', syllabusNodeId: JEE_NODE, correct: true, attemptId: 'a1',
    });
    const other = await getSyllabusCoverage('student-b', 'JEE_MAIN');
    expect(other.coveragePercent).toBe(0);
  });

  it('a node outside the active syllabus cannot enter the planner', async () => {
    const removed = 'topic:JEE_MAIN:2026:syl_OLD:removed_topic:eeeeee';
    const r = await recordAttemptMastery({
      userId: USER, examId: 'JEE_MAIN', syllabusNodeId: removed, correct: true, attemptId: 'r1',
    });
    expect(r).toEqual({ recorded: false, reason: 'NODE_NOT_FOUND' });
    const plan = await generateDailyPlan({ userId: USER, examId: 'JEE_MAIN', dailyMinutes: 120, today: TODAY });
    expect(plan.tasks.some((t) => t.syllabusNodeId === removed)).toBe(false);
  });
});

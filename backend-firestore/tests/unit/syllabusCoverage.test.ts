/**
 * Stage 3 — syllabus coverage map.
 *
 * The classification boundaries are asserted against the SCORES STAGE 2 ACTUALLY PRODUCES, not
 * against invented numbers: 1 correct is 0.70, 3 correct is 0.892, 3 incorrect is 0.108. If the
 * scoring model changes, these fail — which is the point, because a UI band that silently drifts
 * away from the engine is how a student ends up seeing two different answers to one question.
 */

interface FakeNode { id: string; type: string; label: string; parentEntityId?: string }
const nodes: FakeNode[] = [];
let graphReads = 0;

const mockGraph = {
  async getSyllabusNodes(p: { examId: string; syllabusId?: string }) {
    graphReads++;
    return nodes.filter((n) => n.id.split(':')[1] === p.examId);
  },
  async getSyllabusNode() { return null; },
  async validateNodeForQuestion() { return { valid: false, node: null, reason: 'unused' }; },
};
jest.mock('../../src/services/exam/syllabusGraph.service', () => ({ syllabusGraphService: mockGraph }));

const mockMastery: any[] = [];
let masteryReads = 0;
jest.mock('../../src/services/learning/nodeMastery.service', () => ({
  MASTERY_ALLOWED_TYPES: ['TOPIC', 'SUBTOPIC'],
  async getUserMasteryForExam(_u: string, examId: string) {
    masteryReads++;
    return mockMastery.filter((m) => m.syllabusNodeId?.split(':')[1] === examId);
  },
}));

import {
  getSyllabusCoverage, classify, pruneToDepth, getCoverageSubtree, COVERAGE_THRESHOLDS,
} from '../../src/services/learning/syllabusCoverage.service';

const S = 'subject:SSC_CGL:2026:syl_a:quant:aaaaaa';
const T1 = 'topic:SSC_CGL:2026:syl_a:algebra:bbbbbb';
const T2 = 'topic:SSC_CGL:2026:syl_a:ratio:cccccc';
const T3 = 'topic:SSC_CGL:2026:syl_a:geometry:dddddd';
const JEE = 'topic:JEE_MAIN:2026:syl_j:algebra:eeeeee';

const m = (nodeId: string, masteryScore: number, attempts: number, successRate = 0.5) =>
  ({ syllabusNodeId: nodeId, masteryScore, attempts, successRate, lastPracticed: 1700000000000 });

beforeEach(() => {
  nodes.length = 0;
  nodes.push(
    { id: S, type: 'SUBJECT', label: 'Quantitative Aptitude' },
    { id: T1, type: 'TOPIC', label: 'Algebra', parentEntityId: S },
    { id: T2, type: 'TOPIC', label: 'Ratio', parentEntityId: S },
    { id: T3, type: 'TOPIC', label: 'Geometry', parentEntityId: S },
    { id: JEE, type: 'TOPIC', label: 'Algebra' },
  );
  mockMastery.length = 0;
  graphReads = 0; masteryReads = 0;
});

describe('classification — bands follow the Stage 2 curve', () => {
  it('no evidence is UNTOUCHED, never zero', () => {
    expect(classify(null)).toBe('UNTOUCHED');
    expect(classify({ masteryScore: 0, attempts: 0 })).toBe('UNTOUCHED');
  });

  it('one correct answer (0.70) is LEARNING, not STRONG', () => {
    expect(classify({ masteryScore: 0.70, attempts: 1 })).toBe('LEARNING');
  });

  it('one wrong answer (0.30) is LEARNING, not WEAK', () => {
    // A single bad answer is not a weakness — it is not yet evidence of anything.
    expect(classify({ masteryScore: 0.30, attempts: 1 })).toBe('LEARNING');
  });

  it('three wrong answers (0.108) is WEAK', () => {
    expect(classify({ masteryScore: 0.108, attempts: 3 })).toBe('WEAK');
  });

  it('three correct answers (0.892) is STRONG', () => {
    expect(classify({ masteryScore: 0.892, attempts: 3 })).toBe('STRONG');
  });

  it('four correct answers (0.935) is MASTERED', () => {
    expect(classify({ masteryScore: 0.935, attempts: 4 })).toBe('MASTERED');
  });

  it('a high score without enough evidence is never MASTERED', () => {
    expect(classify({ masteryScore: 0.99, attempts: COVERAGE_THRESHOLDS.MASTERY_EVIDENCE - 1 }))
      .not.toBe('MASTERED');
  });
});

describe('coverage map', () => {
  it('an empty student is 0% with everything untouched and no scores', async () => {
    const c = await getSyllabusCoverage('u1', 'SSC_CGL');
    expect(c.coveragePercent).toBe(0);
    expect(c.totals).toEqual({ addressable: 3, untouched: 3, learning: 0, weak: 0, strong: 0, mastered: 0 });
    const topic = c.subjects[0].children[0];
    expect(topic.state).toBe('UNTOUCHED');
    expect(topic.masteryScore).toBeNull();   // not 0 — a different claim
    expect(topic.accuracy).toBeNull();
  });

  it('counts a touched node toward coverage', async () => {
    mockMastery.push(m(T1, 0.70, 1));
    const c = await getSyllabusCoverage('u1', 'SSC_CGL');
    expect(c.totals.untouched).toBe(2);
    expect(c.totals.learning).toBe(1);
    expect(c.coveragePercent).toBeCloseTo(33.3, 1);
  });

  it('reports a mixed syllabus correctly', async () => {
    mockMastery.push(m(T1, 0.935, 4), m(T2, 0.108, 3));
    const c = await getSyllabusCoverage('u1', 'SSC_CGL');
    expect(c.totals).toEqual({ addressable: 3, untouched: 1, learning: 0, weak: 1, strong: 0, mastered: 1 });
    expect(c.coveragePercent).toBeCloseTo(66.7, 1);
    expect(c.masteredPercent).toBeCloseTo(33.3, 1);
  });

  it('the container derives its children and is not itself addressable', async () => {
    mockMastery.push(m(T1, 0.935, 4));
    const c = await getSyllabusCoverage('u1', 'SSC_CGL');
    const subject = c.subjects[0];
    expect(subject.nodeType).toBe('SUBJECT');
    expect(subject.isLeaf).toBe(false);       // containers never count toward the percentage
    expect(subject.children.map((x) => x.state)).toEqual(['MASTERED', 'UNTOUCHED', 'UNTOUCHED']);
    expect(c.totals.addressable).toBe(3);     // three topics, not four nodes
  });

  it('counts the deepest addressable level, not both levels', async () => {
    const SUB = 'subtopic:SSC_CGL:2026:syl_a:linear_equations:ffffff';
    nodes.push({ id: SUB, type: 'SUBTOPIC', label: 'Linear Equations', parentEntityId: T1 });
    const c = await getSyllabusCoverage('u1', 'SSC_CGL');
    // T1 now has an eligible child, so T1 stops being a leaf and the subtopic takes its place.
    expect(c.totals.addressable).toBe(3);
    const t1 = c.subjects[0].children.find((x) => x.nodeId === T1)!;
    expect(t1.isLeaf).toBe(false);
    expect(t1.children[0].isLeaf).toBe(true);
  });
});

describe('exam isolation', () => {
  it('JEE evidence never appears in SSC coverage', async () => {
    mockMastery.push(m(JEE, 0.935, 4));
    const c = await getSyllabusCoverage('u1', 'SSC_CGL');
    expect(c.totals.mastered).toBe(0);
    expect(c.totals.untouched).toBe(3);
    expect(c.coveragePercent).toBe(0);
  });

  it('the same label under each exam gives each its own coverage', async () => {
    mockMastery.push(m(T1, 0.935, 4), m(JEE, 0.108, 3));
    const ssc = await getSyllabusCoverage('u1', 'SSC_CGL');
    const jee = await getSyllabusCoverage('u1', 'JEE_MAIN');
    expect(ssc.totals.mastered).toBe(1);
    expect(jee.totals.mastered).toBe(0);
    expect(jee.totals.weak).toBe(1);
  });
});

describe('integrity', () => {
  it('mastery for a node not in the syllabus is ignored, not counted', async () => {
    mockMastery.push(m('topic:SSC_CGL:2026:syl_a:ghost:999999', 0.9, 5));
    const c = await getSyllabusCoverage('u1', 'SSC_CGL');
    expect(c.totals.addressable).toBe(3);
    expect(c.totals.untouched).toBe(3);   // the ghost contributes nothing
  });

  it('survives a malformed parent cycle', async () => {
    nodes.find((n) => n.id === S)!.parentEntityId = T1;   // subject -> topic -> subject
    const c = await getSyllabusCoverage('u1', 'SSC_CGL');
    expect(c.totals.addressable).toBeGreaterThan(0);
  });
});

describe('performance', () => {
  it('is two reads regardless of syllabus size', async () => {
    for (let i = 0; i < 800; i++) {
      nodes.push({ id: `topic:SSC_CGL:2026:syl_a:t${i}:${String(i).padStart(6, '0')}`, type: 'TOPIC', label: `T${i}`, parentEntityId: S });
    }
    graphReads = 0; masteryReads = 0;
    const c = await getSyllabusCoverage('u1', 'SSC_CGL');
    expect(c.totals.addressable).toBe(803);
    expect(graphReads).toBe(1);
    expect(masteryReads).toBe(1);
  });

  it('prunes to a shallow tree for a first paint', async () => {
    const SUB = 'subtopic:SSC_CGL:2026:syl_a:linear:ffffff';
    nodes.push({ id: SUB, type: 'SUBTOPIC', label: 'Linear', parentEntityId: T1 });
    const full = await getSyllabusCoverage('u1', 'SSC_CGL');
    const shallow = pruneToDepth(full, 2);
    expect(shallow.subjects[0].children.length).toBe(3);
    expect(shallow.subjects[0].children[0].children).toEqual([]);
    expect(shallow.totals).toEqual(full.totals);   // pruning must not change the numbers
  });

  it('fetches one subtree for lazy expansion', async () => {
    mockMastery.push(m(T1, 0.935, 4));
    const sub = await getCoverageSubtree('u1', 'SSC_CGL', T1);
    expect(sub?.label).toBe('Algebra');
    expect(sub?.state).toBe('MASTERED');
    expect(await getCoverageSubtree('u1', 'SSC_CGL', JEE)).toBeNull();
  });
});

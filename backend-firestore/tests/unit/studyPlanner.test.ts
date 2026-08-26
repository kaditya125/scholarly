/**
 * Stage 4 — deterministic study planner.
 *
 * Determinism is the property under test as much as any individual rule: the same inputs must
 * produce the same plan, so a regression is a failing test rather than a student noticing their
 * plan changed for no reason. Every case injects `today`, so nothing depends on the wall clock.
 */

const coverageResult: any = { subjects: [], totals: {}, examId: 'SSC_CGL' };
let coverageCalls = 0;

jest.mock('../../src/services/learning/syllabusCoverage.service', () => ({
  async getSyllabusCoverage(_u: string, examId: string) {
    coverageCalls++;
    return { ...coverageResult, examId };
  },
}));

import {
  generateDailyPlan, scoreNode, estimateRemaining,
  PLANNER_WEIGHTS, REVIEW_INTERVAL_DAYS, ACTIVITY_MINUTES,
} from '../../src/services/learning/studyPlanner.service';

const DAY = 86_400_000;
const TODAY = new Date('2026-09-01T09:00:00Z');
const NOW = TODAY.getTime();

const node = (over: any = {}) => ({
  nodeId: over.nodeId ?? 'topic:SSC_CGL:2026:syl_a:algebra:aaaaaa',
  label: over.label ?? 'Algebra',
  nodeType: 'TOPIC',
  parentId: over.parentId ?? 'subject:SSC_CGL:2026:syl_a:quant:pppppp',
  state: over.state ?? 'UNTOUCHED',
  masteryScore: over.masteryScore ?? null,
  attempts: over.attempts ?? 0,
  accuracy: over.accuracy ?? null,
  lastSeenAt: over.lastSeenAt ?? null,
  isLeaf: over.isLeaf ?? true,
  children: over.children ?? [],
});

const setCoverage = (leaves: any[], totals?: any) => {
  coverageResult.subjects = [{
    ...node({ nodeId: 'subject:SSC_CGL:2026:syl_a:quant:pppppp', label: 'Quant', parentId: null, isLeaf: false }),
    children: leaves,
  }];
  const untouched = leaves.filter((l) => l.state === 'UNTOUCHED').length;
  coverageResult.totals = totals ?? {
    addressable: leaves.length, untouched, weak: leaves.filter((l) => l.state === 'WEAK').length,
    learning: 0, strong: 0, mastered: 0,
  };
};

beforeEach(() => { coverageCalls = 0; setCoverage([]); });

const plan = (over: any = {}) => generateDailyPlan({
  userId: 'u1', examId: 'SSC_CGL', dailyMinutes: 120, today: TODAY, ...over,
});

describe('scoring', () => {
  it('weights sum to one, so the score stays interpretable', () => {
    const total = Object.values(PLANNER_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 10);
  });

  it('an untouched node scores on coverage, not weakness', () => {
    const s = scoreNode(node({ state: 'UNTOUCHED' }) as any, NOW, null, 0);
    expect(s.coverageNeed).toBe(1);
    expect(s.weakness).toBe(0);       // no evidence is not weakness
    expect(s.recencyNeed).toBe(0);
  });

  it('a weak node scores on weakness', () => {
    const s = scoreNode(node({ state: 'WEAK', attempts: 8, masteryScore: 0.2, lastSeenAt: NOW }) as any, NOW, null, 0);
    expect(s.weakness).toBeCloseTo(0.8, 5);
    expect(s.coverageNeed).toBe(0);
  });

  it('recency need grows with time since practice', () => {
    const fresh = scoreNode(node({ state: 'WEAK', attempts: 5, masteryScore: 0.3, lastSeenAt: NOW }) as any, NOW, null, 0);
    const stale = scoreNode(node({ state: 'WEAK', attempts: 5, masteryScore: 0.3, lastSeenAt: NOW - 10 * DAY }) as any, NOW, null, 0);
    expect(stale.recencyNeed).toBeGreaterThan(fresh.recencyNeed);
    expect(stale.score).toBeGreaterThan(fresh.score);
  });

  it('no exam date means no urgency — never an invented deadline', () => {
    const s = scoreNode(node() as any, NOW, null, 0);
    expect(s.urgency).toBe(0);
  });

  it('urgency rises as the exam nears', () => {
    const far = scoreNode(node() as any, NOW, 120, 0);
    const near = scoreNode(node() as any, NOW, 10, 0);
    expect(far.urgency).toBe(0);
    expect(near.urgency).toBeGreaterThan(0.8);
  });

  it('urgency never promotes mastered material above an untouched gap', () => {
    const mastered = scoreNode(node({ state: 'MASTERED', attempts: 6, masteryScore: 0.95, lastSeenAt: NOW - 40 * DAY }) as any, NOW, 5, 0);
    const untouched = scoreNode(node({ state: 'UNTOUCHED' }) as any, NOW, 5, 0);
    expect(untouched.score).toBeGreaterThan(mastered.score);
  });

  it('is deterministic', () => {
    const n = node({ state: 'WEAK', attempts: 4, masteryScore: 0.25, lastSeenAt: NOW - 3 * DAY });
    expect(scoreNode(n as any, NOW, 30, 2).score).toBe(scoreNode(n as any, NOW, 30, 2).score);
  });
});

describe('daily plan', () => {
  it('an empty syllabus produces an empty plan, not an error', async () => {
    const p = await plan();
    expect(p.tasks).toEqual([]);
    expect(p.plannedMinutes).toBe(0);
  });

  it('a fully untouched student gets LEARN before PRACTICE', async () => {
    setCoverage([node({ nodeId: 'topic:SSC_CGL:2026:syl_a:a:aaaaaa', label: 'A' })]);
    const p = await plan();
    expect(p.tasks.map((t) => t.activity)).toEqual(['LEARN', 'PRACTICE']);
    expect(p.tasks.every((t) => t.syllabusNodeId)).toBe(true);
  });

  it('never exceeds the daily budget', async () => {
    setCoverage(Array.from({ length: 40 }, (_, i) =>
      node({ nodeId: `topic:SSC_CGL:2026:syl_a:t${i}:${String(i).padStart(6, '0')}`, label: `T${i}` })));
    const p = await plan({ dailyMinutes: 100 });
    expect(p.plannedMinutes).toBeLessThanOrEqual(100);
    expect(p.tasks.length).toBeGreaterThan(0);
  });

  it('a tiny budget still yields something rather than nothing', async () => {
    setCoverage([node({ label: 'A' })]);
    const p = await plan({ dailyMinutes: 25 });
    expect(p.plannedMinutes).toBeLessThanOrEqual(25);
    expect(p.tasks.length).toBe(1);
    expect(p.tasks[0].activity).toBe('LEARN');
  });

  it('prioritises a weak node over a mastered one', async () => {
    setCoverage([
      node({ nodeId: 'topic:SSC_CGL:2026:syl_a:m:mmmmmm', label: 'Mastered', state: 'MASTERED', attempts: 6, masteryScore: 0.95, lastSeenAt: NOW - 30 * DAY }),
      node({ nodeId: 'topic:SSC_CGL:2026:syl_a:w:wwwwww', label: 'Weak', state: 'WEAK', attempts: 8, masteryScore: 0.2, accuracy: 0.25, lastSeenAt: NOW - 5 * DAY }),
    ]);
    const p = await plan();
    expect(p.tasks[0].label).toBe('Weak');
  });

  it('gives a weak node remediation, not just "study this"', async () => {
    setCoverage([node({ label: 'Current Electricity', state: 'WEAK', attempts: 8, masteryScore: 0.31, accuracy: 0.3, lastSeenAt: NOW - 5 * DAY })]);
    const p = await plan();
    expect(p.tasks.map((t) => t.activity)).toEqual(['REVISE', 'PRACTICE', 'QUIZ']);
  });

  it('does not reschedule something practised today', async () => {
    setCoverage([node({ label: 'Fresh', state: 'STRONG', attempts: 5, masteryScore: 0.8, lastSeenAt: NOW })]);
    const p = await plan();
    expect(p.tasks).toEqual([]);
  });

  it('never schedules a container node', async () => {
    setCoverage([node({ label: 'Leaf' })]);
    const p = await plan();
    expect(p.tasks.every((t) => t.label !== 'Quant')).toBe(true);
  });

  it('every task carries a reason a student can read', async () => {
    setCoverage([node({ label: 'A', state: 'WEAK', attempts: 6, masteryScore: 0.3, accuracy: 0.33, lastSeenAt: NOW - 9 * DAY })]);
    const p = await plan({ examDate: '2026-10-01' });
    const reasons = p.tasks[0].reasons.join(' | ');
    expect(reasons).toMatch(/Weak after 6 attempts/);
    expect(reasons).toMatch(/Not practised in 9 days/);
    expect(reasons).not.toMatch(/AI/i);
  });

  it('is idempotent — task ids are stable across runs', async () => {
    setCoverage([node({ label: 'A' })]);
    const a = await plan();
    const b = await plan();
    expect(a.tasks.map((t) => t.id)).toEqual(b.tasks.map((t) => t.id));
    expect(a.tasks[0].id).toContain('2026-09-01');
  });

  it('handles a missing exam date without inventing one', async () => {
    setCoverage([node({ label: 'A' })]);
    const p = await plan();
    expect(p.examDate).toBeNull();
    expect(p.daysUntilExam).toBeNull();
    expect(p.tasks.length).toBeGreaterThan(0);
  });
});

describe('exam and user isolation', () => {
  it('asks coverage for the exam it was given', async () => {
    setCoverage([node({ label: 'A' })]);
    const jee = await generateDailyPlan({ userId: 'u1', examId: 'JEE_MAIN', dailyMinutes: 60, today: TODAY });
    expect(jee.examId).toBe('JEE_MAIN');
  });

  it('scopes every plan to one user via the coverage call', async () => {
    setCoverage([node({ label: 'A' })]);
    const a = await plan({ userId: 'student-a' });
    expect(a.tasks[0].id.startsWith('student-a:')).toBe(true);
  });
});

describe('outlook', () => {
  it('estimates days to cover from real numbers', () => {
    const o = estimateRemaining({ addressable: 100, untouched: 90, weak: 5 }, 90, null);
    // 90 min/day / 45 min first pass = 2 nodes a day -> 45 days
    expect(o.estimatedDaysToCover).toBe(45);
  });

  it('says plainly when the syllabus does not fit the time left', () => {
    const o = estimateRemaining({ addressable: 800, untouched: 800, weak: 0 }, 60, 20);
    expect(o.achievableBeforeExam).toBe(false);
    expect(o.note).toMatch(/prioritises the highest-need/);
  });

  it('refuses to estimate with no study time set', () => {
    const o = estimateRemaining({ addressable: 100, untouched: 100, weak: 0 }, 0, 30);
    expect(o.estimatedDaysToCover).toBeNull();
    expect(o.note).toMatch(/no estimate/i);
  });
});

describe('performance', () => {
  it('one coverage call regardless of syllabus size', async () => {
    setCoverage(Array.from({ length: 1500 }, (_, i) =>
      node({ nodeId: `topic:SSC_CGL:2026:syl_a:t${i}:${String(i).padStart(6, '0')}`, label: `T${i}` })));
    coverageCalls = 0;
    const t0 = Date.now();
    const p = await plan({ dailyMinutes: 120 });
    expect(coverageCalls).toBe(1);
    expect(p.tasks.length).toBeGreaterThan(0);
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('review intervals are ordered by how fast each state decays', () => {
    expect(REVIEW_INTERVAL_DAYS.WEAK).toBeLessThan(REVIEW_INTERVAL_DAYS.LEARNING);
    expect(REVIEW_INTERVAL_DAYS.LEARNING).toBeLessThan(REVIEW_INTERVAL_DAYS.STRONG);
    expect(REVIEW_INTERVAL_DAYS.STRONG).toBeLessThan(REVIEW_INTERVAL_DAYS.MASTERED);
    expect(ACTIVITY_MINUTES.LEARN).toBeGreaterThan(ACTIVITY_MINUTES.REVISE);
  });
});

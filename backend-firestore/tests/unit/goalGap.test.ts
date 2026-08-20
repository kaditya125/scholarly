/**
 * Goal-gap semantics.
 *
 * THE DEFECT THESE LOCK OUT: buildGoalGap used to return
 * `gap = goal.targetScore - observations.overallAccuracy`. Those are not the same quantity.
 * `overallAccuracy` is an unweighted mean of per-quiz accuracy percentages; `targetScore` was a
 * bare number whose unit was never recorded — the goal validator deliberately refuses to bound it
 * because scoring models differ per exam. A student targeting 180 in a 200-mark paper while
 * averaging 55% on practice quizzes was told their gap was 125, with the same confidence as a
 * real measurement.
 *
 * The rule now: produce a number ONLY when target and measurement are the same quantity on the
 * same instrument. Everything else returns a specific reason code.
 */
// `uuid` ships ESM-only in dist-node and jest does not transform node_modules; the service's
// dependency graph reaches it via quizAttempts → notification.service. Mocked here rather than
// widening transformIgnorePatterns globally. It plays no part in goal-gap arithmetic.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

import { LearningStateService } from '../../src/services/learningState.service';
import type { Observations, StudentGoal } from '../../src/types/learningState.types';

// buildGoalGap is private; these tests exercise it directly because it is the unit under test.
const gapOf = (goal: any, obs: Observations) =>
  (new LearningStateService() as any).buildGoalGap(goal, obs);

const obsWith = (accuracy: number | null): Observations => ({
  topics: [],
  overallAccuracy: accuracy == null
    ? { status: 'INSUFFICIENT_DATA', value: null, confidence: null }
    : { status: 'AVAILABLE', value: accuracy, confidence: 0.8 },
  consistency: { status: 'INSUFFICIENT_DATA', value: null, confidence: null },
  syllabusCoverage: { status: 'INSUFFICIENT_DATA', value: null, confidence: null },
  assessmentsCompleted: { status: 'AVAILABLE', value: 10, confidence: null },
});

const activeGoal = (over: Partial<StudentGoal>): any => ({
  studentId: 'u1', status: 'ACTIVE', source: 'STUDENT_DECLARED',
  createdAt: 0, updatedAt: 0, ...over,
});

describe('no goal', () => {
  it('reports NOT_SET rather than inventing a target', () => {
    const g = gapOf(null, obsWith(55));
    expect(g.status).toBe('NOT_SET');
    expect(g.reason).toBe('GOAL_NOT_SET');
    expect(g.target).toBeNull();
    expect(g.gap).toBeNull();
  });

  it('an inactive goal is treated as not set', () => {
    const g = gapOf(activeGoal({ status: 'ABANDONED', targetScore: 90, targetScoreUnit: 'PERCENT' }), obsWith(55));
    expect(g.status).toBe('NOT_SET');
  });
});

describe('THE REGRESSION: incompatible target and measurement', () => {
  it('a MARKS target does not become a number — the exam maximum is unknown', () => {
    // The original failure case: 180 marks vs 55% would previously have produced gap = 125.
    const g = gapOf(activeGoal({ targetScore: 180, targetScoreUnit: 'MARKS' }), obsWith(55));
    expect(g.status).toBe('UNAVAILABLE');
    expect(g.reason).toBe('EXAM_MAX_MARKS_UNKNOWN');
    expect(g.gap).toBeNull();
    expect(g.current).toBeNull();
  });

  it('a unit-less legacy target is never assumed to be a percentage', () => {
    const g = gapOf(activeGoal({ targetScore: 90 }), obsWith(55));
    expect(g.status).toBe('UNAVAILABLE');
    expect(g.reason).toBe('TARGET_UNIT_UNDECLARED');
    expect(g.gap).toBeNull();
  });

  it('even a PERCENT target yields no gap — quiz accuracy is a different instrument', () => {
    // Same unit, different measuring device: practice quizzes have a different question pool, no
    // negative marking and self-selected difficulty. Subtracting produces a plausible-looking
    // number that systematically misstates how close the student is.
    const g = gapOf(activeGoal({ targetScore: 90, targetScoreUnit: 'PERCENT' }), obsWith(55));
    expect(g.status).toBe('UNAVAILABLE');
    expect(g.reason).toBe('NO_COMPARABLE_MEASUREMENT');
    expect(g.gap).toBeNull();
    expect(g.target).toBe(90);
    expect(g.unit).toBe('PERCENT');
  });
});

describe('goal kinds with no measurement at all', () => {
  it('a rank target reports RANK_NOT_MEASURED', () => {
    const g = gapOf(activeGoal({ targetRank: 500 }), obsWith(55));
    expect(g.status).toBe('UNAVAILABLE');
    expect(g.reason).toBe('RANK_NOT_MEASURED');
    expect(g.gap).toBeNull();
  });

  it('a percentile target reports PERCENTILE_NOT_MEASURED', () => {
    const g = gapOf(activeGoal({ targetPercentile: 99 }), obsWith(55));
    expect(g.status).toBe('UNAVAILABLE');
    expect(g.reason).toBe('PERCENTILE_NOT_MEASURED');
    expect(g.gap).toBeNull();
  });
});

describe('insufficient evidence', () => {
  it('reports INSUFFICIENT_PERFORMANCE_EVIDENCE before NO_COMPARABLE_MEASUREMENT', () => {
    const g = gapOf(activeGoal({ targetScore: 90, targetScoreUnit: 'PERCENT' }), obsWith(null));
    expect(g.status).toBe('INSUFFICIENT_DATA');
    expect(g.reason).toBe('INSUFFICIENT_PERFORMANCE_EVIDENCE');
    expect(g.gap).toBeNull();
  });
});

describe('daysRemaining is independent of the score gap', () => {
  it('is computed even when the gap is unavailable', () => {
    // Plain date arithmetic on a value the student supplied — true regardless of whether the
    // score comparison can be made, and useful to the mentor on its own.
    const future = new Date(Date.now() + 86400000 * 30).toISOString();
    const g = gapOf(activeGoal({ targetScore: 180, targetScoreUnit: 'MARKS', targetDate: future }), obsWith(55));
    expect(g.status).toBe('UNAVAILABLE');
    expect(g.daysRemaining).toBeGreaterThan(28);
    expect(g.daysRemaining).toBeLessThanOrEqual(30);
  });

  it('is null when no target date was declared', () => {
    const g = gapOf(activeGoal({ targetScore: 90, targetScoreUnit: 'PERCENT' }), obsWith(55));
    expect(g.daysRemaining).toBeNull();
  });
});

describe('no unavailable value is ever reported as zero', () => {
  it('every unavailable branch returns null, never 0', () => {
    const cases = [
      gapOf(null, obsWith(55)),
      gapOf(activeGoal({ targetScore: 90 }), obsWith(55)),
      gapOf(activeGoal({ targetScore: 180, targetScoreUnit: 'MARKS' }), obsWith(55)),
      gapOf(activeGoal({ targetScore: 90, targetScoreUnit: 'PERCENT' }), obsWith(55)),
      gapOf(activeGoal({ targetRank: 500 }), obsWith(55)),
      gapOf(activeGoal({ targetPercentile: 99 }), obsWith(55)),
      gapOf(activeGoal({ targetScore: 90, targetScoreUnit: 'PERCENT' }), obsWith(null)),
    ];
    for (const c of cases) {
      expect(c.gap).toBeNull();
      expect(c.gap).not.toBe(0);
      expect(c.current).toBeNull();
    }
  });
});

describe('determinism', () => {
  it('the same inputs produce the same output', () => {
    const goal = activeGoal({ targetScore: 90, targetScoreUnit: 'PERCENT' });
    const a = gapOf(goal, obsWith(55));
    const b = gapOf(goal, obsWith(55));
    expect({ ...a, daysRemaining: null }).toEqual({ ...b, daysRemaining: null });
  });
});

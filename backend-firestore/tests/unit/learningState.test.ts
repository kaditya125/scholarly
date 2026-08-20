/**
 * Gate 7 tests for the composition layer.
 *
 * The recurring assertion across all of these is the same one this whole phase exists to
 * enforce: the absence of evidence must be structurally distinguishable from zero, and no
 * dependency failure may ever produce a plausible-looking number.
 */
import { confidenceFromSample, LearningStateService } from '../../src/services/learningState.service';

// Dependencies are stubbed at module level so each scenario controls exactly what evidence exists.
jest.mock('../../src/services/studentGoal.service', () => ({
  studentGoalService: { getGoal: jest.fn() },
}));
jest.mock('../../src/services/tests/quizAttempts.service', () => ({
  quizAttemptsService: { getProgressReport: jest.fn() },
}));
jest.mock('../../src/core/intelligence/MasteryEngine', () => ({
  masteryEngine: { snapshot: jest.fn(), store: { list: jest.fn() } },
}));
// Plain class, not a jest.fn implementation: clearAllMocks() would wipe a mockImplementation
// and leave getUserStats returning undefined.
jest.mock('../../src/services/userStats.service', () => ({
  UserStatsService: class { async getUserStats() { return null; } },
}));

const { studentGoalService } = require('../../src/services/studentGoal.service');
const { quizAttemptsService } = require('../../src/services/tests/quizAttempts.service');
const { masteryEngine } = require('../../src/core/intelligence/MasteryEngine');

const svc = new LearningStateService();

const setUp = (opts: { goal?: any; progress?: any; mastery?: any[] }) => {
  studentGoalService.getGoal.mockResolvedValue(opts.goal ?? null);
  quizAttemptsService.getProgressReport.mockResolvedValue(opts.progress ?? null);
  masteryEngine.snapshot.mockResolvedValue({});
  masteryEngine.store.list.mockResolvedValue(opts.mastery ?? []);
};

beforeEach(() => jest.clearAllMocks());

describe('confidenceFromSample', () => {
  it('rises with evidence and never reaches certainty', () => {
    expect(confidenceFromSample(0)).toBe(0);
    expect(confidenceFromSample(2)).toBeLessThan(confidenceFromSample(10));
    expect(confidenceFromSample(10)).toBeLessThan(confidenceFromSample(50));
    expect(confidenceFromSample(10_000)).toBeLessThanOrEqual(0.95);
  });
});

describe('LearningStateService — insufficient data paths', () => {
  it('a student with no data reports INSUFFICIENT_DATA, never zeros', async () => {
    setUp({ progress: { topicMastery: [], completedCount: 0, averageAccuracy: 0 } });
    const s = await svc.getLearningState('u1');

    expect(s.observations.overallAccuracy.status).toBe('INSUFFICIENT_DATA');
    expect(s.observations.overallAccuracy.value).toBeNull(); // NOT 0
    expect(s.readiness.status).toBe('INSUFFICIENT_DATA');
    expect(s.readiness.score).toBeNull();                     // NOT 0
    expect(s.decisions.currentPriority.status).toBe('INSUFFICIENT_DATA');
  });

  it('no goal reports GOAL_NOT_SET and never invents a target', async () => {
    setUp({ goal: null, progress: { topicMastery: [], completedCount: 3, averageAccuracy: 70 } });
    const s = await svc.getLearningState('u1');

    expect(s.decisions.goalGap.status).toBe('NOT_SET');
    expect(s.decisions.goalGap.reason).toBe('GOAL_NOT_SET');
    expect(s.decisions.goalGap.gap).toBeNull();
    expect(s.decisions.goalGap.target).toBeNull();
  });

  it('goal set but no performance evidence does not fabricate a gap', async () => {
    setUp({
      // The unit is now part of a well-formed score goal — without it the target is
      // uninterpretable and reports TARGET_UNIT_UNDECLARED instead (covered below).
      goal: { status: 'ACTIVE', targetScore: 80, targetScoreUnit: 'PERCENT' },
      progress: { topicMastery: [], completedCount: 0, averageAccuracy: 0 },
    });
    const s = await svc.getLearningState('u1');

    expect(s.decisions.goalGap.status).toBe('INSUFFICIENT_DATA');
    expect(s.decisions.goalGap.gap).toBeNull();
    expect(s.decisions.goalGap.target).toBe(80); // target is known; the GAP is not
  });

  it('a legacy goal with no declared unit reports why, rather than assuming percent', async () => {
    // Goals recorded before the unit field existed cannot be retro-classified, and guessing would
    // reinstate the original defect: subtracting a percentage from a possibly-raw mark.
    setUp({
      goal: { status: 'ACTIVE', targetScore: 180 },
      progress: { topicMastery: [], completedCount: 5, averageAccuracy: 55 },
    });
    const s = await svc.getLearningState('u1');

    expect(s.decisions.goalGap.status).toBe('UNAVAILABLE');
    expect(s.decisions.goalGap.reason).toBe('TARGET_UNIT_UNDECLARED');
    expect(s.decisions.goalGap.gap).toBeNull();
  });

  it('a topic below the evidence threshold produces no claim at all', async () => {
    setUp({ progress: { topicMastery: [{ topic: 'Probability', total: 2, correct: 0, attempts: 1, accuracy: 0 }], completedCount: 1, averageAccuracy: 0 } });
    const s = await svc.getLearningState('u1');

    expect(s.observations.topics[0].accuracy.status).toBe('INSUFFICIENT_DATA');
    expect(s.analysis.weaknesses).toHaveLength(0); // 0% accuracy on 2 questions is not a weakness
  });
});

describe('LearningStateService — dependency failure must not fabricate', () => {
  it('a failed progress report yields UNAVAILABLE, not accuracy 0', async () => {
    studentGoalService.getGoal.mockResolvedValue(null);
    quizAttemptsService.getProgressReport.mockRejectedValue(new Error('firestore down'));
    masteryEngine.snapshot.mockResolvedValue({});
    masteryEngine.store.list.mockResolvedValue([]);

    const s = await svc.getLearningState('u1');

    expect(s.observations.overallAccuracy.status).toBe('UNAVAILABLE');
    expect(s.observations.overallAccuracy.value).toBeNull(); // critically NOT 0
    expect(s.metadata.degraded).toContain('quizProgress');
    expect(s.readiness.score).toBeNull();
  });
});

describe('LearningStateService — weakness analysis', () => {
  const weakProgress = {
    completedCount: 6,
    averageAccuracy: 55,
    topicMastery: [
      { topic: 'Probability', total: 40, correct: 14, attempts: 6, accuracy: 35 },
      { topic: 'Kinematics', total: 30, correct: 27, attempts: 5, accuracy: 90 },
    ],
  };

  it('detects a weakness with evidence, and a strength separately', async () => {
    setUp({ progress: weakProgress });
    const s = await svc.getLearningState('u1');

    expect(s.analysis.weaknesses.map((w) => w.topicLabel)).toContain('Probability');
    expect(s.analysis.strengths.map((x) => x.topicLabel)).toContain('Kinematics');

    const w = s.analysis.weaknesses[0];
    expect(w.evidence.length).toBeGreaterThan(0);
    expect(w.reasonCodes.length).toBeGreaterThan(0);
    expect(w.confidence).toBeGreaterThan(0.9); // 40 observations
  });

  it('root cause never exceeds the evidence', async () => {
    setUp({ progress: weakProgress });
    const s = await svc.getLearningState('u1');
    const w = s.analysis.weaknesses[0];

    // The data shows low accuracy; it does NOT establish conceptual misunderstanding.
    expect(w.rootCauseStatus).toBe('OBSERVED');
    expect(['LOW_ACCURACY', 'DECLINING_TREND']).toContain(w.rootCause);
  });

  it('caps severity when confidence is low (small sample cannot justify HIGH)', async () => {
    setUp({
      progress: {
        completedCount: 1, averageAccuracy: 20,
        topicMastery: [{ topic: 'Probability', total: 4, correct: 0, attempts: 1, accuracy: 0 }],
      },
    });
    const s = await svc.getLearningState('u1');
    expect(s.analysis.weaknesses[0].severity).not.toBe('HIGH');
  });

  it('current priority names the weakest topic and explains itself in codes', async () => {
    setUp({ progress: weakProgress });
    const s = await svc.getLearningState('u1');

    expect(s.decisions.currentPriority.status).toBe('AVAILABLE');
    expect(s.decisions.currentPriority.topicLabel).toBe('Probability');
    expect(s.decisions.currentPriority.reasonCodes.length).toBeGreaterThan(0);
    expect(s.decisions.currentPriority.evidence.length).toBeGreaterThan(0);
  });

  it('mastery and accuracy are reported separately, never averaged', async () => {
    setUp({
      progress: weakProgress,
      mastery: [{ topic: 'Probability', title: 'Probability', masteryScore: 0.2, confidence: 0.8, attempts: 40, successCount: 14, masteryTrend: 'declining', lastPracticed: Date.now(), subject: 'Mathematics' }],
    });
    const s = await svc.getLearningState('u1');
    const t = s.observations.topics.find((x) => x.topicLabel === 'Probability')!;

    expect(t.accuracy.value).toBe(35);   // from getProgressReport
    expect(t.mastery.value).toBe(20);    // from MasteryEngine — distinct value, not blended
    expect(t.mastery.confidence).toBe(0.8); // MasteryEngine's own confidence preserved
  });

  it('records freshness from the most recent evidence', async () => {
    const when = Date.now() - 1000;
    setUp({
      progress: weakProgress,
      mastery: [{ topic: 'Probability', title: 'Probability', masteryScore: 0.2, confidence: 0.8, attempts: 40, successCount: 14, masteryTrend: 'steady', lastPracticed: when }],
    });
    const s = await svc.getLearningState('u1');
    expect(s.metadata.lastEvidenceAt).toBe(when);
    expect(s.metadata.algorithmVersion).toBeGreaterThanOrEqual(1);
  });
});

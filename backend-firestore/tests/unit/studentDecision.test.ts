/**
 * Gate 8 — deterministic decision layer.
 *
 * These build a StudentLearningState by hand and assert what Gate 8 DECIDES about it. That is the
 * whole point of the layer being pure: no Firestore, no clock, no model, so every rule is
 * observable in isolation and two runs over the same state are byte-identical.
 *
 * The recurring assertion throughout: an unavailable measurement never becomes a zero, and never
 * becomes a confident claim.
 */
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

import { StudentDecisionService } from '../../src/services/studentDecision.service';
import type {
  StudentLearningState, Weakness, TopicObservation, Metric,
} from '../../src/types/learningState.types';

const svc = new StudentDecisionService();
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

const avail = <T>(value: T, confidence: number | null = 0.8): Metric<T> =>
  ({ status: 'AVAILABLE', value, confidence });
const insuf = <T>(reason = 'insufficient'): Metric<T> =>
  ({ status: 'INSUFFICIENT_DATA', value: null, confidence: null, reason });

const topic = (over: Partial<TopicObservation> & { topicId: string }): TopicObservation => ({
  topicLabel: over.topicId, accuracy: insuf(), mastery: insuf(), trend: insuf(),
  attempts: 0, ...over,
});

const weakness = (over: Partial<Weakness> & { topicId: string }): Weakness => ({
  topicLabel: over.topicId, severity: 'MODERATE', confidence: 0.7, accuracy: 45,
  mastery: null, trend: null, rootCause: 'LOW_ACCURACY', rootCauseStatus: 'OBSERVED',
  evidence: [{ kind: 'quiz_attempts', summary: '9/20', sampleSize: 20, lastObservedAt: NOW - DAY }],
  reasonCodes: ['ACCURACY_45_PCT'], ...over,
});

const state = (over: Partial<StudentLearningState> = {}): StudentLearningState => ({
  studentId: 'u1',
  examContext: null,
  goal: null,
  observations: {
    topics: [], overallAccuracy: insuf(), consistency: insuf(),
    syllabusCoverage: insuf(), assessmentsCompleted: insuf(),
  },
  analysis: { strengths: [], weaknesses: [], trend: insuf() },
  decisions: {
    goalGap: { status: 'NOT_SET', gap: null, current: null, target: null, reason: 'GOAL_NOT_SET' },
    currentPriority: { status: 'INSUFFICIENT_DATA', topicId: null, topicLabel: null, priority: null, reasonCodes: [], evidence: [] },
  },
  readiness: {
    status: 'INSUFFICIENT_DATA', score: null, confidence: null,
    dimensions: {
      syllabusCoverage: insuf(), conceptMastery: insuf(), accuracy: insuf(),
      consistency: insuf(), weaknessRisk: insuf(), goalGap: insuf(),
    },
  },
  metadata: { generatedAt: NOW, lastEvidenceAt: null, algorithmVersion: 1, degraded: [] },
  ...over,
});

// ─── 1–3. No / insufficient evidence ────────────────────────────────────────────────────────

describe('1. brand-new student with no evidence', () => {
  const d = svc.decide(state(), NOW);

  it('reports INSUFFICIENT_DATA, not "on track" and not a zero score', () => {
    expect(d.currentStatus.status).toBe('INSUFFICIENT_DATA');
    expect(d.primaryWeakness).toBeNull();
    expect(d.priorities).toHaveLength(0);
  });

  it('asks for evidence rather than inventing a weakness', () => {
    expect(d.nextAction.code).toBe('COLLECT_MORE_EVIDENCE');
    expect(d.nextAction.topicId).toBeNull();
  });

  it('forbids the mentor from claiming readiness, coverage or mastery', () => {
    const joined = d.mustNotClaim.join(' ');
    expect(joined).toMatch(/readiness/i);
    expect(joined).toMatch(/syllabus/i);
    expect(joined).toMatch(/mastery/i);
  });
});

describe('2 & 3. one wrong answer is not a weakness', () => {
  it('a topic below the evidence threshold produces no priority at all', () => {
    // Upstream leaves sub-threshold topics as INSUFFICIENT_DATA and emits no weakness; Gate 8
    // must not resurrect one from the raw observation.
    const d = svc.decide(state({
      observations: {
        ...state().observations,
        topics: [topic({ topicId: 'probability', accuracy: insuf('only 1 graded question'), attempts: 1 })],
      },
    }), NOW);
    expect(d.priorities).toHaveLength(0);
    expect(d.currentStatus.status).toBe('INSUFFICIENT_DATA');
    expect(d.nextAction.code).toBe('COLLECT_MORE_EVIDENCE');
  });
});

// ─── 4–8. Classification, severity, trend, freshness ────────────────────────────────────────

describe('4 & 5. evidence strength drives classification', () => {
  it('well-evidenced weakness classifies as HIGH_CONFIDENCE_WEAKNESS', () => {
    const d = svc.decide(state({
      observations: { ...state().observations, topics: [topic({ topicId: 'algebra', accuracy: avail(30) })] },
      analysis: { strengths: [], weaknesses: [weakness({ topicId: 'algebra', confidence: 0.85, severity: 'HIGH', accuracy: 30 })], trend: insuf() },
    }), NOW);
    expect(d.priorities[0].classification).toBe('HIGH_CONFIDENCE_WEAKNESS');
    expect(d.currentStatus.status).toBe('SIGNIFICANT_GAP');
  });

  it('THE RULE: low confidence can never reach HIGH_CONFIDENCE_WEAKNESS', () => {
    const d = svc.decide(state({
      observations: { ...state().observations, topics: [topic({ topicId: 'algebra', accuracy: avail(20) })] },
      // Even at 20% accuracy — the evidence is thin, so the claim stays weaker than the number looks.
      analysis: { strengths: [], weaknesses: [weakness({ topicId: 'algebra', confidence: 0.25, severity: 'MODERATE', accuracy: 20 })], trend: insuf() },
    }), NOW);
    expect(d.priorities[0].classification).toBe('OBSERVED_WEAKNESS');
    expect(d.currentStatus.status).toBe('NEEDS_ATTENTION');
    expect(d.currentStatus.status).not.toBe('SIGNIFICANT_GAP');
  });
});

describe('6 & 7. trend', () => {
  it('a declining well-evidenced weakness is reviewed, not drilled', () => {
    const d = svc.decide(state({
      observations: { ...state().observations, topics: [topic({ topicId: 'algebra', accuracy: avail(40) })] },
      analysis: { strengths: [], weaknesses: [weakness({
        topicId: 'algebra', confidence: 0.8, trend: 'declining',
        rootCause: 'DECLINING_TREND', rootCauseStatus: 'OBSERVED',
      })], trend: insuf() },
    }), NOW);
    expect(d.priorities[0].trend).toBe('declining');
    expect(d.priorities[0].recommendedAction).toBe('REVIEW_CONCEPT');
  });

  it('an improving topic that is still weak keeps its measured trend', () => {
    const d = svc.decide(state({
      observations: { ...state().observations, topics: [topic({ topicId: 'algebra', accuracy: avail(50) })] },
      analysis: { strengths: [], weaknesses: [weakness({ topicId: 'algebra', confidence: 0.8, trend: 'improving' })], trend: insuf() },
    }), NOW);
    expect(d.priorities[0].trend).toBe('improving');
  });
});

describe('8. stale evidence', () => {
  const stale = weakness({
    topicId: 'algebra', confidence: 0.9,
    evidence: [{ kind: 'quiz_attempts', summary: 'old', sampleSize: 30, lastObservedAt: NOW - DAY * 90 }],
  });
  const d = svc.decide(state({
    observations: { ...state().observations, topics: [topic({ topicId: 'algebra', accuracy: avail(40) })] },
    analysis: { strengths: [], weaknesses: [stale], trend: insuf() },
  }), NOW);

  it('is marked STALE rather than presented as current', () => {
    expect(d.priorities[0].freshness).toBe('STALE');
  });

  it('forbids describing it as the student\'s present state', () => {
    expect(d.mustNotClaim.join(' ')).toMatch(/stale/i);
  });

  it('freshness is UNKNOWN — never FRESH — when no timestamp exists', () => {
    const d2 = svc.decide(state({
      observations: { ...state().observations, topics: [topic({ topicId: 'a', accuracy: avail(40) })] },
      analysis: { strengths: [], weaknesses: [weakness({ topicId: 'a', evidence: [{ kind: 'quiz_attempts', summary: 'x' }] })], trend: insuf() },
    }), NOW);
    expect(d2.priorities[0].freshness).toBe('UNKNOWN');
  });
});

// ─── 9–13. Goal gap passthrough ─────────────────────────────────────────────────────────────

describe('9–13. goal gap is carried through, never recomputed', () => {
  const withGap = (gap: any) => svc.decide(state({ decisions: { ...state().decisions, goalGap: gap } }), NOW);

  it('9. no goal → NOT_SET and the next action is to set one', () => {
    const d = svc.decide(state({
      observations: { ...state().observations, topics: [topic({ topicId: 'a', accuracy: avail(90) })] },
      analysis: { strengths: [{ topicId: 'a', topicLabel: 'a', accuracy: 90, evidence: [] }], weaknesses: [], trend: insuf() },
    }), NOW);
    expect(d.goalGap.status).toBe('NOT_SET');
    expect(d.nextAction.code).toBe('SET_GOAL');
  });

  it('10. incompatible measurement stays UNAVAILABLE with no number', () => {
    const d = withGap({ status: 'UNAVAILABLE', gap: null, current: null, target: 90, unit: 'PERCENT', reason: 'NO_COMPARABLE_MEASUREMENT' });
    expect(d.goalGap.gap).toBeNull();
    expect(d.mustNotClaim.join(' ')).toMatch(/NO_COMPARABLE_MEASUREMENT/);
  });

  it('12. rank goal without rank measurement', () => {
    const d = withGap({ status: 'UNAVAILABLE', gap: null, current: null, target: 500, reason: 'RANK_NOT_MEASURED' });
    expect(d.goalGap.reason).toBe('RANK_NOT_MEASURED');
    expect(d.goalGap.gap).toBeNull();
  });

  it('13. percentile goal without percentile measurement', () => {
    const d = withGap({ status: 'UNAVAILABLE', gap: null, current: null, target: 99, reason: 'PERCENTILE_NOT_MEASURED' });
    expect(d.goalGap.reason).toBe('PERCENTILE_NOT_MEASURED');
    expect(d.goalGap.gap).toBeNull();
  });
});

// ─── 14 & 15. Multiple weaknesses and tie-breaking ──────────────────────────────────────────

describe('14 & 15. priority ordering', () => {
  const many = state({
    observations: {
      ...state().observations,
      topics: [topic({ topicId: 'a', accuracy: avail(40) }), topic({ topicId: 'b', accuracy: avail(30) }), topic({ topicId: 'c', accuracy: avail(50) })],
    },
    analysis: {
      strengths: [],
      weaknesses: [
        weakness({ topicId: 'a', confidence: 0.5, severity: 'MODERATE', accuracy: 40 }),
        weakness({ topicId: 'b', confidence: 0.9, severity: 'HIGH', accuracy: 30 }),
        weakness({ topicId: 'c', confidence: 0.2, severity: 'LOW', accuracy: 50 }),
      ],
      trend: insuf(),
    },
  });

  it('ranks by evidence strength then severity', () => {
    const d = svc.decide(many, NOW);
    expect(d.priorities.map((p) => p.topicId)).toEqual(['b', 'a', 'c']);
    expect(d.primaryWeakness!.topicId).toBe('b');
  });

  it('explains what each priority was selected OVER', () => {
    const d = svc.decide(many, NOW);
    expect(d.priorities[0].selectedOver).toEqual({ topicId: 'a', because: expect.any(String) });
    expect(d.priorities[d.priorities.length - 1].selectedOver).toBeNull();
  });

  it('breaks a total tie deterministically, never randomly', () => {
    const tied = state({
      observations: { ...state().observations, topics: [topic({ topicId: 'zeta', accuracy: avail(40) }), topic({ topicId: 'alpha', accuracy: avail(40) })] },
      analysis: {
        strengths: [],
        weaknesses: [
          weakness({ topicId: 'zeta', confidence: 0.8, severity: 'MODERATE', accuracy: 40 }),
          weakness({ topicId: 'alpha', confidence: 0.8, severity: 'MODERATE', accuracy: 40 }),
        ],
        trend: insuf(),
      },
    });
    const a = svc.decide(tied, NOW).priorities.map((p) => p.topicId);
    const b = svc.decide(tied, NOW).priorities.map((p) => p.topicId);
    expect(a).toEqual(['alpha', 'zeta']);
    expect(a).toEqual(b);
    expect(svc.decide(tied, NOW).priorities[0].selectedOver!.because).toMatch(/tie-break/);
  });
});

// ─── 16–20. Unavailable inputs and readiness ────────────────────────────────────────────────

describe('16–18. unavailable inputs degrade gracefully', () => {
  it('16. mastery unavailable does not become mastery 0', () => {
    const d = svc.decide(state({
      observations: { ...state().observations, topics: [topic({ topicId: 'a', accuracy: avail(40), mastery: insuf('ENABLE_MASTERY off') })] },
      analysis: { strengths: [], weaknesses: [weakness({ topicId: 'a', mastery: null })], trend: insuf() },
    }), NOW);
    expect(d.priorities[0].mastery).toBeNull();
    expect(d.priorities[0].mastery).not.toBe(0);
    expect(d.mustNotClaim.join(' ')).toMatch(/mastery/i);
  });

  it('17. syllabus coverage unavailable is a listed blocker, not a zero', () => {
    const d = svc.decide(state(), NOW);
    expect(d.readiness.unavailableDimensions).toContain('syllabusCoverage');
    expect(d.readiness.dimensions.syllabusCoverage.value).toBeNull();
    expect(d.readiness.blockers.join(' ')).toMatch(/syllabusCoverage/);
  });

  it('18. a degraded dependency is surfaced, not silently absorbed', () => {
    const d = svc.decide(state({ metadata: { ...state().metadata, degraded: ['mastery'] } }), NOW);
    expect(d.metadata.degraded).toContain('mastery');
  });
});

describe('19 & 20. readiness requires sufficient measured dimensions', () => {
  it('20. too few dimensions → INSUFFICIENT_DATA and no score', () => {
    const d = svc.decide(state(), NOW);
    expect(d.readiness.status).toBe('INSUFFICIENT_DATA');
    expect(d.readiness.score).toBeNull();
    expect(d.readiness.measuredDimensions).toHaveLength(0);
    expect(d.readiness.rationale.join(' ')).toMatch(/at least 3/);
  });

  it('19. enough dimensions still yields NO composite score', () => {
    // The important assertion: even fully measured, readiness refuses a percentage, because no
    // validated weighting model exists. Availability is not the same as a defensible number.
    const d = svc.decide(state({
      readiness: {
        status: 'AVAILABLE', score: null, confidence: null,
        dimensions: {
          syllabusCoverage: insuf(), conceptMastery: avail(70, 0.6), accuracy: avail(65, 0.9),
          consistency: avail(5, 0.5), weaknessRisk: insuf(), goalGap: insuf(),
        },
      },
    }), NOW);
    expect(d.readiness.status).toBe('AVAILABLE');
    expect(d.readiness.score).toBeNull();
    expect(d.readiness.measuredDimensions.sort()).toEqual(['accuracy', 'conceptMastery', 'consistency']);
    expect(d.mustNotClaim.join(' ')).toMatch(/readiness percentage/i);
  });

  it('confidence is the weakest link, not an average', () => {
    const d = svc.decide(state({
      readiness: {
        status: 'AVAILABLE', score: null, confidence: null,
        dimensions: {
          syllabusCoverage: insuf(), conceptMastery: avail(70, 0.6), accuracy: avail(65, 0.9),
          consistency: avail(5, 0.2), weaknessRisk: insuf(), goalGap: insuf(),
        },
      },
    }), NOW);
    expect(d.readiness.confidence).toBe(0.2);
  });
});

// ─── 21 & 22. Root cause and next action ────────────────────────────────────────────────────

describe('21 & 22. root cause and action', () => {
  it('an unknown root cause produces a diagnostic, never a guessed explanation', () => {
    const d = svc.decide(state({
      observations: { ...state().observations, topics: [topic({ topicId: 'a', accuracy: avail(40) })] },
      analysis: { strengths: [], weaknesses: [weakness({ topicId: 'a', confidence: 0.9, rootCause: 'UNKNOWN', rootCauseStatus: 'UNKNOWN' })], trend: insuf() },
    }), NOW);
    expect(d.nextAction.code).toBe('DIAGNOSTIC_CHECK');
    expect(d.mustNotClaim.join(' ')).toMatch(/Do not explain WHY/i);
  });

  it('an observed-but-unexplained weakness also prefers a diagnostic over drilling', () => {
    const d = svc.decide(state({
      observations: { ...state().observations, topics: [topic({ topicId: 'a', accuracy: avail(40) })] },
      analysis: { strengths: [], weaknesses: [weakness({ topicId: 'a', confidence: 0.3 })], trend: insuf() },
    }), NOW);
    expect(d.priorities[0].classification).toBe('OBSERVED_WEAKNESS');
    expect(d.nextAction.code).toBe('DIAGNOSTIC_CHECK');
  });

  it('no weakness + an active goal + strengths → maintain', () => {
    const d = svc.decide(state({
      goal: { studentId: 'u1', status: 'ACTIVE', source: 'STUDENT_DECLARED', createdAt: 0, updatedAt: 0, targetScore: 90, targetScoreUnit: 'PERCENT' },
      observations: { ...state().observations, topics: [topic({ topicId: 'a', accuracy: avail(90) })] },
      analysis: { strengths: [{ topicId: 'a', topicLabel: 'a', accuracy: 90, evidence: [] }], weaknesses: [], trend: insuf() },
    }), NOW);
    expect(d.currentStatus.status).toBe('ON_TRACK');
    expect(d.nextAction.code).toBe('MAINTAIN_STRENGTH');
  });
});

// ─── 23–25. Determinism and the zero rule ───────────────────────────────────────────────────

describe('23. repeated execution is byte-identical', () => {
  it('the same state and clock produce the same decision', () => {
    const s = state({
      observations: { ...state().observations, topics: [topic({ topicId: 'a', accuracy: avail(40) }), topic({ topicId: 'b', accuracy: avail(35) })] },
      analysis: { strengths: [], weaknesses: [weakness({ topicId: 'a' }), weakness({ topicId: 'b', accuracy: 35 })], trend: insuf() },
    });
    expect(JSON.stringify(svc.decide(s, NOW))).toBe(JSON.stringify(svc.decide(s, NOW)));
  });
});

describe('24. no LLM input can reach a decision', () => {
  it('decide() is pure — same inputs, same output, with no provider available', () => {
    // The structural guarantee: decide() takes only measured state and a clock. There is no
    // provider to inject and no I/O to intercept, so no model output can influence any branch.
    const s = state({
      observations: { ...state().observations, topics: [topic({ topicId: 'a', accuracy: avail(40) })] },
      analysis: { strengths: [], weaknesses: [weakness({ topicId: 'a' })], trend: insuf() },
    });
    expect(svc.decide(s, NOW)).toEqual(svc.decide(s, NOW));
    expect(svc.decide.length).toBeLessThanOrEqual(2); // (state, now) — nothing else
  });

  it('the service source contains no model call', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../../src/services/studentDecision.service.ts'), 'utf8');
    expect(src).not.toMatch(/generateResponse|llmProvider|GeminiProvider|generateStreamResponse/);
  });
});

describe('25. an unavailable value never becomes zero', () => {
  it('every null-able decision field stays null on a no-evidence student', () => {
    const d = svc.decide(state(), NOW);
    expect(d.readiness.score).toBeNull();
    expect(d.readiness.confidence).toBeNull();
    expect(d.goalGap.gap).toBeNull();
    expect(d.goalGap.current).toBeNull();
    expect(d.primaryWeakness).toBeNull();
    for (const dim of Object.values(d.readiness.dimensions)) {
      expect(dim.value).toBeNull();
      expect(dim.value).not.toBe(0);
    }
  });

  it('weaknessRisk is no longer a fabricated number', () => {
    // Was `min(100, weaknesses.length * 20)` — reported AVAILABLE and counted toward the three
    // dimensions needed to publish a readiness composite.
    const d = svc.decide(state(), NOW);
    expect(d.readiness.dimensions.weaknessRisk.status).toBe('INSUFFICIENT_DATA');
    expect(d.readiness.dimensions.weaknessRisk.value).toBeNull();
    expect(d.readiness.measuredDimensions).not.toContain('weaknessRisk');
  });
});

import {
  StudentLearningState, Metric, EvidenceItem, Observations, Analysis, Weakness, ReadinessDimensions,
  TopicObservation, GoalGap, CurrentPriority, Readiness, Severity,
  LEARNING_STATE_ALGORITHM_VERSION,
} from '../types/learningState.types';
import { studentGoalService } from './studentGoal.service';
import { masteryEngine } from '../core/intelligence/MasteryEngine';
import { quizAttemptsService } from './tests/quizAttempts.service';
import { UserStatsService } from './userStats.service';
import { logger } from '../utils/logger';

/**
 * LearningStateService — the COMPOSITION and DECISION layer.
 *
 * It is explicitly NOT another analytics engine. Every measurement it reports is read from the
 * system that already owns it:
 *
 *   topic accuracy + trend   → quizAttempts.getProgressReport()   (already aggregates per topic)
 *   concept mastery          → MasteryEngine                       (already EMA + confidence)
 *   streak / overall accuracy→ UserStats
 *   goal                     → StudentGoalService
 *
 * What this service adds is only what genuinely did not exist anywhere: severity, measurement
 * confidence, root-cause classification, priority, readiness dimensions, freshness, and the
 * explicit availability semantics that keep "not measured" distinct from "zero".
 *
 * A deliberate non-combination: getProgressReport's accuracy has NO sample-size gating (one
 * question and forty are weighted identically against fixed thresholds), whereas MasteryEngine
 * carries real evidence-scaled confidence. They are therefore reported side by side and never
 * averaged — averaging would launder an unreliable number into a confident-looking one.
 */

/**
 * Measurement thresholds. Exported so the Gate 8 decision layer interprets the SAME numbers this
 * layer measured against — a second copy would drift, and two components disagreeing about what
 * "weak" means is how a mentor ends up contradicting its own evidence.
 */
export const MIN_TOPIC_EVIDENCE = 3;       // below this we make no claim about a topic
export const WEAK_ACCURACY = 60;           // percent — matches quizAttempts' WEAK_THRESHOLD
export const STRONG_ACCURACY = 80;         // percent — matches quizAttempts' STRONG_THRESHOLD
export const STALE_AFTER_MS = 1000 * 60 * 60 * 24 * 45; // ~6 weeks without evidence reads as stale
/**
 * The confidence below which a finding cannot be called HIGH severity. Not arbitrary: with
 * confidenceFromSample's saturating curve this is ~6 graded observations, the point at which a
 * per-topic accuracy stops being swingable by one or two questions.
 */
export const MIN_CONFIDENCE_FOR_HIGH = 0.4;

const unavailable = <T>(reason: string): Metric<T> => ({
  status: 'UNAVAILABLE', value: null, confidence: null, reason,
});
const insufficient = <T>(reason: string): Metric<T> => ({
  status: 'INSUFFICIENT_DATA', value: null, confidence: null, reason,
});
const available = <T>(value: T, confidence: number | null, evidence?: EvidenceItem[]): Metric<T> => ({
  status: 'AVAILABLE', value, confidence, evidence,
});

/**
 * Measurement confidence from evidence volume. Saturating rather than linear: the difference
 * between 2 and 10 observations matters far more than between 40 and 50. Capped below 1.0
 * because a finite sample never justifies certainty.
 */
export function confidenceFromSample(sampleSize: number): number {
  if (sampleSize <= 0) return 0;
  return Math.min(0.95, 1 - Math.exp(-sampleSize / 12));
}

export class LearningStateService {
  private statsService = new UserStatsService();

  /**
   * Builds the student's current measured state.
   *
   * Every dependency is isolated: a failure records the source in `metadata.degraded` and leaves
   * the dependent metrics UNAVAILABLE. It must never fall back to zero or to an estimate — a
   * failed read is not a measurement of a struggling student.
   */
  async getLearningState(userId: string): Promise<StudentLearningState> {
    const degraded: string[] = [];
    const now = Date.now();

    const [goal, progress, masteryList, stats] = await Promise.all([
      studentGoalService.getGoal(userId).catch(() => { degraded.push('goal'); return null; }),
      quizAttemptsService.getProgressReport(userId).catch((e: any) => {
        logger.warn('[LearningState] progress report unavailable', { userId, error: e?.message });
        degraded.push('quizProgress'); return null;
      }),
      // Public contract (see MasteryEngine.listConcepts). This previously called snapshot(),
      // discarded its result, then reached into the private `store` — two full Firestore reads
      // per request, with a silent `?? []` that made a failed read indistinguishable from a
      // student who has never been assessed.
      masteryEngine.listConcepts(userId).catch((e: any) => {
        logger.warn('[LearningState] mastery unavailable', { userId, error: e?.message });
        degraded.push('mastery'); return [];
      }),
      this.statsService.getUserStats(userId).catch(() => { degraded.push('userStats'); return null; }),
    ]);

    const masteryByTopic = new Map<string, any>();
    for (const m of (masteryList as any[]) || []) {
      masteryByTopic.set((m.topic || m.title || m.conceptId || '').toLowerCase(), m);
    }

    const observations = this.buildObservations(progress, masteryByTopic, stats, degraded);
    const analysis = this.buildAnalysis(observations);
    const goalGap = this.buildGoalGap(goal, observations);
    const currentPriority = this.buildPriority(analysis);
    const readiness = this.buildReadiness(observations, analysis, goalGap, degraded);

    const lastEvidenceAt = observations.topics.reduce<number | null>(
      (mx, t) => (t.lastPracticedAt && (!mx || t.lastPracticedAt > mx) ? t.lastPracticedAt : mx), null,
    );

    return {
      studentId: userId,
      examContext: null, // populated by the context layer from the existing examMaster resolution
      goal,
      observations,
      analysis,
      decisions: { goalGap, currentPriority },
      readiness,
      metadata: {
        generatedAt: now,
        lastEvidenceAt,
        algorithmVersion: LEARNING_STATE_ALGORITHM_VERSION,
        degraded,
      },
    };
  }

  // ── Observations ─────────────────────────────────────────────────────────────────────────

  private buildObservations(
    progress: any | null,
    masteryByTopic: Map<string, any>,
    stats: any | null,
    degraded: string[],
  ): Observations {
    const topics: TopicObservation[] = [];

    for (const t of progress?.topicMastery || []) {
      const key = String(t.topic || '').toLowerCase();
      const m = masteryByTopic.get(key);
      // `total` is questions answered for this topic — the real sample size behind the accuracy.
      const sample = t.total ?? 0;

      topics.push({
        topicId: key || 'unknown',
        topicLabel: t.topic,
        subject: m?.subject,
        accuracy: sample >= MIN_TOPIC_EVIDENCE
          ? available(t.accuracy, confidenceFromSample(sample), [{
              kind: 'quiz_attempts',
              summary: `${t.correct}/${t.total} correct across ${t.attempts} quiz attempt(s)`,
              sampleSize: sample,
            }])
          : insufficient(`only ${sample} graded question(s); need ${MIN_TOPIC_EVIDENCE}`),
        // Mastery keeps its OWN confidence from MasteryEngine — not recomputed here.
        mastery: m
          ? available(Math.round(m.masteryScore * 100), m.confidence, [{
              kind: 'mastery',
              summary: `${m.successCount}/${m.attempts} graded attempts, trend ${m.masteryTrend}`,
              sampleSize: m.attempts,
              lastObservedAt: m.lastPracticed,
            }])
          : insufficient('no mastery record (ENABLE_MASTERY may be off, or topic not yet assessed)'),
        trend: m ? available(m.masteryTrend, m.confidence) : insufficient('no mastery record'),
        attempts: sample,
        lastPracticedAt: m?.lastPracticed,
      });
    }

    const completed = progress?.completedCount ?? null;

    return {
      topics,
      overallAccuracy: progress
        ? (completed && completed > 0
            ? available(progress.averageAccuracy, confidenceFromSample(completed), [{
                kind: 'quiz_attempts', summary: `${completed} completed assessment(s)`, sampleSize: completed,
              }])
            : insufficient('no completed assessments'))
        : unavailable('progress report dependency failed'),
      consistency: stats?.gamification?.studyStreakDays != null
        ? available(stats.gamification.studyStreakDays, null, [{
            kind: 'streak', summary: `${stats.gamification.studyStreakDays}-day study streak`,
          }])
        : (degraded.includes('userStats') ? unavailable('userStats dependency failed') : insufficient('no streak data')),
      // Genuinely not computable yet: nothing maps student evidence onto canonical syllabus
      // nodes. Reported honestly rather than approximated by counting attempted topics, which
      // would be a coverage figure with no denominator.
      syllabusCoverage: insufficient('per-student syllabus coverage not yet implemented (no canonical topic mapping)'),
      assessmentsCompleted: completed != null
        ? available(completed, null)
        : unavailable('progress report dependency failed'),
    };
  }

  // ── Analysis ─────────────────────────────────────────────────────────────────────────────

  private buildAnalysis(obs: Observations): Analysis {
    const weaknesses: Weakness[] = [];
    const strengths: Analysis['strengths'] = [];

    for (const t of obs.topics) {
      // No claim without evidence. A topic below the threshold is simply not discussed.
      if (t.accuracy.status !== 'AVAILABLE' || t.accuracy.value == null) continue;
      const accuracy = t.accuracy.value;
      const masteryVal = t.mastery.status === 'AVAILABLE' ? t.mastery.value : null;
      const trendVal = t.trend.status === 'AVAILABLE' ? t.trend.value : null;
      const confidence = t.accuracy.confidence ?? 0;
      const evidence = [...(t.accuracy.evidence || []), ...(t.mastery.evidence || [])];

      if (accuracy >= STRONG_ACCURACY) {
        strengths.push({ topicId: t.topicId, topicLabel: t.topicLabel, accuracy, evidence });
        continue;
      }
      if (accuracy >= WEAK_ACCURACY) continue;

      const reasonCodes = [`ACCURACY_${Math.round(accuracy)}_PCT`];
      if (trendVal === 'declining') reasonCodes.push('DECLINING_TREND');
      if (masteryVal != null && masteryVal < 50) reasonCodes.push('LOW_MASTERY');

      weaknesses.push({
        topicId: t.topicId,
        topicLabel: t.topicLabel,
        subject: t.subject,
        severity: this.severityOf(accuracy, trendVal, confidence),
        confidence,
        accuracy,
        mastery: masteryVal,
        trend: trendVal,
        // Only what the data proves. Low accuracy is OBSERVED; *why* it is low (conceptual gap
        // vs careless error vs time pressure) is not distinguishable from these signals, so it
        // stays UNKNOWN for an interactive diagnostic to establish rather than being guessed.
        rootCause: trendVal === 'declining' ? 'DECLINING_TREND' : 'LOW_ACCURACY',
        rootCauseStatus: 'OBSERVED',
        evidence,
        reasonCodes,
      });
    }

    weaknesses.sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100));

    const declining = obs.topics.filter((t) => t.trend.value === 'declining').length;
    const improving = obs.topics.filter((t) => t.trend.value === 'improving').length;
    const trend: Metric<'improving' | 'declining' | 'steady'> =
      improving + declining === 0
        ? insufficient('no per-topic trend evidence')
        : available(improving > declining ? 'improving' : declining > improving ? 'declining' : 'steady', null);

    return { strengths, weaknesses, trend };
  }

  /**
   * Severity combines how low accuracy is, whether it is getting worse, and how much evidence
   * backs the claim. Low-confidence findings are capped: a topic seen a handful of times cannot
   * be called HIGH severity, because the measurement does not justify that strength of claim.
   */
  private severityOf(accuracy: number, trend: string | null, confidence: number): Severity {
    let s: Severity = accuracy < 35 ? 'HIGH' : accuracy < 50 ? 'MODERATE' : 'LOW';
    if (trend === 'declining' && s !== 'HIGH') s = s === 'LOW' ? 'MODERATE' : 'HIGH';
    if (confidence < MIN_CONFIDENCE_FOR_HIGH && s === 'HIGH') s = 'MODERATE';
    return s;
  }

  // ── Decisions ────────────────────────────────────────────────────────────────────────────

  /**
   * How far the student is from their declared target — or, far more often today, an explicit
   * statement of why that cannot be established.
   *
   * WHAT THIS USED TO DO, AND WHY IT WAS WRONG: it returned
   * `gap = goal.targetScore - observations.overallAccuracy`. Those are not the same quantity.
   * `overallAccuracy` is an unweighted mean of per-quiz accuracy percentages; `targetScore` is a
   * bare number whose unit is unknown — the goal validator deliberately asserts no upper bound
   * because "scoring models differ per exam (percentage vs raw marks vs negative-marked totals)".
   * A student targeting 180 in a 200-mark paper, currently averaging 55% on practice quizzes, was
   * told their gap was 125. That number has no meaning in any unit, and it was presented with the
   * same confidence as a real measurement.
   *
   * The rule now: a gap is produced ONLY when the target and the measurement are the same
   * quantity, measured on the same instrument. Every other case returns a specific reason code
   * instead of a number. That is not a limitation being worked around — it is the honest state of
   * the system, and naming it precisely lets the mentor ask the one question that would fix it.
   *
   * `daysRemaining` is deliberately computed regardless: it is date arithmetic on a value the
   * student supplied, so it remains true even when the score gap is unknowable.
   */
  private buildGoalGap(goal: any, obs: Observations): GoalGap {
    const daysRemaining = goal?.targetDate
      ? Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / 86400000)
      : null;

    if (!goal || goal.status !== 'ACTIVE') {
      return { status: 'NOT_SET', gap: null, current: null, target: null, unit: null, reason: 'GOAL_NOT_SET' };
    }

    // Rank and percentile targets are legitimate student goals, but nothing in this system
    // measures either one — resultAnalysis explicitly leaves attempt.percentile undefined, and the
    // only "rank" is a gamification tier label. Reported as unavailable rather than approximated
    // from accuracy, which would be a different quantity wearing the same word.
    if (goal.targetScore == null) {
      if (goal.targetRank != null) {
        return { status: 'UNAVAILABLE', gap: null, current: null, target: goal.targetRank, unit: null,
                 reason: 'RANK_NOT_MEASURED', daysRemaining };
      }
      if (goal.targetPercentile != null) {
        return { status: 'UNAVAILABLE', gap: null, current: null, target: goal.targetPercentile, unit: null,
                 reason: 'PERCENTILE_NOT_MEASURED', daysRemaining };
      }
      return { status: 'NOT_SET', gap: null, current: null, target: null, unit: null,
               reason: 'GOAL_NOT_SET', daysRemaining };
    }

    // A number with no unit cannot be compared to anything. Assuming PERCENT here would silently
    // reinstate the original defect for every goal recorded before the unit field existed.
    if (goal.targetScoreUnit !== 'PERCENT' && goal.targetScoreUnit !== 'MARKS') {
      return { status: 'UNAVAILABLE', gap: null, current: null, target: goal.targetScore, unit: null,
               reason: 'TARGET_UNIT_UNDECLARED', daysRemaining };
    }

    // Raw marks need the exam's maximum to become comparable, and no exam record in this codebase
    // carries total marks or a negative-marking model.
    if (goal.targetScoreUnit === 'MARKS') {
      return { status: 'UNAVAILABLE', gap: null, current: null, target: goal.targetScore, unit: 'MARKS',
               reason: 'EXAM_MAX_MARKS_UNKNOWN', daysRemaining };
    }

    if (obs.overallAccuracy.status !== 'AVAILABLE' || obs.overallAccuracy.value == null) {
      return { status: 'INSUFFICIENT_DATA', gap: null, current: null, target: goal.targetScore,
               unit: 'PERCENT', reason: 'INSUFFICIENT_PERFORMANCE_EVIDENCE', daysRemaining };
    }

    // Both sides are percentages — but they are not the same INSTRUMENT. The target is an exam
    // score; the measurement is accuracy on self-generated practice quizzes, with a different
    // question pool, no negative marking and self-selected difficulty. Subtracting them yields a
    // plausible-looking number that would systematically misstate how close the student is, so it
    // is withheld until an exam-comparable score exists (mock/full-length scoring).
    return { status: 'UNAVAILABLE', gap: null, current: null, target: goal.targetScore, unit: 'PERCENT',
             reason: 'NO_COMPARABLE_MEASUREMENT', daysRemaining };
  }

  /** The single most important output: what to work on next, and why — as codes, not a score. */
  private buildPriority(analysis: Analysis): CurrentPriority {
    const top = analysis.weaknesses[0];
    if (!top) {
      return {
        status: analysis.weaknesses.length === 0 && analysis.strengths.length === 0
          ? 'INSUFFICIENT_DATA' : 'AVAILABLE',
        topicId: null, topicLabel: null, priority: null,
        reasonCodes: analysis.strengths.length > 0 ? ['NO_WEAKNESS_DETECTED'] : ['INSUFFICIENT_EVIDENCE'],
        evidence: [],
      };
    }
    return {
      status: 'AVAILABLE',
      topicId: top.topicId,
      topicLabel: top.topicLabel,
      priority: top.severity,
      reasonCodes: top.reasonCodes,
      evidence: top.evidence,
    };
  }

  // ── Readiness ────────────────────────────────────────────────────────────────────────────

  /**
   * Readiness retains its dimensions and refuses to produce a composite until enough of them are
   * genuinely measured. Unmeasured dimensions are NOT treated as zero — doing so would drag the
   * score down and misrepresent a student who simply has not been assessed yet, which is exactly
   * the failure mode this whole phase removed.
   */
  private buildReadiness(obs: Observations, analysis: Analysis, goalGap: GoalGap, degraded: string[]): Readiness {
    /*
     * weaknessRisk was `Math.min(100, weaknesses.length * 20)` — five weak topics being defined as
     * 100% risk, one as 20%, on no basis whatsoever. Deterministic, but meaningless: the 20 was
     * invented, and the figure ignored severity, confidence and how much of the syllabus those
     * topics represent. Worse, it always reported AVAILABLE, so it counted toward the three
     * measured dimensions required to publish a readiness composite — a fabricated number helping
     * unlock a score that is supposed to require real ones.
     *
     * It is NOT replaced with another formula. The defensible alternative — weak topics as a
     * proportion of measured topics — still has the wrong denominator: topics the student happened
     * to practise, not the syllabus they are examined on. A student who practised only their two
     * weakest topics would read as 100% risk. Until canonical syllabus coverage exists (#89/#91),
     * there is no honest denominator, so this reports INSUFFICIENT_DATA.
     */
    const weaknessRisk: Metric<number> = insufficient(
      'no honest denominator: weak topics can only be counted against topics the student chose to ' +
      'practise, not against syllabus coverage (blocked on canonical syllabus identity)',
    );

    const masteryTopics = obs.topics.filter((t) => t.mastery.status === 'AVAILABLE' && t.mastery.value != null);
    const masterySample = masteryTopics.reduce((s, t) => s + t.attempts, 0);

    const dimensions: ReadinessDimensions = {
      syllabusCoverage: obs.syllabusCoverage,
      // Mean of per-topic mastery. Unweighted by design — each topic is one concept the student
      // either knows or does not, so a topic practised 40 times is not four times more of the
      // syllabus than one practised 10 times. Confidence comes from the TOTAL evidence behind the
      // mean, so a mean over thin data is visibly thin rather than silently equal to a solid one.
      conceptMastery: masteryTopics.length > 0
        ? available<number>(
            Math.round(masteryTopics.reduce((s, t) => s + (t.mastery.value || 0), 0) / masteryTopics.length),
            confidenceFromSample(masterySample),
            [{ kind: 'mastery', summary: `${masteryTopics.length} concept(s), ${masterySample} graded attempt(s)`,
               sampleSize: masterySample }],
          )
        : insufficient('no mastery evidence (ENABLE_MASTERY may be off, or nothing assessed yet)'),
      accuracy: obs.overallAccuracy,
      consistency: obs.consistency,
      weaknessRisk,
      goalGap: goalGap.status === 'AVAILABLE' && goalGap.gap != null
        ? available(goalGap.gap, null)
        : insufficient(goalGap.reason || 'goal gap unavailable'),
    };

    const availableDims = Object.values(dimensions).filter((d) => d.status === 'AVAILABLE');
    // A composite from one or two dimensions is not a readiness score, it is one metric wearing
    // a more authoritative name. Require a majority before claiming an overall figure.
    if (availableDims.length < 3) {
      return {
        status: 'INSUFFICIENT_DATA', score: null, dimensions, confidence: null,
        reason: `only ${availableDims.length} of 6 readiness dimensions measured`,
      };
    }

    return {
      status: degraded.length > 0 ? 'STALE' : 'AVAILABLE',
      score: null, // Composite weighting is exam-specific and deliberately deferred to Gate 8.
      dimensions,
      confidence: null,
      reason: 'dimensions measured; exam-specific composite weighting pending (Gate 8)',
    };
  }
}

export const learningStateService = new LearningStateService();

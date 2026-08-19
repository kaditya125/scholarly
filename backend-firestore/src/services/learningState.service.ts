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

const MIN_TOPIC_EVIDENCE = 3;       // below this we make no claim about a topic
const WEAK_ACCURACY = 60;           // percent
const STRONG_ACCURACY = 80;         // percent
const STALE_AFTER_MS = 1000 * 60 * 60 * 24 * 45; // ~6 weeks without evidence reads as stale

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
      masteryEngine.snapshot(userId).then(() => (masteryEngine as any).store?.list?.(userId) ?? [])
        .catch(() => { degraded.push('mastery'); return []; }),
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
    if (confidence < 0.4 && s === 'HIGH') s = 'MODERATE';
    return s;
  }

  // ── Decisions ────────────────────────────────────────────────────────────────────────────

  private buildGoalGap(goal: any, obs: Observations): GoalGap {
    if (!goal || goal.status !== 'ACTIVE' || goal.targetScore == null) {
      return { status: 'NOT_SET', gap: null, current: null, target: null, reason: 'GOAL_NOT_SET' };
    }
    if (obs.overallAccuracy.status !== 'AVAILABLE' || obs.overallAccuracy.value == null) {
      return {
        status: 'INSUFFICIENT_DATA', gap: null, current: null, target: goal.targetScore,
        reason: 'INSUFFICIENT_PERFORMANCE_EVIDENCE',
      };
    }
    const current = obs.overallAccuracy.value;
    const daysRemaining = goal.targetDate
      ? Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / 86400000)
      : null;
    return {
      status: 'AVAILABLE',
      current,
      target: goal.targetScore,
      gap: Math.round((goal.targetScore - current) * 100) / 100,
      daysRemaining,
    };
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
    const weaknessRisk: Metric<number> = analysis.weaknesses.length > 0 || analysis.strengths.length > 0
      ? available(Math.min(100, analysis.weaknesses.length * 20), null)
      : insufficient('no topic-level evidence');

    const dimensions: ReadinessDimensions = {
      syllabusCoverage: obs.syllabusCoverage,
      conceptMastery: obs.topics.some((t) => t.mastery.status === 'AVAILABLE')
        ? available<number>(
            Math.round(
              obs.topics.filter((t) => t.mastery.value != null)
                .reduce((s, t) => s + (t.mastery.value || 0), 0) /
              Math.max(1, obs.topics.filter((t) => t.mastery.value != null).length),
            ), null)
        : insufficient('no mastery evidence'),
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

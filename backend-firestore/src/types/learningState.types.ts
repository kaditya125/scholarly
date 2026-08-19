/**
 * Canonical contract for a student's measured learning state.
 *
 * The organising rule, which the whole mentor architecture depends on:
 *
 *     EVIDENCE → OBSERVATIONS → ANALYSIS → DECISIONS → COMMUNICATION
 *
 * The first four are deterministic and evidence-backed and live here. Only COMMUNICATION
 * (Gate 9) is LLM-driven. Nothing in this file may ever be produced by asking a model what it
 * thinks about a student — the model's job is to explain these values, never to invent them.
 *
 * Two structural rules follow from that:
 *
 *  1. OBSERVATIONS are separated from DECISIONS. An observation is a fact derived from evidence
 *     ("55% accuracy over 40 attempts"); a decision is what we conclude from it ("high priority,
 *     because low accuracy + declining trend + high exam relevance"). Mixing them makes it
 *     impossible to answer "why?" later, or to change the decision rules without disturbing the
 *     measurements.
 *
 *  2. Absence of evidence is never zero. Every derived metric carries an explicit status, so
 *     "we have not measured this" is structurally distinct from "we measured this and it is 0".
 *     A student with no data is not a zero-performing student, and the previous generation of
 *     this system told every student they were at 0% mastery precisely because it could not make
 *     that distinction.
 */

/** Why a metric does or does not have a value. Never collapse these into null. */
export type MetricStatus =
  /** Measured, current, and backed by sufficient evidence. */
  | 'AVAILABLE'
  /** The inputs exist but there is not enough evidence to make a defensible claim. */
  | 'INSUFFICIENT_DATA'
  /** Requires something the student has not provided (e.g. a goal). Not a measurement failure. */
  | 'NOT_SET'
  /** Was measured, but the underlying evidence is old enough that presenting it as current would mislead. */
  | 'STALE'
  /** A dependency failed. Explicitly NOT the same as zero — see the note on fabrication below. */
  | 'UNAVAILABLE';

/**
 * A single derived measurement plus everything needed to justify it.
 *
 * `evidence` exists so the AI context layer can answer "why do you think that?" without
 * reverse-engineering the number, and so a human can audit any claim the mentor makes.
 */
export interface Metric<T> {
  status: MetricStatus;
  /** Null unless status is AVAILABLE or STALE. */
  value: T | null;
  /**
   * Confidence in the MEASUREMENT (evidence volume, recency, consistency) — never the LLM's
   * confidence in an opinion. Null when not meaningfully computable.
   */
  confidence: number | null;
  /** Human-readable, machine-checkable justification. */
  evidence?: EvidenceItem[];
  /** Why the status is what it is, when that is not self-evident. */
  reason?: string;
}

/** One citable fact supporting a metric. Kept small: ids and aggregates, never question content. */
export interface EvidenceItem {
  kind: 'quiz_attempts' | 'test_attempts' | 'mastery' | 'streak' | 'planner' | 'goal' | 'syllabus';
  /** e.g. "40 attempts across 6 quizzes" */
  summary: string;
  /** How many underlying observations back this. Drives confidence. */
  sampleSize?: number;
  /** Most recent contributing evidence, for freshness. */
  lastObservedAt?: number;
  /** Source record ids where useful for audit; never full payloads. */
  refs?: string[];
}

// ─── Goal ───────────────────────────────────────────────────────────────────────────────────

/**
 * Where a goal came from. Deliberately explicit: a goal the system guessed must never be
 * presented back to the student as their own commitment, and "target = your previous best" or
 * "target date = the exam date" are inferences, not goals.
 */
export type GoalSource = 'STUDENT_DECLARED' | 'IMPORTED' | 'SYSTEM_SUGGESTED';

export type GoalStatus = 'ACTIVE' | 'NOT_SET' | 'ACHIEVED' | 'ABANDONED';

/**
 * A student-owned target. Stored at users/{uid}/profile/goal, alongside the existing onboarding
 * profile document rather than in a parallel goal system.
 *
 * targetExam/targetYear already live on the onboarding profile and are not duplicated here;
 * this record adds only what genuinely did not exist: what score the student is aiming for and
 * by when. Previously the only targetScore in the system came off the LLM-generated digital
 * twin, which is not a student commitment and cannot support "are you on track?".
 */
export interface StudentGoal {
  studentId: string;
  status: GoalStatus;
  source: GoalSource;
  /** Canonical exam id, resolved via examMaster. */
  examId?: string;
  /** Exam cycle/year the goal is aimed at (e.g. "2026"). */
  examCycle?: string;
  /** Student's own target. Units are exam-dependent; interpret with examId. */
  targetScore?: number;
  targetRank?: number;
  targetPercentile?: number;
  /**
   * The student's personal target date. NOT defaulted to the exam date — a student may be
   * aiming at a mock, an earlier attempt, or a self-imposed checkpoint.
   */
  targetDate?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Observations (facts) ───────────────────────────────────────────────────────────────────

export interface TopicObservation {
  /** Canonical id where available; falls back to the normalized slug used by MasteryEngine. */
  topicId: string;
  topicLabel: string;
  subject?: string;
  /** From quizAttempts.getProgressReport — accuracy over attempted questions, 0..100. */
  accuracy: Metric<number>;
  /** From MasteryEngine — the confidence-bearing signal. Deliberately NOT averaged with accuracy. */
  mastery: Metric<number>;
  trend: Metric<'improving' | 'declining' | 'steady'>;
  attempts: number;
  lastPracticedAt?: number;
}

export interface Observations {
  /** Per-topic facts, the substrate for weakness analysis. */
  topics: TopicObservation[];
  /** Overall accuracy across completed assessments. */
  overallAccuracy: Metric<number>;
  /** Study streak / regularity. */
  consistency: Metric<number>;
  /** Proportion of the canonical syllabus with meaningful evidence behind it. */
  syllabusCoverage: Metric<number>;
  /** Volume of assessment activity, used to gate claims. */
  assessmentsCompleted: Metric<number>;
}

// ─── Analysis (interpretation of facts) ─────────────────────────────────────────────────────

/**
 * How far a root cause claim is actually supported. The system must not say "you don't
 * understand probability" when the evidence only shows "you answer probability questions
 * incorrectly" — those are different claims, and only one of them is measured.
 */
export type RootCauseStatus = 'OBSERVED' | 'INFERRED' | 'CONFIRMED' | 'UNKNOWN';

/**
 * Deterministic classifications only. Anything requiring interpretation the data cannot support
 * (conceptual misunderstanding vs careless error) stays UNKNOWN until an interactive diagnostic
 * establishes it — which is more useful than a confident guess.
 */
export type RootCauseCode =
  | 'LOW_ACCURACY'
  | 'DECLINING_TREND'
  | 'AVOIDANCE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'UNKNOWN';

export type Severity = 'LOW' | 'MODERATE' | 'HIGH';

export interface Weakness {
  topicId: string;
  topicLabel: string;
  subject?: string;
  severity: Severity;
  /** Confidence in the MEASUREMENT that this is weak, not in any explanation of why. */
  confidence: number;
  accuracy: number | null;
  mastery: number | null;
  trend: 'improving' | 'declining' | 'steady' | null;
  rootCause: RootCauseCode;
  rootCauseStatus: RootCauseStatus;
  evidence: EvidenceItem[];
  /** Machine-readable justification, so the mentor can explain itself without re-deriving. */
  reasonCodes: string[];
}

export interface Analysis {
  strengths: Array<{ topicId: string; topicLabel: string; accuracy: number; evidence: EvidenceItem[] }>;
  weaknesses: Weakness[];
  /** Overall direction of travel, when enough successive evidence exists to establish one. */
  trend: Metric<'improving' | 'declining' | 'steady'>;
}

// ─── Decisions (recommendations) ────────────────────────────────────────────────────────────

export type GoalGapStatus = MetricStatus;

export interface GoalGap {
  status: GoalGapStatus;
  /** Points between current measured position and the student's declared target. */
  gap: number | null;
  current: number | null;
  target: number | null;
  /** e.g. GOAL_NOT_SET, INSUFFICIENT_DATA */
  reason?: string;
  daysRemaining?: number | null;
}

export interface CurrentPriority {
  status: MetricStatus;
  topicId: string | null;
  topicLabel: string | null;
  priority: Severity | null;
  /** Why this, why now — codes rather than an opaque score. */
  reasonCodes: string[];
  evidence: EvidenceItem[];
}

// ─── Readiness ──────────────────────────────────────────────────────────────────────────────

/**
 * Readiness is NOT another name for mastery, and must never collapse to a single unexplained
 * number. Dimensions are retained so the student can be answered when they ask "why is my
 * readiness 68%?".
 *
 * Only dimensions the current data can actually support are populated; the rest report their own
 * status rather than being silently treated as zero, which would drag the composite down and
 * misrepresent a student who simply has not been measured yet.
 */
export interface ReadinessDimensions {
  syllabusCoverage: Metric<number>;
  conceptMastery: Metric<number>;
  accuracy: Metric<number>;
  consistency: Metric<number>;
  weaknessRisk: Metric<number>;
  goalGap: Metric<number>;
}

export interface Readiness {
  status: MetricStatus;
  /** Null unless enough dimensions are AVAILABLE to make a composite defensible. */
  score: number | null;
  dimensions: ReadinessDimensions;
  confidence: number | null;
  reason?: string;
}

// ─── Root state ─────────────────────────────────────────────────────────────────────────────

export interface StudentLearningState {
  studentId: string;

  examContext: {
    examId?: string;
    examName?: string;
    cycleId?: string;
    /** Countdown to the next official milestone, when known. */
    daysToNextMilestone?: number | null;
  } | null;

  goal: StudentGoal | null;

  observations: Observations;
  analysis: Analysis;

  decisions: {
    goalGap: GoalGap;
    currentPriority: CurrentPriority;
  };

  readiness: Readiness;

  metadata: {
    generatedAt: number;
    /** Timestamp of the most recent piece of evidence contributing to this state. */
    lastEvidenceAt: number | null;
    /**
     * Bumped when the derivation rules change, so persisted snapshots can be recognised as
     * computed by older logic and recalculated from raw evidence.
     */
    algorithmVersion: number;
    /** Dependencies that failed during composition. Their metrics are UNAVAILABLE, never 0. */
    degraded: string[];
  };
}

/** Current derivation-rules version. Bump when any calculation in the service changes. */
export const LEARNING_STATE_ALGORITHM_VERSION = 1;

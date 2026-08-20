import {
  Severity, EvidenceItem, MetricStatus, RootCauseCode, RootCauseStatus,
  GoalGap, ReadinessDimensions,
} from './learningState.types';

/**
 * Gate 8 — the deterministic DECISION layer.
 *
 *     authoritative sources → StudentLearningState → Gate 8 → Gate 9 mentor
 *
 * This is not another analytics engine, and it recomputes nothing. Accuracy, mastery, trend,
 * streak, test performance and goal values are all measured upstream by the systems that own
 * them; Gate 8 only INTERPRETS those measurements into what a mentor should do next, and records
 * why. Every field here is derivable from a StudentLearningState with no I/O, no clock beyond a
 * caller-supplied `now`, and no model call — which is what makes it testable, replayable, and
 * impossible for an LLM to influence.
 *
 * The rule every value obeys: if the five questions — SOURCE, RULE, WHY VALID, CONFIDENCE,
 * FRESHNESS — cannot all be answered, the value is not exposed and the status says so instead.
 */

/** Current derivation-rules version. Bump when any rule below changes. */
export const STUDENT_DECISION_ALGORITHM_VERSION = 1;

// ─── Weakness classification ────────────────────────────────────────────────────────────────

/**
 * How strongly the evidence supports calling something a weakness. Distinct from severity:
 * severity is how bad it looks, this is how sure we are it is real. One wrong answer can look
 * terrible (0% accuracy) while supporting no claim at all.
 */
export type WeaknessClassification =
  /** Nothing measured for this student at all. */
  | 'NO_EVIDENCE'
  /** Some observations exist, but below the threshold at which a claim is defensible. */
  | 'INSUFFICIENT_DATA'
  /** Enough evidence to state the observation; not enough to lean on it hard. */
  | 'OBSERVED_WEAKNESS'
  /** Enough evidence that the mentor can act on it directly. */
  | 'HIGH_CONFIDENCE_WEAKNESS';

/** Whether the supporting evidence is recent enough to describe as current. */
export type Freshness = 'FRESH' | 'STALE' | 'UNKNOWN';

export interface PrioritizedWeakness {
  /** 1 = the single thing to address first. Deterministic; see the tie-break rules. */
  rank: number;
  topicId: string;
  topicLabel: string;
  subject?: string;
  classification: WeaknessClassification;
  severity: Severity;
  /** Confidence in the MEASUREMENT, carried through from the observation. Never an LLM's opinion. */
  confidence: number;
  accuracy: number | null;
  mastery: number | null;
  trend: 'improving' | 'declining' | 'steady' | null;
  freshness: Freshness;
  lastObservedAt: number | null;
  rootCause: RootCauseCode;
  rootCauseStatus: RootCauseStatus;
  evidence: EvidenceItem[];
  /** Machine-readable justification for the classification and severity. */
  reasonCodes: string[];
  recommendedAction: NextActionCode;
  /**
   * Why this outranked the next candidate — the actual comparison that decided it, so the
   * ordering can be explained rather than asserted. Null for the last entry.
   */
  selectedOver?: { topicId: string; because: string } | null;
}

// ─── Current status ─────────────────────────────────────────────────────────────────────────

/**
 * The student's preparation status. Produced BEFORE any model sees the context, so the mentor
 * explains a decision rather than making one.
 */
export type CurrentStatus =
  /** Measured performance is strong and nothing is trending down. */
  | 'ON_TRACK'
  /** Real weaknesses exist and are actionable. */
  | 'NEEDS_ATTENTION'
  /** High-confidence, high-severity weakness — the student is materially behind. */
  | 'SIGNIFICANT_GAP'
  /** Not enough measured evidence to characterise preparation at all. */
  | 'INSUFFICIENT_DATA';

// ─── Next action ────────────────────────────────────────────────────────────────────────────

export type NextActionCode =
  | 'PRACTICE_WEAK_TOPIC'
  | 'REVIEW_CONCEPT'
  /** The evidence shows a problem but cannot explain it — ask, do not guess. */
  | 'DIAGNOSTIC_CHECK'
  | 'MAINTAIN_STRENGTH'
  | 'COMPLETE_MISSED_STUDY'
  | 'CONTINUE_CURRENT_PLAN'
  | 'SET_GOAL'
  /** Too little measured to act on. The honest default for a new student. */
  | 'COLLECT_MORE_EVIDENCE';

export interface NextAction {
  code: NextActionCode;
  /** The topic this action is about, when it has one. */
  topicId: string | null;
  topicLabel: string | null;
  /** Machine-readable justification. Gate 9 turns these into prose; it must not invent its own. */
  reasonCodes: string[];
  evidence: EvidenceItem[];
}

// ─── Readiness ──────────────────────────────────────────────────────────────────────────────

export interface ReadinessDecision {
  status: MetricStatus;
  /**
   * Null unless a defensible measurement model exists for a composite. There is none today:
   * weighting six dimensions into one number requires an exam-specific model nobody has
   * validated, and inventing weights would produce a confident-looking figure with no basis.
   */
  score: number | null;
  dimensions: ReadinessDimensions;
  /** Dimension names that are genuinely measured. */
  measuredDimensions: string[];
  /** Dimension names that are not — reported, never counted as zero. */
  unavailableDimensions: string[];
  /** What specifically prevents an overall judgement. */
  blockers: string[];
  confidence: number | null;
  rationale: string[];
}

// ─── Root state ─────────────────────────────────────────────────────────────────────────────

export interface StudentDecision {
  studentId: string;

  currentStatus: {
    status: CurrentStatus;
    reasonCodes: string[];
  };

  /** Ranked weaknesses, most important first. Empty when nothing is claimable. */
  priorities: PrioritizedWeakness[];
  /** Convenience alias for priorities[0]; null when there is nothing to prioritise. */
  primaryWeakness: PrioritizedWeakness | null;

  goalGap: GoalGap;
  readiness: ReadinessDecision;
  nextAction: NextAction;

  /**
   * What the mentor must NOT claim, because the evidence does not support it. Gate 9 reads this
   * as a hard constraint — it is cheaper to forbid the specific false statements than to hope a
   * prompt discourages them.
   */
  mustNotClaim: string[];

  metadata: {
    generatedAt: number;
    /** Timestamp of the newest evidence behind any decision here. */
    lastEvidenceAt: number | null;
    algorithmVersion: number;
    /** Upstream dependencies that failed; their inputs are unavailable, never zero. */
    degraded: string[];
  };
}

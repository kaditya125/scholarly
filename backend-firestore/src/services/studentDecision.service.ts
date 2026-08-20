import { StudentLearningState, Weakness, EvidenceItem } from '../types/learningState.types';
import {
  StudentDecision, PrioritizedWeakness, WeaknessClassification, Freshness,
  CurrentStatus, NextAction, NextActionCode, ReadinessDecision,
  STUDENT_DECISION_ALGORITHM_VERSION,
} from '../types/studentDecision.types';
import {
  learningStateService, MIN_CONFIDENCE_FOR_HIGH, STALE_AFTER_MS, STRONG_ACCURACY,
} from './learningState.service';

/**
 * Gate 8 — the deterministic decision layer.
 *
 * Answers the nine mentor questions from an already-measured StudentLearningState, and nothing
 * else. It performs NO I/O, calls NO model, reads NO clock of its own (the caller supplies `now`),
 * and recomputes NONE of the upstream measurements — accuracy, mastery, trend, streak, test
 * performance and goal values all arrive already measured by the systems that own them. Those
 * three properties together are what make its output replayable, auditable, and impossible for an
 * LLM to influence.
 *
 * Every threshold it applies is imported from LearningStateService rather than redeclared, so the
 * layer that MEASURES "weak" and the layer that DECIDES what to do about it can never drift apart
 * and leave the mentor contradicting its own evidence.
 *
 * THE STANDARD FOR EXPOSING A NUMBER — applied to every value below:
 *   SOURCE      where the number came from
 *   RULE        the deterministic transformation applied
 *   WHY VALID   why that transformation is meaningful, not merely computable
 *   CONFIDENCE  how well-evidenced it is
 *   FRESHNESS   whether it is current
 * If any of the five cannot be answered, the value is not exposed and a status explains why.
 * That is why there is no readiness percentage, no risk score, no projected rank, and no
 * probability of success anywhere in this file: each would fail "WHY VALID".
 */

export class StudentDecisionService {
  /** Convenience wrapper: fetch the measured state, then decide over it. */
  async getDecision(userId: string, now: number = Date.now()): Promise<StudentDecision> {
    const state = await learningStateService.getLearningState(userId);
    return this.decide(state, now);
  }

  /**
   * The whole decision, as a pure function of measured state.
   *
   * `now` is a parameter rather than a call to Date.now() so freshness is testable and two runs
   * over the same state produce byte-identical output.
   */
  decide(state: StudentLearningState, now: number = Date.now()): StudentDecision {
    const priorities = this.prioritize(state, now);
    const readiness = this.decideReadiness(state);
    const currentStatus = this.decideStatus(state, priorities);
    const nextAction = this.decideNextAction(state, priorities, currentStatus.status);

    return {
      studentId: state.studentId,
      currentStatus,
      priorities,
      primaryWeakness: priorities[0] ?? null,
      goalGap: state.decisions.goalGap,
      readiness,
      nextAction,
      mustNotClaim: this.forbiddenClaims(state, priorities, readiness),
      metadata: {
        generatedAt: now,
        lastEvidenceAt: state.metadata.lastEvidenceAt,
        algorithmVersion: STUDENT_DECISION_ALGORITHM_VERSION,
        degraded: state.metadata.degraded,
      },
    };
  }

  // ── Weakness classification ──────────────────────────────────────────────────────────────

  /**
   * How strongly the evidence supports the weakness claim.
   *
   * SOURCE     the weakness's own measurement confidence, computed upstream from sample size.
   * RULE       at or above MIN_CONFIDENCE_FOR_HIGH → HIGH_CONFIDENCE_WEAKNESS, else OBSERVED.
   * WHY VALID  that threshold is the same line the measurement layer already uses to refuse HIGH
   *            severity — roughly six graded observations, the point at which a topic's accuracy
   *            stops swinging on one or two questions. Reusing it keeps one definition of "enough
   *            evidence" rather than inventing a second.
   *
   * Upstream has already discarded topics below MIN_TOPIC_EVIDENCE, so a weakness reaching here
   * can never rest on a single wrong answer.
   */
  private classify(w: Weakness): WeaknessClassification {
    if (w.confidence >= MIN_CONFIDENCE_FOR_HIGH) return 'HIGH_CONFIDENCE_WEAKNESS';
    return 'OBSERVED_WEAKNESS';
  }

  /**
   * FRESHNESS. SOURCE: the newest contributing observation. RULE: older than STALE_AFTER_MS
   * (~6 weeks) reads as STALE. WHY VALID: the same window the measurement layer uses; beyond it,
   * presenting a finding as the student's current state would misdescribe them. UNKNOWN when no
   * evidence carries a timestamp — deliberately not defaulted to FRESH.
   */
  private freshnessOf(w: Weakness, now: number): { freshness: Freshness; lastObservedAt: number | null } {
    const stamps = (w.evidence || []).map((e) => e.lastObservedAt).filter((t): t is number => typeof t === 'number');
    if (stamps.length === 0) return { freshness: 'UNKNOWN', lastObservedAt: null };
    const last = Math.max(...stamps);
    return { freshness: now - last > STALE_AFTER_MS ? 'STALE' : 'FRESH', lastObservedAt: last };
  }

  // ── Priority ─────────────────────────────────────────────────────────────────────────────

  /**
   * "If the mentor can help with only ONE thing right now, what should it be?"
   *
   * Ordering is a total, deterministic comparator — no scores, no weights, no randomness. A
   * weighted priority number was deliberately NOT used: any weighting of severity against
   * confidence against recency would be invented, and it would hide the actual reason for the
   * ordering behind a decimal. Comparing one dimension at a time keeps every decision explainable
   * as the specific comparison that settled it.
   *
   * Order of precedence, most to least decisive:
   *   1. classification  — act on what we are sure of before what we merely observed
   *   2. severity        — HIGH before MODERATE before LOW
   *   3. freshness       — a current problem before a stale one
   *   4. accuracy        — lower accuracy first
   *   5. confidence      — better-evidenced first
   *   6. topicId         — lexicographic, purely to make ties total and reproducible
   *
   * Step 6 carries no meaning and is not presented as a reason; it exists so that two topics
   * identical on every measured dimension still order identically on every run.
   */
  private prioritize(state: StudentLearningState, now: number): PrioritizedWeakness[] {
    const enriched = state.analysis.weaknesses.map((w) => {
      const { freshness, lastObservedAt } = this.freshnessOf(w, now);
      return { w, classification: this.classify(w), freshness, lastObservedAt };
    });

    const CLASS_RANK: Record<WeaknessClassification, number> = {
      HIGH_CONFIDENCE_WEAKNESS: 0, OBSERVED_WEAKNESS: 1, INSUFFICIENT_DATA: 2, NO_EVIDENCE: 3,
    };
    const SEVERITY_RANK: Record<string, number> = { HIGH: 0, MODERATE: 1, LOW: 2 };
    const FRESH_RANK: Record<Freshness, number> = { FRESH: 0, UNKNOWN: 1, STALE: 2 };

    /** Returns the first dimension on which a and b differ, with the winner. Drives both order and rationale. */
    const compare = (a: typeof enriched[0], b: typeof enriched[0]): { cmp: number; because: string } => {
      const byClass = CLASS_RANK[a.classification] - CLASS_RANK[b.classification];
      if (byClass !== 0) return { cmp: byClass, because: 'stronger evidence' };
      const bySeverity = SEVERITY_RANK[a.w.severity] - SEVERITY_RANK[b.w.severity];
      if (bySeverity !== 0) return { cmp: bySeverity, because: 'higher severity' };
      const byFresh = FRESH_RANK[a.freshness] - FRESH_RANK[b.freshness];
      if (byFresh !== 0) return { cmp: byFresh, because: 'more recent evidence' };
      const byAccuracy = (a.w.accuracy ?? 100) - (b.w.accuracy ?? 100);
      if (byAccuracy !== 0) return { cmp: byAccuracy, because: 'lower measured accuracy' };
      const byConfidence = b.w.confidence - a.w.confidence;
      if (byConfidence !== 0) return { cmp: byConfidence, because: 'better-evidenced' };
      return { cmp: a.w.topicId.localeCompare(b.w.topicId), because: 'deterministic tie-break on topic id' };
    };

    const sorted = [...enriched].sort((a, b) => compare(a, b).cmp);

    return sorted.map((e, i) => {
      const next = sorted[i + 1];
      return {
        rank: i + 1,
        topicId: e.w.topicId,
        topicLabel: e.w.topicLabel,
        subject: e.w.subject,
        classification: e.classification,
        severity: e.w.severity,
        confidence: e.w.confidence,
        accuracy: e.w.accuracy,
        mastery: e.w.mastery,
        trend: e.w.trend,
        freshness: e.freshness,
        lastObservedAt: e.lastObservedAt,
        rootCause: e.w.rootCause,
        rootCauseStatus: e.w.rootCauseStatus,
        evidence: e.w.evidence,
        reasonCodes: [...e.w.reasonCodes, `CLASSIFICATION_${e.classification}`, `FRESHNESS_${e.freshness}`],
        recommendedAction: this.actionForWeakness(e.w, e.classification),
        selectedOver: next
          ? { topicId: next.w.topicId, because: compare(e, next).because }
          : null,
      };
    });
  }

  /**
   * What to do about ONE weakness.
   *
   * The key rule, and the reason this is not a lookup table: when the root cause is not
   * established, the action is to ASK, not to prescribe. Practising more questions on a topic the
   * student misunderstands conceptually wastes their time, and the current signals cannot tell a
   * conceptual gap from careless errors — so the honest move is a diagnostic, not a guess dressed
   * as a plan. Stale evidence gets the same treatment: re-establish the fact before acting on it.
   */
  private actionForWeakness(w: Weakness, classification: WeaknessClassification): NextActionCode {
    if (w.rootCauseStatus === 'UNKNOWN' || w.rootCause === 'UNKNOWN') return 'DIAGNOSTIC_CHECK';
    if (classification === 'OBSERVED_WEAKNESS') return 'DIAGNOSTIC_CHECK';
    if (w.trend === 'declining') return 'REVIEW_CONCEPT';
    return 'PRACTICE_WEAK_TOPIC';
  }

  // ── Readiness ────────────────────────────────────────────────────────────────────────────

  /**
   * Readiness, kept multidimensional and explicitly WITHOUT a composite score.
   *
   * `score` stays null. Collapsing six dimensions into "you are 78% ready" needs a weighting model
   * validated against real exam outcomes; no such model exists here, and choosing weights to make
   * the number look reasonable would be fabrication with extra steps. The dimensions are reported
   * individually so a student can be told what is actually known.
   *
   * Unavailable dimensions are listed, never counted as zero and never counted as failure — a
   * student who has not been measured is not a student measured as bad.
   */
  private decideReadiness(state: StudentLearningState): ReadinessDecision {
    const dims = state.readiness.dimensions;
    const measured: string[] = [];
    const unavailable: string[] = [];
    const blockers: string[] = [];

    for (const [name, m] of Object.entries(dims)) {
      if (m.status === 'AVAILABLE') measured.push(name);
      else {
        unavailable.push(name);
        blockers.push(`${name}: ${m.status}${m.reason ? ` — ${m.reason}` : ''}`);
      }
    }

    // Preserved from the measurement layer: fewer than three measured dimensions is one metric
    // wearing a more authoritative name, not a readiness judgement.
    const REQUIRED_DIMENSIONS = 3;
    const enough = measured.length >= REQUIRED_DIMENSIONS;

    const confidences = Object.values(dims)
      .filter((m) => m.status === 'AVAILABLE' && typeof m.confidence === 'number')
      .map((m) => m.confidence as number);
    // Weakest link, not mean: an overall judgement is only as trustworthy as its thinnest input,
    // and averaging would let one well-evidenced dimension mask two thin ones.
    const confidence = confidences.length > 0 ? Math.min(...confidences) : null;

    const rationale = enough
      ? [`${measured.length} of ${measured.length + unavailable.length} dimensions measured`,
         'no composite score: exam-specific weighting model not established']
      : [`only ${measured.length} of ${measured.length + unavailable.length} dimensions measured`,
         `at least ${REQUIRED_DIMENSIONS} required before an overall readiness judgement`];

    return {
      status: enough ? (state.metadata.degraded.length > 0 ? 'STALE' : 'AVAILABLE') : 'INSUFFICIENT_DATA',
      score: null,
      dimensions: dims,
      measuredDimensions: measured,
      unavailableDimensions: unavailable,
      blockers,
      confidence,
      rationale,
    };
  }

  // ── Current status ───────────────────────────────────────────────────────────────────────

  /**
   * The student's preparation status, decided before any model sees the context.
   *
   * SOURCE     measured topic observations and the classified weaknesses above.
   * RULE       a HIGH-severity, high-confidence weakness → SIGNIFICANT_GAP; any actionable
   *            weakness → NEEDS_ATTENTION; measured topics with none → ON_TRACK; nothing
   *            measurable → INSUFFICIENT_DATA.
   * WHY VALID  each branch restates a measurement rather than extrapolating from it. Notably
   *            ON_TRACK is NOT a claim about passing the exam — it says the measured topics show
   *            no weakness, which is all the evidence supports.
   */
  private decideStatus(
    state: StudentLearningState,
    priorities: PrioritizedWeakness[],
  ): { status: CurrentStatus; reasonCodes: string[] } {
    const measuredTopics = state.observations.topics.filter((t) => t.accuracy.status === 'AVAILABLE');

    if (measuredTopics.length === 0) {
      return {
        status: 'INSUFFICIENT_DATA',
        reasonCodes: ['NO_TOPIC_MEETS_EVIDENCE_THRESHOLD'],
      };
    }

    const severe = priorities.find(
      (p) => p.severity === 'HIGH' && p.classification === 'HIGH_CONFIDENCE_WEAKNESS',
    );
    if (severe) {
      return {
        status: 'SIGNIFICANT_GAP',
        reasonCodes: ['HIGH_SEVERITY_HIGH_CONFIDENCE', `TOPIC_${severe.topicId}`],
      };
    }

    if (priorities.length > 0) {
      return {
        status: 'NEEDS_ATTENTION',
        reasonCodes: [`WEAKNESSES_${priorities.length}`, `TOP_SEVERITY_${priorities[0].severity}`],
      };
    }

    return {
      status: 'ON_TRACK',
      reasonCodes: ['NO_WEAKNESS_ABOVE_THRESHOLD', `MEASURED_TOPICS_${measuredTopics.length}`],
    };
  }

  // ── Next action ──────────────────────────────────────────────────────────────────────────

  /**
   * The single highest-value next action.
   *
   * Ordered so the honest defaults win: with too little evidence the action is to gather more,
   * never to invent a weakness; with no goal the action is to set one, because a goal is the
   * student's to declare and cannot be inferred from their history.
   */
  private decideNextAction(
    state: StudentLearningState,
    priorities: PrioritizedWeakness[],
    status: CurrentStatus,
  ): NextAction {
    if (status === 'INSUFFICIENT_DATA') {
      return {
        code: 'COLLECT_MORE_EVIDENCE',
        topicId: null, topicLabel: null,
        reasonCodes: ['NO_TOPIC_MEETS_EVIDENCE_THRESHOLD', 'CANNOT_NAME_A_WEAKNESS_WITHOUT_EVIDENCE'],
        evidence: [],
      };
    }

    const top = priorities[0];
    if (top) {
      return {
        code: top.recommendedAction,
        topicId: top.topicId,
        topicLabel: top.topicLabel,
        reasonCodes: [...top.reasonCodes, `SEVERITY_${top.severity}`, `ROOT_CAUSE_${top.rootCause}`],
        evidence: top.evidence,
      };
    }

    // No weakness. A goal is the one thing the system may prompt for without evidence, because it
    // is a statement only the student can make — never derived from their history.
    if (state.goal == null || state.goal.status !== 'ACTIVE') {
      return {
        code: 'SET_GOAL',
        topicId: null, topicLabel: null,
        reasonCodes: ['NO_ACTIVE_GOAL', 'PERFORMANCE_MEASURED_BUT_NO_TARGET_TO_MEASURE_AGAINST'],
        evidence: [],
      };
    }

    const strong = state.analysis.strengths.length > 0;
    return {
      code: strong ? 'MAINTAIN_STRENGTH' : 'CONTINUE_CURRENT_PLAN',
      topicId: null, topicLabel: null,
      reasonCodes: strong
        ? ['NO_WEAKNESS_ABOVE_THRESHOLD', `STRONG_TOPICS_${state.analysis.strengths.length}`,
           `STRONG_AT_OR_ABOVE_${STRONG_ACCURACY}_PCT`]
        : ['NO_WEAKNESS_ABOVE_THRESHOLD'],
      evidence: state.analysis.strengths.flatMap((s) => s.evidence).slice(0, 3) as EvidenceItem[],
    };
  }

  // ── Guardrails for Gate 9 ────────────────────────────────────────────────────────────────

  /**
   * The claims the mentor must not make, derived from what is actually unavailable.
   *
   * Emitted as explicit prohibitions rather than left to prompt wording: a prompt that merely
   * encourages caution still lets a model fill a silence with something plausible. Naming the
   * specific forbidden statements is enforceable and reviewable.
   */
  private forbiddenClaims(
    state: StudentLearningState,
    priorities: PrioritizedWeakness[],
    readiness: ReadinessDecision,
  ): string[] {
    const out: string[] = [];

    if (readiness.status !== 'AVAILABLE') {
      out.push('Do not state or imply an overall exam-readiness level, percentage or probability of clearing.');
    } else {
      out.push('Do not state a readiness percentage: dimensions are measured but no validated composite exists.');
    }

    if (state.observations.syllabusCoverage.status !== 'AVAILABLE') {
      out.push('Do not state how much of the syllabus is covered or remaining.');
    }

    if (state.decisions.goalGap.status !== 'AVAILABLE') {
      out.push(`Do not state a numeric distance from the goal (${state.decisions.goalGap.reason ?? 'unavailable'}).`);
    }

    if (!state.observations.topics.some((t) => t.mastery.status === 'AVAILABLE')) {
      out.push('Do not state concept-mastery levels; no mastery evidence exists for this student.');
    }

    if (priorities.some((p) => p.rootCauseStatus === 'OBSERVED' || p.rootCause === 'UNKNOWN')) {
      out.push('Do not explain WHY a topic is weak (conceptual gap, carelessness, time pressure) — ' +
               'only that the measured accuracy is low. Ask a diagnostic question instead.');
    }

    if (priorities.some((p) => p.freshness === 'STALE')) {
      out.push('Do not describe stale findings as the student\'s current state without saying when they were measured.');
    }

    out.push('Do not project a future score, rank or percentile.');
    return out;
  }
}

export const studentDecisionService = new StudentDecisionService();

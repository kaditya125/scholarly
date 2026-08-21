/**
 * J.7.1 — the canonical assessment contract.
 *
 * THE INVARIANT THIS EXISTS TO CARRY: an exam-specific assessment is derived from the verified
 * canonical syllabus for the student's exact exam AND cycle, or it is not produced at all.
 *
 * Every field here is application-owned. None of it is ever taken from a language model, inferred
 * from a free-text topic label, or defaulted to "whatever syllabus we happen to have". The J.7
 * audit found the opposite everywhere: a pre-test assembled from twelve hardcoded Physics/
 * Chemistry/Maths templates and handed to SSC CGL, UPSC and NEET students alike, with the exam the
 * student actually selected available in their profile and simply never read.
 *
 * Deliberately NOT a new syllabus model. These types reference the canonical graph built in
 * J.1–J.6 by id; they never copy or re-describe it.
 */
import type { SyllabusGraphNode } from '../services/exam/syllabusGraph.service';

// ─── Resolution ──────────────────────────────────────────────────────────────────────────────

/**
 * Why a canonical syllabus could not be resolved.
 *
 * Each value is a distinct fact about the world, and they are kept apart because they demand
 * different responses. Collapsing them into one "not found" is how a broken extraction ends up
 * indistinguishable from an exam that genuinely has no published syllabus yet.
 */
export type NoCanonicalSyllabusReason =
  /** No record is CURRENT for this exam+cycle. Includes the case where one exists at INVALID. */
  | 'NO_CURRENT_SYLLABUS'
  /** A CURRENT record exists but its cycle does not match the request. Never silently accepted. */
  | 'CYCLE_MISMATCH'
  /** The version has no published canonical graph — nothing was ever validated and persisted. */
  | 'GRAPH_NOT_BUILT'
  /** A graph exists but contains no nodes. An extraction that produced nothing, not an empty exam. */
  | 'GRAPH_EMPTY'
  /** Nodes exist but none can carry a question (no TOPIC/SUBTOPIC). Structurally unusable. */
  | 'NO_QUESTION_BEARING_NODES';

export interface ResolvedCanonicalSyllabus {
  outcome: 'RESOLVED';
  examId: string;
  cycleId: string;
  syllabusId: string;
  /** The version label as published, e.g. "2026-v1". Carried so an attempt stays interpretable. */
  version: string;
  /** Every node in this version's graph. */
  nodes: SyllabusGraphNode[];
  /** The subset a question may legitimately be authored against (TOPIC/SUBTOPIC). */
  questionBearingNodes: SyllabusGraphNode[];
}

export interface UnresolvedCanonicalSyllabus {
  outcome: 'NO_CANONICAL_SYLLABUS';
  examId: string;
  cycleId: string;
  reason: NoCanonicalSyllabusReason;
  /** Operator-facing detail. Never rendered to a student as-is. */
  detail: string;
}

export type SyllabusResolution = ResolvedCanonicalSyllabus | UnresolvedCanonicalSyllabus;

/**
 * NO_CANONICAL_SYLLABUS is a fact about the platform's data, never an infrastructure failure.
 *
 * A Firestore outage throws instead, and must keep throwing all the way to the caller: "we could
 * not ask" and "the answer is no" are different statements, and a student told the second when the
 * first is true has been misinformed about their own exam.
 */
export class SyllabusUnavailableError extends Error {
  constructor(public readonly examId: string, public readonly cycleId: string, cause: string) {
    super(`[CanonicalSyllabus] resolution unavailable for ${examId}/${cycleId}: ${cause}`);
    this.name = 'SyllabusUnavailableError';
  }
}

// ─── Request ─────────────────────────────────────────────────────────────────────────────────

export type AssessmentPurpose = 'DIAGNOSTIC_PRETEST' | 'TOPIC_PRACTICE' | 'REVISION';

export type DifficultyBand = 'EASY' | 'MEDIUM' | 'HARD';

/** How many questions of each band. Counts, not ratios, so the total is exact and auditable. */
export type DifficultyDistribution = Partial<Record<DifficultyBand, number>>;

/**
 * A fully-resolved, application-owned request for a canonical assessment.
 *
 * Constructed ONLY by `CanonicalPreTestService` from a `SyllabusResolution` — never assembled by a
 * route handler, a client, or a model. That is what makes `requestedNodeIds` trustworthy: by the
 * time this object exists, every id in it has already been proven to belong to `syllabusId`.
 */
export interface CanonicalPreTestRequest {
  studentId: string;
  examId: string;
  cycleId: string;
  syllabusId: string;
  syllabusVersion: string;
  /** Canonical node ids, in the deterministic order the assessment will present them. */
  requestedNodeIds: string[];
  questionCount: number;
  difficultyDistribution: DifficultyDistribution;
  assessmentPurpose: AssessmentPurpose;
  language: string;
  /**
   * Deterministic identity for this logical request.
   *
   * Same student + exam + cycle + syllabus + purpose + node selection ⇒ same id, so a retried or
   * double-submitted request is recognisable as the same one rather than minting a second
   * assessment. Mirrors the `learning.test_completed:{attemptId}` convention already used by the
   * event pipeline rather than introducing a second idempotency scheme.
   */
  requestId: string;
}

// ─── Outcome ─────────────────────────────────────────────────────────────────────────────────

export type PreTestFailureReason =
  | NoCanonicalSyllabusReason
  /** The generator returned nothing usable for a node. */
  | 'GENERATION_PRODUCED_NO_QUESTIONS'
  /** A generated question failed canonical validation. Never downgraded — see the service. */
  | 'CANONICAL_VALIDATION_FAILED';

export interface PreTestGenerated {
  outcome: 'GENERATED';
  request: CanonicalPreTestRequest;
  attemptId: string;
  questionCount: number;
  /** Node id per question, in order — the audit trail for "why was this asked?". */
  nodeIdsUsed: string[];
}

export interface PreTestUnavailable {
  outcome: 'NO_CANONICAL_SYLLABUS';
  examId: string;
  cycleId: string;
  reason: NoCanonicalSyllabusReason;
  detail: string;
  /** Safe to show a student. States the limitation without inventing a cause. */
  studentMessage: string;
}

export interface PreTestFailed {
  outcome: 'FAILED';
  examId: string;
  cycleId: string;
  syllabusId: string;
  reason: PreTestFailureReason;
  detail: string;
}

export type PreTestResult = PreTestGenerated | PreTestUnavailable | PreTestFailed;

/**
 * The one message a student sees when no verified syllabus exists.
 *
 * Says what is true and stops. It does not apologise for a defect that has not occurred, does not
 * promise a date, and above all does not offer a "general" test as a consolation — offering one
 * would recreate exactly the substitution this gate removes.
 */
export const NO_CANONICAL_SYLLABUS_MESSAGE =
  'A verified syllabus for this exam cycle is not currently available, so we can\'t generate a ' +
  'syllabus-backed assessment yet.';

import { db } from '../../config/firebase';
import { logger } from '../../utils/logger';
import {
  masteryEngine, slugifyConcept,
  type ConceptMastery, type MasteryEvent,
} from '../../core/intelligence/MasteryEngine';
import {
  validateSyllabusNodeId, parseSyllabusNodeId, getSyllabusAncestors,
  type SyllabusIdentityCode,
} from '../exam/syllabusNodeIdentity';
import { syllabusGraphService } from '../exam/syllabusGraph.service';

/**
 * Stage 2 — mastery keyed by a VALIDATED canonical syllabus node.
 *
 * The invariant: a validated syllabus node plus an authentic attempt is the only thing that may
 * produce a mastery event. Anything without a canonical node is recorded as an attempt but does
 * not contaminate node-level analytics.
 *
 * ── This wraps MasteryEngine; it does not replace it ────────────────────────────────────────
 * The engine already does the hard parts well and they are kept intact:
 *   · applyEvent is an EMA pull toward the event's target, so one answer can never read as
 *     "mastered" — exactly the property Stage 2 asks for
 *   · successRate (raw accuracy) is already separate from masteryScore (evidence-adjusted)
 *   · confidence already grows with attempts and caps at 0.95
 *   · writes are already transactional, and recordBatch already folds a submission's events into
 *     one read-modify-write after contention was measured losing 4 events down to 2
 *   · replay is already idempotent via processedEventIds, deduplicated INSIDE the transaction
 * What was missing was identity. This module supplies that and reuses everything above.
 *
 * ── Why the key is not slugifyConcept(nodeId) ───────────────────────────────────────────────
 * The existing subscriber keys on `slugifyConcept(syllabusNodeId)`, and slugifyConcept ends with
 * `.slice(0, 120)`. Canonical ids currently run to 114 characters, so nothing truncates today —
 * measured across all 7,526 nodes, zero collisions. But the disambiguating fingerprint is the
 * LAST segment of the id, so any id that did exceed the cap would lose precisely the part that
 * makes it unique, and two distinct nodes would silently share one mastery record. Six characters
 * of headroom is not a guarantee.
 *
 * The key here is instead the same lossless encoding the graph already uses for its own document
 * ids — `id.replace(/[:/]/g, '_')` — which is reversible, collision-free by construction, and
 * consistent with an existing convention rather than a new one. The mastery collection is empty,
 * so adopting it costs no migration.
 */

/** Node types that may carry mastery. */
export const MASTERY_ALLOWED_TYPES = ['TOPIC', 'SUBTOPIC'] as const;

/**
 * Mastery is recorded at TOPIC and SUBTOPIC only.
 *
 * A SUBJECT or PAPER is a container, not something a question tests. Writing mastery at every
 * ancestor would mean one attempt costing five writes, and — worse — parent and child could drift
 * into contradicting each other, with "Physics 40%" sitting above a set of topics averaging 70%
 * because the parent's own EMA lagged. Parent-level figures are DERIVED from descendants on read
 * (see `aggregateForNode`), so they cannot disagree with the evidence beneath them.
 */
export type MasteryWriteOutcome =
  | { recorded: true; key: string; mastery: ConceptMastery }
  | { recorded: false; reason: SyllabusIdentityCode | 'NO_USER' };

/** Lossless, collision-free mastery document key for a canonical node. */
export function masteryKeyForNode(syllabusNodeId: string): string {
  return syllabusNodeId.replace(/[:/]/g, '_');
}

export interface AttemptEvidence {
  userId: string;
  examId: string;
  syllabusNodeId?: string | null;
  correct: boolean;
  /** Immutable identity of the attempt. Replaying the same one must not double-count. */
  attemptId?: string;
  label?: string;
}

/**
 * Record one graded attempt against its syllabus node.
 *
 * ── SUPERSEDED. DO NOT WIRE THIS INTO THE QUIZ PATH. ──────────────────────────────────────
 *
 * It has no callers, and that is the intended state — not an oversight, and not missing wiring.
 * Twice now the absence of callers has been read as a gap to be closed, so the reasoning is
 * recorded here rather than left to be re-derived.
 *
 * The quiz path ALREADY writes node-keyed mastery, end to end:
 *
 *     quizAttempts.service   groups graded rows by q.syllabusNodeId
 *     resultAnalysis:181     publishes topicBreakdown carrying syllabusNodeId + identityStatus
 *     subscribers.ts:94      conceptKey = masteryKeyForNode(row.syllabusNodeId)
 *     masteryEngine          → users/{uid}/mastery/{node-keyed}
 *
 * That path is dormant only because ENABLE_MASTERY defaults to false. Enabling the flag turns it
 * on; adding a call to this function does not enable anything that is missing.
 *
 * Wiring it alongside that path would do two specific harms:
 *
 *   1. DOUBLE COUNTING. Both write the same store with the same masteryKeyForNode derivation, but
 *      their idempotency keys differ — `ev.attemptId` here versus `${eventId}#${conceptKey}` in
 *      the subscriber — so MasteryEngine's dedup cannot recognise them as the same evidence.
 *      Every graded answer would move mastery twice.
 *
 *   2. A MEASURED DATA-LOSS BUG. This is the PER-QUESTION shape. The subscriber is per-submission
 *      precisely because per-question was tried and measured to lose writes: "4 graded answers
 *      persisted as 2 attempts, because concurrent transactions on one concept contended and the
 *      losers were discarded." See the comment above the learning.test_completed subscriber.
 *
 * ── WHY IT IS KEPT ────────────────────────────────────────────────────────────────────────
 * Three suites exercise it — nodeMastery, learningLoop.e2e and pyqEligibility — and they encode
 * real behaviour about the mastery EMA and node-eligibility rules that is worth keeping under
 * test. It is a single-attempt reference implementation and a test seam, not a production writer.
 *
 * If a genuine single-attempt use case ever appears (a one-off practice question outside a
 * submission, say), it must first be reconciled with the subscriber's idempotency scheme, or the
 * two will double-count the moment both are live.
 *
 * ── BEHAVIOUR ─────────────────────────────────────────────────────────────────────────────
 * Returns a structured outcome rather than throwing: an attempt with no canonical node is an
 * ordinary, expected situation — most content is not mapped yet — and the caller needs to store
 * the attempt regardless. Only the mastery contribution is withheld.
 */
export async function recordAttemptMastery(ev: AttemptEvidence): Promise<MasteryWriteOutcome> {
  if (!ev.userId) return { recorded: false, reason: 'NO_USER' };

  const check = await validateSyllabusNodeId({
    examId: ev.examId,
    syllabusNodeId: ev.syllabusNodeId,
    allowedTypes: [...MASTERY_ALLOWED_TYPES],
  });
  if (!check.valid) {
    // Deliberately not an error. "Not mapped yet" is the common case, and turning it into a
    // failure is what pressures callers into inventing a node to make the write succeed.
    logger.debug('[NodeMastery] attempt not eligible for node mastery', {
      userId: ev.userId, examId: ev.examId, code: check.code, attemptId: ev.attemptId,
    });
    return { recorded: false, reason: check.code };
  }

  const nodeId = ev.syllabusNodeId!;
  const key = masteryKeyForNode(nodeId);
  const event: MasteryEvent = ev.correct ? 'quiz_correct' : 'quiz_incorrect';

  /*
   * recordBatch, not recordEvent: it folds a submission's events into ONE transactional
   * read-modify-write and carries the idempotency key. The dedup check runs inside the
   * transaction callback against the state that transaction actually read, so two concurrent
   * deliveries of the same attemptId cannot both apply — the loser re-runs, sees the id already
   * recorded, and no-ops.
   */
  const { deduplicated } = await masteryEngine.recordBatch(
    ev.userId,
    { id: key, title: check.node?.label || ev.label || nodeId, topic: check.node?.label, syllabusNodeId: nodeId },
    [event],
    ev.attemptId,
  );

  const mastery = await masteryEngine.get(ev.userId, key);
  logger.info('[NodeMastery] recorded', {
    userId: ev.userId, attemptId: ev.attemptId, nodeId, deduplicated,
    result: ev.correct ? 'correct' : 'incorrect',
    masteryScore: mastery?.masteryScore, attempts: mastery?.attempts,
  });
  return { recorded: true, key, mastery: mastery! };
}

/** Mastery for one node, or null when the student has no evidence there. */
export async function getNodeMastery(
  userId: string, syllabusNodeId: string,
): Promise<ConceptMastery | null> {
  if (!userId || !syllabusNodeId) return null;
  return masteryEngine.get(userId, masteryKeyForNode(syllabusNodeId));
}

/**
 * All node-anchored mastery for one exam.
 *
 * Filtered on `syllabusNodeId` rather than on the document key so legacy label-keyed records —
 * which carry no node and cannot be attributed to an exam — are excluded rather than guessed at.
 */
export async function getUserMasteryForExam(
  userId: string, examId: string,
): Promise<ConceptMastery[]> {
  if (!userId) return [];
  const want = examId.trim().toUpperCase().replace(/[\s_-]+/g, '_');
  const all = await masteryEngine.listConcepts(userId);
  return all.filter((m) => {
    if (!m.syllabusNodeId) return false;
    const parsed = parseSyllabusNodeId(m.syllabusNodeId);
    return parsed?.examId.toUpperCase() === want;
  });
}

/** Node-anchored mastery for one specific syllabus version. */
export async function getUserMasteryForSyllabus(
  userId: string, syllabusId: string,
): Promise<ConceptMastery[]> {
  const all = await masteryEngine.listConcepts(userId);
  return all.filter((m) => m.syllabusNodeId
    && parseSyllabusNodeId(m.syllabusNodeId)?.syllabusId === syllabusId);
}

/**
 * Nodes where the student has evidence AND is performing below threshold.
 *
 * Requires a minimum number of attempts. Without that a single unlucky answer would rank a topic
 * as the student's greatest weakness, which is both wrong and demoralising — and would send a
 * future planner to the wrong place.
 */
export async function getWeakNodes(
  userId: string, examId: string, opts: { threshold?: number; minAttempts?: number; limit?: number } = {},
): Promise<ConceptMastery[]> {
  const { threshold = 0.5, minAttempts = 3, limit = 20 } = opts;
  const rows = await getUserMasteryForExam(userId, examId);
  return rows
    .filter((m) => m.attempts >= minAttempts && m.masteryScore < threshold)
    .sort((a, b) => a.masteryScore - b.masteryScore)
    .slice(0, limit);
}

/**
 * Syllabus nodes the student has never attempted.
 *
 * Derived by subtracting what has evidence from what the syllabus contains, so an untouched node
 * is a real absence rather than a record with a zero in it. Stage 3's coverage map is exactly
 * this set plus the mastered/learning/weak partition of its complement.
 */
export async function getUncoveredNodes(
  userId: string, examId: string, syllabusId?: string,
): Promise<Array<{ nodeId: string; label: string; type: string }>> {
  const nodes = await syllabusGraphService.getSyllabusNodes({ examId, syllabusId });
  const eligible = nodes.filter((n) => (MASTERY_ALLOWED_TYPES as readonly string[]).includes(n.type));
  const seen = new Set(
    (await getUserMasteryForExam(userId, examId)).map((m) => m.syllabusNodeId).filter(Boolean) as string[],
  );
  return eligible
    .filter((n) => !seen.has(n.id))
    .map((n) => ({ nodeId: n.id, label: n.label, type: n.type }));
}

/**
 * Mastery for a container node, computed from its descendants.
 *
 * Nothing is stored for parents — see the note on MASTERY_ALLOWED_TYPES. A parent with no
 * evidence beneath it returns null rather than zero, because "no data" and "scored zero" are
 * different claims and a coverage map must not render them the same way.
 */
export async function aggregateForNode(
  userId: string, examId: string, syllabusNodeId: string,
): Promise<{ nodeId: string; descendants: number; withEvidence: number; masteryScore: number | null; attempts: number }> {
  const parsed = parseSyllabusNodeId(syllabusNodeId);
  const nodes = await syllabusGraphService.getSyllabusNodes({
    examId, cycleId: parsed?.cycleId, syllabusId: parsed?.syllabusId,
  });

  const childrenOf = new Map<string, string[]>();
  nodes.forEach((n) => {
    if (!n.parentEntityId) return;
    childrenOf.set(n.parentEntityId, [...(childrenOf.get(n.parentEntityId) || []), n.id]);
  });

  const descendants: string[] = [];
  const stack = [syllabusNodeId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;      // a malformed parent cycle must not spin here
    seen.add(cur);
    for (const c of childrenOf.get(cur) || []) { descendants.push(c); stack.push(c); }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const eligible = descendants.filter((d) =>
    (MASTERY_ALLOWED_TYPES as readonly string[]).includes(byId.get(d)?.type ?? ''));

  const rows = await getUserMasteryForExam(userId, examId);
  const byNode = new Map(rows.map((r) => [r.syllabusNodeId!, r]));
  const withEvidence = eligible.map((d) => byNode.get(d)).filter(Boolean) as ConceptMastery[];

  if (!withEvidence.length) {
    return { nodeId: syllabusNodeId, descendants: eligible.length, withEvidence: 0, masteryScore: null, attempts: 0 };
  }
  // Attempt-weighted: a topic backed by twenty answers should count for more than one backed by a
  // single answer, which a plain average would treat as equals.
  const attempts = withEvidence.reduce((a, m) => a + m.attempts, 0);
  const weighted = withEvidence.reduce((a, m) => a + m.masteryScore * Math.max(1, m.attempts), 0);
  const weight = withEvidence.reduce((a, m) => a + Math.max(1, m.attempts), 0);
  return {
    nodeId: syllabusNodeId,
    descendants: eligible.length,
    withEvidence: withEvidence.length,
    masteryScore: weighted / weight,
    attempts,
  };
}

/** Ancestor labels for a node, for display. Identity always stays the canonical id. */
export async function describeNode(examId: string, syllabusNodeId: string): Promise<string[]> {
  const anc = await getSyllabusAncestors(examId, syllabusNodeId);
  return anc.map((n) => n.label);
}

/** Legacy detection — records with no canonical node cannot be attributed to an exam. */
export async function legacyMasteryCount(userId: string): Promise<{ total: number; nodeAnchored: number; legacy: number }> {
  const all = await masteryEngine.listConcepts(userId);
  const nodeAnchored = all.filter((m) => !!m.syllabusNodeId).length;
  return { total: all.length, nodeAnchored, legacy: all.length - nodeAnchored };
}

export const __internal = { slugifyConcept, db };

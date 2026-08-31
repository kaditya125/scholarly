import { db } from '../config/firebase';
import { eventBus } from '../core/events/EventBus';
import { featureFlags } from '../config/featureFlags';
import { isMasteryEnabledFor } from './masteryGate';
import { logger } from '../utils/logger';

/**
 * Baseline evidence reconciliation.
 *
 * The architectural point: the EventBus is at-most-once with no persistence, replay or
 * acknowledgement, so a publish failure would otherwise mean a student's graded baseline never
 * reaches mastery — silently. This component makes the EventBus an ACCELERATOR rather than the
 * only path: durable Firestore evidence is the source of truth, and mastery is a projection that
 * can always be rebuilt from it.
 *
 * The invariant it enforces:
 *
 *     If every EventBus message disappeared, mastery could still be reconstructed correctly.
 *
 * It NEVER re-grades. Grading is server-authoritative and already durable; reconciliation reads
 * the persisted per-question verdicts (`gradedQuestions`) and replays events from them. The
 * original client payload is irrelevant once the submission is COMPLETED — which is exactly the
 * property that makes replay safe.
 *
 * Idempotency is inherited, not reinvented: the completion event keeps the deterministic identity
 * `learning.test_completed:{attemptId}`, and MasteryEngine already dedupes on processedEventIds
 * inside its transaction (verified in production: 10 concurrent duplicates → 1 effect). Running
 * this once, twice or concurrently therefore yields one logical mastery effect.
 *
 * WHAT projectionStatus MEANS — three distinct states, deliberately not collapsed:
 *
 *   PENDING    projection is owed. Either it has not been attempted, the publish failed, or the
 *              mastery consumer is switched off. In every case the evidence stays eligible and a
 *              later run will pick it up.
 *   PROJECTED  the projection obligation is discharged — either the event was handed to a live
 *              consumer without error, or there was genuinely nothing to project (an empty
 *              submission). It is NOT a claim that a consumer finished successfully; this bus has
 *              no acknowledgement, so no publisher could honestly claim that.
 *
 * The case that forced this to be spelled out: with ENABLE_MASTERY off, publish() still succeeds
 * (Redis accepts the message) while the subscriber returns on its first line. Marking that
 * PROJECTED recorded work that provably never happened AND made it unrecoverable, because
 * reconciliation skips PROJECTED records. Evidence graded before the flag was turned on would
 * have been silently orphaned forever.
 */

export interface ReconcileOutcome {
  attemptId: string | null;
  projected: boolean;
  reason?: string;
}

export class BaselineReconciliationService {
  /**
   * Replays the durable evidence for ONE student's pending baseline submission.
   *
   * Returns without projecting when there is nothing owed, so it is safe to call speculatively.
   */
  async reconcileUser(userId: string): Promise<ReconcileOutcome> {
    const ref = db.collection('users').doc(userId).collection('assessments').doc('baselineSession');
    const snap = await ref.get();
    const data: any = snap.exists ? snap.data() : null;

    if (!data) return { attemptId: null, projected: false, reason: 'NO_SESSION' };
    if (data.submissionState !== 'COMPLETED') {
      return { attemptId: data.attemptId ?? null, projected: false, reason: 'NOT_COMPLETED' };
    }
    if (data.projectionStatus === 'PROJECTED') {
      return { attemptId: data.attemptId ?? null, projected: false, reason: 'ALREADY_PROJECTED' };
    }

    const gradedQuestions: any[] = data.gradedQuestions || [];
    const attemptId: string | null = data.attemptId ?? null;
    if (!attemptId) {
      // Cannot build a deterministic event identity, so replay could not be made idempotent.
      // Left PENDING and reported rather than projected under a fabricated id.
      logger.error('[BaselineReconcile] COMPLETED submission has no attemptId; cannot project', { userId });
      return { attemptId: null, projected: false, reason: 'NO_ATTEMPT_ID' };
    }
    if (gradedQuestions.length === 0) {
      /**
       * Two very different situations produce zero per-question rows, and conflating them was a
       * defect: a student who submitted nothing at all is not the same as a submission whose
       * evidence went missing.
       *
       * LEGITIMATELY EMPTY — the student attempted nothing, so `gradeBaselineSubmission` (which
       * maps over RESPONSES, not questions) produced no rows. There is genuinely nothing to
       * project: no attempts, no outcomes, no topics. The projection obligation is discharged the
       * moment we establish that, so it is marked PROJECTED and never scanned again. Previously
       * this sat COMPLETED + PENDING forever, re-scanned by every reconciliation pass and logging
       * an error each time for a perfectly valid submission.
       *
       * Critically, nothing is fabricated to achieve that: no event is published, no mastery
       * document is touched, no attempt is counted and no accuracy is invented. `accuracyPct`
       * stays null. From a learning standpoint this student remains INSUFFICIENT_DATA — which is
       * the honest state, and the one an empty submission must keep.
       *
       * ANOMALOUS — `gradedResult` claims attempts but the per-question rows are absent, or the
       * graded result is missing outright. COMPLETED + evidence is written atomically, so this
       * combination should be impossible; it stays loud and stays PENDING rather than being
       * tidied away into a state that asserts work was done.
       */
      const gradedResult: any = data.gradedResult;
      const legitimatelyEmpty = !!gradedResult && gradedResult.attempted === 0;

      if (legitimatelyEmpty) {
        await ref.set(
          { projectionStatus: 'PROJECTED', projectedAt: Date.now(), projectedEvidenceCount: 0 },
          { merge: true },
        );
        logger.info('[BaselineReconcile] empty submission — nothing to project', {
          userId, attemptId, totalQuestions: gradedResult.totalQuestions, attempted: 0,
        });
        return { attemptId, projected: true, reason: 'EMPTY_SUBMISSION' };
      }

      logger.error('[BaselineReconcile] COMPLETED submission has no gradedQuestions', {
        userId, attemptId, attempted: gradedResult?.attempted, hasGradedResult: !!gradedResult,
      });
      return { attemptId, projected: false, reason: 'NO_EVIDENCE' };
    }

    /**
     * The projection CONSUMER is switched off, so nothing can be projected — and unlike a normal
     * publish, that is not a guess: the mastery subscriber returns on its first line when the flag
     * is off, so we know with certainty that no mastery will be written.
     *
     * Marking this PROJECTED would therefore be a false claim, and a permanently damaging one:
     * reconciliation skips PROJECTED records as already done, so evidence graded while mastery was
     * disabled would never produce mastery even after the flag was turned on. Left PENDING and
     * eligible instead, so enabling mastery makes the backlog reconcilable rather than lost.
     *
     * Nothing is published either. With mastery off, learning.test_completed has no consumer at
     * all and learning.question_answered has none regardless, so a publish would be pure Redis
     * traffic against a quota-limited tier for zero effect. No write happens here, so the
     * submission simply keeps the PENDING it was created with — no document churn from repeated
     * reconciliation passes.
     *
     * Deliberately AFTER the empty-submission branch above: a legitimately empty submission has
     * genuinely nothing to project and is settled as PROJECTED regardless of the flag. Those two
     * situations must not be conflated — one is "nothing to do", the other is "cannot do it yet".
     */
    if (!(await isMasteryEnabledFor(userId))) {
      logger.info('[BaselineReconcile] mastery disabled; evidence left PENDING and eligible', {
        userId, attemptId, questions: gradedQuestions.length,
      });
      return { attemptId, projected: false, reason: 'MASTERY_DISABLED' };
    }

    // Rebuild the per-topic rollup from the DURABLE verdicts. Skips are excluded from graded
    // evidence exactly as elsewhere: not attempting is a time/avoidance signal, not a knowledge gap.
    const byTopic = new Map<string, { attempted: number; correct: number; skipped: number }>();
    for (const q of gradedQuestions) {
      const topic = q.topic || q.subject || 'General';
      const e = byTopic.get(topic) || { attempted: 0, correct: 0, skipped: 0 };
      if (q.skipped) e.skipped++;
      else if (q.graded) { e.attempted++; if (q.correct) e.correct++; }
      byTopic.set(topic, e);
    }

    const occurredAt = Date.now();
    try {
      // Raw per-question evidence for realtime consumers. Best-effort by design; mastery does
      // not depend on these, which is why losing them is survivable.
      for (const q of gradedQuestions) {
        void eventBus.publish('learning.question_answered', {
          userId,
          questionId: q.questionId,
          subject: q.subject ?? undefined,
          topic: q.topic ?? undefined,
          correct: !!q.correct,
          skipped: !!q.skipped,
          source: 'assignment',
          sourceId: attemptId,
          identityStatus: 'UNANCHORED',
          occurredAt,
        } as any, { eventId: `learning.question_answered:${attemptId}:${q.questionId}` });
      }

      const totalGraded = gradedQuestions.filter((q) => q.graded).length;
      const correctCount = gradedQuestions.filter((q) => q.graded && q.correct).length;

      // The authoritative graded trigger. Same event and same deterministic identity the normal
      // path uses — no baseline-specific mastery lifecycle exists.
      const delivered = await eventBus.publish('learning.test_completed', {
        userId,
        attemptId,
        testId: attemptId,
        subject: undefined,
        totalQuestions: data.gradedResult?.totalQuestions ?? gradedQuestions.length,
        correctCount,
        skippedCount: gradedQuestions.filter((q) => q.skipped).length,
        accuracy: totalGraded > 0 ? Math.round((correctCount / totalGraded) * 100) : 0,
        topicBreakdown: Array.from(byTopic.entries()).map(([topic, s]) => ({
          topic, attempted: s.attempted, correct: s.correct, skipped: s.skipped,
          identityStatus: 'UNANCHORED' as const,
        })),
        occurredAt,
      } as any, { eventId: `learning.test_completed:${attemptId}` });

      // PROJECTED requires the publish to have actually reported success. It previously depended
      // only on publish() not throwing — but publish() swallows its own errors, so the call
      // ALWAYS appeared to succeed. Measured against real Redis with the publisher socket closed:
      // the event reached nobody, mastery was never written, and this line still wrote PROJECTED.
      // Reconciliation then skipped the submission forever as ALREADY_PROJECTED, permanently
      // orphaning intact durable evidence. Leaving it PENDING is the honest outcome: it is
      // recoverable, and PENDING is a valid state meaning "safely graded, projection still owed".
      if (!delivered) {
        logger.error('[BaselineReconcile] publish reported failure; leaving PENDING for retry', {
          userId, attemptId,
        });
        return { attemptId, projected: false, reason: 'PUBLISH_FAILED' };
      }

      // Note the remaining honest limitation: the EventBus does not acknowledge CONSUMER success,
      // so this records "handed off without error", not "mastery definitely wrote". Re-running
      // reconciliation is safe and idempotent, so a stuck submission can always be retried.
      await ref.set({ projectionStatus: 'PROJECTED', projectedAt: Date.now() }, { merge: true });
      logger.info('[BaselineReconcile] projected baseline evidence', {
        userId, attemptId, questions: gradedQuestions.length, correctCount,
      });
      return { attemptId, projected: true };
    } catch (err: any) {
      // Durable evidence is never rolled back — it is already authoritative. Only the projection
      // is owed, and PENDING is preserved so a later run picks it up.
      logger.error('[BaselineReconcile] projection failed; leaving PENDING for retry', {
        userId, attemptId, error: err?.message, code: err?.code,
      });
      return { attemptId, projected: false, reason: 'PUBLISH_FAILED' };
    }
  }

  /**
   * Finds and replays every submission still owing a projection.
   *
   * Uses a collection-group query on the assessments subcollection, filtered on the two
   * projection fields, so it does not scan whole user documents. Firestore will require a
   * composite index on (submissionState, projectionStatus) for this collection group.
   */
  async reconcilePending(limit = 50): Promise<{ scanned: number; projected: number }> {
    const snap = await db.collectionGroup('assessments')
      .where('submissionState', '==', 'COMPLETED')
      .where('projectionStatus', '==', 'PENDING')
      .limit(limit)
      .get();

    let projected = 0;
    for (const doc of snap.docs) {
      const userId = (doc.data() as any)?.userId || doc.ref.parent.parent?.id;
      if (!userId) continue;
      const r = await this.reconcileUser(userId);
      if (r.projected) projected++;
    }
    return { scanned: snap.size, projected };
  }
}

export const baselineReconciliationService = new BaselineReconciliationService();

import { eventBus } from './EventBus';
import { NotificationFactory } from '../notifications/NotificationEngine';
import { logger } from '../../utils/logger';
import { featureFlags } from '../../config/featureFlags';
import { isMasteryEnabledFor } from '../../services/masteryGate';
import { masteryEngine, slugifyConcept } from '../intelligence/MasteryEngine';
import { masteryKeyForNode } from '../../services/learning/nodeMastery.service';

/**
 * Guards against double registration.
 *
 * `eventBus.subscribe()` stores handlers in a Set, but each call to this function builds FRESH
 * closures, so two calls would register two distinct functions for the same event and every
 * handler would run twice — reproducing the exact double-delivery incident that previously
 * doubled every side effect on the platform (duplicate student notifications, duplicate BullMQ
 * enqueues) and would now double-count mastery evidence.
 *
 * Module-scoped rather than a Set-identity trick, because Set dedupe only works if the handler
 * references are identical, which closures never are.
 */
let subscribersRegistered = false;

/**
 * One topic's graded outcome, normalised.
 *
 * The two completion events report a topic row differently — quiz_completed mirrors the persisted
 * QuizAttempt (`correct` / `incorrect` / `unattempted` / `total`), test_completed reports
 * `attempted` / `correct` / `skipped`. Both are true to the record they were computed from, so
 * neither is reshaped at its publisher; they are normalised to this one shape here instead.
 *
 * Getting that wrong is not a subtle bug: feeding a quiz row to the test-shaped reader yields
 * `Array(undefined - correct)` → `Array(NaN)` → RangeError, and the student's evidence is dropped
 * inside a catch. The normaliser at each subscribe site is what prevents that.
 */
interface MasteryEvidenceRow {
  topic: string;
  /** Questions the student actually answered. Skipped/unattempted are EXCLUDED by the caller. */
  attempted: number;
  correct: number;
  syllabusNodeId?: string;
  identityStatus?: 'CANONICAL' | 'UNANCHORED';
}

/**
 * Applies one submission's graded evidence to mastery. THE single mastery write path.
 *
 * Extracted from the test_completed subscriber so quiz_completed can reuse it verbatim rather
 * than growing a second implementation. Two copies of this logic would drift on the keying rule,
 * on the skip rule, or on the idempotency scope — and mastery is cumulative, so a drift does not
 * announce itself; it just quietly produces a different number for one path than the other.
 *
 * Exported (not just used by the two subscribers below) so a one-off reconciliation script can
 * replay a completed submission's durable evidence directly — the same shape baselineReconcili
 * -ation.service.ts already does for the one-time baseline assessment, but ordinary quiz/test
 * completions have no standing reconciliation job, so a manual replay is the only way to recover
 * evidence an EventBus failure already lost before EventBus.publish()'s local-delivery fallback
 * shipped.
 */
export async function applyMasteryEvidence(params: {
  userId: string;
  subject?: string;
  submissionId?: string;
  source: 'quiz' | 'test';
  rows: MasteryEvidenceRow[];
  eventId?: string;
}): Promise<void> {
  const { userId, subject, submissionId, source, rows, eventId } = params;
  if (rows.length === 0) return;

  for (const row of rows) {
    const label = row.topic;
    if (!label) continue;
    // Skipped questions are deliberately excluded: not attempting is an avoidance/time signal,
    // not evidence about knowledge, and counting them as failures would understate mastery for
    // a student who simply ran out of time. Both callers subtract them before arriving here.
    const events: Array<'quiz_correct' | 'quiz_incorrect'> = [
      ...Array(Math.max(0, row.correct)).fill('quiz_correct' as const),
      ...Array(Math.max(0, row.attempted - row.correct)).fill('quiz_incorrect' as const),
    ];
    if (events.length === 0) continue;

    try {
      /*
       * ONE keying scheme, shared with the Stage 2 node-mastery service.
       *
       * Key on the canonical node when the evidence carries one, so mastery aggregates by
       * syllabus location rather than by an LLM-invented label ("Algebra" would otherwise collide
       * across every exam). Falls back to the label slug for unanchored evidence, which keeps
       * legacy records working and distinguishable.
       *
       * An ABSENT node id means the question was never anchored — the validator at generation
       * time (quizGenerator → validateSyllabusNodeId) refuses to produce a question for an
       * INVALID node rather than degrading it to an unanchored one, so nothing malformed reaches
       * this point. The label fallback is therefore honest evidence about an unanchored question,
       * never a guessed syllabus location.
       *
       * This previously used slugifyConcept(nodeId), which ends in .slice(0, 120) — and the
       * disambiguating fingerprint is the LAST segment of a canonical id, so any id over the cap
       * would lose exactly what makes it unique. masteryKeyForNode is lossless and is now the
       * only derivation.
       */
      const conceptKey = row.syllabusNodeId
        ? masteryKeyForNode(row.syllabusNodeId)
        : slugifyConcept(label);
      // Scoped per concept: one submission writes several concept documents, so each needs its
      // own idempotency key or the second topic would look already-processed.
      const perTopicEventId = eventId ? `${eventId}#${conceptKey}` : undefined;
      const { deduplicated } = await masteryEngine.recordBatch(
        userId,
        {
          id: conceptKey,
          title: label,
          subject,
          topic: label,
          syllabusNodeId: row.syllabusNodeId,
        },
        events,
        perTopicEventId,
      );
      logger.info('[Mastery] submission evidence applied', {
        studentId: userId, submissionId, source,
        topic: label, attempts: row.attempted, correct: row.correct,
        deduplicated, eventId,
        // Lets us answer "what share of new evidence is canonical?" without trawling documents.
        identityStatus: row.identityStatus || 'UNANCHORED',
        syllabusNodeId: row.syllabusNodeId,
      });
    } catch (err: any) {
      // Logged loudly (MasteryEngine already logged the underlying failure) but not rethrown:
      // one topic failing to record must not fail the student's submission. Recovery comes from
      // the durable Firestore evidence via reconciliation, NOT from the transient events.
      logger.error('[EventBus] mastery batch failed for topic; evidence NOT recorded', {
        userId, topic: label, submissionId, source, error: err?.message,
      });
    }
  }
}

/**
 * Registers every domain event subscriber. Safe to call more than once: subsequent calls are
 * no-ops and report `registered: false`, so a second bootstrap path (or a stray import) cannot
 * silently double-deliver.
 *
 * WHEN TO CALL: as early in bootstrap as possible, and synchronously. The EventBus subscribes to
 * the Redis channel asynchronously from its own constructor, and delivery is at-most-once with no
 * replay — so any message arriving before these handlers exist is lost permanently. Registering
 * synchronously at startup wins that race deterministically, because the Redis connect is a
 * network round trip.
 */
export function registerEventSubscribers(): { registered: boolean } {
  if (subscribersRegistered) {
    logger.warn('[EventBus] Subscribers already registered; ignoring duplicate registration');
    return { registered: false };
  }
  subscribersRegistered = true;
  logger.info('[EventBus] Registering domain event subscribers');

  // ── Learning evidence → MasteryEngine ──────────────────────────────────────────────────
  // The measurement half of the mentor loop. A graded question outcome moves per-concept
  // mastery through MasteryEngine's pure, EMA-smoothed update — no LLM is consulted about how
  // well the student knows anything. The LLM's job is to explain this evidence later, never to
  // produce it.
  //
  // Gated so the write path can be enabled independently of anything reading it, and so this is
  // a no-op until deliberately turned on. The gate is now PER STUDENT (see masteryGate): the
  // ENABLE_MASTERY env var still enables everyone, and with it unset only students named in the
  // `mastery` flag document are written — which is what makes a first enablement containable.
  // Mastery is aggregated ONCE PER SUBMISSION, from the completion event's topicBreakdown — not
  // once per question. A submission already contains the complete result set, so folding a topic's
  // outcomes into a single atomic write is both correct and simpler than N writes racing on the
  // same document. Measured: the per-question approach persisted 4 graded answers as 2 attempts,
  // because concurrent transactions on one concept contended and the losers were discarded.
  //
  // TWO SUBSCRIBERS, ONE WRITER. Both completion events below funnel into applyMasteryEvidence,
  // which is the only function in the process that writes mastery. nodeMastery.service exports a per-attempt
  // recordAttemptMastery() that writes the same store with the same masteryKeyForNode derivation
  // but a different idempotency key, so the two cannot dedupe against each other. It is kept as a
  // reference implementation and test seam and must not be wired alongside this — see the
  // SUPERSEDED note above it, which records the measurement that made per-submission the choice.
  //
  // learning.question_answered is still emitted for realtime consumers, but note carefully:
  // it is NOT durable and is NOT what makes mastery recomputable. It is a transient message on an
  // at-most-once bus with no persistence, replay or acknowledgement — if delivery fails it is gone.
  // (An earlier version of this comment claimed otherwise; that was wrong.)
  //
  // The durable source of truth is the persisted attempt/graded-result document in Firestore.
  // Mastery is a PROJECTION rebuildable from that, which is what makes reconciliation possible.
  /*
   * Per-student gate on BOTH paths, not just the process-wide env var. ENABLE_MASTERY=true still
   * enables everyone; with it unset, only students named in the `mastery` flag document are
   * written. That makes a first enablement containable — the write path has never run against
   * real traffic, and mastery is cumulative evidence about real people. Shared with
   * baselineReconciliation via one derivation so the three sites cannot disagree.
   *
   * The gate is checked per event, against the userId ON THE EVENT, which is itself derived from
   * the authenticated submission (quiz: the verified token uid; test: the attempt's owner, now
   * verified against the token uid before grading). Mastery is written to
   * users/{that uid}/mastery/{key} — never a shared or global document — so one student's
   * submission can only ever move their own record.
   */
  eventBus.subscribe('learning.test_completed', async (payload, meta) => {
    if (!(await isMasteryEnabledFor(payload.userId))) return;
    await applyMasteryEvidence({
      userId: payload.userId,
      subject: payload.subject,
      submissionId: payload.attemptId,
      source: 'test',
      eventId: meta?.eventId,
      // Already shaped as attempted/correct; `skipped` is excluded by construction.
      rows: (payload.topicBreakdown || []).map((r) => ({
        topic: r.topic,
        attempted: r.attempted,
        correct: r.correct,
        syllabusNodeId: r.syllabusNodeId,
        identityStatus: r.identityStatus,
      })),
    });
  });

  /*
   * ── THE LIVE STUDENT PATH ────────────────────────────────────────────────────────────────
   * This is the event a real student produces. The frontend submits to /quiz/attempts/:id/submit
   * (frontend/src/lib/api/quiz.ts), which reaches quizAttempts.submitAttempt and publishes
   * quiz_completed. Mastery previously subscribed ONLY to test_completed — an event published by
   * the tests subsystem and by baseline reconciliation, neither of which is on the path a student
   * actually walks. The consequence was silent and total: every real quiz produced an event that
   * the mastery engine never saw, so enabling ENABLE_MASTERY would have looked like a clean
   * rollout and written nothing for anyone.
   *
   * NO DOUBLE COUNTING. These two events are published from disjoint sources over disjoint
   * attempt collections — quiz_completed only from quizAttempts.submitAttempt (quiz_attempts),
   * test_completed only from resultAnalysis.processSubmission (test_attempts) and baseline
   * reconciliation. One submission produces exactly one of them, never both. Should that ever
   * change, the eventId prefixes keep the id spaces disjoint and recordBatch dedupes per
   * (concept, eventId) inside the write transaction, so a redelivery of either is discarded.
   */
  eventBus.subscribe('learning.quiz_completed', async (payload, meta) => {
    if (!(await isMasteryEnabledFor(payload.userId))) return;
    await applyMasteryEvidence({
      userId: payload.userId,
      subject: payload.subject,
      submissionId: payload.attemptId,
      source: 'quiz',
      eventId: meta?.eventId,
      rows: (payload.topicBreakdown || []).map((r) => ({
        topic: r.topic,
        // attempted = answered questions only. `unattempted` is dropped here rather than inside
        // applyMasteryEvidence, so the skip rule is applied identically to both shapes.
        attempted: (r.correct || 0) + (r.incorrect || 0),
        correct: r.correct,
        syllabusNodeId: r.syllabusNodeId,
        identityStatus: r.identityStatus,
      })),
    });
  });

  eventBus.subscribe('podcast.completed', async (payload) => {
    const notification = NotificationFactory.createLearningAlert(
      payload.userId,
      'Podcast Ready',
      `Your podcast has been successfully generated (${Math.round(payload.durationMs / 60000)} mins).`,
      `/podcast/${payload.podcastId}`
    );
    await eventBus.publish('notification.created', notification);
  });

  eventBus.subscribe('podcast.failed', async (payload) => {
    const notification = {
      userId: payload.userId,
      category: 'system' as const,
      type: 'podcast.failed',
      title: 'Podcast Generation Failed',
      body: `We couldn't generate your podcast. Reason: ${payload.error}`,
      priority: 'high' as const
    };
    await eventBus.publish('notification.created', notification);
  });

  eventBus.subscribe('user.registered', async (payload) => {
    const notification = {
      userId: payload.userId,
      category: 'administrative' as const,
      type: 'user.welcome',
      title: 'Welcome to Sadhya',
      body: 'Get started by creating your first AI Notebook.',
      priority: 'low' as const
    };
    await eventBus.publish('notification.created', notification);
  });

  eventBus.subscribe('notebook.ingested', async (payload) => {
    const notification = {
      userId: payload.userId,
      category: 'learning' as const,
      type: 'notebook.ready',
      title: 'Knowledge Base Ready',
      body: 'Your notebook has been fully processed and is ready for AI interactions.',
      actionUrl: `/notebooks/${payload.notebookId}`,
      priority: 'medium' as const
    };
    await eventBus.publish('notification.created', notification);
  });

  // ── Automation Studio Trigger Dispatcher ────────────────────────────────────────────────
  // Listens on EventBus for domain events (quiz_completed, test_completed, user.registered, etc.)
  // and dispatches matching active DAG workflows with atomic deduplication.
  try {
    const { automationTriggerDispatcher } = require('../automation/engine/AutomationTriggerDispatcher');
    automationTriggerDispatcher.initialize();
  } catch (err: any) {
    logger.error('[EventBus] Failed to initialize automation trigger dispatcher:', err?.message || err);
  }

  logger.info('[EventBus] Domain event subscribers registered', {
    events: ['learning.test_completed', 'podcast.completed', 'podcast.failed',
             'user.registered', 'notebook.ingested', 'learning.quiz_completed', 'automations.active'],
    // Mastery writes stay inert until the flag is on; logged so startup states which it is
    // rather than leaving it to be inferred.
    masteryEnabled: featureFlags.mastery,
  });
  return { registered: true };
}

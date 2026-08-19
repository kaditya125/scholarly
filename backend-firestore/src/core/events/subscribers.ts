import { eventBus } from './EventBus';
import { NotificationFactory } from '../notifications/NotificationEngine';
import { logger } from '../../utils/logger';
import { featureFlags } from '../../config/featureFlags';
import { masteryEngine, slugifyConcept } from '../intelligence/MasteryEngine';

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
  // Gated on featureFlags.mastery so the write path can be enabled independently of anything
  // reading it, and so this is a no-op until the flag is deliberately turned on.
  // Mastery is aggregated ONCE PER SUBMISSION, from test_completed's topicBreakdown — not once
  // per question. A submission already contains the complete result set, so folding a topic's
  // outcomes into a single atomic write is both correct and simpler than N writes racing on the
  // same document. Measured: the per-question approach persisted 4 graded answers as 2 attempts,
  // because concurrent transactions on one concept contended and the losers were discarded.
  //
  // learning.question_answered is still emitted for realtime consumers, but note carefully:
  // it is NOT durable and is NOT what makes mastery recomputable. It is a transient message on an
  // at-most-once bus with no persistence, replay or acknowledgement — if delivery fails it is gone.
  // (An earlier version of this comment claimed otherwise; that was wrong.)
  //
  // The durable source of truth is the persisted attempt/graded-result document in Firestore.
  // Mastery is a PROJECTION rebuildable from that, which is what makes reconciliation possible.
  eventBus.subscribe('learning.test_completed', async (payload, meta) => {
    if (!featureFlags.mastery) return;
    const breakdown = payload.topicBreakdown || [];
    if (breakdown.length === 0) return;

    for (const row of breakdown) {
      const label = row.topic;
      if (!label) continue;
      // Skipped questions are deliberately excluded: not attempting is an avoidance/time signal,
      // not evidence about knowledge, and counting them as failures would understate mastery for
      // a student who simply ran out of time.
      const events: Array<'quiz_correct' | 'quiz_incorrect'> = [
        ...Array(row.correct).fill('quiz_correct' as const),
        ...Array(Math.max(0, row.attempted - row.correct)).fill('quiz_incorrect' as const),
      ];
      if (events.length === 0) continue;

      try {
        // Key on the canonical node when the evidence carries one, so mastery aggregates by
        // syllabus location rather than by an LLM-invented label ("Algebra" would otherwise
        // collide across every exam). Falls back to the label slug for unanchored evidence,
        // which keeps legacy records working and distinguishable.
        const conceptKey = row.syllabusNodeId ? slugifyConcept(row.syllabusNodeId) : slugifyConcept(label);
        // Scoped per concept: one submission writes several concept documents, so each needs its
        // own idempotency key or the second topic would look already-processed.
        const perTopicEventId = meta?.eventId ? `${meta.eventId}#${conceptKey}` : undefined;
        const { deduplicated } = await masteryEngine.recordBatch(
          payload.userId,
          {
            id: conceptKey,
            title: label,
            subject: payload.subject,
            topic: label,
            syllabusNodeId: row.syllabusNodeId,
          },
          events,
          perTopicEventId,
        );
        logger.info('[Mastery] submission evidence applied', {
          studentId: payload.userId, submissionId: payload.attemptId,
          topic: label, attempts: row.attempted, correct: row.correct,
          deduplicated, eventId: meta?.eventId,
          // Lets us answer "what share of new evidence is canonical?" without trawling documents.
          identityStatus: row.identityStatus || 'UNANCHORED',
          syllabusNodeId: row.syllabusNodeId,
        });
      } catch (err: any) {
        // Logged loudly (MasteryEngine already logged the underlying failure) but not rethrown:
        // one topic failing to record must not fail the student's submission. Recovery comes from
        // the durable Firestore evidence via reconciliation, NOT from the transient events.
        logger.error('[EventBus] mastery batch failed for topic; evidence NOT recorded', {
          userId: payload.userId, topic: label, attemptId: payload.attemptId, error: err?.message,
        });
      }
    }
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

  // More subscribers can be added here as we wire up gamification, notebooks, etc.

  logger.info('[EventBus] Domain event subscribers registered', {
    events: ['learning.test_completed', 'podcast.completed', 'podcast.failed',
             'user.registered', 'notebook.ingested'],
    // Mastery writes stay inert until the flag is on; logged so startup states which it is
    // rather than leaving it to be inferred.
    masteryEnabled: featureFlags.mastery,
  });
  return { registered: true };
}

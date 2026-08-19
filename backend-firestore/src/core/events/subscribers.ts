import { eventBus } from './EventBus';
import { NotificationFactory } from '../notifications/NotificationEngine';
import { logger } from '../../utils/logger';
import { featureFlags } from '../../config/featureFlags';
import { masteryEngine, slugifyConcept } from '../intelligence/MasteryEngine';

export function registerEventSubscribers() {
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
  // learning.question_answered is still emitted and remains the raw evidence stream — it is what
  // makes mastery recomputable if this aggregation ever changes — it simply is not what drives
  // the mastery write.
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
        // one topic failing to record must not fail the student's submission, and the raw
        // question_answered events remain available to recompute from.
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
}

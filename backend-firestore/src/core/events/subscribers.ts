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
  eventBus.subscribe('learning.question_answered', async (payload) => {
    if (!featureFlags.mastery) return;
    // A skipped question is not evidence about knowledge — see the EventBus payload docs.
    if (payload.skipped) return;
    // Mastery is tracked per concept; topic is the finest-grained concept label the question
    // data actually carries today. Without one there is nothing to attribute the result to.
    const label = payload.topic || payload.subject;
    if (!label) return;

    try {
      await masteryEngine.recordEvent(
        payload.userId,
        {
          id: slugifyConcept(label),
          title: label,
          subject: payload.subject,
          topic: payload.topic,
        },
        payload.correct ? 'quiz_correct' : 'quiz_incorrect',
      );
    } catch (err: any) {
      // Never let evidence recording break the request that produced it.
      logger.warn('[EventBus] mastery update failed', { userId: payload.userId, error: err?.message });
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

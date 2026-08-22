/**
 * @file AutomationTriggerDispatcher.ts
 * @description Listens for platform domain events on EventBus and dispatches matching active workflows with atomic deduplication.
 */

import { eventBus, EventType, EventPayloads } from '../../events/EventBus';
import { automationExecutionRepository } from './AutomationExecutionRepository';
import { automationEngine } from './AutomationEngine';
import { env } from '../../../config/env';
import { createClient, RedisClientType } from 'redis';
import { logger } from '../../../utils/logger';

export class AutomationTriggerDispatcher {
  private isSubscribed = false;
  private redisClient: RedisClientType | null = null;
  private inMemoryDedupStore = new Map<string, number>();

  constructor() {
    if (env.REDIS_URL && process.env.DISABLE_WORKERS !== 'true') {
      try {
        this.redisClient = createClient({ url: env.REDIS_URL });
        this.redisClient.connect().catch(err => {
          logger.warn(`[AutomationTriggerDispatcher] Redis connection for deduplication failed: ${err.message}`);
          this.redisClient = null;
        });
      } catch {
        this.redisClient = null;
      }
    }
  }

  /**
   * Checks and acquires an atomic idempotency lock on an event.
   * Returns true if event is NEW; false if event is DUPLICATE.
   */
  async acquireEventLock(eventIdentity: string, ttlSeconds = 86400): Promise<boolean> {
    const key = `automation:dedup:${eventIdentity}`;

    if (this.redisClient && this.redisClient.isOpen) {
      try {
        const res = await this.redisClient.set(key, '1', {
          EX: ttlSeconds,
          NX: true
        });
        return res === 'OK';
      } catch (err: any) {
        logger.warn(`[AutomationTriggerDispatcher] Redis SETNX error: ${err.message}, falling back to in-memory store`);
      }
    }

    // In-memory atomic fallback with TTL
    const now = Date.now();
    const existingExpiry = this.inMemoryDedupStore.get(key);
    if (existingExpiry && existingExpiry > now) {
      return false; // Duplicate
    }

    this.inMemoryDedupStore.set(key, now + ttlSeconds * 1000);
    return true; // Acquired
  }

  /**
   * Initializes event listeners on the shared EventBus.
   */
  public initialize(): void {
    if (this.isSubscribed) return;

    eventBus.subscribe('learning.quiz_completed', async payload => {
      await this.handleDomainEvent('learning.quiz_completed', payload);
    });

    eventBus.subscribe('learning.test_completed', async payload => {
      await this.handleDomainEvent('learning.test_completed', payload);
    });

    eventBus.subscribe('learning.question_answered', async payload => {
      await this.handleDomainEvent('learning.question_answered', payload);
    });

    eventBus.subscribe('user.registered', async payload => {
      await this.handleDomainEvent('user.registered', payload);
    });

    this.isSubscribed = true;
    logger.info('[AutomationTriggerDispatcher] Initialized and subscribed to domain EventBus.');
  }

  /**
   * Evaluates active workflows that trigger on the given event type with atomic deduplication.
   */
  public async handleDomainEvent<T extends EventType>(
    eventType: T,
    payload: EventPayloads[T]
  ): Promise<void> {
    try {
      const p = payload as any;
      const eventIdentity =
        p.eventId ||
        `${eventType}:${p.userId || 'anon'}:${p.attemptId || p.questionId || p.podcastId || p.notebookId || 'default'}`;

      // Atomic Event Deduplication Check
      const isNewEvent = await this.acquireEventLock(eventIdentity);
      if (!isNewEvent) {
        logger.warn(
          `[AutomationTriggerDispatcher] Suppressing DUPLICATE event "${eventType}" (Identity: ${eventIdentity})`
        );
        return;
      }

      logger.info(
        `[AutomationTriggerDispatcher] Processing event "${eventType}" (Identity: ${eventIdentity}) for user ${p.userId}`
      );

      // Query active workflows
      const activeWorkflows = await automationExecutionRepository.listWorkflows();
      const matching = activeWorkflows.filter(
        w =>
          w.status === 'ACTIVE' &&
          w.trigger.type === 'EVENT' &&
          w.trigger.eventType === eventType
      );

      logger.info(
        `[AutomationTriggerDispatcher] Found ${matching.length} active workflow(s) matching event "${eventType}"`
      );

      for (const workflow of matching) {
        automationEngine
          .startExecution(workflow, payload as Record<string, unknown>, {
            studentId: p.userId,
            organizationId: workflow.organizationId,
            teacherId: workflow.teacherId,
            triggeredBy: `event:${eventType}`
          })
          .catch(err => {
            logger.error(
              `[AutomationTriggerDispatcher] Failed executing workflow ${workflow.id}: ${err.message}`
            );
          });
      }
    } catch (err: any) {
      logger.error(`[AutomationTriggerDispatcher] Error handling event ${eventType}: ${err.message}`);
    }
  }
}

export const automationTriggerDispatcher = new AutomationTriggerDispatcher();

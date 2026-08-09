import EventEmitter from 'events';
import { logger } from '../../utils/logger';
import { backgroundQueue } from '../workflow/jobs/BackgroundQueue';
import { env } from '../../config/env';
import { createClient } from 'redis';
import { NotificationPayload } from '../notifications/NotificationEngine';

/**
 * Global Event Types for the Scholarly platform.
 */
export type EventType =
  | 'notification.created'
  | 'podcast.completed'
  | 'podcast.failed'
  | 'notebook.ingested'
  | 'user.registered'
  | 'payment.failed'
  | 'system.maintenance';

export interface EventPayloads {
  'notification.created': NotificationPayload;
  'podcast.completed': { podcastId: string; userId: string; durationMs: number };
  'podcast.failed': { podcastId: string; userId: string; error: string };
  'notebook.ingested': { notebookId: string; userId: string };
  'user.registered': { userId: string; email: string };
  'payment.failed': { userId: string; amount: number; reason: string };
  'system.maintenance': { scheduledFor: string; durationMinutes: number };
}

export class EventBus extends EventEmitter {
  private pubClient: ReturnType<typeof createClient> | null = null;
  private subClient: ReturnType<typeof createClient> | null = null;
  private redisChannel = 'scholarly:events';
  private handlers = new Map<string, Set<(payload: any) => void | Promise<void>>>();
  private isRedisConnected = false;

  constructor() {
    super();
    this.setMaxListeners(50);
    this.initRedisPubSub();
  }

  private async initRedisPubSub() {
    if (process.env.NODE_ENV === 'test' || !env.REDIS_URL) {
      return;
    }
    const redisUrl = env.REDIS_URL;
    try {
      this.pubClient = createClient({ url: redisUrl });
      this.pubClient.on('error', (err) => console.error('[EventBus] pubClient Redis error:', err.message));
      this.subClient = createClient({ url: redisUrl });
      this.subClient.on('error', (err) => console.error('[EventBus] subClient Redis error:', err.message));

      await Promise.all([
        this.pubClient.connect(),
        this.subClient.connect()
      ]);

      this.isRedisConnected = true;
      logger.info(`[EventBus] Redis Pub/Sub connected successfully to ${redisUrl}`);

      // Listen on channel
      await this.subClient.subscribe(this.redisChannel, (message) => {
        try {
          const { event, payload } = JSON.parse(message);
          this.executeHandlers(event, payload);
        } catch (e: any) {
          logger.error(`[EventBus] Failed to parse Redis message: ${e.message}`);
        }
      });
    } catch (e: any) {
      logger.warn(`[EventBus] Redis Pub/Sub init failed, falling back to in-memory EventEmitter. Error: ${e.message}`);
      this.isRedisConnected = false;
    }
  }

  private async executeHandlers(event: string, payload: any) {
    // Emit locally as well
    super.emit(event, payload);

    // Run registered subscribers
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      for (const handler of eventHandlers) {
        try {
          await handler(payload);
        } catch (err: any) {
          logger.error(`[EventBus] Error in subscriber handler for event ${event}: ${err.message}`);
        }
      }
    }
  }

  /**
   * Publishes an event to all internal listeners.
   * If the event should trigger a background job, it enqueues it automatically.
   */
  async publish<T extends EventType>(event: T, payload: EventPayloads[T]): Promise<void> {
    try {
      if (this.isRedisConnected && this.pubClient) {
        // Publish to distributed Redis channel
        await this.pubClient.publish(this.redisChannel, JSON.stringify({ event, payload }));
      } else {
        // Fallback to local execution
        await this.executeHandlers(event, payload);
      }
      
      // Route specific high-level events to the BullMQ background queue for reliable asynchronous processing.
      if (event === 'notification.created') {
        await backgroundQueue.enqueueNotification(payload as NotificationPayload);
      }
      
    } catch (error) {
      logger.error(`[EventBus] Error publishing event ${event}`, { error, payload });
    }
  }

  /**
   * Type-safe listener registration.
   */
  subscribe<T extends EventType>(event: T, handler: (payload: EventPayloads[T]) => void | Promise<void>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    
    // Maintain standard listener mapping as fallback
    this.on(event, handler);
  }

  async close(): Promise<void> {
    if (this.pubClient) await this.pubClient.quit();
    if (this.subClient) await this.subClient.quit();
    this.isRedisConnected = false;
  }
}

export const eventBus = new EventBus();

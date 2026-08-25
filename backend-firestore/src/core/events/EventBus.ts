import EventEmitter from 'events';
import { redactUrlCredentials } from '../../utils/redactUrl';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import { backgroundQueue } from '../workflow/jobs/BackgroundQueue';
import { env } from '../../config/env';
import { createClient } from 'redis';
import { NotificationPayload } from '../notifications/NotificationEngine';
import { noteRedisError } from '../../services/redisQuota';

/**
 * Global Event Types for the Sadhya platform.
 */
export type EventType =
  | 'notification.created'
  | 'podcast.completed'
  | 'podcast.failed'
  | 'notebook.ingested'
  | 'user.registered'
  | 'payment.failed'
  | 'system.maintenance'
  // ── Learning events ────────────────────────────────────────────────────────────────────
  // The evidence backbone for the AI mentor. Each payload must carry enough DETERMINISTIC
  // detail for a downstream service to compute learning state without asking an LLM anything —
  // that is the whole point: measurement is calculated, only the explanation is generated.
  //
  // Deliberately a small set. The taxonomy discussed covered ~20 events; these are the ones the
  // app can actually emit truthfully today from data it already has. Events we cannot populate
  // honestly (revision.*, session.missed, topic.*) are omitted rather than emitted empty —
  // an event with invented fields is the same failure as an invented metric.
  | 'learning.question_answered'
  | 'learning.quiz_completed'
  | 'learning.test_completed'
  | 'learning.goal_set';

export interface EventPayloads {
  'notification.created': NotificationPayload;
  'podcast.completed': { podcastId: string; userId: string; durationMs: number };
  'podcast.failed': { podcastId: string; userId: string; error: string };
  'notebook.ingested': { notebookId: string; userId: string };
  'user.registered': { userId: string; email: string };
  'payment.failed': { userId: string; amount: number; reason: string };
  'system.maintenance': { scheduledFor: string; durationMinutes: number };

  /**
   * One graded question outcome. The atom of the evidence loop — everything about topic mastery
   * is ultimately derived from a stream of these.
   *
   * `skipped` is distinct from `correct: false` on purpose: leaving a question unattempted is an
   * avoidance/time signal, not a knowledge gap, and conflating them would inflate apparent
   * weakness for a student who simply ran out of time.
   */
  'learning.question_answered': {
    userId: string;
    questionId: string;
    subject?: string;
    topic?: string;
    difficulty?: string;
    correct: boolean;
    skipped: boolean;
    timeSpentSeconds?: number;
    /**
     * Canonical syllabus identity CARRIED from the question — never reconstructed from `topic`.
     * Optional because unanchored/legacy questions legitimately have none; identityStatus says
     * which, so consumers never have to infer meaning from absence.
     */
    syllabusNodeId?: string;
    syllabusId?: string;
    cycleId?: string;
    identityStatus?: 'CANONICAL' | 'UNANCHORED';
    /** Where this came from, so a weakness can cite corroboration across sources. */
    source: 'quiz' | 'test' | 'assignment' | 'practice';
    sourceId?: string;
    occurredAt: number;
  };

  /** Aggregate of one quiz attempt. Per-question detail arrives via question_answered. */
  'learning.quiz_completed': {
    userId: string;
    attemptId: string;
    subject?: string;
    topic?: string;
    totalQuestions: number;
    correctCount: number;
    skippedCount: number;
    accuracy: number; // 0..100
    totalTimeSeconds?: number;
    occurredAt: number;
  };

  /**
   * The student declared or changed their target. Carries only what downstream needs to
   * invalidate derived state — never the full goal, and never treated as evidence about
   * performance. Changing a goal reinterprets history; it does not rewrite it.
   */
  'learning.goal_set': {
    userId: string;
    created: boolean; // false = updated an existing goal
    examId?: string;
    goalKind: 'score' | 'rank' | 'percentile';
    occurredAt: number;
  };

  /** Aggregate of one test/mock attempt. */
  'learning.test_completed': {
    userId: string;
    attemptId: string;
    testId: string;
    subject?: string;
    totalQuestions: number;
    correctCount: number;
    skippedCount: number;
    accuracy: number; // 0..100
    score?: number;
    totalTimeSeconds?: number;
    /** Per-topic rollup computed at submission, so consumers need not refetch questions. */
    /**
     * Per-topic rollup. Carries canonical identity per row so the authoritative mastery
     * aggregation can key on the syllabus node rather than a label.
     */
    topicBreakdown?: Array<{
      topic: string;
      attempted: number;
      correct: number;
      skipped: number;
      syllabusNodeId?: string;
      syllabusId?: string;
      cycleId?: string;
      identityStatus?: 'CANONICAL' | 'UNANCHORED';
    }>;
    occurredAt: number;
  };
}

/**
 * ── EventBus delivery contract ────────────────────────────────────────────────────────────
 *
 * TRANSPORT (unchanged, and already correct): Redis pub/sub is authoritative when connected.
 * publish() writes ONLY to the Redis channel; it does not also dispatch locally. Redis echoes
 * the message back to every subscriber including the publishing process, and that echo is what
 * invokes handlers. With no REDIS_URL (or NODE_ENV=test) publish() falls back to dispatching
 * in-process so single-node and test runs behave the same.
 *
 * DISPATCH: exactly one invocation per handler per delivered message.
 *   - subscribe() handlers  → dispatched via the `handlers` Map, and AWAITED.
 *   - eventBus.on() listeners → dispatched via super.emit(), fire-and-forget.
 * A handler registered through subscribe() is NOT also registered as an EventEmitter listener;
 * doing both is what caused every handler to run twice.
 *
 * DELIVERY SEMANTICS: **at-most-once**, honestly stated. Redis pub/sub is fire-and-forget with
 * no acknowledgement, no persistence and no replay: a message published while a subscriber is
 * disconnected, restarting, or mid-reconnect is lost permanently. We do NOT claim exactly-once
 * physical delivery, because the infrastructure cannot provide it.
 *
 * ORDERING: per-publisher order is preserved by Redis on a single channel, but concurrent
 * publishers interleave arbitrarily. Consumers must not depend on cross-publisher ordering.
 *
 * RETRIES / FAILURE: none at this layer. A throwing handler is logged and swallowed so one bad
 * subscriber cannot break others; it is NOT retried and the publisher is not informed. Work that
 * must survive failure belongs on the BullMQ queue (see enqueueNotification), which has
 * persistence and retries — not on this bus.
 *
 * IDEMPOTENCY: required of consumers. Because delivery is at-most-once with no dedupe, and
 * because a process can legitimately receive a message it also published, any consumer whose
 * handler is not naturally idempotent must guard its own side effects. For learning evidence
 * specifically, the mutation must be keyed on event identity so a repeated delivery cannot
 * apply the same evidence twice.
 */
/** Envelope metadata that travels with an event through Redis to every handler. */
export interface EventMeta {
  /** Stable identity of the LOGICAL event. Never regenerated after publish. */
  eventId: string;
  correlationId?: string;
  publishedAt: number;
}

export class EventBus extends EventEmitter {
  private pubClient: ReturnType<typeof createClient> | null = null;
  private subClient: ReturnType<typeof createClient> | null = null;
  private redisChannel = 'sadhya:events';
  private handlers = new Map<string, Set<(payload: any, meta?: EventMeta) => void | Promise<void>>>();
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
      // Routed through the shared breaker: while the request allowance is exhausted every
      // command fails, and logging each one drowns the signal. The breaker reports it once.
      this.pubClient.on('error', (err: any) => {
        if (!noteRedisError(err, 'EventBus.pubClient')) {
          console.error('[EventBus] pubClient Redis error:', err?.message ?? err);
        }
      });
      this.subClient = createClient({ url: redisUrl });
      // Routed through the shared breaker: while the request allowance is exhausted every
      // command fails, and logging each one drowns the signal. The breaker reports it once.
      this.subClient.on('error', (err: any) => {
        if (!noteRedisError(err, 'EventBus.subClient')) {
          console.error('[EventBus] subClient Redis error:', err?.message ?? err);
        }
      });

      await Promise.all([
        this.pubClient.connect(),
        this.subClient.connect()
      ]);

      this.isRedisConnected = true;
      // Redacted: this logged the full connection string, password included, on every boot.
      logger.info(`[EventBus] Redis Pub/Sub connected successfully to ${redactUrlCredentials(redisUrl)}`);

      // Listen on channel
      await this.subClient.subscribe(this.redisChannel, (message) => {
        try {
          // eventId is carried through serialization, never regenerated here — regenerating on
          // receive would defeat deduplication entirely, since each delivery would look new.
          const { event, payload, meta } = JSON.parse(message);
          this.executeHandlers(event, payload, meta);
        } catch (e: any) {
          logger.error(`[EventBus] Failed to parse Redis message: ${e.message}`);
        }
      });
    } catch (e: any) {
      logger.warn(`[EventBus] Redis Pub/Sub init failed, falling back to in-memory EventEmitter. Error: ${e.message}`);
      this.isRedisConnected = false;
    }
  }

  private async executeHandlers(event: string, payload: any, meta?: EventMeta) {
    // Emit locally as well
    super.emit(event, payload);

    // Run registered subscribers
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      for (const handler of eventHandlers) {
        try {
          await handler(payload, meta);
        } catch (err: any) {
          logger.error(`[EventBus] Error in subscriber handler for event ${event}: ${err.message}`);
        }
      }
    }
  }

  /**
   * Publishes an event to all internal listeners.
   * If the event should trigger a background job, it enqueues it automatically.
   *
   * RETURNS whether the publish path completed without error — `true` means the message was
   * handed to Redis (or dispatched locally in the fallback) with no exception; `false` means it
   * was NOT. It deliberately does NOT mean "a consumer processed it": this bus has no
   * acknowledgement, so no publisher can honestly claim that.
   *
   * Errors are still swallowed rather than thrown, because most callers publish fire-and-forget
   * (`void eventBus.publish(...)`) and throwing would turn a lost notification into an unhandled
   * rejection. The boolean is purely additive — every existing caller ignores it and is
   * unaffected — but it lets a caller that records durable state from the outcome tell success
   * from failure instead of assuming success.
   *
   * This gap was measured, not theorised: with the socket closed under a still-true connected
   * flag, publish() logged the failure and returned normally, so baseline reconciliation marked
   * `projectionStatus: 'PROJECTED'` for a submission whose event reached nobody — and then
   * refused to retry it, because the status said the work was already done. Durable evidence
   * survived, but it was permanently orphaned: exactly the fabricated-state failure this
   * programme exists to eliminate, arriving through a path where nothing downstream could tell.
   */
  async publish<T extends EventType>(
    event: T,
    payload: EventPayloads[T],
    options?: { eventId?: string; correlationId?: string },
  ): Promise<boolean> {
    try {
      // Identity is assigned ONCE here, at the point the logical event is created, and travels
      // with it for the rest of its life. Publishers supply a DETERMINISTIC id derived from the
      // domain (e.g. `learning.test_completed:{attemptId}`) so that a republish of the same
      // logical event — after a retry, redeploy or process restart — carries the same id and is
      // recognised as a duplicate. A random id would make every republish look novel.
      // The uuid fallback covers events with no natural key, where at-most-once is acceptable.
      const meta: EventMeta = {
        eventId: options?.eventId || `${event}:${randomUUID()}`,
        correlationId: options?.correlationId,
        publishedAt: Date.now(),
      };

      if (this.isRedisConnected && this.pubClient) {
        // Publish to distributed Redis channel
        await this.pubClient.publish(this.redisChannel, JSON.stringify({ event, payload, meta }));
      } else {
        // Fallback to local execution
        await this.executeHandlers(event, payload, meta);
      }
      
      // Route specific high-level events to the BullMQ background queue for reliable asynchronous processing.
      if (event === 'notification.created') {
        await backgroundQueue.enqueueNotification(payload as NotificationPayload);
      }

      return true;
    } catch (error) {
      logger.error(`[EventBus] Error publishing event ${event}`, { error, payload });
      return false;
    }
  }

  /**
   * Type-safe listener registration.
   */
  subscribe<T extends EventType>(
    event: T,
    handler: (payload: EventPayloads[T], meta?: EventMeta) => void | Promise<void>,
  ): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // NOTE: deliberately NOT also calling `this.on(event, handler)`.
    //
    // executeHandlers() dispatches through two paths — super.emit() for raw EventEmitter
    // listeners, and this handlers Map for subscribe() handlers. Registering here in BOTH
    // places meant every subscribe() handler ran twice per event: measured as 4 publishes ->
    // 8 handler invocations against production Redis.
    //
    // That silently doubled every side effect on the platform, not just mastery: each
    // podcast.completed / notebook.ingested / user.registered handler published
    // notification.created twice, so students received duplicate notifications and each was
    // enqueued to BullMQ twice.
    //
    // The Map is the correct home for these: it is the only path that AWAITS async handlers.
    // super.emit() is fire-and-forget, so an async subscriber's failure there is unobservable.
  }

  async close(): Promise<void> {
    if (this.pubClient) await this.pubClient.quit();
    if (this.subClient) await this.subClient.quit();
    this.isRedisConnected = false;
  }
}

export const eventBus = new EventBus();

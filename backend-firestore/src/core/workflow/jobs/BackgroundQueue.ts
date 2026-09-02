import { Queue } from 'bullmq';
import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { NotificationPayload } from '../../notifications/NotificationEngine';

// Job Payload Interfaces
export interface WorkflowPostExecutionPayload {
  userId: string;
  traceId?: string;
  executionTime: number;
  shouldBypassMemory: boolean;
  req: any; // Serialized WorkflowRequest
  finalReply: string;
}

export interface SessionGenerateTitlePayload {
  sessionId: string;
  messages: any[]; // Serialized messages
}

export interface GenericJobPayload {
  [key: string]: any;
}

// Guard helpers shared with the worker classes — kept inline here so a stale
// edit in one file can't drift from the others. The two rules:
//   1) REDIS_URL must be set (no silent localhost fallback — it lies about
//      whether a broker is reachable and burns 30 minutes the first time a
//      dev box has Memurai 3.x answering on :6379, which is what was happening
//      in the boot log: "Redis version needs to be greater or equal than 5.0.0
//      Current: 3.0.504" / "ERR unknown command 'HELLO'" on every retry).
//   2) DISABLE_WORKERS=true short-circuits everything (test runs, smoke tests,
//      CI without a Redis sidecar, dev boxes that don't need queue traffic).
export const isQueueBrokerEnabled = (): boolean =>
  Boolean(env.REDIS_URL) && process.env.DISABLE_WORKERS !== 'true';

/**
 * How long a notification's deduplication key is held, in ms.
 *
 * It only has to span the spread between N API instances receiving the SAME Redis broadcast and
 * each reaching its enqueue — milliseconds in practice. Ten minutes is deliberately generous
 * because a dedupe id names ONE logical event (see EventBus.publish), so a longer window can
 * never suppress a genuinely different notification; the only cost is a short-lived Redis key.
 */
const NOTIFICATION_DEDUPE_TTL_MS = 10 * 60 * 1000;

const queueBrokerDisabledReason = (): string =>
  !env.REDIS_URL
    ? 'REDIS_URL not set'
    : process.env.DISABLE_WORKERS === 'true'
      ? 'DISABLE_WORKERS=true'
      : 'unknown';

export class BackgroundQueue {
  public queue: Queue | null;
  public mediaQueue: Queue | null;
  public notificationQueue: Queue | null;
  public scheduledNotificationQueue: Queue | null;

  constructor() {
    if (!isQueueBrokerEnabled()) {
      // All enqueue* methods already null-check `this.queue` etc., so safe to
      // leave null and turn every enqueue call into a silent no-op until a
      // broker is configured.
      this.queue = null;
      this.mediaQueue = null;
      this.notificationQueue = null;
      this.scheduledNotificationQueue = null;
      logger.info(
        `[BackgroundQueue] Skipping Redis connection (${queueBrokerDisabledReason()}). ` +
        'All enqueue* calls become no-ops. To enable workers, set REDIS_URL to a Redis ≥ 6.0 ' +
        'instance (BullMQ uses HELLO at init and fails on 3.x/5.x).'
      );
      return;
    }
    const connection = { url: env.REDIS_URL! };
    this.queue = new Queue('background-jobs', { connection });
    this.mediaQueue = new Queue('media-jobs', { connection });
    this.notificationQueue = new Queue(process.env.NOTIFICATION_QUEUE_NAME || 'notification-jobs', { connection });
    this.scheduledNotificationQueue = new Queue('scheduled-notifications', { connection });
    logger.info(`[BackgroundQueue] Initialized. Queue name: ${process.env.NOTIFICATION_QUEUE_NAME || 'notification-jobs'}. Connecting to ${env.REDIS_URL}`);
  }

  async enqueueWorkflowPostExecution(payload: WorkflowPostExecutionPayload, retries = 3, backoffMs = 1000): Promise<void> {
    if (!this.queue) return;
    await this.queue.add('workflow.post_execution', payload, {
      attempts: retries,
      backoff: { type: 'exponential', delay: backoffMs },
      removeOnComplete: true,
      removeOnFail: 100
    });
  }

  async enqueueSessionGenerateTitle(payload: SessionGenerateTitlePayload, retries = 3, backoffMs = 1000): Promise<void> {
    if (!this.queue) return;
    await this.queue.add('session.generateTitle', payload, {
      attempts: retries,
      backoff: { type: 'exponential', delay: backoffMs },
      removeOnComplete: true,
      removeOnFail: 100
    });
  }

  async enqueueGeneric(jobName: string, payload: GenericJobPayload, retries = 3, backoffMs = 5000): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(jobName, payload, {
      attempts: retries,
      backoff: { type: 'exponential', delay: backoffMs },
      removeOnComplete: true,
      removeOnFail: 100
    });
  }

  async enqueueMediaJob(jobName: string, payload: GenericJobPayload, retries = 3, backoffMs = 5000): Promise<void> {
    if (!this.mediaQueue) return;
    await this.mediaQueue.add(jobName, payload, {
      attempts: retries,
      backoff: { type: 'exponential', delay: backoffMs },
      removeOnComplete: true,
      removeOnFail: 100
    });
  }

  /**
   * `dedupeId`, when supplied, makes this enqueue idempotent for the logical event it names:
   * concurrent enqueues carrying the same id collapse to ONE job. Callers that have no stable
   * identity omit it and get today's behaviour (one job per call) unchanged.
   *
   * WHY `deduplication` AND NOT A DETERMINISTIC `jobId` — both were evaluated, and jobId fails
   * twice over:
   *   1. BullMQ rejects it outright. A custom job id may not contain ':' ("Custom Id cannot
   *      contain :", bullmq/classes/job.js), and every id we would derive one from is an
   *      EventBus eventId, which is always `${event}:${...}`. It would throw, not dedupe.
   *   2. Even escaped, jobId dedupe only holds while the job RECORD exists. `removeOnComplete`
   *      is true below, so the record is deleted the moment the job finishes — a duplicate
   *      arriving after that would create a second job and a second notification, which is the
   *      exact bug this guards against.
   * The deduplication key is a separate `SET <key> <jobId> PX <ttl> NX` (an atomic Redis
   * compare-and-set, so it is safe across instances) whose lifetime is the TTL, independent of
   * the job's lifecycle. That closes both gaps.
   *
   * DO NOT pass a dedupeId from NotificationWorker's quiet-hours reschedule. That path
   * deliberately re-enqueues the SAME payload with a delay, so a dedupe id derived from it would
   * match the still-live key of the job being rescheduled, the re-add would be swallowed, and the
   * notification would be silently dropped rather than delivered later.
   */
  async enqueueNotification(
    payload: NotificationPayload,
    retries = 3,
    backoffMs = 1000,
    delayMs = 0,
    dedupeId?: string,
  ): Promise<void> {
    if (!this.notificationQueue) return;
    await this.notificationQueue.add('notification.process', payload, {
      attempts: retries,
      backoff: { type: 'exponential', delay: backoffMs },
      removeOnComplete: true,
      removeOnFail: 100,
      delay: delayMs,
      ...(dedupeId ? { deduplication: { id: dedupeId, ttl: NOTIFICATION_DEDUPE_TTL_MS } } : {}),
    });
  }

  async close(): Promise<void> {
    try {
      if (this.queue) await this.queue.close();
      if (this.mediaQueue) await this.mediaQueue.close();
      if (this.notificationQueue) await this.notificationQueue.close();
      if (this.scheduledNotificationQueue) await this.scheduledNotificationQueue.close();
    } catch (e: any) {
      logger.warn('[BackgroundQueue] Closed queues (suppressed Redis error during shutdown)');
    }
  }
}

// Re-export the guard helpers so the worker classes can import them with
// zero risk of drift between queue and worker behavior.
export { queueBrokerDisabledReason };

export const backgroundQueue = new BackgroundQueue();

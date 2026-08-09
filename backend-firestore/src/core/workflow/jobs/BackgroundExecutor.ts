import { logger } from '../../../utils/logger';

/**
 * A unit of deferred work run off the request's critical path.
 *  - `run`        the async work (should be idempotent-ish; may be retried).
 *  - `retries`    max RETRY attempts after the first try (default 2 => up to 3 runs).
 *  - `backoffMs`  base delay for exponential backoff between attempts (default 500ms).
 *  - `traceId`    correlation id for structured logs.
 */
export interface BackgroundJob {
  name: string;
  run: () => Promise<void>;
  retries?: number;
  backoffMs?: number;
  traceId?: string;
}

export interface IBackgroundExecutor {
  /** Fire-and-forget: schedule a job. Never throws; failures are retried then logged. */
  enqueue(job: BackgroundJob): void;
}

interface ExecutorStats {
  enqueued: number;
  completed: number;
  failed: number;
  retried: number;
  pending: number;
  active: number;
}

/**
 * Lightweight in-process background task executor (Task 5).
 *
 * Intentionally NOT Temporal / Kafka / BullMQ — just an internal async job runner with
 * enqueue / process / retry and a concurrency cap. It exists so latency-irrelevant work
 * (telemetry, analytics, memory update, profile extraction, session titles) can be moved
 * OFF the user's critical path without being lost, while keeping a clean seam for a future
 * durable-queue migration: swap this class for a Cloud Tasks / queue-backed implementation
 * of `IBackgroundExecutor` and nothing else changes.
 *
 * Guarantees:
 *   - `enqueue` never throws and never blocks the caller.
 *   - a failing job is retried with exponential backoff up to `retries` times.
 *   - a job that still fails is logged (structured) and dropped — it can never crash the process.
 */
export class BackgroundExecutor implements IBackgroundExecutor {
  private queue: BackgroundJob[] = [];
  private active = 0;
  private readonly concurrency: number;
  private stats: ExecutorStats = { enqueued: 0, completed: 0, failed: 0, retried: 0, pending: 0, active: 0 };
  /** Resolvers waiting on `onIdle()` — settled when the queue fully drains. */
  private idleWaiters: Array<() => void> = [];

  constructor(concurrency = 4) {
    this.concurrency = Math.max(1, concurrency);
  }

  enqueue(job: BackgroundJob): void {
    this.stats.enqueued++;
    this.queue.push(job);
    // Schedule the pump on the next tick so enqueue always returns immediately.
    setImmediate(() => this.pump());
  }

  /** Current counters (for tests / observability). */
  getStats(): Readonly<ExecutorStats> {
    return { ...this.stats, pending: this.queue.length, active: this.active };
  }

  /** Resolves once the queue is empty AND no job is in flight. Primarily for tests/shutdown. */
  onIdle(): Promise<void> {
    if (this.queue.length === 0 && this.active === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.active++;
      // Detach: run without awaiting so the pump can fill remaining slots.
      void this.runJob(job).finally(() => {
        this.active--;
        if (this.queue.length > 0) this.pump();
        else if (this.active === 0) this.settleIdle();
      });
    }
    if (this.queue.length === 0 && this.active === 0) this.settleIdle();
  }

  private settleIdle(): void {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private async runJob(job: BackgroundJob): Promise<void> {
    const maxRetries = Math.max(0, job.retries ?? 2);
    const baseBackoff = Math.max(0, job.backoffMs ?? 500);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await job.run();
        this.stats.completed++;
        return;
      } catch (err: any) {
        const isLast = attempt === maxRetries;
        if (isLast) {
          this.stats.failed++;
          logger.error(`[BackgroundExecutor] job "${job.name}" failed after ${attempt + 1} attempt(s)`, {
            traceId: job.traceId,
            error: err?.message || String(err),
          });
          return; // swallow — background work must never crash the process
        }
        this.stats.retried++;
        logger.warn(`[BackgroundExecutor] job "${job.name}" attempt ${attempt + 1} failed, retrying`, {
          traceId: job.traceId,
          error: err?.message || String(err),
        });
        if (baseBackoff > 0) {
          await new Promise((r) => setTimeout(r, baseBackoff * Math.pow(2, attempt)));
        }
      }
    }
  }
}

/** Shared process-wide executor used by the workflow. */
export const backgroundExecutor = new BackgroundExecutor();

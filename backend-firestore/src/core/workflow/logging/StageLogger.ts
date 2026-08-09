import { logger } from '../../../utils/logger';

/**
 * Structured per-stage logging for the workflow (Task 8).
 *
 * Replaces scattered `console.log`/`console.warn` in the pipeline with consistent,
 * trace-correlated structured logs. Every stage emits:
 *   - start   (stage name + traceId)
 *   - end     (stage name + duration + traceId)  — or —
 *   - error   (stage name + duration + error + traceId)
 *
 * It is a thin wrapper over the existing winston `logger`, so log formatting/transport
 * is unchanged. Purely additive — it does not alter control flow or swallow errors
 * (errors are logged then re-thrown so callers keep their existing behavior).
 */
export class StageLogger {
  private readonly traceId?: string;
  private readonly requestId?: string;

  constructor(traceId?: string, requestId?: string) {
    this.traceId = traceId;
    this.requestId = requestId;
  }

  /** Correlation fields stamped on every structured log this instance emits. */
  private base(stage: string, extra?: Record<string, unknown>) {
    return { traceId: this.traceId, requestId: this.requestId, stage, ...extra };
  }

  /** Log a one-off structured event within a stage (no timing). */
  event(stage: string, message: string, data?: Record<string, unknown>): void {
    logger.info(`[workflow] ${stage}: ${message}`, this.base(stage, data));
  }

  /** Log a non-fatal warning within a stage. */
  warn(stage: string, message: string, data?: Record<string, unknown>): void {
    logger.warn(`[workflow] ${stage}: ${message}`, this.base(stage, data));
  }

  /**
   * Runs `fn` as a timed stage, logging start + end(duration, success) or error(duration).
   * Re-throws on error so control flow is identical to un-instrumented code.
   * `data` may carry stage attributes such as `provider`, `retries`, etc.
   */
  async stage<T>(name: string, fn: () => Promise<T>, data?: Record<string, unknown>): Promise<T> {
    const start = Date.now();
    logger.debug(`[workflow] ${name}: start`, this.base(name, { phase: 'start', ...data }));
    try {
      const result = await fn();
      logger.info(`[workflow] ${name}: end`, this.base(name, { phase: 'end', success: true, durationMs: Date.now() - start, ...data }));
      return result;
    } catch (err: any) {
      logger.error(`[workflow] ${name}: error`, this.base(name, {
        phase: 'error', success: false, durationMs: Date.now() - start,
        errorType: err?.name || 'Error', error: err?.message || String(err), ...data,
      }));
      throw err;
    }
  }

  /**
   * Like `stage`, but for async generators so streaming stages can be instrumented
   * without buffering. Yields through unchanged; logs start, end(duration, success) or error.
   */
  async *streamStage<T>(name: string, gen: AsyncGenerator<T>, data?: Record<string, unknown>): AsyncGenerator<T> {
    const start = Date.now();
    logger.debug(`[workflow] ${name}: start`, this.base(name, { phase: 'start', ...data }));
    try {
      for await (const item of gen) {
        yield item;
      }
      logger.info(`[workflow] ${name}: end`, this.base(name, { phase: 'end', success: true, durationMs: Date.now() - start, ...data }));
    } catch (err: any) {
      logger.error(`[workflow] ${name}: error`, this.base(name, {
        phase: 'error', success: false, durationMs: Date.now() - start,
        errorType: err?.name || 'Error', error: err?.message || String(err), ...data,
      }));
      throw err;
    }
  }
}

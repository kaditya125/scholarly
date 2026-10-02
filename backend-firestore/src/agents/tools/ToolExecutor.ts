import { randomUUID } from 'crypto';
import { Telemetry } from '../../lib/telemetry';
import { FailureClass, ToolCallRecord } from '../runtime/agent.types';
import { ToolContext, ToolRegistry, ToolResult } from './ToolRegistry';
import { RETRYABLE_FAILURES, ToolError, classifyError } from './toolErrors';

/**
 * ToolExecutor — the only way a registered tool is ever invoked.
 *
 * Per call it: validates input against the tool's schema, charges the run's budget, enforces the
 * tool's timeout, honours cancellation, validates the output shape, retries only transient failures
 * of idempotent tools (with backoff), and returns a ToolCallRecord for every attempt. It never
 * throws for a tool failure — the caller always gets a classified outcome it can act on.
 */

/** Budget hooks supplied by the run executor. */
export interface BudgetMeter {
  /** Called before every attempt. Throws ToolError('budget') when the run may not make another call. */
  beforeToolCall(): void;
  /** Adds the attempt's token / cost usage to the run. */
  recordUsage(usage: { tokens: number; costUsd: number }): void;
}

export interface ToolExecutionOutcome {
  ok: boolean;
  result?: ToolResult<unknown>;
  failureClass?: FailureClass;
  /** Internal detail for logs and the tool_calls record — not student-facing. */
  errorMessage?: string;
  attempts: number;
  calls: ToolCallRecord[];
}

export interface ToolExecutorOptions {
  /** Injected for tests. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Injected for tests; defaults to Telemetry-window estimation. */
  estimateUsage?: (startIso: string, userId: string) => { tokens: number; costUsd: number };
}

const INPUT_PREVIEW_CHARS = 500;
const ERROR_MESSAGE_CHARS = 300;

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ToolError('cancelled', 'cancelled'));
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ToolError('cancelled', 'cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Races the tool against its timeout and the run's cancellation signal. */
export function runWithTimeout<T>(fn: () => Promise<T>, ms: number, signal: AbortSignal, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(new ToolError('cancelled', 'cancelled'));
    let settled = false;
    const finish = () => {
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      finish();
      reject(new ToolError('timeout', `${label} timed out after ${ms}ms`));
    }, ms);
    const onAbort = () => {
      if (settled) return;
      finish();
      reject(new ToolError('cancelled', 'cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    let promise: Promise<T>;
    try {
      promise = fn();
    } catch (e) {
      finish();
      reject(e);
      return;
    }
    promise.then(
      (v) => {
        if (settled) return;
        finish();
        resolve(v);
      },
      (e) => {
        if (settled) return;
        finish();
        reject(e);
      },
    );
  });
}

/**
 * Best-effort usage attribution: sums provider cost events recorded since `startIso` for this user
 * (or with no user attached). Concurrent requests can blur this, so it is used for budget
 * enforcement and telemetry only — tools that know their exact usage report it themselves.
 */
export function estimateUsageFromTelemetry(startIso: string, userId: string): { tokens: number; costUsd: number } {
  let tokens = 0;
  let costUsd = 0;
  const costs = Telemetry.costs as Array<{ timestamp?: string; tokens?: number; cost?: number; userId?: string }>;
  for (let i = costs.length - 1; i >= 0; i--) {
    const entry = costs[i];
    if (!entry?.timestamp || entry.timestamp < startIso) break;
    if (entry.userId && entry.userId !== userId) continue;
    tokens += Number(entry.tokens || 0);
    costUsd += Number(entry.cost || 0);
  }
  return { tokens, costUsd };
}

function zodMessage(error: { issues: Array<{ path: (string | number)[]; message: string }> }): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

export class ToolExecutor {
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private readonly estimateUsage: (startIso: string, userId: string) => { tokens: number; costUsd: number };

  constructor(private readonly registry: ToolRegistry, opts: ToolExecutorOptions = {}) {
    this.sleep = opts.sleep ?? abortableSleep;
    this.estimateUsage = opts.estimateUsage ?? estimateUsageFromTelemetry;
  }

  async execute(
    toolName: string,
    rawInput: Record<string, unknown>,
    ctx: ToolContext,
    meter: BudgetMeter,
  ): Promise<ToolExecutionOutcome> {
    const tool = this.registry.get(toolName);
    if (!tool) {
      return { ok: false, failureClass: 'validation', errorMessage: `unregistered tool: ${toolName}`, attempts: 0, calls: [] };
    }

    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        failureClass: 'validation',
        errorMessage: `invalid input for ${toolName}: ${zodMessage(parsed.error)}`,
        attempts: 0,
        calls: [],
      };
    }

    const inputPreview = JSON.stringify(parsed.data).slice(0, INPUT_PREVIEW_CHARS);
    const calls: ToolCallRecord[] = [];

    for (let attempt = 1; attempt <= tool.retry.maxAttempts; attempt++) {
      if (ctx.signal.aborted) {
        return { ok: false, failureClass: 'cancelled', errorMessage: 'cancelled', attempts: attempt - 1, calls };
      }
      try {
        meter.beforeToolCall();
      } catch (e: any) {
        return {
          ok: false,
          failureClass: 'budget',
          errorMessage: String(e?.message ?? 'budget exhausted').slice(0, ERROR_MESSAGE_CHARS),
          attempts: attempt - 1,
          calls,
        };
      }

      const startedAt = Date.now();
      const startIso = new Date(startedAt).toISOString();
      try {
        const result = await runWithTimeout(() => tool.execute(parsed.data, ctx), tool.timeoutMs, ctx.signal, tool.name);
        const out = tool.outputSchema.safeParse(result?.data);
        if (!out.success) {
          throw new ToolError('validation', `${tool.name} returned an unexpected shape: ${zodMessage(out.error)}`);
        }
        const usage = {
          tokens: result.usage?.tokens ?? this.estimateUsage(startIso, ctx.userId).tokens,
          costUsd: result.usage?.costUsd ?? this.estimateUsage(startIso, ctx.userId).costUsd,
        };
        meter.recordUsage(usage);
        calls.push({
          id: randomUUID(),
          runId: ctx.runId,
          stepId: ctx.stepId,
          tool: tool.name,
          attempt,
          status: 'ok',
          latencyMs: Date.now() - startedAt,
          startedAt,
          provenance: result.provenance,
          inputPreview,
          tokens: usage.tokens,
          costUsd: usage.costUsd,
        });
        return { ok: true, result: { ...result, data: out.data }, attempts: attempt, calls };
      } catch (err: any) {
        const failureClass = classifyError(err);
        const errorMessage = String(err?.message ?? err).slice(0, ERROR_MESSAGE_CHARS);
        const usage = this.estimateUsage(startIso, ctx.userId);
        meter.recordUsage(usage);
        calls.push({
          id: randomUUID(),
          runId: ctx.runId,
          stepId: ctx.stepId,
          tool: tool.name,
          attempt,
          status: 'error',
          latencyMs: Date.now() - startedAt,
          startedAt,
          failureClass,
          errorMessage,
          inputPreview,
          tokens: usage.tokens,
          costUsd: usage.costUsd,
        });

        const canRetry =
          RETRYABLE_FAILURES.has(failureClass) &&
          tool.idempotent &&
          attempt < tool.retry.maxAttempts &&
          !ctx.signal.aborted;
        if (!canRetry) {
          return { ok: false, failureClass, errorMessage, attempts: attempt, calls };
        }

        const backoff = tool.retry.baseBackoffMs * 2 ** (attempt - 1);
        const jitter = Math.floor(Math.random() * (tool.retry.baseBackoffMs / 2));
        try {
          await this.sleep(backoff + jitter, ctx.signal);
        } catch {
          return { ok: false, failureClass: 'cancelled', errorMessage: 'cancelled', attempts: attempt, calls };
        }
      }
    }

    // Unreachable: the loop always returns. Kept for the type checker.
    return { ok: false, failureClass: 'internal', errorMessage: 'retry loop exhausted', attempts: tool.retry.maxAttempts, calls };
  }
}

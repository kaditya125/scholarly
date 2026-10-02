import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import { ToolExecutor } from '../tools/ToolExecutor';
import { ToolRegistry } from '../tools/ToolRegistry';
import { WorkflowRegistry, WorkflowTemplate } from '../workflows/WorkflowTemplate';
import {
  AgentError,
  AgentEvent,
  AgentPlan,
  AgentRunDoc,
  AgentRunResult,
  AgentRunStatus,
  AgentUsage,
  RunContext,
  StepState,
  TERMINAL_RUN_STATUSES,
} from './agent.types';
import { AgentEmitter } from './AgentEmitter';
import { AgentEventHub } from './AgentEventHub';
import { AgentExecutor, RunExecutionContext } from './AgentExecutor';
import { AGENT_CONCURRENCY, AGENT_LEASE, MAX_GOAL_CHARS, resolveBudget } from './AgentPolicy';
import { AgentRunStore, MAX_RESULT_DATA_CHARS, capJson } from './AgentRunStore';
import { validatePlan } from './PlanValidator';

/**
 * AgentRuntime — owns the lifecycle of every agent run on this API instance.
 *
 *   startRun ─► queued ─► planning ─► executing ─► verifying ─► completed | failed | cancelled
 *
 * A run is created, charged against the student's quota, persisted, and queued; it executes in the
 * background (never inside the HTTP request that started it) under a lease with a heartbeat, so a
 * crashed process leaves an identifiable orphan instead of a run that is "executing" forever.
 * Concurrency is bounded globally and per student. Everything a student sees about the run comes
 * from the persisted run document and event stream.
 */

export type AgentRunErrorCode =
  | 'INVALID_GOAL'
  | 'UNKNOWN_WORKFLOW'
  | 'USER_BUSY'
  | 'QUEUE_FULL'
  | 'NOT_FOUND';

export class AgentRunError extends Error {
  constructor(readonly code: AgentRunErrorCode, message: string, readonly statusCode: number) {
    super(message);
    this.name = 'AgentRunError';
  }
}

/** Charges one agent run to the student's plan. Throws the usage service's QUOTA_EXHAUSTED error. */
export interface QuotaGate {
  consumeAgentRun(userId: string): Promise<void>;
}

export interface AgentRuntimeDeps {
  store: AgentRunStore;
  registry: ToolRegistry;
  toolExecutor: ToolExecutor;
  hub: AgentEventHub;
  workflows: WorkflowRegistry;
  instanceId?: string;
  quota?: QuotaGate;
  /** Called once per run after it reaches a terminal state (e.g. to post the summary into chat). */
  onRunFinished?: (run: AgentRunDoc) => Promise<void>;
  concurrency?: { maxConcurrentRuns: number; maxActiveRunsPerUser: number; maxConcurrentStepsPerRun: number };
  lease?: { heartbeatMs: number; ttlMs: number };
  maxQueueLength?: number;
}

export interface StartRunInput {
  userId: string;
  goal: string;
  workflowId: string;
  sessionId?: string;
  source: 'api' | 'chat';
  /** Documents attached to the turn (ids of the student's own agent uploads). */
  context?: RunContext;
}

const zeroUsage = (): AgentUsage => ({ steps: 0, toolCalls: 0, tokens: 0, costUsd: 0, elapsedMs: 0 });

export function isTerminal(status: AgentRunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}

/** The owner-facing view of a run: no lease internals. */
export function toPublicRun(run: AgentRunDoc): Omit<AgentRunDoc, 'lease'> {
  const { lease: _lease, ...rest } = run;
  return rest;
}

export class AgentRuntime {
  private readonly store: AgentRunStore;
  private readonly registry: ToolRegistry;
  private readonly hub: AgentEventHub;
  private readonly workflows: WorkflowRegistry;
  private readonly executor: AgentExecutor;
  private readonly instanceId: string;
  private readonly quota?: QuotaGate;
  private readonly onRunFinished?: (run: AgentRunDoc) => Promise<void>;
  private readonly concurrency: NonNullable<AgentRuntimeDeps['concurrency']>;
  private readonly lease: NonNullable<AgentRuntimeDeps['lease']>;
  private readonly maxQueueLength: number;

  private readonly active = new Map<string, RunExecutionContext>();
  private readonly activeByUser = new Map<string, Set<string>>();
  private readonly queue: string[] = [];
  /** Runs handed to executeRun and not yet finished (covers the gap before `active` is set). */
  private readonly inFlight = new Set<string>();
  /** Cancels that arrived while a run was in flight but before its context existed. */
  private readonly pendingCancels = new Set<string>();
  private running = 0;
  private readonly waiters = new Map<string, Array<() => void>>();

  constructor(deps: AgentRuntimeDeps) {
    this.store = deps.store;
    this.registry = deps.registry;
    this.hub = deps.hub;
    this.workflows = deps.workflows;
    this.instanceId = deps.instanceId ?? `api-${process.pid}-${randomUUID().slice(0, 8)}`;
    this.quota = deps.quota;
    this.onRunFinished = deps.onRunFinished;
    this.concurrency = deps.concurrency ?? { ...AGENT_CONCURRENCY };
    this.lease = deps.lease ?? { ...AGENT_LEASE };
    this.maxQueueLength = deps.maxQueueLength ?? 20;
    this.executor = new AgentExecutor(deps.registry, deps.toolExecutor, deps.store, this.concurrency.maxConcurrentStepsPerRun);
  }

  // ── Public API ──────────────────────────────────────────────────────────────────────────

  async startRun(input: StartRunInput): Promise<AgentRunDoc> {
    const goal = String(input.goal ?? '').trim();
    if (!goal) throw new AgentRunError('INVALID_GOAL', 'Tell me what you would like me to do.', 400);
    if (goal.length > MAX_GOAL_CHARS) {
      throw new AgentRunError('INVALID_GOAL', `Please keep the goal under ${MAX_GOAL_CHARS} characters.`, 400);
    }
    const workflow = this.workflows.get(input.workflowId);
    if (!workflow) throw new AgentRunError('UNKNOWN_WORKFLOW', 'That kind of task is not available in Agent mode yet.', 422);

    const userRuns = this.activeByUser.get(input.userId);
    if (userRuns && userRuns.size >= this.concurrency.maxActiveRunsPerUser) {
      throw new AgentRunError('USER_BUSY', 'You already have an agent task running. Wait for it to finish or stop it first.', 409);
    }
    if (this.queue.length >= this.maxQueueLength) {
      throw new AgentRunError('QUEUE_FULL', 'Sadhya is busy with other tasks right now. Please try again in a minute.', 503);
    }

    // Charge before creating: a quota failure leaves nothing behind.
    if (this.quota) await this.quota.consumeAgentRun(input.userId);

    const now = Date.now();
    const run: AgentRunDoc = {
      runId: randomUUID(),
      userId: input.userId,
      sessionId: input.sessionId,
      goal,
      workflowId: workflow.id,
      source: input.source,
      ...(input.context?.uploadIds?.length ? { context: { uploadIds: input.context.uploadIds.slice(0, 5) } } : {}),
      status: 'queued',
      steps: [],
      budget: resolveBudget(workflow.budget),
      usage: zeroUsage(),
      artifactIds: [],
      cancelRequested: false,
      lastEventSeq: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.createRun(run);

    this.trackUser(input.userId, run.runId);
    this.queue.push(run.runId);
    this.pump();
    return run;
  }

  /** Owner-only read. A run owned by someone else is reported as not found (no existence leak). */
  async getRunForUser(runId: string, userId: string): Promise<AgentRunDoc> {
    const run = await this.store.getRun(runId);
    if (!run || run.userId !== userId) throw new AgentRunError('NOT_FOUND', 'Agent task not found.', 404);
    return run;
  }

  async listRunsForUser(userId: string, limit = 20): Promise<AgentRunDoc[]> {
    return this.store.listRunsForUser(userId, Math.min(Math.max(limit, 1), 50));
  }

  /** Owner-only replay of persisted events after `afterSeq`. */
  async listEventsForUser(runId: string, userId: string, afterSeq: number): Promise<AgentEvent[]> {
    await this.getRunForUser(runId, userId);
    return this.store.listEvents(runId, Math.max(0, afterSeq));
  }

  /** Live events for a run on this instance (callers must already have checked ownership). */
  subscribe(runId: string, listener: (event: AgentEvent) => void): () => void {
    return this.hub.subscribe(runId, listener);
  }

  /** Workflows a student can start right now. */
  availableWorkflows(): Array<{ id: string; title: string; description: string }> {
    return this.workflows.ids().map((id) => {
      const t = this.workflows.get(id)!;
      return { id: t.id, title: t.title, description: t.description };
    });
  }

  toolDescriptors() {
    return this.registry.list();
  }

  async cancelRun(runId: string, userId: string): Promise<AgentRunDoc> {
    const run = await this.getRunForUser(runId, userId);
    if (isTerminal(run.status)) return run;

    await this.store.updateRun(runId, { cancelRequested: true });

    const ctx = this.active.get(runId);
    if (ctx) {
      if (!ctx.abort.signal.aborted) {
        ctx.abortReason = 'cancelled';
        ctx.abort.abort();
      }
    } else if (this.inFlight.has(runId)) {
      // Handed to the executor but its context is not built yet; executeRun checks this set.
      this.pendingCancels.add(runId);
    } else {
      const queuedAt = this.queue.indexOf(runId);
      if (queuedAt >= 0) {
        this.queue.splice(queuedAt, 1);
        await this.finalizeNeverStarted(run, 'cancelled', undefined, 'Stopped before it started.');
      }
      // Otherwise it is executing on another instance; its heartbeat picks up cancelRequested.
    }
    return (await this.store.getRun(runId)) ?? run;
  }

  /** Resolves when the run finishes executing in this process (tests, integration scripts). */
  waitForRun(runId: string): Promise<void> {
    if (!this.inFlight.has(runId) && !this.queue.includes(runId)) return Promise.resolve();
    return new Promise((resolve) => {
      const list = this.waiters.get(runId) ?? [];
      list.push(resolve);
      this.waiters.set(runId, list);
    });
  }

  /**
   * Marks runs orphaned by a dead process as failed. A run is orphaned when its lease expired, or it
   * never got a lease and was created more than a minute ago. Runs owned by this process are skipped.
   */
  async recoverInterruptedRuns(): Promise<number> {
    const now = Date.now();
    const candidates = await this.store.findActiveRuns(100);
    let recovered = 0;
    for (const run of candidates) {
      if (this.inFlight.has(run.runId) || this.queue.includes(run.runId)) continue;
      const leaseAlive = run.lease && run.lease.expiresAt > now;
      const freshlyQueued = !run.lease && run.createdAt > now - 60_000;
      if (leaseAlive || freshlyQueued) continue;
      await this.finalizeNeverStarted(
        run,
        'failed',
        { class: 'internal', message: 'This task was interrupted by a server restart. Please run it again.' },
        'Interrupted before it could finish.',
      );
      recovered++;
    }
    if (recovered) logger.warn('[agent] recovered interrupted runs', { recovered });
    return recovered;
  }

  // ── Scheduling ──────────────────────────────────────────────────────────────────────────

  private trackUser(userId: string, runId: string) {
    const set = this.activeByUser.get(userId) ?? new Set<string>();
    set.add(runId);
    this.activeByUser.set(userId, set);
  }

  private untrackUser(userId: string, runId: string) {
    const set = this.activeByUser.get(userId);
    if (!set) return;
    set.delete(runId);
    if (set.size === 0) this.activeByUser.delete(userId);
  }

  private pump() {
    while (this.running < this.concurrency.maxConcurrentRuns && this.queue.length > 0) {
      const runId = this.queue.shift()!;
      this.running++;
      this.inFlight.add(runId);
      void this.executeRun(runId)
        .catch((e) => logger.error('[agent] run crashed outside its own handler', { runId, error: String(e?.message ?? e) }))
        .finally(() => {
          this.running--;
          this.inFlight.delete(runId);
          this.pendingCancels.delete(runId);
          this.resolveWaiters(runId);
          this.pump();
        });
    }
  }

  // ── Execution ───────────────────────────────────────────────────────────────────────────

  private async executeRun(runId: string): Promise<void> {
    const run = await this.store.getRun(runId);
    if (!run) {
      this.resolveWaiters(runId);
      return;
    }
    if (run.cancelRequested || isTerminal(run.status)) {
      if (!isTerminal(run.status)) await this.finalizeNeverStarted(run, 'cancelled', undefined, 'Stopped before it started.');
      this.untrackUser(run.userId, runId);
      this.resolveWaiters(runId);
      return;
    }

    const workflow = this.workflows.get(run.workflowId);
    const startedAt = Date.now();
    const ctx: RunExecutionContext = {
      runId,
      userId: run.userId,
      budget: run.budget,
      usage: zeroUsage(),
      steps: new Map<string, StepState>(),
      outputs: new Map<string, unknown>(),
      abort: new AbortController(),
      abortReason: null,
      artifactIds: [],
      startedAt,
    };
    this.active.set(runId, ctx);
    if (this.pendingCancels.has(runId)) {
      ctx.abortReason = 'cancelled';
      ctx.abort.abort();
    }
    const emitter = new AgentEmitter(this.store, this.hub, runId, run.lastEventSeq);

    const heartbeat = setInterval(() => void this.beat(runId, ctx, emitter), this.lease.heartbeatMs);
    (heartbeat as any).unref?.();
    const timeLimit = setTimeout(() => {
      if (!ctx.abort.signal.aborted) {
        ctx.abortReason = 'budget';
        ctx.abort.abort();
      }
    }, run.budget.maxExecutionMs);
    (timeLimit as any).unref?.();

    try {
      await this.store.updateRun(runId, {
        status: 'planning',
        startedAt,
        lease: { owner: this.instanceId, expiresAt: Date.now() + this.lease.ttlMs },
      });
      await emitter.emit('agent.started', { label: workflow?.title ?? 'Agent task', data: { workflowId: run.workflowId } });

      if (!workflow) {
        await this.finalize(run, ctx, emitter, 'failed', undefined, {
          class: 'validation',
          message: 'That kind of task is no longer available in Agent mode.',
        });
        return;
      }

      await emitter.emit('agent.planning', { label: 'Planning the steps' });
      let plan: AgentPlan;
      let planSource: 'model' | 'template' = 'template';
      let planNotes: string[] = [];
      try {
        if (workflow.proposePlan) {
          // A model may propose the plan; the proposer checks it and falls back to the template.
          try {
            const proposal = await workflow.proposePlan({ goal: run.goal, context: run.context, userId: run.userId, registry: this.registry, budget: run.budget });
            plan = proposal.plan;
            planSource = proposal.source;
            planNotes = proposal.notes;
            ctx.usage.tokens += Math.max(0, proposal.usage.tokens || 0);
            ctx.usage.costUsd += Math.max(0, proposal.usage.costUsd || 0);
          } catch (e: any) {
            logger.warn('[agent] plan proposal failed; using the template', { runId, workflowId: workflow.id, error: String(e?.message ?? e) });
            plan = workflow.buildPlan(run.goal, run.context);
            planNotes = ['The planner was unavailable; the standard plan was used.'];
          }
        } else {
          plan = workflow.buildPlan(run.goal, run.context);
        }
      } catch (e: any) {
        logger.warn('[agent] plan construction failed', { runId, workflowId: workflow.id, error: String(e?.message ?? e) });
        await this.finalize(run, ctx, emitter, 'failed', undefined, {
          class: 'validation',
          message: "I couldn't turn this goal into a plan.",
        });
        return;
      }

      const validation = validatePlan(plan, this.registry, run.budget);
      if (!validation.ok) {
        logger.warn('[agent] plan rejected by validator', { runId, workflowId: workflow.id, errors: validation.errors });
        await this.finalize(run, ctx, emitter, 'failed', undefined, {
          class: 'validation',
          message: "I couldn't build a safe plan for this goal.",
        });
        return;
      }

      for (const step of plan.steps) {
        ctx.steps.set(step.id, { id: step.id, label: step.label, tool: step.tool, status: 'pending', attempts: 0 });
      }
      await this.store.updateRun(runId, { plan, planSource, planNotes, steps: [...ctx.steps.values()], status: 'executing' });
      await emitter.emit('agent.plan_ready', {
        label: `${plan.steps.length} steps planned`,
        data: { planSource, steps: plan.steps.map((s) => ({ id: s.id, label: s.label, dependsOn: s.dependsOn })) },
      });

      const execution = await this.executor.executePlan(plan, ctx, emitter);

      if (execution.stopReason === 'cancelled') {
        const partial = this.evaluateSafely(workflow, run.goal, plan, ctx);
        await this.finalize(run, ctx, emitter, 'cancelled', {
          ...partial,
          outcome: 'partial',
          summary: `Stopped at your request.${partial.completed.length ? ` Completed before stopping: ${partial.completed.join(', ')}.` : ''}`,
        });
        return;
      }

      await this.store.updateRun(runId, { status: 'verifying' });
      await emitter.emit('agent.verification.started', { label: 'Checking the results' });
      const result = this.evaluateSafely(workflow, run.goal, plan, ctx);
      await emitter.emit('agent.verification.completed', { label: 'Results checked', data: { outcome: result.outcome } });

      if (execution.stopReason === 'budget') {
        await this.finalize(run, ctx, emitter, 'failed', { ...result, outcome: 'partial' }, {
          class: 'budget',
          message: 'I stopped because this task reached its size limit. Here is what I finished.',
        });
        return;
      }

      const failedRequired = plan.steps.filter((s) => !s.optional && ctx.steps.get(s.id)?.status === 'failed');
      if (failedRequired.length > 0) {
        const first = ctx.steps.get(failedRequired[0].id);
        await this.finalize(run, ctx, emitter, 'failed', result, {
          class: first?.error?.class ?? 'internal',
          message: `I couldn't finish “${failedRequired[0].label}” because ${first?.error?.message ?? 'it failed'}.`,
          stepId: failedRequired[0].id,
        });
        return;
      }

      await this.finalize(run, ctx, emitter, 'completed', result);
    } catch (e: any) {
      logger.error('[agent] run failed unexpectedly', { runId, error: String(e?.message ?? e) });
      await this.finalize(run, ctx, emitter, 'failed', undefined, {
        class: 'internal',
        message: 'Something went wrong while running this task. Nothing was changed; you can try again.',
      }).catch(() => undefined);
    } finally {
      clearInterval(heartbeat);
      clearTimeout(timeLimit);
      this.active.delete(runId);
      this.untrackUser(run.userId, runId);
    }
  }

  private evaluateSafely(workflow: WorkflowTemplate, goal: string, plan: AgentPlan, ctx: RunExecutionContext): AgentRunResult {
    try {
      const result = workflow.evaluate({ goal, plan, steps: ctx.steps, outputs: ctx.outputs });
      if (result.data) {
        const { json, truncated } = capJson(result.data, MAX_RESULT_DATA_CHARS);
        if (truncated) result.data = { truncated: true, preview: json.slice(0, 2_000) };
      }
      return result;
    } catch (e: any) {
      logger.warn('[agent] completion evaluation failed', { runId: ctx.runId, error: String(e?.message ?? e) });
      const completed = [...ctx.steps.values()].filter((s) => s.status === 'completed').map((s) => s.label);
      const failed = [...ctx.steps.values()].filter((s) => s.status === 'failed').map((s) => s.label);
      return { outcome: 'partial', summary: 'I finished the steps but could not assemble the final summary.', completed, failed };
    }
  }

  private async beat(runId: string, ctx: RunExecutionContext, emitter: AgentEmitter) {
    try {
      await this.store.updateRun(runId, {
        lease: { owner: this.instanceId, expiresAt: Date.now() + this.lease.ttlMs },
        lastEventSeq: emitter.lastSeq,
        usage: { ...ctx.usage, elapsedMs: Date.now() - ctx.startedAt },
      });
      // Cancellation requested through another instance (or directly in the store).
      const fresh = await this.store.getRun(runId);
      if (fresh?.cancelRequested && !ctx.abort.signal.aborted) {
        ctx.abortReason = 'cancelled';
        ctx.abort.abort();
      }
    } catch (e: any) {
      logger.warn('[agent] heartbeat failed', { runId, error: String(e?.message ?? e) });
    }
  }

  private async finalize(
    run: AgentRunDoc,
    ctx: RunExecutionContext,
    emitter: AgentEmitter,
    status: 'completed' | 'failed' | 'cancelled',
    result?: AgentRunResult,
    error?: AgentError,
  ): Promise<void> {
    const completedAt = Date.now();
    const usage: AgentUsage = { ...ctx.usage, elapsedMs: completedAt - ctx.startedAt };
    const patch: Partial<AgentRunDoc> = {
      status,
      result,
      error,
      usage,
      steps: [...ctx.steps.values()],
      artifactIds: ctx.artifactIds,
      completedAt,
      lastEventSeq: emitter.lastSeq + 1,
      // Released lease: expiresAt 0 marks "no live owner" for recovery and for other instances.
      lease: { owner: this.instanceId, expiresAt: 0 },
    };
    await this.store.updateRun(run.runId, patch);

    const type = status === 'completed' ? 'agent.completed' : status === 'cancelled' ? 'agent.cancelled' : 'agent.failed';
    await emitter.emit(type, {
      label: status === 'completed' ? 'Done' : status === 'cancelled' ? 'Stopped' : 'Could not finish',
      data: {
        outcome: result?.outcome ?? null,
        summary: result?.summary ?? error?.message ?? null,
        error: error ? { class: error.class, message: error.message } : null,
        completed: result?.completed ?? [],
        failed: result?.failed ?? [],
        usage,
      },
    });
    await this.notifyFinished(run.runId);
  }

  /** Terminal transition for a run that never executed here (cancelled while queued, or orphaned). */
  private async finalizeNeverStarted(
    run: AgentRunDoc,
    status: 'cancelled' | 'failed',
    error: AgentError | undefined,
    summary: string,
  ): Promise<void> {
    const existing = await this.store.listEvents(run.runId, run.lastEventSeq, 1000);
    const lastSeq = existing.reduce((m, e) => Math.max(m, e.seq), run.lastEventSeq);
    const emitter = new AgentEmitter(this.store, this.hub, run.runId, lastSeq);
    const result: AgentRunResult = {
      outcome: 'no_result',
      summary,
      completed: run.steps.filter((s) => s.status === 'completed').map((s) => s.label),
      failed: run.steps.filter((s) => s.status === 'failed').map((s) => s.label),
    };
    await this.store.updateRun(run.runId, {
      status,
      error,
      result,
      completedAt: Date.now(),
      lastEventSeq: lastSeq + 1,
      lease: { owner: this.instanceId, expiresAt: 0 },
    });
    await emitter.emit(status === 'cancelled' ? 'agent.cancelled' : 'agent.failed', {
      label: status === 'cancelled' ? 'Stopped' : 'Could not finish',
      data: { outcome: 'no_result', summary, error: error ? { class: error.class, message: error.message } : null, completed: result.completed, failed: result.failed },
    });
    this.untrackUser(run.userId, run.runId);
    await this.notifyFinished(run.runId);
  }

  private async notifyFinished(runId: string) {
    if (!this.onRunFinished) return;
    try {
      const run = await this.store.getRun(runId);
      if (run) await this.onRunFinished(run);
    } catch (e: any) {
      logger.warn('[agent] onRunFinished hook failed', { runId, error: String(e?.message ?? e) });
    }
  }

  private resolveWaiters(runId: string) {
    const list = this.waiters.get(runId);
    if (!list) return;
    this.waiters.delete(runId);
    for (const resolve of list) resolve();
  }
}

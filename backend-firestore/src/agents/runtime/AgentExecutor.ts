import { logger } from '../../utils/logger';
import { ToolExecutor, BudgetMeter } from '../tools/ToolExecutor';
import { ToolRegistry } from '../tools/ToolRegistry';
import { ToolError, describeFailure } from '../tools/toolErrors';
import { AgentBudget, AgentPlan, AgentUsage, FailureClass, StepState } from './agent.types';
import { AgentEmitter } from './AgentEmitter';
import { AgentRunStore } from './AgentRunStore';
import { UnresolvedRefError, resolveStepInput } from './stepRefs';

/**
 * AgentExecutor — runs a validated plan.
 *
 * Steps whose dependencies have all completed run together in a wave (capped at
 * `maxConcurrentSteps`), so independent retrievals happen in parallel. A step whose dependency
 * failed, was skipped, or produced nothing to pass on is skipped with a reason — never run with a
 * missing input. Budgets are charged through the BudgetMeter on every tool attempt; hitting one
 * stops the run. Cancellation aborts in-flight tool calls via the run's AbortSignal.
 */

export type StopReason = 'cancelled' | 'budget' | null;

export interface RunExecutionContext {
  runId: string;
  userId: string;
  budget: AgentBudget;
  usage: AgentUsage;
  steps: Map<string, StepState>;
  outputs: Map<string, unknown>;
  abort: AbortController;
  /** Why the run was aborted (set by the runtime before aborting). */
  abortReason: StopReason;
  startedAt: number;
  /** Artifacts produced by this run's tools, in the order they were created. */
  artifactIds: string[];
}

export interface PlanExecutionResult {
  stopReason: StopReason;
  /** Class of the failure that stopped the run, if a budget/cancel stop occurred. */
  stopClass?: FailureClass;
}

export function createBudgetMeter(ctx: RunExecutionContext): BudgetMeter {
  return {
    beforeToolCall() {
      const { budget, usage } = ctx;
      if (usage.toolCalls + 1 > budget.maxToolCalls) {
        throw new ToolError('budget', `tool-call limit of ${budget.maxToolCalls} reached`);
      }
      if (usage.tokens >= budget.maxTokens) {
        throw new ToolError('budget', `token limit of ${budget.maxTokens} reached`);
      }
      if (usage.costUsd >= budget.maxCostUsd) {
        throw new ToolError('budget', `cost limit of $${budget.maxCostUsd} reached`);
      }
      if (Date.now() - ctx.startedAt > budget.maxExecutionMs) {
        throw new ToolError('budget', `time limit of ${Math.round(budget.maxExecutionMs / 1000)}s reached`);
      }
      usage.toolCalls += 1;
    },
    recordUsage(u) {
      ctx.usage.tokens += Math.max(0, u.tokens || 0);
      ctx.usage.costUsd += Math.max(0, u.costUsd || 0);
    },
  };
}

export class AgentExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly toolExecutor: ToolExecutor,
    private readonly store: AgentRunStore,
    private readonly maxConcurrentSteps = 3,
  ) {}

  async executePlan(plan: AgentPlan, ctx: RunExecutionContext, emitter: AgentEmitter): Promise<PlanExecutionResult> {
    const meter = createBudgetMeter(ctx);
    let stop: StopReason = null;
    let stopClass: FailureClass | undefined;

    const stepById = new Map(plan.steps.map((s) => [s.id, s]));

    while (true) {
      if (ctx.abort.signal.aborted) {
        stop = ctx.abortReason ?? 'cancelled';
        stopClass = stop === 'budget' ? 'budget' : 'cancelled';
        break;
      }

      const pending = plan.steps.filter((s) => ctx.steps.get(s.id)?.status === 'pending');
      if (pending.length === 0) break;

      // Skip steps whose dependencies can no longer complete.
      let skippedAny = false;
      for (const step of pending) {
        const blocking = step.dependsOn.find((d) => {
          const st = ctx.steps.get(d)?.status;
          return st === 'failed' || st === 'skipped' || st === 'cancelled';
        });
        if (blocking) {
          await this.skipStep(ctx, emitter, step.id, `an earlier step (${ctx.steps.get(blocking)?.label ?? blocking}) did not complete`);
          skippedAny = true;
        }
      }
      if (skippedAny) continue;

      const ready = pending.filter((s) => s.dependsOn.every((d) => ctx.steps.get(d)?.status === 'completed'));
      if (ready.length === 0) {
        // Validated plans are acyclic, so this only happens if state was corrupted. Fail closed.
        for (const step of pending) await this.skipStep(ctx, emitter, step.id, 'its dependencies could not be satisfied');
        break;
      }

      const wave = ready.slice(0, this.maxConcurrentSteps);
      const results = await Promise.all(wave.map((s) => this.runStep(stepById.get(s.id)!, ctx, emitter, meter)));
      await this.persistProgress(ctx);

      const hardStop = results.find((r) => r === 'budget' || r === 'cancelled');
      if (hardStop) {
        // An in-flight tool aborted by the run's time limit reports 'cancelled'; the runtime's
        // recorded abort reason says why the signal fired, so it wins.
        stop = ctx.abortReason ?? (hardStop === 'budget' ? 'budget' : 'cancelled');
        stopClass = stop === 'budget' ? 'budget' : 'cancelled';
        break;
      }
    }

    if (stop) {
      // Everything not finished is recorded as cancelled — nothing is silently left "pending".
      for (const step of plan.steps) {
        const st = ctx.steps.get(step.id);
        if (st && (st.status === 'pending' || st.status === 'running')) {
          st.status = 'cancelled';
          st.completedAt = Date.now();
        }
      }
      await this.persistProgress(ctx);
    }

    return { stopReason: stop, stopClass };
  }

  /** Returns the failure class that should stop the whole run, or null. */
  private async runStep(
    step: AgentPlan['steps'][number],
    ctx: RunExecutionContext,
    emitter: AgentEmitter,
    meter: BudgetMeter,
  ): Promise<FailureClass | null> {
    const state = ctx.steps.get(step.id)!;

    if (ctx.usage.steps + 1 > ctx.budget.maxSteps) {
      state.status = 'failed';
      state.error = { class: 'budget', message: describeFailure('budget'), stepId: step.id };
      state.completedAt = Date.now();
      await emitter.emit('agent.step.failed', { stepId: step.id, label: step.label, data: { reason: 'budget' } });
      return 'budget';
    }

    let input: Record<string, unknown>;
    try {
      input = resolveStepInput(step.input, ctx.outputs);
    } catch (e) {
      if (e instanceof UnresolvedRefError) {
        await this.skipStep(ctx, emitter, step.id, 'an earlier step found nothing to pass on');
        return null;
      }
      throw e;
    }

    ctx.usage.steps += 1;
    state.status = 'running';
    state.startedAt = Date.now();
    await emitter.emit('agent.step.started', { stepId: step.id, label: step.label });
    await emitter.emit('agent.tool.started', { stepId: step.id, tool: step.tool, label: step.label });

    const outcome = await this.toolExecutor.execute(
      step.tool,
      input,
      { userId: ctx.userId, runId: ctx.runId, stepId: step.id, signal: ctx.abort.signal },
      meter,
    );
    state.attempts = outcome.attempts;

    try {
      await this.store.recordToolCalls(ctx.runId, outcome.calls);
    } catch (e: any) {
      logger.warn('[agent] tool-call record persistence failed', { runId: ctx.runId, error: String(e?.message ?? e) });
    }

    if (outcome.ok && outcome.result) {
      const tool = this.registry.get(step.tool);
      const summary = tool?.summarize ? safeSummary(() => tool.summarize!(outcome.result!.data)) : undefined;
      ctx.outputs.set(step.id, outcome.result.data);
      // A tool that produced an artifact reports its id in the output; record it on the run so the
      // workspace can open it without re-reading every step's output. Only tools that WRITE
      // artifacts count — a tool that looks up an existing one (to build on it) also returns an
      // artifactId, and announcing that as new would be false.
      const produced = outcome.result.data as any;
      const artifactId = produced?.artifactId;
      const writesArtifacts = Boolean(tool?.permissions.includes('write:own-artifact'));
      const newArtifact = writesArtifacts && typeof artifactId === 'string' && artifactId !== '' && !ctx.artifactIds.includes(artifactId);
      if (newArtifact) ctx.artifactIds.push(artifactId);
      state.status = 'completed';
      state.completedAt = Date.now();
      state.outputSummary = summary;
      state.provenance = outcome.result.provenance;
      try {
        await this.store.saveStepOutput(ctx.runId, step.id, outcome.result.data);
      } catch (e: any) {
        logger.warn('[agent] step output persistence failed', { runId: ctx.runId, stepId: step.id, error: String(e?.message ?? e) });
      }
      await emitter.emit('agent.tool.completed', {
        stepId: step.id,
        tool: step.tool,
        data: { summary, provenance: outcome.result.provenance, attempts: outcome.attempts },
      });
      if (newArtifact) {
        // Lets the workspace open the document the moment it exists, not when the run ends.
        await emitter.emit('agent.artifact.ready', {
          stepId: step.id,
          label: typeof produced.title === 'string' ? produced.title : 'Document ready',
          data: {
            artifactId,
            title: produced.title,
            kind: produced.kind ?? 'document',
            ...(produced.pageCount !== undefined ? { pageCount: produced.pageCount } : {}),
            ...(produced.cardCount !== undefined ? { cardCount: produced.cardCount } : {}),
            ...(produced.questionCount !== undefined ? { questionCount: produced.questionCount } : {}),
            ...(produced.weakAreaCount !== undefined ? { weakAreaCount: produced.weakAreaCount } : {}),
            ...(produced.dayCount !== undefined ? { dayCount: produced.dayCount } : {}),
            ...(produced.weekCount !== undefined ? { weekCount: produced.weekCount } : {}),
          },
        });
      }
      await emitter.emit('agent.step.completed', { stepId: step.id, label: step.label, data: { summary } });
      return null;
    }

    const failureClass = outcome.failureClass ?? 'internal';
    // A cancellation or budget stop is recorded by the loop as 'cancelled'; a real failure is 'failed'.
    const isStop = failureClass === 'cancelled' || failureClass === 'budget';
    state.status = isStop ? 'cancelled' : 'failed';
    state.completedAt = Date.now();
    state.error = { class: failureClass, message: describeFailure(failureClass), stepId: step.id };
    logger.info('[agent] step failed', {
      runId: ctx.runId,
      stepId: step.id,
      tool: step.tool,
      failureClass,
      detail: outcome.errorMessage,
    });
    await emitter.emit('agent.tool.failed', {
      stepId: step.id,
      tool: step.tool,
      data: { failureClass, attempts: outcome.attempts },
    });
    await emitter.emit('agent.step.failed', {
      stepId: step.id,
      label: step.label,
      data: { failureClass, reason: describeFailure(failureClass) },
    });
    return isStop ? failureClass : null;
  }

  private async skipStep(ctx: RunExecutionContext, emitter: AgentEmitter, stepId: string, reason: string) {
    const state = ctx.steps.get(stepId)!;
    state.status = 'skipped';
    state.skippedReason = reason;
    state.completedAt = Date.now();
    await emitter.emit('agent.step.skipped', { stepId, label: state.label, data: { reason } });
  }

  private async persistProgress(ctx: RunExecutionContext) {
    try {
      await this.store.updateRun(ctx.runId, {
        steps: [...ctx.steps.values()],
        usage: { ...ctx.usage, elapsedMs: Date.now() - ctx.startedAt },
      });
    } catch (e: any) {
      logger.warn('[agent] progress persistence failed', { runId: ctx.runId, error: String(e?.message ?? e) });
    }
  }
}

function safeSummary(fn: () => Record<string, unknown>): Record<string, unknown> | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

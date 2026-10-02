import { z } from 'zod';
import { ToolDefinition, ToolRegistry, ToolContext } from '../../../src/agents/tools/ToolRegistry';
import { ToolExecutor } from '../../../src/agents/tools/ToolExecutor';
import { AgentEventHub } from '../../../src/agents/runtime/AgentEventHub';
import { InMemoryAgentRunStore } from '../../../src/agents/runtime/AgentRunStore';
import { AgentRuntime, AgentRuntimeDeps } from '../../../src/agents/runtime/AgentRuntime';
import { WorkflowRegistry, WorkflowTemplate } from '../../../src/agents/workflows/WorkflowTemplate';
import { AgentPlan, AgentRunResult } from '../../../src/agents/runtime/agent.types';

export const noSleep = async () => undefined;
export const noUsage = () => ({ tokens: 0, costUsd: 0 });

/** A fake tool with a `query`/`examId`-style schema and a scripted implementation. */
export function fakeTool(
  name: string,
  impl: (input: any, ctx: ToolContext) => Promise<any>,
  overrides: Partial<ToolDefinition<any, any>> = {},
): ToolDefinition<any, any> {
  return {
    name,
    description: `fake ${name}`,
    category: 'knowledge',
    inputSchema: z.object({ query: z.string().optional(), examId: z.string().optional(), n: z.number().optional() }),
    outputSchema: z.any(),
    permissions: ['read:shared-corpus'],
    costClass: 'free',
    timeoutMs: 1_000,
    retry: { maxAttempts: 2, baseBackoffMs: 1 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input, ctx) {
      return { data: await impl(input, ctx), provenance: 'VERIFIED_CORPUS' };
    },
    summarize: (out: any) => ({ keys: out && typeof out === 'object' ? Object.keys(out).length : 0 }),
    ...overrides,
  };
}

export function registryOf(...tools: ToolDefinition<any, any>[]): ToolRegistry {
  const r = new ToolRegistry();
  for (const t of tools) r.register(t);
  return r;
}

/** A workflow built from a fixed plan, with a simple evaluator that reports what completed. */
export function fixedWorkflow(id: string, plan: Omit<AgentPlan, 'goal' | 'workflowId'>, extras: Partial<WorkflowTemplate> = {}): WorkflowTemplate {
  return {
    id,
    title: `Workflow ${id}`,
    description: 'test workflow',
    buildPlan: (goal: string) => ({ ...plan, goal, workflowId: id }),
    evaluate: ({ steps, outputs }): AgentRunResult => {
      const completed = [...steps.values()].filter((s) => s.status === 'completed').map((s) => s.label);
      const failed = [...steps.values()].filter((s) => s.status === 'failed').map((s) => s.label);
      return {
        outcome: completed.length === steps.size ? 'success' : completed.length ? 'partial' : 'no_result',
        summary: `done: ${completed.join(', ')}`,
        data: { outputs: Object.fromEntries(outputs) },
        completed,
        failed,
      };
    },
    ...extras,
  };
}

export interface TestRig {
  runtime: AgentRuntime;
  store: InMemoryAgentRunStore;
  hub: AgentEventHub;
  finished: string[];
}

export function makeRuntime(
  registry: ToolRegistry,
  workflows: WorkflowTemplate[],
  deps: Partial<AgentRuntimeDeps> = {},
): TestRig {
  const store = new InMemoryAgentRunStore();
  const hub = new AgentEventHub();
  const wf = new WorkflowRegistry();
  for (const w of workflows) wf.register(w);
  const finished: string[] = [];
  const runtime = new AgentRuntime({
    store,
    registry,
    toolExecutor: new ToolExecutor(registry, { sleep: noSleep, estimateUsage: noUsage }),
    hub,
    workflows: wf,
    instanceId: 'test-instance',
    onRunFinished: async (run) => {
      finished.push(run.runId);
    },
    lease: { heartbeatMs: 60_000, ttlMs: 120_000 },
    ...deps,
  });
  return { runtime, store, hub, finished };
}

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

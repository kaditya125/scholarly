import { AgentBudget } from './agent.types';

/**
 * Agent Mode policy — budgets, concurrency and model choice in one place.
 *
 * Budgets are hard limits enforced by the executor before every step and tool call, not advice
 * to a model. They exist because an agent turns one request into many calls, and every Gemini call
 * is billed to the card now that the GCP free credit is spent. Values can be overridden per
 * deployment through env without a code change.
 */

function numEnv(name: string, def: number): number {
  const v = Number.parseFloat(process.env[name] ?? '');
  return Number.isFinite(v) && v > 0 ? v : def;
}

export const DEFAULT_AGENT_BUDGET: Readonly<AgentBudget> = Object.freeze({
  maxSteps: numEnv('AGENT_MAX_STEPS', 12),
  maxToolCalls: numEnv('AGENT_MAX_TOOL_CALLS', 25),
  maxTokens: numEnv('AGENT_MAX_TOKENS', 120_000),
  maxExecutionMs: numEnv('AGENT_MAX_EXECUTION_MS', 180_000),
  maxCostUsd: numEnv('AGENT_MAX_COST_USD', 0.05),
});

/** Merge a workflow's own tighter budget into the deployment default — a workflow can only lower limits. */
export function resolveBudget(override?: Partial<AgentBudget>): AgentBudget {
  const base = { ...DEFAULT_AGENT_BUDGET };
  if (!override) return base;
  return {
    maxSteps: Math.min(base.maxSteps, override.maxSteps ?? base.maxSteps),
    maxToolCalls: Math.min(base.maxToolCalls, override.maxToolCalls ?? base.maxToolCalls),
    maxTokens: Math.min(base.maxTokens, override.maxTokens ?? base.maxTokens),
    maxExecutionMs: Math.min(base.maxExecutionMs, override.maxExecutionMs ?? base.maxExecutionMs),
    maxCostUsd: Math.min(base.maxCostUsd, override.maxCostUsd ?? base.maxCostUsd),
  };
}

/** Concurrency on the single API instance. A second run by the same student waits for the first. */
export const AGENT_CONCURRENCY = Object.freeze({
  maxConcurrentRuns: numEnv('AGENT_MAX_CONCURRENT_RUNS', 3),
  maxActiveRunsPerUser: 1,
  maxConcurrentStepsPerRun: 3,
});

/** Lease: a run's executor refreshes its lease every heartbeat; an expired lease means the process died. */
export const AGENT_LEASE = Object.freeze({
  heartbeatMs: 10_000,
  ttlMs: 30_000,
});

/** Goal text limits — the goal is stored and echoed; keep it bounded. */
export const MAX_GOAL_CHARS = 2000;

/**
 * Model policy for steps that call a model (Phase 2+). Cheap models for classification,
 * extraction and formatting; the standard model for synthesis and fact-checking; no Pro model
 * unless a workflow opts in explicitly.
 */
export const AGENT_MODEL_POLICY = Object.freeze({
  classify: 'gemini-2.5-flash-lite',
  extract: 'gemini-2.5-flash-lite',
  format: 'gemini-2.5-flash-lite',
  synthesize: 'gemini-2.5-flash',
  verify: 'gemini-2.5-flash',
});

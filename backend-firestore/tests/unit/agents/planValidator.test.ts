import { z } from 'zod';
import { validatePlan } from '../../../src/agents/runtime/PlanValidator';
import { AgentBudget, AgentPlan } from '../../../src/agents/runtime/agent.types';
import { getDefaultToolRegistry } from '../../../src/agents/tools';
import { examOverviewWorkflow } from '../../../src/agents/workflows/examOverview.workflow';
import { resolveBudget } from '../../../src/agents/runtime/AgentPolicy';
import { fakeTool, registryOf } from './helpers';

const budget: AgentBudget = { maxSteps: 5, maxToolCalls: 10, maxTokens: 1000, maxExecutionMs: 10_000, maxCostUsd: 1 };

const strictTool = fakeTool('needs_exam', async () => ({}), {
  inputSchema: z.object({ examId: z.string(), limit: z.number().optional() }),
});
const lookupTool = fakeTool('lookup', async () => ({ examId: 'X' }), {
  inputSchema: z.object({ query: z.string() }),
});
const gatedTool = fakeTool('delete_everything', async () => ({}), { requiresApproval: true, retry: { maxAttempts: 1, baseBackoffMs: 1 }, idempotent: false });
const registry = registryOf(strictTool, lookupTool, gatedTool);

function plan(steps: AgentPlan['steps'], extra: Partial<AgentPlan> = {}): AgentPlan {
  return {
    goal: 'g',
    workflowId: 'w',
    successCriteria: [],
    estimatedComplexity: 'low',
    requiresUserApproval: false,
    steps,
    ...extra,
  };
}

const step = (id: string, tool: string, input: Record<string, unknown>, dependsOn: string[] = []) => ({
  id,
  objective: id,
  label: `Label ${id}`,
  type: 'retrieve' as const,
  tool,
  input,
  dependsOn,
});

describe('PlanValidator', () => {
  it('accepts a valid DAG and returns a topological order', () => {
    const r = validatePlan(
      plan([
        step('find', 'lookup', { query: 'ssc cgl' }),
        step('use_a', 'needs_exam', { examId: { $ref: 'find', path: 'examId' } }, ['find']),
        step('use_b', 'needs_exam', { examId: { $ref: 'find', path: 'examId' }, limit: 3 }, ['find']),
      ]),
      registry,
      budget,
    );
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.order![0]).toBe('find');
    expect(r.order).toHaveLength(3);
  });

  it('rejects an unregistered tool', () => {
    const r = validatePlan(plan([step('x', 'rm_rf', { query: 'a' })]), registry, budget);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/unregistered tool "rm_rf"/);
  });

  it('rejects literal inputs that do not match the tool schema, including unknown fields', () => {
    const missing = validatePlan(plan([step('x', 'needs_exam', {})]), registry, budget);
    expect(missing.ok).toBe(false);
    expect(missing.errors.join(' ')).toMatch(/does not match tool "needs_exam"/);

    const extra = validatePlan(plan([step('x', 'lookup', { query: 'a', userId: 'someone-else' })]), registry, budget);
    expect(extra.ok).toBe(false);
  });

  it('rejects a reference that does not follow a declared dependency', () => {
    const r = validatePlan(
      plan([step('find', 'lookup', { query: 'a' }), step('use', 'needs_exam', { examId: { $ref: 'find' } })]),
      registry,
      budget,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/not in dependsOn/);
  });

  it('rejects a reference into a field the tool does not have', () => {
    const r = validatePlan(
      plan([step('find', 'lookup', { query: 'a' }), step('use', 'needs_exam', { examId: 'X', bogus: { $ref: 'find' } }, ['find'])]),
      registry,
      budget,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/"bogus" is not a field/);
  });

  it('rejects cycles, self-dependencies, unknown dependencies and duplicate ids', () => {
    expect(
      validatePlan(
        plan([step('a', 'lookup', { query: 'q' }, ['b']), step('b', 'lookup', { query: 'q' }, ['a'])]),
        registry,
        budget,
      ).errors.join(' '),
    ).toMatch(/cycle/);
    expect(validatePlan(plan([step('a', 'lookup', { query: 'q' }, ['a'])]), registry, budget).errors.join(' ')).toMatch(/depends on itself/);
    expect(validatePlan(plan([step('a', 'lookup', { query: 'q' }, ['ghost'])]), registry, budget).errors.join(' ')).toMatch(/unknown step "ghost"/);
    expect(
      validatePlan(plan([step('a', 'lookup', { query: 'q' }), step('a', 'lookup', { query: 'q' })]), registry, budget).errors.join(' '),
    ).toMatch(/duplicate step id/);
  });

  it('rejects plans over the step or tool-call budget', () => {
    const steps = Array.from({ length: 6 }, (_, i) => step(`s${i}`, 'lookup', { query: 'q' }));
    const r = validatePlan(plan(steps), registry, budget);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/budget allows 5/);
  });

  it('rejects an approval-gated tool unless the plan requests approval', () => {
    const steps = [step('x', 'delete_everything', { query: 'q' })];
    expect(validatePlan(plan(steps), registry, budget).ok).toBe(false);
    expect(validatePlan(plan(steps, { requiresUserApproval: true }), registry, budget).ok).toBe(true);
  });

  it('rejects an empty plan', () => {
    expect(validatePlan(plan([]), registry, budget).ok).toBe(false);
  });

  it('the exam-overview template validates against the real tool registry', () => {
    const p = examOverviewWorkflow.buildPlan('Give me an overview of the SSC CGL exam');
    const r = validatePlan(p, getDefaultToolRegistry(), resolveBudget(examOverviewWorkflow.budget));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

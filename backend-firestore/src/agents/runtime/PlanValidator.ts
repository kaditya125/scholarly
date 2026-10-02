import { AgentBudget, AgentPlan } from './agent.types';
import { ToolRegistry } from '../tools/ToolRegistry';
import { collectRefs } from './stepRefs';

/**
 * PlanValidator — nothing executes until the whole plan passes.
 *
 * A plan is data (from a workflow template today; from a model proposal in Phase 7). Before any
 * tool runs, this checks that: every tool is registered; every literal input satisfies the tool's
 * schema; step ids are well-formed and unique; dependencies exist and form a DAG; references only
 * point along declared dependency edges; the plan fits the run's budget; and approval-gated tools
 * are only present in a plan that asks for approval. It never repairs a plan — an invalid plan is
 * rejected with the full list of problems.
 */

export interface PlanValidationResult {
  ok: boolean;
  errors: string[];
  /** Topological execution order (ids), present when ok. */
  order?: string[];
}

const STEP_ID_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_INPUT_JSON_CHARS = 8_000;

export function validatePlan(plan: AgentPlan, registry: ToolRegistry, budget: AgentBudget): PlanValidationResult {
  const errors: string[] = [];

  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    return { ok: false, errors: ['plan has no steps'] };
  }
  if (plan.steps.length > budget.maxSteps) {
    errors.push(`plan has ${plan.steps.length} steps; the budget allows ${budget.maxSteps}`);
  }

  const ids = new Set<string>();
  for (const step of plan.steps) {
    if (!STEP_ID_PATTERN.test(step.id)) errors.push(`invalid step id "${step.id}"`);
    if (ids.has(step.id)) errors.push(`duplicate step id "${step.id}"`);
    ids.add(step.id);
    if (!step.label || typeof step.label !== 'string') errors.push(`step ${step.id} has no student-facing label`);
  }

  let minToolCalls = 0;
  for (const step of plan.steps) {
    const tool = registry.get(step.tool);
    if (!tool) {
      errors.push(`step ${step.id} uses unregistered tool "${step.tool}"`);
      continue;
    }
    minToolCalls += 1;

    if (tool.requiresApproval && !plan.requiresUserApproval) {
      errors.push(`step ${step.id} uses approval-gated tool "${step.tool}" but the plan does not request approval`);
    }

    const input = step.input ?? {};
    if (typeof input !== 'object' || Array.isArray(input)) {
      errors.push(`step ${step.id} input must be an object`);
      continue;
    }
    if (JSON.stringify(input).length > MAX_INPUT_JSON_CHARS) {
      errors.push(`step ${step.id} input is larger than ${MAX_INPUT_JSON_CHARS} characters`);
    }

    const deps = Array.isArray(step.dependsOn) ? step.dependsOn : [];
    for (const dep of deps) {
      if (dep === step.id) errors.push(`step ${step.id} depends on itself`);
      else if (!ids.has(dep)) errors.push(`step ${step.id} depends on unknown step "${dep}"`);
    }

    // References must follow declared edges, and the referenced keys must exist in the schema.
    const refs = collectRefs(input as Record<string, unknown>);
    const shapeKeys = new Set(Object.keys(tool.inputSchema.shape));
    for (const { key, ref } of refs) {
      if (!deps.includes(ref.$ref)) {
        errors.push(`step ${step.id} input "${key}" references "${ref.$ref}", which is not in dependsOn`);
      }
      if (!shapeKeys.has(key)) {
        errors.push(`step ${step.id} input "${key}" is not a field of tool "${step.tool}"`);
      }
    }

    // Literal fields must satisfy the schema now; referenced fields are checked after resolution.
    const refKeys = new Set(refs.map((r) => r.key));
    const literal: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (!refKeys.has(k)) literal[k] = v;
    }
    const partialMask: Record<string, true> = {};
    for (const k of refKeys) if (shapeKeys.has(k)) partialMask[k] = true;
    const literalSchema = Object.keys(partialMask).length
      ? tool.inputSchema.partial(partialMask as any).strict()
      : tool.inputSchema.strict();
    const parsed = literalSchema.safeParse(literal);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      errors.push(`step ${step.id} input does not match tool "${step.tool}": ${detail}`);
    }
  }

  if (minToolCalls > budget.maxToolCalls) {
    errors.push(`plan needs at least ${minToolCalls} tool calls; the budget allows ${budget.maxToolCalls}`);
  }

  // DAG check (Kahn). Unknown deps were already reported; ignore them here.
  const order: string[] = [];
  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const step of plan.steps) {
    indegree.set(step.id, 0);
    children.set(step.id, []);
  }
  for (const step of plan.steps) {
    for (const dep of step.dependsOn ?? []) {
      if (!ids.has(dep) || dep === step.id) continue;
      indegree.set(step.id, (indegree.get(step.id) ?? 0) + 1);
      children.get(dep)!.push(step.id);
    }
  }
  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const child of children.get(id) ?? []) {
      const d = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, d);
      if (d === 0) queue.push(child);
    }
  }
  if (order.length !== ids.size) {
    errors.push('plan dependencies contain a cycle');
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [], order };
}

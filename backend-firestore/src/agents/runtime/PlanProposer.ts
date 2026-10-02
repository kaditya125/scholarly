import { AgentBudget, AgentPlan, AgentStep, StepType } from './agent.types';
import { ToolRegistry } from '../tools/ToolRegistry';
import { validatePlan } from './PlanValidator';

/**
 * Model-proposed plans, under validation (Phase 7; architecture §2.3).
 *
 * For open-ended goals ("Prepare me for X") a model may PROPOSE the steps. It sees the goal, a
 * few lines about the student (selective memory — never their record), the tools it may use and a
 * worked example: the workflow's own template plan. What it returns is only data. It must pass
 * PlanValidator (registered tools, schema-valid literal inputs, references along declared edges,
 * an acyclic graph, the run's budget) and the workflow's policy (which tools, wired how) before
 * anything runs; the model never dispatches a tool. Any failure — an invalid plan, a timeout, a
 * busy model — falls back to the template plan, and the reason is recorded with the run.
 */

export interface PlanProposal {
  plan: AgentPlan;
  source: 'model' | 'template';
  /** The model's one-line account of its plan, or why its plan was not used. */
  notes: string[];
  usage: { tokens: number; costUsd: number };
}

export interface ProposeArgs {
  goal: string;
  workflowId: string;
  userId: string;
  /** What the model is told about the student: a few lines, from selective memory. */
  facts: string[];
  /** The only tools the plan may use. */
  allow: string[];
  /** The workflow's own plan for this goal: the worked example, and the fallback. */
  template: AgentPlan;
  registry: ToolRegistry;
  budget: AgentBudget;
  /** Rules beyond the validator's (required tools, required wiring). Returns problems. */
  policy: (plan: AgentPlan) => string[];
  maxSteps: number;
  today: string;
  timeoutMs?: number;
  /** Injectable model call, for tests; defaults to the grounded JSON call. */
  callModel?: (prompt: string, system: string) => Promise<{ json: any; usage: { tokens: number; costUsd: number } }>;
}

const STEP_TYPES: StepType[] = ['retrieve', 'search', 'analyze', 'generate', 'transform', 'verify', 'export', 'practice', 'teach', 'schedule'];
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** A tool as the model sees it: name, inputs, output fields it can reference, purpose. */
function describeTool(registry: ToolRegistry, name: string): string | null {
  const tool = registry.get(name);
  if (!tool) return null;
  const inputs = Object.entries((tool.inputSchema as any).shape ?? {})
    .map(([k, v]: [string, any]) => `${k}${v?.isOptional?.() ? '?' : ''}`)
    .join(', ');
  const out: any = tool.outputSchema as any;
  const outShape = out?.shape ?? out?._def?.schema?.shape ?? out?._def?.innerType?.shape;
  const outputs = outShape ? Object.keys(outShape).join(', ') : 'object';
  return `- ${name}(${inputs}) → {${outputs}}: ${clip(String(tool.description).split(/(?<=[.:])\s/)[0], 240)}`;
}

/** The template plan as an example: only what a step is, not the goal-specific literals' internals. */
const exampleOf = (plan: AgentPlan) =>
  JSON.stringify({
    steps: plan.steps.map((s) => ({ id: s.id, tool: s.tool, label: s.label, objective: s.objective, type: s.type, input: s.input, dependsOn: s.dependsOn })),
  });

export function buildPlannerPrompt(args: Pick<ProposeArgs, 'goal' | 'facts' | 'allow' | 'template' | 'registry' | 'maxSteps' | 'today'>): { prompt: string; system: string } {
  const catalog = args.allow.map((n) => describeTool(args.registry, n)).filter(Boolean);
  const prompt = [
    `Goal, in the student's words: "${clip(args.goal, 400)}"`,
    `Today: ${args.today}.`,
    'What is known about the student (only this):',
    ...args.facts.map((f) => `- ${f}`),
    '',
    'Tools you may use, and only these (inputs → output fields you can reference):',
    ...catalog,
    '',
    'How to write steps:',
    '- Each step: {"id": short_snake_case, "tool": one of the tools, "label": what the student sees while it runs (plain words, under 60 characters), "objective": one sentence, "type": "retrieve" | "analyze" | "generate" | "export", "input": {...}, "dependsOn": [step ids]}.',
    '- To pass an earlier step\'s output, write {"$ref": "<step id>"} for all of it or {"$ref": "<step id>", "path": "<output field>"} for one field, as the whole value of an input field, and list that step in dependsOn.',
    '- Steps that do not depend on each other run at the same time. Use each tool at most once.',
    `- At most ${args.maxSteps} steps. The last step saves the result for the student.`,
    '- Use the goal text exactly as given where a tool takes the request.',
    '',
    'This is how the goal is planned by default. Keep it, or drop steps that cannot help this student and add ones from the list that would:',
    exampleOf(args.template),
    '',
    'Reply with JSON only: {"steps": [...], "why": "one sentence: what you changed from the default plan and why, or \'kept the default plan\'"}',
  ].join('\n');
  const system = 'You plan the steps of a study agent. You only write the plan as JSON; code checks it and runs it.';
  return { prompt, system };
}

/** Turns the model's JSON into plan steps; anything malformed is left for the validator to reject. */
export function stepsFromModel(json: any, template: AgentPlan): AgentStep[] {
  const raw: any[] = Array.isArray(json?.steps) ? json.steps.slice(0, 20) : [];
  const templateLabel = new Map(template.steps.map((s) => [s.tool, s.label]));
  return raw.map((s) => {
    const tool = String(s?.tool ?? '');
    const label = String(s?.label ?? '').replace(/\s+/g, ' ').trim();
    const type = STEP_TYPES.includes(s?.type) ? s.type : 'retrieve';
    return {
      id: String(s?.id ?? ''),
      objective: clip(String(s?.objective ?? '').replace(/\s+/g, ' ').trim() || tool, 200),
      label: label ? clip(label, 60) : templateLabel.get(tool) ?? tool,
      type,
      tool,
      input: s?.input && typeof s.input === 'object' && !Array.isArray(s.input) ? s.input : {},
      dependsOn: Array.isArray(s?.dependsOn) ? s.dependsOn.map(String) : [],
    };
  });
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`planner timed out after ${ms} ms`)), ms);
    (t as any).unref?.();
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

export async function proposePlan(args: ProposeArgs): Promise<PlanProposal> {
  const usage = { tokens: 0, costUsd: 0 };
  const fallback = (notes: string[]): PlanProposal => ({ plan: args.template, source: 'template', notes: notes.slice(0, 6), usage });
  const { prompt, system } = buildPlannerPrompt(args);
  const call =
    args.callModel ??
    (async (p: string, s: string) => {
      const { callJson } = require('../tools/adapters/grounded');
      return callJson(p, s, { userId: args.userId, operation: 'agent_plan_proposal' });
    });

  let json: any;
  try {
    const res = await withTimeout(call(prompt, system), args.timeoutMs ?? 25_000);
    json = res.json;
    usage.tokens += res.usage?.tokens ?? 0;
    usage.costUsd += res.usage?.costUsd ?? 0;
  } catch (e: any) {
    return fallback([`The planner was unavailable (${clip(String(e?.message ?? e), 120)}); the standard plan was used.`]);
  }

  const steps = stepsFromModel(json, args.template);
  const plan: AgentPlan = {
    goal: args.goal,
    workflowId: args.workflowId,
    estimatedComplexity: args.template.estimatedComplexity,
    requiresUserApproval: false,
    successCriteria: args.template.successCriteria,
    steps,
  };
  const problems: string[] = [];
  if (!steps.length) problems.push('the proposal had no steps');
  if (steps.length > args.maxSteps) problems.push(`the proposal had ${steps.length} steps; at most ${args.maxSteps} are allowed`);
  const allowed = new Set(args.allow);
  for (const s of steps) if (!allowed.has(s.tool)) problems.push(`step ${s.id} uses "${s.tool}", which this task may not use`);
  const tools = steps.map((s) => s.tool);
  if (new Set(tools).size !== tools.length) problems.push('the proposal used a tool more than once');
  if (!problems.length) {
    const validation = validatePlan(plan, args.registry, args.budget);
    problems.push(...validation.errors);
  }
  if (!problems.length) problems.push(...args.policy(plan));
  if (problems.length) return fallback(['The proposed plan was not used: ' + problems.slice(0, 4).join('; ') + '.']);

  const why = clip(String(json?.why ?? '').replace(/\s+/g, ' ').trim(), 240);
  return { plan, source: 'model', notes: why ? [why] : [], usage };
}

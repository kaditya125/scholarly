import { AgentBudget, AgentPlan, AgentRunResult, RunContext, StepState } from '../runtime/agent.types';
import type { PlanProposal } from '../runtime/PlanProposer';
import type { ToolRegistry } from '../tools/ToolRegistry';

/**
 * A workflow template turns a parsed goal into a plan — deterministically, in code. Known goals
 * (exam overview, formula chart, notes, flashcards, quiz, mock test, study plan…) are templates, so
 * their plans are testable, cheap and identical every time. Only open-ended goals (Phase 7) may
 * have a model propose a plan, and that proposal goes through the same PlanValidator.
 *
 * `evaluate` is the completion check: it reads what the steps actually produced and decides the
 * outcome from the success criteria — the run is never "complete" just because steps ended.
 */
export interface WorkflowTemplate {
  id: string;
  /** Student-facing name, e.g. "Exam overview". */
  title: string;
  description: string;
  /** Workflow-specific limits; can only tighten the deployment default. */
  budget?: Partial<AgentBudget>;
  /** Extra feature-flag gates beyond AGENT_MODE_ENABLED. */
  isEnabled?(): boolean;
  /** `context` carries what the turn attached (document ids); most workflows ignore it. */
  buildPlan(goal: string, context?: RunContext): AgentPlan;
  /**
   * Phase 7: an open-ended workflow may let a model PROPOSE its plan (see PlanProposer). The
   * proposal is checked before use, and `buildPlan` is both its worked example and its fallback.
   */
  proposePlan?(args: { goal: string; context?: RunContext; userId: string; registry: ToolRegistry; budget: AgentBudget }): Promise<PlanProposal>;
  evaluate(args: {
    goal: string;
    plan: AgentPlan;
    steps: ReadonlyMap<string, StepState>;
    outputs: ReadonlyMap<string, unknown>;
  }): AgentRunResult;
}

export class WorkflowRegistry {
  private readonly templates = new Map<string, WorkflowTemplate>();

  register(t: WorkflowTemplate): this {
    if (this.templates.has(t.id)) throw new Error(`workflow "${t.id}" already registered`);
    this.templates.set(t.id, t);
    return this;
  }

  get(id: string): WorkflowTemplate | undefined {
    const t = this.templates.get(id);
    if (!t) return undefined;
    return t.isEnabled && !t.isEnabled() ? undefined : t;
  }

  ids(): string[] {
    return [...this.templates.keys()].filter((id) => this.get(id));
  }
}

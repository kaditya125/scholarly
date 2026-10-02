import { z } from 'zod';
import { Provenance } from '../runtime/agent.types';

/**
 * ToolRegistry — the complete list of things an agent is allowed to do.
 *
 * Every capability the runtime can invoke is a ToolDefinition registered here, with its schemas,
 * permissions, cost class, timeout, retry policy and approval rule. The PlanValidator rejects any
 * step naming a tool that is not registered, and the executor only ever dispatches through this
 * registry — there is no code path from model output to an arbitrary function.
 *
 * Tools wrap existing services; they never re-implement retrieval, generation or storage.
 */

export type ToolCategory =
  | 'knowledge'
  | 'web'
  | 'document'
  | 'asset'
  | 'assessment'
  | 'student'
  | 'planning'
  | 'artifact';

/** What a tool touches. Checked by policy; enforced inside the tool against ctx.userId. */
export type ToolPermission =
  | 'read:shared-corpus'
  | 'read:own-notebook'
  | 'read:own-history'
  | 'read:own-artifact'
  | 'write:own-artifact'
  | 'network:web';

export type CostClass = 'free' | 'low' | 'medium' | 'high';

export interface RetryPolicy {
  /** Total attempts including the first. 1 = never retry. */
  maxAttempts: number;
  /** First backoff; doubles per retry (with jitter). */
  baseBackoffMs: number;
}

/**
 * Per-call context. `userId` is the run owner's uid, which came from a verified Firebase token —
 * never from the plan, the model or tool arguments. Tools that touch user-owned data must check
 * ownership against it.
 */
export interface ToolContext {
  userId: string;
  runId: string;
  stepId: string;
  signal: AbortSignal;
}

export interface ToolResult<O> {
  data: O;
  provenance: Provenance;
  /** Optional precise usage when the tool knows it (LLM tools); otherwise the executor estimates. */
  usage?: { tokens?: number; costUsd?: number };
}

export interface ToolDefinition<I extends z.ZodRawShape = z.ZodRawShape, O = unknown> {
  /** snake_case, unique. */
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: z.ZodObject<I>;
  outputSchema: z.ZodType<O>;
  permissions: ToolPermission[];
  costClass: CostClass;
  timeoutMs: number;
  retry: RetryPolicy;
  /** Safe to repeat with the same input (read-only tools). Required for automatic retries. */
  idempotent: boolean;
  /** Pauses the run for explicit student approval before executing. */
  requiresApproval: boolean;
  /** Default provenance of this tool's results. */
  provenance: Provenance;
  /**
   * Read at lookup time, so a feature flag can gate a tool without a restart. A disabled tool is
   * invisible: it is not listed, and the validator rejects any plan naming it, exactly as if it
   * were never registered.
   */
  isEnabled?: () => boolean;
  execute(input: z.infer<z.ZodObject<I>>, ctx: ToolContext): Promise<ToolResult<O>>;
  /** Counts / ids for step state and events. Must never include student data or long text. */
  summarize?(output: O): Record<string, unknown>;
}

/** Public, non-executable description of a tool (for the API / UI / docs). */
export interface ToolDescriptor {
  name: string;
  description: string;
  category: ToolCategory;
  permissions: ToolPermission[];
  costClass: CostClass;
  timeoutMs: number;
  maxAttempts: number;
  idempotent: boolean;
  requiresApproval: boolean;
  provenance: Provenance;
  inputFields: string[];
}

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<any, any>>();

  register<I extends z.ZodRawShape, O>(def: ToolDefinition<I, O>): this {
    if (!TOOL_NAME_PATTERN.test(def.name)) {
      throw new Error(`Invalid tool name "${def.name}" — must match ${TOOL_NAME_PATTERN}`);
    }
    if (this.tools.has(def.name)) {
      throw new Error(`Tool "${def.name}" is already registered`);
    }
    if (def.retry.maxAttempts < 1 || def.retry.maxAttempts > 5) {
      throw new Error(`Tool "${def.name}": retry.maxAttempts must be 1..5`);
    }
    if (def.retry.maxAttempts > 1 && !def.idempotent) {
      // Retrying a non-idempotent tool can duplicate a write (two artifacts, two charges).
      throw new Error(`Tool "${def.name}" retries but is not idempotent`);
    }
    if (def.timeoutMs <= 0 || def.timeoutMs > 300_000) {
      throw new Error(`Tool "${def.name}": timeoutMs must be 1..300000`);
    }
    this.tools.set(def.name, def as ToolDefinition<any, any>);
    return this;
  }

  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  get(name: string): ToolDefinition<any, any> | undefined {
    const tool = this.tools.get(name);
    if (!tool) return undefined;
    return tool.isEnabled && !tool.isEnabled() ? undefined : tool;
  }

  /** Registered names whose tool is currently enabled. */
  names(): string[] {
    return [...this.tools.keys()].filter((name) => this.get(name)).sort();
  }

  list(): ToolDescriptor[] {
    return this.names().map((name) => {
      const t = this.tools.get(name)!;
      return {
        name: t.name,
        description: t.description,
        category: t.category,
        permissions: [...t.permissions],
        costClass: t.costClass,
        timeoutMs: t.timeoutMs,
        maxAttempts: t.retry.maxAttempts,
        idempotent: t.idempotent,
        requiresApproval: t.requiresApproval,
        provenance: t.provenance,
        inputFields: Object.keys(t.inputSchema.shape),
      };
    });
  }
}

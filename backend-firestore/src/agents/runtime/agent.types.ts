/**
 * Agent Mode — shared types.
 *
 * The runtime turns a student's GOAL into a validated plan of registered tool calls, executes it,
 * and persists everything it did. These types are the contract between the planner, the validator,
 * the executor, the run store, the event stream and the HTTP layer. Nothing here is model output:
 * a plan is data the backend builds (from a workflow template) or validates (Phase 7 proposals)
 * before a single tool runs.
 */

/** Where a piece of information came from. Carried by every tool result; never silently mixed. */
export type Provenance =
  /** Sadhya's verified corpora: official syllabi, NCERT, verified PYQs, reference books, derived analytics. */
  | 'VERIFIED_CORPUS'
  /** A document the student uploaded (their own notebook). */
  | 'STUDENT_UPLOAD'
  /** Live web search results. */
  | 'WEB'
  /** Text or structure the model produced. */
  | 'GENERATED'
  /** Deterministic system lookups (identifier resolution, bookkeeping). */
  | 'SYSTEM';

/** Why a tool call or step failed. Drives retry decisions and the student-facing explanation. */
export type FailureClass =
  | 'validation'   // bad input/output shape — never retried
  | 'permission'   // caller may not touch this resource — never retried
  | 'not_found'    // the thing asked for does not exist — never retried
  | 'timeout'      // took longer than the tool's timeout — retried
  | 'rate_limit'   // provider throttled us — retried with backoff
  | 'network'      // transient transport failure — retried
  | 'cancelled'    // the run was cancelled — never retried
  | 'budget'       // the run's budget is spent — never retried
  | 'internal';    // anything else — not retried by default

export type AgentRunStatus =
  | 'queued'
  | 'planning'
  | 'executing'
  | 'waiting'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const TERMINAL_RUN_STATUSES: readonly AgentRunStatus[] = ['completed', 'failed', 'cancelled'];
export const ACTIVE_RUN_STATUSES: readonly AgentRunStatus[] = ['queued', 'planning', 'executing', 'waiting', 'verifying'];

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';

export type StepType =
  | 'retrieve'
  | 'search'
  | 'analyze'
  | 'generate'
  | 'transform'
  | 'verify'
  | 'export'
  | 'practice'
  | 'teach'
  | 'schedule';

/**
 * A reference from one step's input to an earlier step's output. `{ $ref: 's1', path: 'examId' }`
 * resolves to `outputs.s1.examId` at execution time. The referenced step must be listed in
 * `dependsOn` — the validator enforces it, so data can only flow along declared edges.
 */
export interface StepInputRef {
  $ref: string;
  path?: string;
}

export interface AgentStep {
  /** Short stable id, e.g. `resolve_exam`. `[a-z][a-z0-9_]{0,39}` */
  id: string;
  /** What this step is for, in plain words (internal). */
  objective: string;
  /** The label a student sees while this step runs — never a prompt or model reasoning. */
  label: string;
  type: StepType;
  /** Registered tool name. The validator rejects anything not in the ToolRegistry. */
  tool: string;
  /** Tool input. Values may be literals or StepInputRef objects. */
  input: Record<string, unknown>;
  dependsOn: string[];
  /** When true, this step failing does not fail the run (it is recorded, and the run can still succeed). */
  optional?: boolean;
}

export interface SuccessCriterion {
  id: string;
  description: string;
}

export interface AgentPlan {
  goal: string;
  workflowId: string;
  successCriteria: SuccessCriterion[];
  steps: AgentStep[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  requiresUserApproval: boolean;
}

export interface AgentBudget {
  maxSteps: number;
  maxToolCalls: number;
  maxTokens: number;
  maxExecutionMs: number;
  maxCostUsd: number;
}

export interface AgentUsage {
  steps: number;
  toolCalls: number;
  tokens: number;
  costUsd: number;
  elapsedMs: number;
}

export interface AgentError {
  class: FailureClass;
  /** Student-safe explanation. Never a stack trace, prompt or provider payload. */
  message: string;
  stepId?: string;
}

export interface StepState {
  id: string;
  label: string;
  tool: string;
  status: StepStatus;
  attempts: number;
  startedAt?: number;
  completedAt?: number;
  /** Counts / ids only — full outputs live in the step_outputs subcollection. */
  outputSummary?: Record<string, unknown>;
  provenance?: Provenance;
  error?: AgentError;
  skippedReason?: string;
}

export interface ToolCallRecord {
  id: string;
  runId: string;
  stepId: string;
  tool: string;
  attempt: number;
  status: 'ok' | 'error';
  latencyMs: number;
  startedAt: number;
  failureClass?: FailureClass;
  errorMessage?: string;
  provenance?: Provenance;
  /** Size-capped JSON of the resolved input — for debugging; tools never receive identity through it. */
  inputPreview: string;
  tokens?: number;
  costUsd?: number;
}

export type AgentRunOutcome = 'success' | 'partial' | 'no_result';

export interface AgentRunResult {
  outcome: AgentRunOutcome;
  /** Student-facing markdown summary. */
  summary: string;
  /** Structured result for the UI / follow-ups. Size-capped by the store. */
  data?: Record<string, unknown>;
  /** What was completed and what failed — the brief's §45 failure UX, in data form. */
  completed: string[];
  failed: string[];
}

/**
 * What a run is about beyond its words: documents the student attached to the turn. Ids only —
 * every tool that reads them checks they belong to the run's user.
 */
export interface RunContext {
  uploadIds?: string[];
}

export interface AgentRunDoc {
  runId: string;
  userId: string;
  sessionId?: string;
  goal: string;
  workflowId: string;
  source: 'api' | 'chat';
  context?: RunContext;
  status: AgentRunStatus;
  plan?: AgentPlan;
  /** Whether a model proposed the plan (and it passed every check) or the template was used. */
  planSource?: 'model' | 'template';
  /** The model's account of its plan, or why its proposal was not used. */
  planNotes?: string[];
  steps: StepState[];
  budget: AgentBudget;
  usage: AgentUsage;
  result?: AgentRunResult;
  error?: AgentError;
  artifactIds: string[];
  cancelRequested: boolean;
  lastEventSeq: number;
  lease?: { owner: string; expiresAt: number };
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
}

export type AgentEventType =
  | 'agent.started'
  | 'agent.planning'
  | 'agent.plan_ready'
  | 'agent.step.started'
  | 'agent.step.completed'
  | 'agent.step.failed'
  | 'agent.step.skipped'
  | 'agent.tool.started'
  | 'agent.tool.completed'
  | 'agent.tool.failed'
  | 'agent.artifact.started'
  | 'agent.artifact.ready'
  | 'agent.verification.started'
  | 'agent.verification.completed'
  | 'agent.waiting_for_user'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.cancelled';

export const TERMINAL_EVENT_TYPES: readonly AgentEventType[] = ['agent.completed', 'agent.failed', 'agent.cancelled'];

/**
 * One persisted, replayable event. Payloads carry student-facing labels, counts and ids — never
 * prompts, raw tool payloads or model reasoning.
 */
export interface AgentEvent {
  runId: string;
  /** Monotonic per run, starting at 1. Doubles as the SSE event id for replay. */
  seq: number;
  type: AgentEventType;
  ts: number;
  label?: string;
  stepId?: string;
  tool?: string;
  data?: Record<string, unknown>;
}

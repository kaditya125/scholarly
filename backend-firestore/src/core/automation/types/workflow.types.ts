/**
 * @file workflow.types.ts
 * @description Core domain TypeScript definitions for Scholarly Automation Studio.
 */

export type WorkflowStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export type WorkflowScope = 'SYSTEM' | 'ORGANIZATION' | 'TEACHER' | 'STUDENT';

export type NodeCategory =
  | 'Trigger'
  | 'Student'
  | 'Syllabus'
  | 'Mastery'
  | 'Assessment'
  | 'AI'
  | 'Logic'
  | 'Data'
  | 'Messaging'
  | 'Flow';

export type NodeExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'WAITING';

export type WorkflowExecutionStatus = 'QUEUED' | 'RUNNING' | 'WAITING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface WorkflowVariableDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  defaultValue?: unknown;
  description?: string;
}

export interface WorkflowTriggerConfig {
  type: 'EVENT' | 'SCHEDULE' | 'MANUAL';
  eventType?: string; // e.g. 'learning.quiz_completed', 'user.registered'
  schedule?: {
    cronExpression?: string;
    intervalMinutes?: number;
    timezone?: string;
  };
  filterCondition?: {
    field: string;
    operator: 'equals' | 'not_equals' | 'less_than' | 'greater_than' | 'contains' | 'in';
    value: unknown;
  };
}

export interface WorkflowNodeConfig {
  id: string;
  type: string;
  label: string;
  category: NodeCategory;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface WorkflowEdgeConfig {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: 'source' | 'true' | 'false' | string;
  targetHandle?: string;
  condition?: {
    field: string;
    operator: 'equals' | 'not_equals' | 'less_than' | 'greater_than' | 'contains' | 'in';
    value: unknown;
  };
}

export interface WorkflowDefinition {
  id: string;
  scope: WorkflowScope;
  organizationId?: string;
  teacherId?: string;
  classId?: string;

  name: string;
  description?: string;

  version: number;
  activeVersionId?: string;

  status: WorkflowStatus;

  trigger: WorkflowTriggerConfig;
  nodes: WorkflowNodeConfig[];
  edges: WorkflowEdgeConfig[];
  variables: Record<string, WorkflowVariableDef>;

  rateLimits?: {
    maxExecutionsPerMinute?: number;
    maxMessagesPerStudentDay?: number;
  };

  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowVersion {
  id: string; // e.g. "wf_123_v1"
  workflowId: string;
  versionNumber: number;
  definitionSnapshot: WorkflowDefinition;
  publishedBy: string;
  publishedAt: number;
  status: 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED';
}

export interface WorkflowExecutionContext {
  executionId: string;
  workflowId: string;
  workflowVersion: number;
  organizationId?: string;
  teacherId?: string;
  classId?: string;
  studentId?: string;

  examContext?: {
    examId: string;
    cycleId: string;
    syllabusId?: string;
    syllabusNodeId?: string;
  };

  triggerEvent?: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>; // Keyed by nodeId
  variables: Record<string, unknown>;
  isSimulation: boolean;
  startedAt: number;
  correlationId?: string;
}

export interface WorkflowNodeExecution {
  id: string;
  executionId: string;
  workflowId: string;
  workflowVersion: number;
  nodeId: string;
  nodeType: string;
  status: NodeExecutionStatus;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: {
    message: string;
    code?: string;
    stack?: string;
    retryable?: boolean;
  };
  retryCount: number;
}

export interface WorkflowExecutionRecord {
  id: string;
  workflowId: string;
  workflowVersion: number;
  workflowVersionId?: string;
  definitionSnapshot?: WorkflowDefinition;
  status: WorkflowExecutionStatus;
  organizationId?: string;
  teacherId?: string;
  studentId?: string;
  triggeredBy: string;
  triggerEvent?: Record<string, unknown>;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  waitingOnNodeId?: string;
  resumeAt?: number;
  lastHeartbeatAt?: number;
  leaseExpiresAt?: number;
  workerId?: string;
  isSimulation: boolean;
  nodeStatuses: Record<string, NodeExecutionStatus>;
  error?: {
    message: string;
    nodeId?: string;
  };
}

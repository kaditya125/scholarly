/**
 * @file automations.ts
 * @description Frontend API client for Scholarly Automation Studio.
 */

import { api } from './client';

export interface NodeCatalogItem {
  type: string;
  category: string;
  label: string;
  description: string;
  icon?: string;
  requiresStudent: boolean;
  requiresExamContext: boolean;
  requiresCanonicalContext: boolean;
  producesExternalSideEffect: boolean;
  supportsSimulation: boolean;
}

export interface WorkflowNodeConfig {
  id: string;
  type: string;
  label: string;
  category: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface WorkflowEdgeConfig {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
  targetHandle?: string;
  condition?: {
    field: string;
    operator: string;
    value: unknown;
  };
}

export interface WorkflowDefinition {
  id: string;
  scope: string;
  organizationId?: string;
  teacherId?: string;
  name: string;
  description?: string;
  version: number;
  activeVersionId?: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  trigger: {
    type: 'EVENT' | 'SCHEDULE' | 'MANUAL';
    eventType?: string;
    schedule?: {
      cronExpression?: string;
      intervalMinutes?: number;
      timezone?: string;
    };
  };
  nodes: WorkflowNodeConfig[];
  edges: WorkflowEdgeConfig[];
  variables: Record<string, unknown>;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowExecutionRecord {
  id: string;
  workflowId: string;
  workflowVersion: number;
  status: 'QUEUED' | 'RUNNING' | 'WAITING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  isSimulation: boolean;
  studentId?: string;
  nodeStatuses: Record<string, string>;
  error?: {
    message: string;
    nodeId?: string;
  };
}

export interface WorkflowNodeExecution {
  id: string;
  executionId: string;
  workflowId: string;
  nodeId: string;
  nodeType: string;
  status: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: {
    message: string;
  };
}

export const automationsApi = {
  async getNodeCatalog(): Promise<NodeCatalogItem[]> {
    const res = await api.get('/automations/nodes/catalog');
    return res.data.catalog || [];
  },

  async listWorkflows(scope?: string): Promise<WorkflowDefinition[]> {
    const res = await api.get('/automations/workflows', { params: { scope } });
    return res.data.workflows || [];
  },

  async getWorkflow(id: string): Promise<WorkflowDefinition> {
    const res = await api.get(`/automations/workflows/${id}`);
    return res.data.workflow;
  },

  async createWorkflow(payload: Partial<WorkflowDefinition>): Promise<WorkflowDefinition> {
    const res = await api.post('/automations/workflows', payload);
    return res.data.workflow;
  },

  async updateWorkflow(id: string, payload: Partial<WorkflowDefinition>): Promise<WorkflowDefinition> {
    const res = await api.patch(`/automations/workflows/${id}`, payload);
    return res.data.workflow;
  },

  async activateWorkflow(id: string): Promise<{ workflow: WorkflowDefinition; version: any }> {
    const res = await api.post(`/automations/workflows/${id}/activate`);
    return res.data;
  },

  async pauseWorkflow(id: string): Promise<WorkflowDefinition> {
    const res = await api.post(`/automations/workflows/${id}/pause`);
    return res.data.workflow;
  },

  async testWorkflow(id: string, sampleEvent?: Record<string, unknown>, studentId?: string): Promise<WorkflowExecutionRecord> {
    const res = await api.post(`/automations/workflows/${id}/test`, { sampleEvent, studentId });
    return res.data.execution;
  },

  async listExecutions(workflowId: string): Promise<WorkflowExecutionRecord[]> {
    const res = await api.get(`/automations/workflows/${workflowId}/executions`);
    return res.data.executions || [];
  },

  async getExecutionDetail(executionId: string): Promise<{ execution: WorkflowExecutionRecord; nodeExecutions: WorkflowNodeExecution[] }> {
    const res = await api.get(`/automations/executions/${executionId}`);
    return res.data;
  }
};

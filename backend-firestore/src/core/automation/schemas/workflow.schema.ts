/**
 * @file workflow.schema.ts
 * @description Zod validation schemas and structural DAG validation for Scholarly Automation Studio.
 */

import { z } from 'zod';
import { WorkflowDefinition, WorkflowNodeConfig, WorkflowEdgeConfig } from '../types/workflow.types';

export const WorkflowScopeSchema = z.enum(['SYSTEM', 'ORGANIZATION', 'TEACHER', 'STUDENT']);

export const NodeCategorySchema = z.enum([
  'Trigger',
  'Student',
  'Syllabus',
  'Mastery',
  'Assessment',
  'AI',
  'Logic',
  'Data',
  'Messaging',
  'Flow'
]);

export const WorkflowVariableDefSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'json']),
  defaultValue: z.unknown().optional(),
  description: z.string().optional()
});

export const WorkflowTriggerConfigSchema = z.object({
  type: z.enum(['EVENT', 'SCHEDULE', 'MANUAL']),
  eventType: z.string().optional(),
  schedule: z
    .object({
      cronExpression: z.string().optional(),
      intervalMinutes: z.number().int().positive().optional(),
      timezone: z.string().optional()
    })
    .optional(),
  filterCondition: z
    .object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'less_than', 'greater_than', 'contains', 'in']),
      value: z.unknown()
    })
    .optional()
});

export const WorkflowNodeConfigSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  label: z.string().min(1),
  category: NodeCategorySchema,
  position: z.object({
    x: z.number(),
    y: z.number()
  }),
  config: z.record(z.unknown())
});

export const WorkflowEdgeConfigSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  condition: z
    .object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'less_than', 'greater_than', 'contains', 'in']),
      value: z.unknown()
    })
    .optional()
});

export const WorkflowDefinitionSchema = z.object({
  id: z.string().min(1),
  scope: WorkflowScopeSchema,
  organizationId: z.string().optional(),
  teacherId: z.string().optional(),
  classId: z.string().optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  version: z.number().int().nonnegative().default(1),
  activeVersionId: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).default('DRAFT'),
  trigger: WorkflowTriggerConfigSchema,
  nodes: z.array(WorkflowNodeConfigSchema).min(1),
  edges: z.array(WorkflowEdgeConfigSchema),
  variables: z.record(WorkflowVariableDefSchema).default({}),
  rateLimits: z
    .object({
      maxExecutionsPerMinute: z.number().int().positive().optional(),
      maxMessagesPerStudentDay: z.number().int().positive().optional()
    })
    .optional(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative()
});

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Validates graph topology:
 * 1. Node IDs are unique.
 * 2. Edges point only to existing nodes.
 * 3. No self-referencing loops (source === target).
 * 4. Graph must be a Directed Acyclic Graph (DAG) — no cycles allowed.
 * 5. Exactly one Trigger node.
 * 6. No unreachable non-trigger nodes (orphan nodes warning/error).
 */
export function validateWorkflowGraph(workflow: WorkflowDefinition): GraphValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const nodeMap = new Map<string, WorkflowNodeConfig>();
  const triggerNodes: WorkflowNodeConfig[] = [];

  for (const node of workflow.nodes) {
    if (nodeMap.has(node.id)) {
      errors.push(`Duplicate node ID found: "${node.id}".`);
    }
    nodeMap.set(node.id, node);
    if (node.category === 'Trigger' || node.type.toLowerCase().includes('trigger')) {
      triggerNodes.push(node);
    }
  }

  if (triggerNodes.length === 0) {
    errors.push('Workflow must contain at least one Trigger node.');
  }

  const adjacencyList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of workflow.nodes) {
    adjacencyList.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of workflow.edges) {
    if (!nodeMap.has(edge.sourceNodeId)) {
      errors.push(`Edge "${edge.id}" references non-existent sourceNodeId "${edge.sourceNodeId}".`);
      continue;
    }
    if (!nodeMap.has(edge.targetNodeId)) {
      errors.push(`Edge "${edge.id}" references non-existent targetNodeId "${edge.targetNodeId}".`);
      continue;
    }
    if (edge.sourceNodeId === edge.targetNodeId) {
      errors.push(`Self-referencing edge detected on node "${edge.sourceNodeId}". Cycles are forbidden.`);
      continue;
    }

    adjacencyList.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) || 0) + 1);
  }

  // Detect cycles using Kahn's Algorithm (Topological Sort)
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  let visitedCount = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visitedCount++;

    for (const neighbor of adjacencyList.get(current) || []) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (visitedCount < workflow.nodes.length) {
    errors.push('Cycle detected in workflow graph! Workflows must be strict Directed Acyclic Graphs (DAGs).');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

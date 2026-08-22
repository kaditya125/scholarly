/**
 * @file WorkflowRegistryAndValidation.test.ts
 * @description Unit tests for WorkflowNodeRegistry, Zod schema validation, and DAG validation.
 */

import { workflowNodeRegistry } from '../registry/WorkflowNodeRegistry';
import '../registry/nodes/index';
import { validateWorkflowGraph, WorkflowDefinitionSchema } from '../schemas/workflow.schema';
import { WorkflowDefinition } from '../types/workflow.types';

describe('WorkflowNodeRegistry & Validation Tests', () => {
  it('should have all standard MVP nodes registered', () => {
    const catalog = workflowNodeRegistry.getCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(18);

    const types = catalog.map(n => n.type);
    expect(types).toContain('TRIGGER_EVENT');
    expect(types).toContain('GET_STUDENT_PROFILE');
    expect(types).toContain('GET_STUDENT_MASTERY');
    expect(types).toContain('RESOLVE_SYLLABUS');
    expect(types).toContain('GENERATE_PRACTICE_QUIZ');
    expect(types).toContain('GENERATE_REMEDIAL_LESSON');
    expect(types).toContain('CONDITION_IF');
    expect(types).toContain('SEND_IN_APP_NOTIFICATION');
    expect(types).toContain('FLOW_WAIT');
  });

  it('should validate valid node configs and reject invalid ones', () => {
    const validIf = workflowNodeRegistry.validateNodeConfig('CONDITION_IF', {
      field: 'accuracy',
      operator: 'less_than',
      value: 60
    });
    expect(validIf.valid).toBe(true);

    const invalidIf = workflowNodeRegistry.validateNodeConfig('CONDITION_IF', {
      field: '',
      operator: 'invalid_operator'
    });
    expect(invalidIf.valid).toBe(false);
  });

  it('should validate a valid DAG workflow definition', () => {
    const validWorkflow: WorkflowDefinition = {
      id: 'wf_test_1',
      name: 'Weakness Recovery',
      scope: 'ORGANIZATION',
      organizationId: 'org_123',
      version: 1,
      status: 'DRAFT',
      trigger: {
        type: 'EVENT',
        eventType: 'learning.quiz_completed'
      },
      nodes: [
        {
          id: 'node_trigger',
          type: 'TRIGGER_EVENT',
          label: 'Quiz Completed',
          category: 'Trigger',
          position: { x: 100, y: 100 },
          config: { eventType: 'learning.quiz_completed' }
        },
        {
          id: 'node_mastery',
          type: 'GET_STUDENT_MASTERY',
          label: 'Get Mastery',
          category: 'Mastery',
          position: { x: 100, y: 200 },
          config: {}
        },
        {
          id: 'node_if',
          type: 'CONDITION_IF',
          label: 'Accuracy < 60%',
          category: 'Logic',
          position: { x: 100, y: 300 },
          config: { field: 'accuracy', operator: 'less_than', value: 60 }
        }
      ],
      edges: [
        {
          id: 'edge_1',
          sourceNodeId: 'node_trigger',
          targetNodeId: 'node_mastery'
        },
        {
          id: 'edge_2',
          sourceNodeId: 'node_mastery',
          targetNodeId: 'node_if'
        }
      ],
      variables: {},
      createdBy: 'user_admin',
      updatedBy: 'user_admin',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const schemaResult = WorkflowDefinitionSchema.safeParse(validWorkflow);
    expect(schemaResult.success).toBe(true);

    const graphResult = validateWorkflowGraph(validWorkflow);
    expect(graphResult.valid).toBe(true);
    expect(graphResult.errors.length).toBe(0);
  });

  it('should detect cycles and reject invalid cyclic workflows', () => {
    const cyclicWorkflow: WorkflowDefinition = {
      id: 'wf_cyclic',
      name: 'Cyclic Workflow',
      scope: 'SYSTEM',
      version: 1,
      status: 'DRAFT',
      trigger: {
        type: 'EVENT',
        eventType: 'learning.quiz_completed'
      },
      nodes: [
        {
          id: 'node_1',
          type: 'TRIGGER_EVENT',
          label: 'Trigger',
          category: 'Trigger',
          position: { x: 100, y: 100 },
          config: { eventType: 'learning.quiz_completed' }
        },
        {
          id: 'node_2',
          type: 'GET_STUDENT_MASTERY',
          label: 'Mastery',
          category: 'Mastery',
          position: { x: 100, y: 200 },
          config: {}
        },
        {
          id: 'node_3',
          type: 'CONDITION_IF',
          label: 'Condition',
          category: 'Logic',
          position: { x: 100, y: 300 },
          config: { field: 'accuracy', operator: 'less_than', value: 60 }
        }
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'node_1', targetNodeId: 'node_2' },
        { id: 'e2', sourceNodeId: 'node_2', targetNodeId: 'node_3' },
        { id: 'e3', sourceNodeId: 'node_3', targetNodeId: 'node_2' } // Cycle!
      ],
      variables: {},
      createdBy: 'admin',
      updatedBy: 'admin',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const graphResult = validateWorkflowGraph(cyclicWorkflow);
    expect(graphResult.valid).toBe(false);
    expect(graphResult.errors.some(e => e.includes('Cycle detected'))).toBe(true);
  });

  it('should correctly evaluate logic condition nodes', async () => {
    const ifNode = workflowNodeRegistry.getNode('CONDITION_IF')!;
    const ctx = {
      executionId: 'exec_1',
      workflowId: 'wf_1',
      workflowVersion: 1,
      nodeOutputs: {},
      variables: {},
      isSimulation: false,
      startedAt: Date.now()
    };

    const resTrue = await ifNode.execute(ctx as any, { field: 'accuracy', operator: 'less_than', value: 60 }, { accuracy: 45 });
    expect(resTrue.result).toBe(true);

    const resFalse = await ifNode.execute(ctx as any, { field: 'accuracy', operator: 'less_than', value: 60 }, { accuracy: 75 });
    expect(resFalse.result).toBe(false);
  });
});

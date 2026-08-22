/**
 * @file AutomationEngine.ts
 * @description Durable DAG graph executor for Scholarly Automation Studio.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  WorkflowDefinition,
  WorkflowExecutionContext,
  WorkflowExecutionRecord,
  WorkflowNodeExecution,
  WorkflowNodeConfig,
  NodeExecutionStatus
} from '../types/workflow.types';
import { workflowNodeRegistry } from '../registry/WorkflowNodeRegistry';
import { automationExecutionRepository } from './AutomationExecutionRepository';
import { backgroundQueue } from '../../workflow/jobs/BackgroundQueue';
import { logger } from '../../../utils/logger';

export class AutomationEngine {
  private readonly LEASE_DURATION_MS = 60000; // 60 seconds lease

  /**
   * Initializes an immutable workflow execution record in Firestore and begins step execution.
   */
  async startExecution(
    workflow: WorkflowDefinition,
    triggerEvent: Record<string, unknown> = {},
    options: {
      studentId?: string;
      teacherId?: string;
      organizationId?: string;
      isSimulation?: boolean;
      triggeredBy?: string;
    } = {}
  ): Promise<WorkflowExecutionRecord> {
    const executionId = `exec_${uuidv4()}`;
    const now = Date.now();

    const nodeStatuses: Record<string, NodeExecutionStatus> = {};
    for (const node of workflow.nodes) {
      nodeStatuses[node.id] = 'PENDING';
    }

    // Freeze workflow definition snapshot into execution record for version immutability
    const definitionSnapshot: WorkflowDefinition = JSON.parse(JSON.stringify(workflow));

    const execution: WorkflowExecutionRecord = {
      id: executionId,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      workflowVersionId: workflow.activeVersionId || `v${workflow.version}`,
      definitionSnapshot,
      status: 'RUNNING',
      organizationId: options.organizationId || workflow.organizationId,
      teacherId: options.teacherId || workflow.teacherId,
      studentId: options.studentId,
      triggeredBy: options.triggeredBy || 'system',
      triggerEvent,
      startedAt: now,
      lastHeartbeatAt: now,
      leaseExpiresAt: now + this.LEASE_DURATION_MS,
      workerId: String(process.pid || 'worker_main'),
      isSimulation: !!options.isSimulation,
      nodeStatuses
    };

    await automationExecutionRepository.createExecution(execution);
    logger.info(`[AutomationEngine] Created execution ${executionId} for workflow ${workflow.id} (v${workflow.version})`);

    // Find the trigger node and start execution
    const triggerNode = definitionSnapshot.nodes.find(
      n => n.category === 'Trigger' || n.type.startsWith('TRIGGER_')
    );

    if (!triggerNode) {
      throw new Error(`[AutomationEngine] Workflow ${workflow.id} has no valid trigger node.`);
    }

    const context: WorkflowExecutionContext = {
      executionId,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      organizationId: execution.organizationId,
      teacherId: execution.teacherId,
      studentId: execution.studentId,
      triggerEvent,
      nodeOutputs: {},
      variables: {},
      isSimulation: execution.isSimulation,
      startedAt: now
    };

    return this.executeGraph(definitionSnapshot, execution, context, triggerNode.id);
  }

  /**
   * Executes the DAG step-by-step from a given starting node using the immutable workflow snapshot.
   */
  async executeGraph(
    workflow: WorkflowDefinition,
    execution: WorkflowExecutionRecord,
    context: WorkflowExecutionContext,
    startNodeId: string
  ): Promise<WorkflowExecutionRecord> {
    const readyQueue: string[] = [startNodeId];
    const nodeMap = new Map<string, WorkflowNodeConfig>();
    for (const n of workflow.nodes) {
      nodeMap.set(n.id, n);
    }

    while (readyQueue.length > 0) {
      const currentNodeId = readyQueue.shift()!;
      const nodeConfig = nodeMap.get(currentNodeId);
      if (!nodeConfig) continue;

      // Update lease heartbeat
      execution.lastHeartbeatAt = Date.now();
      execution.leaseExpiresAt = Date.now() + this.LEASE_DURATION_MS;

      // Check if all incoming edges from active branches are resolved
      const incomingEdges = workflow.edges.filter(e => e.targetNodeId === currentNodeId);
      const isReady = incomingEdges.every(e => {
        const sourceStatus = execution.nodeStatuses[e.sourceNodeId];
        return sourceStatus === 'COMPLETED' || sourceStatus === 'SKIPPED';
      });

      if (!isReady && currentNodeId !== startNodeId) {
        continue;
      }

      // Execute node
      const nodeResult = await this.executeSingleNode(nodeConfig, context);
      execution.nodeStatuses[currentNodeId] = nodeResult.status;

      if (nodeResult.status === 'FAILED') {
        execution.status = 'FAILED';
        execution.completedAt = Date.now();
        execution.durationMs = execution.completedAt - execution.startedAt;
        execution.error = {
          message: nodeResult.error?.message || 'Node execution failed',
          nodeId: currentNodeId
        };
        await automationExecutionRepository.updateExecution(execution.id, execution);
        return execution;
      }

      if (nodeResult.status === 'WAITING') {
        execution.status = 'WAITING';
        execution.waitingOnNodeId = currentNodeId;
        const durationMinutes = (nodeConfig.config.durationMinutes as number) || 1440;
        const durationMs = durationMinutes * 60 * 1000;
        execution.resumeAt = Date.now() + durationMs;

        await automationExecutionRepository.updateExecution(execution.id, execution);
        logger.info(`[AutomationEngine] Execution ${execution.id} paused at node ${currentNodeId} until ${execution.resumeAt}`);

        // Enqueue delayed BullMQ job for durable resumption
        try {
          await backgroundQueue.enqueueGeneric(
            'automation.resume_execution',
            { executionId: execution.id, nodeId: currentNodeId },
            3,
            5000,
            durationMs
          );
          logger.info(`[AutomationEngine] Enqueued delayed resume job for execution ${execution.id} in ${durationMs}ms`);
        } catch (e: any) {
          logger.warn(`[AutomationEngine] BullMQ unavailable for delayed job: ${e.message}`);
        }

        return execution;
      }

      // Store output in context
      context.nodeOutputs[currentNodeId] = nodeResult.output;

      // Find downstream nodes
      const outgoingEdges = workflow.edges.filter(e => e.sourceNodeId === currentNodeId);

      for (const edge of outgoingEdges) {
        let shouldTraverse = true;

        // Conditional branch resolution
        if (edge.sourceHandle === 'true' || edge.sourceHandle === 'false') {
          const conditionOutcome = (nodeResult.output as any)?.result;
          const expectedHandle = conditionOutcome ? 'true' : 'false';
          if (edge.sourceHandle !== expectedHandle) {
            shouldTraverse = false;
            execution.nodeStatuses[edge.targetNodeId] = 'SKIPPED';
          }
        }

        if (shouldTraverse && !readyQueue.includes(edge.targetNodeId)) {
          readyQueue.push(edge.targetNodeId);
        }
      }
    }

    // Complete workflow
    execution.status = 'COMPLETED';
    execution.completedAt = Date.now();
    execution.durationMs = execution.completedAt - execution.startedAt;
    await automationExecutionRepository.updateExecution(execution.id, execution);
    logger.info(`[AutomationEngine] Execution ${execution.id} COMPLETED in ${execution.durationMs}ms`);

    return execution;
  }

  /**
   * Resumes a paused WAITING workflow execution.
   */
  async resumeExecution(executionId: string, nodeId: string): Promise<WorkflowExecutionRecord | null> {
    const execution = await automationExecutionRepository.getExecution(executionId);
    if (!execution) {
      logger.warn(`[AutomationEngine] Cannot resume execution ${executionId}: not found.`);
      return null;
    }

    // Idempotency check: only resume if currently WAITING on this exact node
    if (execution.status !== 'WAITING' || execution.waitingOnNodeId !== nodeId) {
      logger.info(`[AutomationEngine] Skipping duplicate or invalid resume for execution ${executionId} (status: ${execution.status}, waitingOn: ${execution.waitingOnNodeId})`);
      return execution;
    }

    // Use immutable definition snapshot stored on the execution
    const workflow = execution.definitionSnapshot;
    if (!workflow) {
      throw new Error(`[AutomationEngine] Execution ${executionId} is missing immutable definitionSnapshot.`);
    }

    execution.status = 'RUNNING';
    execution.waitingOnNodeId = undefined;
    execution.nodeStatuses[nodeId] = 'COMPLETED';
    execution.lastHeartbeatAt = Date.now();
    execution.leaseExpiresAt = Date.now() + this.LEASE_DURATION_MS;

    const context: WorkflowExecutionContext = {
      executionId: execution.id,
      workflowId: execution.workflowId,
      workflowVersion: execution.workflowVersion,
      organizationId: execution.organizationId,
      teacherId: execution.teacherId,
      studentId: execution.studentId,
      triggerEvent: execution.triggerEvent || {},
      nodeOutputs: {},
      variables: {},
      isSimulation: execution.isSimulation,
      startedAt: execution.startedAt
    };

    // Find outgoing edges from the wait node
    const outgoing = workflow.edges.filter(e => e.sourceNodeId === nodeId);
    if (outgoing.length === 0) {
      execution.status = 'COMPLETED';
      execution.completedAt = Date.now();
      execution.durationMs = execution.completedAt - execution.startedAt;
      await automationExecutionRepository.updateExecution(execution.id, execution);
      return execution;
    }

    return this.executeGraph(workflow, execution, context, outgoing[0].targetNodeId);
  }

  /**
   * Recovers orphaned executions where worker lease has expired.
   */
  async recoverOrphanedExecutions(maxStaleMs = 120000): Promise<number> {
    const active = await automationExecutionRepository.listExecutions('', 100);
    const now = Date.now();
    let recoveredCount = 0;

    for (const exec of active) {
      if (exec.status === 'RUNNING' && exec.leaseExpiresAt && exec.leaseExpiresAt < now) {
        exec.status = 'FAILED';
        exec.completedAt = now;
        exec.durationMs = now - exec.startedAt;
        exec.error = {
          message: 'Worker lease expired; execution recovered from ungraceful termination.'
        };
        await automationExecutionRepository.updateExecution(exec.id, exec);
        recoveredCount++;
        logger.warn(`[AutomationEngine] Recovered orphaned execution ${exec.id} (lease expired ${now - exec.leaseExpiresAt}ms ago)`);
      }
    }
    return recoveredCount;
  }

  /**
   * Executes a single node handler with error catching and duration recording.
   */
  private async executeSingleNode(
    node: WorkflowNodeConfig,
    ctx: WorkflowExecutionContext
  ): Promise<WorkflowNodeExecution> {
    const handler = workflowNodeRegistry.getNode(node.type);
    const startedAt = Date.now();

    const nodeExec: WorkflowNodeExecution = {
      id: `node_exec_${uuidv4()}`,
      executionId: ctx.executionId,
      workflowId: ctx.workflowId,
      workflowVersion: ctx.workflowVersion,
      nodeId: node.id,
      nodeType: node.type,
      status: 'RUNNING',
      startedAt,
      retryCount: 0
    };

    if (!handler) {
      nodeExec.status = 'FAILED';
      nodeExec.completedAt = Date.now();
      nodeExec.error = {
        message: `Unknown node handler type: "${node.type}".`,
        code: 'HANDLER_NOT_FOUND',
        retryable: false
      };
      await automationExecutionRepository.saveNodeExecution(nodeExec);
      return nodeExec;
    }

    try {
      let mergedOutputs: Record<string, unknown> = {};
      for (const [_, val] of Object.entries(ctx.nodeOutputs)) {
        if (val && typeof val === 'object') {
          mergedOutputs = { ...mergedOutputs, ...(val as Record<string, unknown>) };
        }
      }

      const inputPayload = { ...ctx.nodeOutputs, ...mergedOutputs, ...ctx.variables };
      nodeExec.input = inputPayload;

      const output = await handler.execute(ctx, node.config, inputPayload);

      nodeExec.output = output;
      nodeExec.completedAt = Date.now();
      nodeExec.durationMs = nodeExec.completedAt - startedAt;

      if ((output as any)?.waiting) {
        nodeExec.status = 'WAITING';
      } else {
        nodeExec.status = 'COMPLETED';
      }

      await automationExecutionRepository.saveNodeExecution(nodeExec);
      return nodeExec;
    } catch (err: any) {
      logger.error(`[AutomationEngine] Error executing node ${node.id} (${node.type}): ${err.message}`);
      nodeExec.status = 'FAILED';
      nodeExec.completedAt = Date.now();
      nodeExec.durationMs = nodeExec.completedAt - startedAt;
      nodeExec.error = {
        message: err.message,
        stack: err.stack,
        retryable: true
      };
      await automationExecutionRepository.saveNodeExecution(nodeExec);
      return nodeExec;
    }
  }
}

export const automationEngine = new AutomationEngine();

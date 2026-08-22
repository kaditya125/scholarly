/**
 * @file AutomationExecutionRepository.ts
 * @description Firestore repository for persisting workflow definitions, versions, and execution records.
 */

import { db } from '../../../config/firebase';
import {
  WorkflowDefinition,
  WorkflowVersion,
  WorkflowExecutionRecord,
  WorkflowNodeExecution
} from '../types/workflow.types';
import { logger } from '../../../utils/logger';

export class AutomationExecutionRepository {
  private workflowsCol = db.collection('workflows');
  private executionsCol = db.collection('workflowExecutions');
  private auditLogsCol = db.collection('workflowAuditLogs');

  // ── Workflows & Versions ────────────────────────────────────────────────────────

  async saveWorkflow(workflow: WorkflowDefinition): Promise<void> {
    await this.workflowsCol.doc(workflow.id).set(workflow);
    logger.info(`[AutomationRepo] Saved workflow ${workflow.id} (v${workflow.version})`);
  }

  async getWorkflow(workflowId: string): Promise<WorkflowDefinition | null> {
    const snap = await this.workflowsCol.doc(workflowId).get();
    if (!snap.exists) return null;
    return snap.data() as WorkflowDefinition;
  }

  async listWorkflows(scope?: string, ownerId?: string): Promise<WorkflowDefinition[]> {
    let query: FirebaseFirestore.Query = this.workflowsCol;
    if (scope) {
      query = query.where('scope', '==', scope);
    }
    if (ownerId) {
      query = query.where('organizationId', '==', ownerId);
    }
    const snap = await query.get();
    return snap.docs.map(d => d.data() as WorkflowDefinition);
  }

  async saveVersion(version: WorkflowVersion): Promise<void> {
    await this.workflowsCol
      .doc(version.workflowId)
      .collection('versions')
      .doc(version.id)
      .set(version);
    logger.info(`[AutomationRepo] Published version ${version.id} for workflow ${version.workflowId}`);
  }

  async getVersion(workflowId: string, versionId: string): Promise<WorkflowVersion | null> {
    const snap = await this.workflowsCol
      .doc(workflowId)
      .collection('versions')
      .doc(versionId)
      .get();
    if (!snap.exists) return null;
    return snap.data() as WorkflowVersion;
  }

  // ── Workflow Executions ─────────────────────────────────────────────────────────

  async createExecution(execution: WorkflowExecutionRecord): Promise<void> {
    await this.executionsCol.doc(execution.id).set(execution);
  }

  async getExecution(executionId: string): Promise<WorkflowExecutionRecord | null> {
    const snap = await this.executionsCol.doc(executionId).get();
    if (!snap.exists) return null;
    return snap.data() as WorkflowExecutionRecord;
  }

  async updateExecution(
    executionId: string,
    patch: Partial<WorkflowExecutionRecord>
  ): Promise<void> {
    await this.executionsCol.doc(executionId).update(patch);
  }

  async listExecutions(workflowId: string, limit = 50): Promise<WorkflowExecutionRecord[]> {
    const snap = await this.executionsCol
      .where('workflowId', '==', workflowId)
      .orderBy('startedAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => d.data() as WorkflowExecutionRecord);
  }

  // ── Node Executions ─────────────────────────────────────────────────────────────

  async saveNodeExecution(nodeExec: WorkflowNodeExecution): Promise<void> {
    await this.executionsCol
      .doc(nodeExec.executionId)
      .collection('nodeExecutions')
      .doc(nodeExec.nodeId)
      .set(nodeExec);
  }

  async listNodeExecutions(executionId: string): Promise<WorkflowNodeExecution[]> {
    const snap = await this.executionsCol
      .doc(executionId)
      .collection('nodeExecutions')
      .orderBy('startedAt', 'asc')
      .get();
    return snap.docs.map(d => d.data() as WorkflowNodeExecution);
  }

  // ── Audit Logs ──────────────────────────────────────────────────────────────────

  async recordAuditLog(log: {
    workflowId: string;
    action: string;
    performedBy: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    const ref = this.auditLogsCol.doc();
    await ref.set({
      id: ref.id,
      ...log,
      timestamp: Date.now()
    });
  }
}

export const automationExecutionRepository = new AutomationExecutionRepository();

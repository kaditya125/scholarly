/**
 * @file automation.controller.ts
 * @description Controller for Scholarly Automation Studio APIs with tenant isolation and RBAC.
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { automationExecutionRepository } from '../core/automation/engine/AutomationExecutionRepository';
import { automationEngine } from '../core/automation/engine/AutomationEngine';
import { workflowNodeRegistry } from '../core/automation/registry/WorkflowNodeRegistry';
import {
  WorkflowDefinitionSchema,
  validateWorkflowGraph
} from '../core/automation/schemas/workflow.schema';
import { WorkflowDefinition, WorkflowVersion } from '../core/automation/types/workflow.types';
import { isAdmin } from '../middlewares/auth';
import { logger } from '../utils/logger';

export class AutomationController {
  /**
   * Helper to verify tenant ownership of a workflow.
   */
  private checkTenantAccess(req: Request, workflow: WorkflowDefinition): boolean {
    if (isAdmin(req)) return true;
    const userOrg = (req.user as any)?.organizationId;
    if (workflow.scope === 'SYSTEM' && !isAdmin(req)) return false;
    if (workflow.organizationId && userOrg && workflow.organizationId !== userOrg) {
      return false;
    }
    return true;
  }

  /**
   * Get available node catalog for visual canvas.
   */
  getNodeCatalog = async (_req: Request, res: Response): Promise<void> => {
    try {
      const catalog = workflowNodeRegistry.getCatalog();
      res.json({ success: true, catalog });
    } catch (err: any) {
      logger.error(`[AutomationController] getNodeCatalog failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  /**
   * List workflows with tenant isolation.
   */
  listWorkflows = async (req: Request, res: Response): Promise<void> => {
    try {
      const userOrg = (req.user as any)?.organizationId;
      const scope = isAdmin(req) ? (req.query.scope as string) : 'ORGANIZATION';
      const ownerId = isAdmin(req) ? (req.query.ownerId as string) || userOrg : userOrg;

      const workflows = await automationExecutionRepository.listWorkflows(scope, ownerId);
      res.json({ success: true, workflows });
    } catch (err: any) {
      logger.error(`[AutomationController] listWorkflows failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  /**
   * Create a new workflow draft.
   */
  createWorkflow = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = `wf_${uuidv4().slice(0, 8)}`;
      const now = Date.now();
      const userOrg = (req.user as any)?.organizationId || 'default_org';

      const newWorkflow: WorkflowDefinition = {
        id,
        scope: isAdmin(req) ? req.body.scope || 'ORGANIZATION' : 'ORGANIZATION',
        organizationId: userOrg,
        name: req.body.name || 'Untitled Automation',
        description: req.body.description || '',
        version: 1,
        status: 'DRAFT',
        trigger: req.body.trigger || {
          type: 'EVENT',
          eventType: 'learning.quiz_completed'
        },
        nodes: req.body.nodes || [
          {
            id: 'trigger_1',
            type: 'TRIGGER_EVENT',
            label: 'Quiz Completed',
            category: 'Trigger',
            position: { x: 250, y: 100 },
            config: { eventType: 'learning.quiz_completed' }
          }
        ],
        edges: req.body.edges || [],
        variables: req.body.variables || {},
        createdBy: req.user?.uid || 'admin',
        updatedBy: req.user?.uid || 'admin',
        createdAt: now,
        updatedAt: now
      };

      await automationExecutionRepository.saveWorkflow(newWorkflow);
      res.status(201).json({ success: true, workflow: newWorkflow });
    } catch (err: any) {
      logger.error(`[AutomationController] createWorkflow failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  /**
   * Get workflow by ID with tenant guard.
   */
  getWorkflow = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const workflow = await automationExecutionRepository.getWorkflow(id);
      if (!workflow) {
        res.status(404).json({ success: false, error: 'Workflow not found.' });
        return;
      }

      if (!this.checkTenantAccess(req, workflow)) {
        res.status(403).json({ success: false, error: 'Forbidden: Cross-tenant access denied' });
        return;
      }

      res.json({ success: true, workflow });
    } catch (err: any) {
      logger.error(`[AutomationController] getWorkflow failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  /**
   * Update workflow draft with tenant guard.
   */
  updateWorkflow = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const existing = await automationExecutionRepository.getWorkflow(id);
      if (!existing) {
        res.status(404).json({ success: false, error: 'Workflow not found.' });
        return;
      }

      if (!this.checkTenantAccess(req, existing)) {
        res.status(403).json({ success: false, error: 'Forbidden: Cross-tenant access denied' });
        return;
      }

      const updated: WorkflowDefinition = {
        ...existing,
        ...req.body,
        id,
        organizationId: existing.organizationId, // immutable tenant boundary
        updatedBy: req.user?.uid || 'admin',
        updatedAt: Date.now()
      };

      const parseResult = WorkflowDefinitionSchema.safeParse(updated);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parseResult.error.errors
        });
        return;
      }

      await automationExecutionRepository.saveWorkflow(updated);
      res.json({ success: true, workflow: updated });
    } catch (err: any) {
      logger.error(`[AutomationController] updateWorkflow failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  /**
   * Validate and activate workflow (publishes a new immutable version).
   */
  activateWorkflow = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const workflow = await automationExecutionRepository.getWorkflow(id);
      if (!workflow) {
        res.status(404).json({ success: false, error: 'Workflow not found.' });
        return;
      }

      if (!this.checkTenantAccess(req, workflow)) {
        res.status(403).json({ success: false, error: 'Forbidden: Cross-tenant access denied' });
        return;
      }

      const validation = validateWorkflowGraph(workflow);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: 'Graph validation failed.',
          errors: validation.errors
        });
        return;
      }

      const newVersionNum = workflow.version + 1;
      const versionId = `v${newVersionNum}_${Date.now()}`;

      const versionRecord: WorkflowVersion = {
        id: versionId,
        workflowId: workflow.id,
        versionNumber: newVersionNum,
        definitionSnapshot: { ...workflow, status: 'ACTIVE', version: newVersionNum },
        publishedBy: req.user?.uid || 'admin',
        publishedAt: Date.now(),
        status: 'ACTIVE'
      };

      await automationExecutionRepository.saveVersion(versionRecord);

      workflow.status = 'ACTIVE';
      workflow.version = newVersionNum;
      workflow.activeVersionId = versionId;
      workflow.updatedAt = Date.now();

      await automationExecutionRepository.saveWorkflow(workflow);

      res.json({ success: true, workflow, version: versionRecord });
    } catch (err: any) {
      logger.error(`[AutomationController] activateWorkflow failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  /**
   * Pause an active workflow.
   */
  pauseWorkflow = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const workflow = await automationExecutionRepository.getWorkflow(id);
      if (!workflow) {
        res.status(404).json({ success: false, error: 'Workflow not found.' });
        return;
      }

      if (!this.checkTenantAccess(req, workflow)) {
        res.status(403).json({ success: false, error: 'Forbidden: Cross-tenant access denied' });
        return;
      }

      workflow.status = 'PAUSED';
      workflow.updatedAt = Date.now();
      await automationExecutionRepository.saveWorkflow(workflow);

      res.json({ success: true, workflow });
    } catch (err: any) {
      logger.error(`[AutomationController] pauseWorkflow failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  /**
   * Run workflow in safe simulation test mode with tenant enforcement.
   */
  testWorkflow = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { sampleEvent } = req.body;

      const workflow = await automationExecutionRepository.getWorkflow(id);
      if (!workflow) {
        res.status(404).json({ success: false, error: 'Workflow not found.' });
        return;
      }

      if (!this.checkTenantAccess(req, workflow)) {
        res.status(403).json({ success: false, error: 'Forbidden: Cross-tenant access denied' });
        return;
      }

      // Enforce authenticated user or tenant-scoped student
      const studentId = req.body.studentId || req.user?.uid || 'test_student_sim';

      const execution = await automationEngine.startExecution(
        workflow,
        sampleEvent || {},
        {
          studentId,
          organizationId: workflow.organizationId,
          isSimulation: true,
          triggeredBy: `manual_test:${req.user?.uid || 'admin'}`
        }
      );

      res.json({ success: true, execution });
    } catch (err: any) {
      logger.error(`[AutomationController] testWorkflow failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  /**
   * List executions for a workflow with tenant guard.
   */
  listExecutions = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const workflow = await automationExecutionRepository.getWorkflow(id);
      if (!workflow) {
        res.status(404).json({ success: false, error: 'Workflow not found.' });
        return;
      }

      if (!this.checkTenantAccess(req, workflow)) {
        res.status(403).json({ success: false, error: 'Forbidden: Cross-tenant access denied' });
        return;
      }

      const executions = await automationExecutionRepository.listExecutions(id);
      res.json({ success: true, executions });
    } catch (err: any) {
      logger.error(`[AutomationController] listExecutions failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  /**
   * Get detailed execution trace including node executions.
   */
  getExecutionDetail = async (req: Request, res: Response): Promise<void> => {
    try {
      const { executionId } = req.params;
      const execution = await automationExecutionRepository.getExecution(executionId);
      if (!execution) {
        res.status(404).json({ success: false, error: 'Execution record not found.' });
        return;
      }

      const userOrg = (req.user as any)?.organizationId;
      if (!isAdmin(req) && execution.organizationId && userOrg && execution.organizationId !== userOrg) {
        res.status(403).json({ success: false, error: 'Forbidden: Cross-tenant access denied' });
        return;
      }

      const nodeExecutions = await automationExecutionRepository.listNodeExecutions(executionId);

      res.json({
        success: true,
        execution,
        nodeExecutions
      });
    } catch (err: any) {
      logger.error(`[AutomationController] getExecutionDetail failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

export const automationController = new AutomationController();

/**
 * @file automation.routes.ts
 * @description Authenticated REST API routes for Scholarly Automation Studio.
 */

import { Router } from 'express';
import { automationController } from '../controllers/automation.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

// Enforce authentication on all automation studio endpoints
router.use(requireAuth);

// Catalog
router.get('/nodes/catalog', automationController.getNodeCatalog);

// Workflows
router.get('/workflows', automationController.listWorkflows);
router.post('/workflows', automationController.createWorkflow);
router.get('/workflows/:id', automationController.getWorkflow);
router.patch('/workflows/:id', automationController.updateWorkflow);
router.post('/workflows/:id/activate', automationController.activateWorkflow);
router.post('/workflows/:id/pause', automationController.pauseWorkflow);
router.post('/workflows/:id/test', automationController.testWorkflow);

// Executions
router.get('/workflows/:id/executions', automationController.listExecutions);
router.get('/executions/:executionId', automationController.getExecutionDetail);

export default router;

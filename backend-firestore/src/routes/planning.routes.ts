/**
 * Planning Routes
 * 
 * API routes for the conversational planning system
 */

import { Router } from 'express';
import {
  startPlanning,
  respondToPlanning,
  getPlanningSession,
  getUserPlanningSessions,
  cancelPlanningSession,
} from '../controllers/planning.controller';

const router = Router();

/**
 * POST /api/planning/start
 * Start a new conversational planning session
 */
router.post('/start', startPlanning);

/**
 * POST /api/planning/respond
 * Process user's response in an ongoing conversation
 */
router.post('/respond', respondToPlanning);

/**
 * GET /api/planning/:sessionId
 * Retrieve an existing planning session
 */
router.get('/:sessionId', getPlanningSession);

/**
 * GET /api/planning/user/:userId
 * Get all planning sessions for a user
 */
router.get('/user/:userId', getUserPlanningSessions);

/**
 * DELETE /api/planning/:sessionId
 * Cancel/delete a planning session
 */
router.delete('/:sessionId', cancelPlanningSession);

export default router;


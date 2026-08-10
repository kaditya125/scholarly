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
import { requireAuth, enforceSelf } from '../middlewares/auth';

const router = Router();

/**
 * SECURITY (Phase 0): this router had no authentication, and every handler took the
 * caller's identity from the request itself (req.body.userId / req.query.userId /
 * req.params.userId). The session handlers did compare `sessionData.userId !== userId`,
 * but both sides of that comparison were client-supplied — passing the victim's userId
 * satisfied it. The check proved nothing.
 *
 * requireAuth now establishes identity from the verified token, and the controllers read
 * req.user.uid instead of the request payload. The planning engine itself is unchanged.
 */
router.use(requireAuth);

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
router.get('/user/:userId', enforceSelf('userId'), getUserPlanningSessions);

/**
 * DELETE /api/planning/:sessionId
 * Cancel/delete a planning session
 */
router.delete('/:sessionId', cancelPlanningSession);

export default router;


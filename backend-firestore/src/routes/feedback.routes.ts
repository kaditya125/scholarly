import { Router } from 'express';
import { FeedbackController } from '../controllers/feedback.controller';
import { requireAuth } from '../middlewares/auth';
import { requireAdmin } from '../admin/middleware/rbac.middleware';

const router = Router();
const feedbackCtrl = new FeedbackController();

// Submit feedback for a specific AI message (authenticated user).
router.post('/:messageId/feedback', requireAuth, feedbackCtrl.submitFeedback);

// Admin: feedback summary (admin role required).
router.get('/feedback/summary', requireAdmin, feedbackCtrl.getFeedbackSummary);

export default router;

import { Router } from 'express';
import { policiesController } from '../controllers/policies.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

// Public routes — no auth required to read platform terms & policies
router.get('/current', policiesController.getCurrent);
router.get('/version/:version', policiesController.getByVersion);

// Authenticated routes — requires valid session
router.get('/my-consent', requireAuth, policiesController.getMyConsent);
router.post('/consent', requireAuth, policiesController.acceptConsent);
router.get('/my-consent/history', requireAuth, policiesController.getMyConsentHistory);

export default router;

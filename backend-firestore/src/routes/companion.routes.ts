import { Router } from 'express';
import { companionController } from '../controllers/companion.controller';
import { requireCronSecret } from '../middlewares/auth';

const router = Router();

// Endpoint for Cloud Scheduler / CRON to hit nightly.
// Protected by a shared secret (env.CRON_SECRET) rather than a user token.
router.post('/evaluate', requireCronSecret, companionController.runNightlyEvaluation);

export default router;

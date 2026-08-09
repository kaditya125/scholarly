import { Router } from 'express';
import { cronController } from '../controllers/cron.controller';
import { requireCronSecret } from '../middlewares/auth';

const router = Router();

// Endpoints for Cloud Scheduler / CRON to hit periodically.
// Protected by a shared secret (env.CRON_SECRET) rather than a user token.

// Trigger automated Firestore backup
router.post('/backup', requireCronSecret, cronController.runBackup);

export default router;

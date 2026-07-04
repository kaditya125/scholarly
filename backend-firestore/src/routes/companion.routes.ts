import { Router } from 'express';
import { companionController } from '../controllers/companion.controller';

const router = Router();

// Endpoint for Cloud Scheduler / CRON to hit nightly
router.post('/evaluate', companionController.runNightlyEvaluation);

export default router;

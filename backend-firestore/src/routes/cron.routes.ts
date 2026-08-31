import { Router } from 'express';
import { cronController } from '../controllers/cron.controller';
import { requireCronSecret } from '../middlewares/auth';

const router = Router();

// Endpoints for Cloud Scheduler / CRON to hit periodically.
// Protected by a shared secret (env.CRON_SECRET) rather than a user token.

// Trigger automated Firestore backup
router.post('/backup', requireCronSecret, cronController.runBackup);

/*
 * Drain the baseline projection backlog.
 *
 * POST /api/cron/reconcile-baseline?limit=50   (limit optional, capped at 200)
 *
 * Mastery is a projection rebuilt from durable graded evidence, so a submission whose completion
 * event was never consumed stays PENDING and recoverable. reconcilePending existed but nothing
 * called it, which meant the backlog only ever grew.
 *
 * Idempotent by construction — the republished event keeps its deterministic id and MasteryEngine
 * dedupes inside its transaction — so a scheduler retry cannot double-apply.
 */
router.post('/reconcile-baseline', requireCronSecret, cronController.reconcileBaselineProjections);

export default router;

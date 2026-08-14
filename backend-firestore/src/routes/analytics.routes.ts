import { Router } from 'express';
import { getCostAnalytics } from '../controllers/analytics.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

/**
 * SECURITY (Phase 0): this route had no authentication, and omitting the optional
 * `?userId=` made it return SYSTEM-WIDE AI spend across every user — a business metric
 * readable by anyone who could reach the server.
 *
 * requireAuth establishes identity; the controller then scopes the query to the caller
 * unless they hold an administrative claim. The endpoint stays a single route because
 * CostAnalyticsWidget already calls it both ways (`isAdminMode` → system totals,
 * otherwise `?userId=<self>`); the split is enforced server-side now instead of trusted.
 */
router.use(requireAuth);

router.get('/costs', getCostAnalytics);

export default router;

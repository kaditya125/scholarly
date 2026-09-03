import { Request, Response } from 'express';
import { adminPerformanceService } from '../services/adminPerformance.service';
import { logger } from '../../utils/logger';

/**
 * Student performance reporting endpoints.
 *
 * AUTHORISATION. None here, deliberately — these are mounted behind `requireAdmin` in
 * admin.routes.ts, which verifies the token signature and role claim before any handler
 * runs. Repeating it would give the rule a second home to drift from.
 */
export class PerformanceController {
  /**
   * GET /api/admin/performance
   *
   * Takes no parameters — this is a fixed aggregate over quiz_attempts, not a filtered
   * report. Letting a caller ask for an arbitrary window would need per-window
   * aggregation this collection's size does not yet warrant.
   */
  overview = async (_req: Request, res: Response) => {
    try {
      const data = await adminPerformanceService.getOverview();
      res.json(data);
    } catch (error) {
      logger.error('[admin/performance] overview failed', { error });
      res.status(500).json({ error: 'Failed to load performance overview' });
    }
  };
}

export const performanceController = new PerformanceController();

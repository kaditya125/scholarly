import { Request, Response } from 'express';
import { adminEngagementService } from '../services/adminEngagement.service';
import { logger } from '../../utils/logger';

/**
 * Student engagement reporting endpoints.
 *
 * AUTHORISATION. None here, deliberately — these are mounted behind `requireAdmin` in
 * admin.routes.ts, which verifies the token signature and role claim before any handler
 * runs. Repeating it would give the rule a second home to drift from.
 */
export class EngagementController {
  /**
   * GET /api/admin/engagement
   *
   * Takes no parameters. The windows (7/30 days) are fixed rather than caller-supplied —
   * an arbitrary range would need its own indexed query per call rather than the two
   * pre-shaped ones this reuses.
   */
  overview = async (_req: Request, res: Response) => {
    try {
      const data = await adminEngagementService.getOverview();
      res.json(data);
    } catch (error) {
      logger.error('[admin/engagement] overview failed', { error });
      res.status(500).json({ error: 'Failed to load engagement overview' });
    }
  };
}

export const engagementController = new EngagementController();

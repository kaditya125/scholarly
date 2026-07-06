import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * System Logs — surfaces the real Firestore admin_alerts event stream. Full
 * request/debug logs go to stdout (winston) and require a durable log sink.
 */
export class LogsController {
  getLogs = async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
      res.json(await adminAggregatesService.getLogs(limit));
    } catch (error) {
      logger.error('admin.logs.getLogs failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load logs' });
    }
  };
}

import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * System Health — real process metrics (uptime/memory/cpu) plus live dependency
 * probes for Firestore and Pinecone, and the honest Redis configuration status.
 */
export class SystemHealthController {
  getHealth = async (_req: Request, res: Response) => {
    try {
      res.json(await adminAggregatesService.getSystemHealth());
    } catch (error) {
      logger.error('admin.system-health.getHealth failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load system health' });
    }
  };
}

import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * Backup & Restore — Firestore backups are managed by Google Cloud and are not
 * exposed via the application SDK. This endpoint returns an honest empty result
 * with an explanatory note rather than fabricated backup records.
 */
export class BackupsController {
  getBackups = async (_req: Request, res: Response) => {
    try {
      res.json(await adminAggregatesService.getBackups());
    } catch (error) {
      logger.error('admin.backups.getBackups failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load backups' });
    }
  };
}

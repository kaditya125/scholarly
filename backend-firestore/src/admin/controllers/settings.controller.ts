import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * Settings — real read-only runtime configuration (environment, models, Pinecone
 * index/namespace, cache status) plus feature flags. No secrets are returned.
 */
export class SettingsController {
  getSettings = async (_req: Request, res: Response) => {
    try {
      res.json(await adminAggregatesService.getSettings());
    } catch (error) {
      logger.error('admin.settings.getSettings failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load settings' });
    }
  };
}

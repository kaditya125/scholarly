import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * Learning Assets — real community-published assets from PublishedAssetsService.
 */
export class LearningAssetsController {
  getAssets = async (_req: Request, res: Response) => {
    try {
      res.json(await adminAggregatesService.getLearningAssets());
    } catch (error) {
      logger.error('admin.learning-assets.getAssets failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load learning assets' });
    }
  };
}

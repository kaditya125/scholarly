import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * Feature Flags — real flags from FeatureFlagService (Firestore `feature_flags`),
 * with default seeding and live toggling.
 */
export class FeatureFlagsController {
  getFlags = async (_req: Request, res: Response) => {
    try {
      res.json(await adminAggregatesService.getFeatureFlags());
    } catch (error) {
      logger.error('admin.feature-flags.getFlags failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load feature flags' });
    }
  };

  updateFlag = async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const { enabled } = req.body ?? {};
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Body must include boolean `enabled`' });
      }
      const updatedBy = (req as any).user?.uid || (req as any).user?.email || 'admin';
      const result = await adminAggregatesService.setFeatureFlag(name, enabled, updatedBy);
      res.json(result);
    } catch (error) {
      logger.error('admin.feature-flags.updateFlag failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to update feature flag' });
    }
  };
}

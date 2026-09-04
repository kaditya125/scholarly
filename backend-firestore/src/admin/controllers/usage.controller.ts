import { Request, Response } from 'express';
import { adminUsageService, USAGE_METRIC_KEYS, UsageMetricKey } from '../services/adminUsage.service';
import { logger } from '../../utils/logger';

export class UsageController {
  detail = async (req: Request, res: Response) => {
    const metric = req.params.metric as UsageMetricKey;
    if (!USAGE_METRIC_KEYS.includes(metric)) {
      return res.status(404).json({ error: `Unknown usage metric: ${req.params.metric}` });
    }
    try {
      res.json(await adminUsageService.getMetricDetail(metric));
    } catch (error) {
      logger.error('admin.usage.detail failed', { metric, error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load usage detail' });
    }
  };
}

export const usageController = new UsageController();

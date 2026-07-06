import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * AI Monitoring — real telemetry aggregates (provider stats, latency, cost, 24h timeline).
 * Backed by TelemetryService (Firestore `telemetry`/`admin_alerts`/`user_feedback`).
 */
export class AIMonitoringController {
  getMetrics = async (_req: Request, res: Response) => {
    try {
      res.json(await adminAggregatesService.getAIMetrics());
    } catch (error) {
      logger.error('admin.ai-monitoring.getMetrics failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load AI metrics' });
    }
  };

  getCostAnalytics = async (req: Request, res: Response) => {
    try {
      const days = Math.min(parseInt(String(req.query.days ?? '30'), 10) || 30, 365);
      res.json(await adminAggregatesService.getCostAnalytics(days));
    } catch (error) {
      logger.error('admin.ai-monitoring.getCostAnalytics failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load cost analytics' });
    }
  };
}

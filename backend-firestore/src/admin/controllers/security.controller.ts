import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * Security Monitoring — real signals from admin_alerts (latency, verification
 * failures, token usage) and the RAG verification pass-rate. Alerts can be resolved.
 */
export class SecurityController {
  getThreats = async (_req: Request, res: Response) => {
    try {
      res.json(await adminAggregatesService.getSecurity());
    } catch (error) {
      logger.error('admin.security.getThreats failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load security data' });
    }
  };

  resolveAlert = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await adminAggregatesService.resolveAlert(id);
      res.json({ id, resolved: true });
    } catch (error) {
      logger.error('admin.security.resolveAlert failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to resolve alert' });
    }
  };
}

import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * Notifications — system notifications derived from unresolved admin_alerts.
 */
export class NotificationsController {
  getNotifications = async (_req: Request, res: Response) => {
    try {
      res.json(await adminAggregatesService.getNotifications());
    } catch (error) {
      logger.error('admin.notifications.getNotifications failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load notifications' });
    }
  };
}

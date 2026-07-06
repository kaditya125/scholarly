import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * User Management — real users listed via the Firebase Admin SDK (auth.listUsers),
 * including role custom-claims and account status.
 */
export class UsersController {
  getUsers = async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '200'), 10) || 200, 1000);
      res.json(await adminAggregatesService.getUsers(limit));
    } catch (error) {
      logger.error('admin.users.getUsers failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load users' });
    }
  };
}

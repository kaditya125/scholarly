import { Request, Response } from 'express';
import { adminAuditService } from '../services/adminAudit.service';
import { logger } from '../../utils/logger';

export class AuditController {
  overview = async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '200'), 10) || 200, 200);
      res.json(await adminAuditService.getOverview(limit));
    } catch (error) {
      logger.error('admin.audit.overview failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load audit log' });
    }
  };
}

export const auditController = new AuditController();

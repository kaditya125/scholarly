import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * Curriculum Ingestion Jobs — real document ingestion status derived from the
 * `sources` subcollections across all notebooks (collectionGroup).
 */
export class CurriculumController {
  getJobs = async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
      res.json(await adminAggregatesService.getIngestionJobs(limit));
    } catch (error) {
      logger.error('admin.curriculum.getJobs failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load ingestion jobs' });
    }
  };
}

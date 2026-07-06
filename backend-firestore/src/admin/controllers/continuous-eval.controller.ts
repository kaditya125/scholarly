import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * Continuous Evaluation — real aggregates derived from user_feedback
 * (satisfaction, daily trend, recent failures). No fabricated dimension scores.
 */
export class ContinuousEvalController {
  getEvaluationMetrics = async (_req: Request, res: Response) => {
    try {
      res.json(await adminAggregatesService.getEvaluation());
    } catch (error) {
      logger.error('admin.continuous-eval.getEvaluationMetrics failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load evaluation metrics' });
    }
  };
}

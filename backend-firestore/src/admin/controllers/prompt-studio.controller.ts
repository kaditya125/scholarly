import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * Prompt Studio — real prompt versions observed in telemetry (with real usage/cost)
 * plus A/B experiments from the `prompt_experiments` collection.
 */
export class PromptStudioController {
  getPrompts = async (_req: Request, res: Response) => {
    try {
      res.json(await adminAggregatesService.getPrompts());
    } catch (error) {
      logger.error('admin.prompt-studio.getPrompts failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load prompts' });
    }
  };
}

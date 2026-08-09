import { Request, Response, NextFunction } from 'express';
import { backupService } from '../services/admin/backup.service';
import { logger } from '../utils/logger';

export class CronController {
  
  /**
   * Endpoint to trigger an automated Firestore backup.
   * Expected to be called by Google Cloud Scheduler on a nightly basis.
   * Protected by requireCronSecret middleware.
   */
  async runBackup(req: Request, res: Response, next: NextFunction) {
    try {
      logger.info('[CronController] Received request to trigger Firestore backup');
      
      const result = await backupService.triggerBackup();
      
      res.status(202).json({
        message: 'Backup operation successfully initiated',
        operationName: result.operationName,
        outputUriPrefix: result.outputUriPrefix
      });
    } catch (error: any) {
      logger.error(`[CronController] Backup failed: ${error.message}`);
      // Usually 500 triggers Cloud Scheduler to retry depending on config
      res.status(500).json({ error: error.message });
    }
  }
}

export const cronController = new CronController();

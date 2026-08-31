import { Request, Response, NextFunction } from 'express';
import { backupService } from '../services/admin/backup.service';
import { baselineReconciliationService } from '../services/baselineReconciliation.service';
import { featureFlags } from '../config/featureFlags';
import { logger } from '../utils/logger';

/**
 * Upper bound on one reconciliation pass.
 *
 * reconcilePending walks its page serially, and each entry is a Firestore read plus a potential
 * transactional mastery write, so an unbounded limit would turn one scheduler call into a long
 * request holding a connection. A capped page that runs again on the next tick is the safer
 * shape than one pass that tries to drain everything.
 */
const MAX_RECONCILE_LIMIT = 200;

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

  /**
   * Drain the baseline projection backlog.
   *
   * ── WHAT THIS IS FOR ──────────────────────────────────────────────────────────────────────
   * Grading is durable and server-authoritative; mastery is a PROJECTION rebuilt from it. When a
   * completion event is not delivered — Redis down, mastery disabled, a restart mid-flight — the
   * submission stays COMPLETED with projectionStatus PENDING, and its evidence is recoverable but
   * not yet applied. Nothing invoked reconcilePending, so that backlog simply accumulated.
   *
   * Safe to call repeatedly and concurrently: reconcileUser republishes with the deterministic id
   * `learning.test_completed:{attemptId}`, and MasteryEngine dedupes on processedEventIds inside
   * its transaction, so N passes produce one logical effect.
   *
   * ── WHY THE RESPONSE REPORTS THE FLAG ─────────────────────────────────────────────────────
   * With ENABLE_MASTERY off, reconcileUser deliberately writes nothing and leaves each record
   * PENDING and eligible — the correct behaviour, since marking them PROJECTED would make
   * evidence graded during the disabled window permanently unrecoverable. But the pass then
   * returns projected:0, which reads exactly like "backlog already clear".
   *
   * Those two states must not look identical to whoever reads the scheduler logs, so the flag is
   * reported alongside the counts. A drain that did nothing because the feature is off is not a
   * drain that found nothing to do.
   */
  async reconcileBaselineProjections(req: Request, res: Response, _next: NextFunction) {
    const requested = Number((req.query.limit as string) ?? '');
    const limit = Number.isFinite(requested) && requested > 0
      ? Math.min(Math.floor(requested), MAX_RECONCILE_LIMIT)
      : 50;

    try {
      const result = await baselineReconciliationService.reconcilePending(limit);
      const masteryEnabled = featureFlags.mastery;

      logger.info('[CronController] baseline projection reconciliation pass', {
        ...result, limit, masteryEnabled,
      });

      res.status(200).json({
        ...result,
        limit,
        masteryEnabled,
        // Stated in words as well as a boolean: this is what a human skimming scheduler output
        // actually reads, and the ambiguity above is worth spending a line to remove.
        note: masteryEnabled
          ? 'Mastery enabled — pending submissions were projected.'
          : 'ENABLE_MASTERY is off, so nothing was projected. Records remain PENDING and eligible; '
            + 'projected:0 here does NOT mean the backlog is clear.',
      });
    } catch (error: any) {
      logger.error('[CronController] baseline reconciliation failed', { error: error?.message });
      // 500 so the scheduler retries; the pass is idempotent, so a retry cannot double-apply.
      res.status(500).json({ error: error?.message });
    }
  }
}

export const cronController = new CronController();

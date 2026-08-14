import { Request, Response } from 'express';
import { earningsService } from '../../services/earnings.service';
import { isPayoutMethod, MAX_PAYOUT_NOTE, MAX_PAYOUT_REFERENCE, PAYOUT_METHODS } from '../../types/earnings';
import { logger } from '../../utils/logger';

/**
 * Manual payouts (Phase 3J-lite). Mounted under the existing `/api/admin` router, already
 * wrapped in `requireAdmin` — see teacher-verification.controller.ts for the identical posture.
 *
 * `record` does not move any money. It records that the admin ALREADY paid a teacher outside
 * the platform (UPI, bank transfer, cash) and marks the corresponding ledger entries settled.
 * See types/earnings.ts for why this exists instead of automated payout execution.
 */
export class PayoutController {
  /** GET /api/admin/payouts/queue — every teacher with an outstanding balance, highest first. */
  listQueue = async (_req: Request, res: Response) => {
    try {
      const queue = await earningsService.getPayoutQueue();
      return res.status(200).json({ queue });
    } catch (err: any) {
      logger.error('[Payout] Queue read failed', { error: err?.message });
      return res.status(500).json({ error: 'Failed to load the payout queue.' });
    }
  };

  /**
   * POST /api/admin/payouts
   * body: { teacherUid, method, reference?, note? }
   *
   *   201 recorded · 400 bad shape · 409 nothing owed
   */
  record = async (req: Request, res: Response) => {
    const adminUid = req.user?.uid;
    if (!adminUid) return res.status(401).json({ error: 'Unauthorized' });

    const { teacherUid, method, reference, note } = req.body ?? {};
    if (!teacherUid || typeof teacherUid !== 'string') {
      return res.status(400).json({ error: 'A teacherUid is required.' });
    }
    if (!isPayoutMethod(method)) {
      return res.status(400).json({ error: 'Invalid payout method.', allowed: PAYOUT_METHODS });
    }
    if (reference !== undefined && reference !== null && (typeof reference !== 'string' || reference.length > MAX_PAYOUT_REFERENCE)) {
      return res.status(400).json({ error: `reference must be a string of ${MAX_PAYOUT_REFERENCE} characters or fewer.` });
    }
    if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > MAX_PAYOUT_NOTE)) {
      return res.status(400).json({ error: `note must be a string of ${MAX_PAYOUT_NOTE} characters or fewer.` });
    }

    try {
      const payout = await earningsService.recordPayout(teacherUid, adminUid, { method, reference, note });
      return res.status(201).json(payout);
    } catch (err: any) {
      if (err?.code === 'NOTHING_OWED') {
        return res.status(409).json({ error: err.message });
      }
      if (err?.code === 'INVALID_INPUT') {
        return res.status(400).json({ error: err.message });
      }
      logger.error('[Payout] Record failed', { adminUid, teacherUid, error: err?.message });
      return res.status(500).json({ error: 'Failed to record the payout.' });
    }
  };
}

export const payoutController = new PayoutController();

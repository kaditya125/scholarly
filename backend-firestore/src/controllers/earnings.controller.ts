import { Request, Response } from 'express';
import { earningsService } from '../services/earnings.service';
import { logger } from '../utils/logger';

export class EarningsController {
  /** GET /api/teacher/earnings — self only, no capability gate (reading needs ownership, not approval). */
  get = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const summary = await earningsService.getSummary(uid);
      return res.status(200).json(summary);
    } catch (err: any) {
      logger.error('[Earnings] Request failed', { uid, error: err?.message });
      return res.status(500).json({ error: 'Could not load earnings.' });
    }
  };

  /** GET /api/teacher/payouts — self only. */
  listPayouts = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const payouts = await earningsService.listPayouts(uid);
      return res.status(200).json({ payouts });
    } catch (err: any) {
      logger.error('[Earnings] Payout history read failed', { uid, error: err?.message });
      return res.status(500).json({ error: 'Could not load payout history.' });
    }
  };
}

export const earningsController = new EarningsController();

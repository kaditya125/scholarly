import { Request, Response } from 'express';
import { referralService } from '../services/referral.service';
import { logger } from '../utils/logger';

export class ReferralController {
  /**
   * GET /api/users/referrals — self only.
   *
   * `referralCode` is simply the caller's own uid: there is no separate code-minting system
   * (unlike class invitations, which grant access and need collision-checked codes, a referral
   * grants nothing by itself — a shared uid is not a security boundary here). The server also
   * returns the CURRENT reward amounts so the client never hardcodes a number that could drift
   * from whatever `rewardRules/referral_signup` actually holds.
   */
  listMine = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const [referrals, rewardRule] = await Promise.all([
        referralService.listMyReferrals(uid),
        referralService.getEffectiveRewardRule(),
      ]);
      return res.status(200).json({ referralCode: uid, referrals, rewardRule });
    } catch (err: any) {
      logger.error('[Referral] Read failed', { uid, error: err?.message });
      return res.status(500).json({ error: 'Could not load your referrals.' });
    }
  };
}

export const referralController = new ReferralController();

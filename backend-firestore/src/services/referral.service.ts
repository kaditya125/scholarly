import * as admin from 'firebase-admin';
import { db, auth } from '../config/firebase';
import { referralRepository } from '../repositories/referral.repository';
import {
  DEFAULT_REWARD_RULE,
  EffectiveRewardRule,
  EntitlementGrant,
  ReferralRecord,
  referralId,
} from '../types/referral';
import { logger } from '../utils/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ReferralService — see types/referral.ts for the full design rationale.
 *
 * `recordReferral` is never reachable from a client route directly. It is called exactly once,
 * from userIdentity.controller.ts's bootstrap handler, and only when
 * `userIdentityService.bootstrapProductRole` itself reports `profileCreated: true` — a
 * server-computed fact, not a client assertion. A client cannot replay bootstrap to re-credit a
 * referral: the SECOND call for the same uid always has `profileCreated: false` (the doc already
 * exists), so this method is never even invoked twice for the same referred account.
 */
export class ReferralService {
  async getEffectiveRewardRule(): Promise<EffectiveRewardRule> {
    const stored = await referralRepository.getRewardRule();
    return stored ?? DEFAULT_REWARD_RULE;
  }

  async recordReferral(referrerUid: string, referredUid: string): Promise<ReferralRecord | null> {
    if (!referrerUid || referrerUid === referredUid) return null; // no self-referral

    try {
      await auth.getUser(referrerUid);
    } catch {
      logger.warn('[Referral] Referrer uid does not exist; ignoring', { referrerUid, referredUid });
      return null;
    }

    // One referral per new signup, ever. Defends a client retry (or a signup flow re-running
    // bootstrap after a token refresh) from crediting the same new account twice, independent
    // of which referrer code was attached.
    const existing = await referralRepository.findByReferred(referredUid);
    if (existing) return existing;

    const rule = await this.getEffectiveRewardRule();
    if (!rule.active) return null; // the kill switch

    const record: ReferralRecord = {
      id: referralId(referrerUid, referredUid),
      referrerUid,
      referredUid,
      referrerRewardDays: rule.referrerRewardDays,
      referredRewardDays: rule.referredRewardDays,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await referralRepository.createReferral(record);

    await Promise.all([
      this.grantProDays(referrerUid, record.id, rule.referrerRewardDays),
      this.grantProDays(referredUid, record.id, rule.referredRewardDays),
    ]);

    logger.info('[Referral] Recorded', {
      referrerUid, referredUid,
      referrerRewardDays: rule.referrerRewardDays, referredRewardDays: rule.referredRewardDays,
    });
    return record;
  }

  /** A user's own referral history, most recent first is not tracked here (no index needed at this scale). */
  async listMyReferrals(referrerUid: string): Promise<ReferralRecord[]> {
    return referralRepository.listByReferrer(referrerUid);
  }

  /**
   * Extends (or starts) a user's Pro period by N days — reusing the EXACT fields
   * payments.service.ts#markPaidAndUpgrade already writes, so every Pro-aware surface (Settings
   * badge, capability checks) shows a referral reward with no new code.
   *
   * Preserves an EXISTING real subscription's `provider`/`source`/`planName` — only stamps
   * those as `'referral'` when the user has never had a subscription record before. A paying
   * customer who happens to also refer a friend must not have their real payment attribution
   * overwritten; only their `currentPeriodEnd` extends.
   */
  private async grantProDays(userId: string, referralRecordId: string, days: number): Promise<void> {
    if (days <= 0) return;
    const userRef = db.collection('users').doc(userId);
    const now = Date.now();

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const data = snap.exists ? (snap.data() as any) : {};
      const currentEnd = data?.subscription?.currentPeriodEnd;
      const base = typeof currentEnd === 'number' && currentEnd > now ? currentEnd : now;
      const newEnd = base + days * DAY_MS;
      const hadSubscription = !!data?.subscription?.provider;

      tx.set(
        userRef,
        {
          plan: 'pro',
          subscription: {
            ...(data.subscription || {}),
            status: 'active',
            currentPeriodEnd: newEnd,
            ...(hadSubscription ? {} : { plan: 'pro', planName: 'Sadhya Pro (referral)', provider: 'referral', source: 'referral' }),
          },
        },
        { merge: true },
      );
    });

    const grant: EntitlementGrant = {
      id: referralRepository.newGrantId(),
      userId,
      source: 'referral',
      sourceId: referralRecordId,
      kind: 'pro_days',
      amount: days,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await referralRepository.createGrant(grant);
  }
}

export const referralService = new ReferralService();

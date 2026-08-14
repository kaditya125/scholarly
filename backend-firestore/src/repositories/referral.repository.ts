import { db } from '../config/firebase';
import { EntitlementGrant, ReferralRecord, REFERRAL_REWARD_RULE_ID, RewardRule } from '../types/referral';

/** `referrals/{id}`, `entitlementGrants/{id}`, `rewardRules/{id}` — data access only. */
export class ReferralRepository {
  private referrals = db.collection('referrals');
  private grants = db.collection('entitlementGrants');
  private rewardRules = db.collection('rewardRules');

  async getReferral(id: string): Promise<ReferralRecord | null> {
    const snap = await this.referrals.doc(id).get();
    return snap.exists ? (snap.data() as ReferralRecord) : null;
  }

  /** Has this uid already been the REFERRED party in any referral, ever? Enforced once per signup. */
  async findByReferred(referredUid: string): Promise<ReferralRecord | null> {
    const snap = await this.referrals.where('referredUid', '==', referredUid).limit(1).get();
    return snap.empty ? null : (snap.docs[0].data() as ReferralRecord);
  }

  async listByReferrer(referrerUid: string): Promise<ReferralRecord[]> {
    const snap = await this.referrals.where('referrerUid', '==', referrerUid).get();
    return snap.docs.map((d) => d.data() as ReferralRecord);
  }

  async createReferral(record: ReferralRecord): Promise<void> {
    await this.referrals.doc(record.id).set(record);
  }

  newGrantId(): string {
    return this.grants.doc().id;
  }

  async createGrant(grant: EntitlementGrant): Promise<void> {
    await this.grants.doc(grant.id).set(grant);
  }

  /** null when nobody has ever written the rule document — the service applies DEFAULT_REWARD_RULE. */
  async getRewardRule(): Promise<RewardRule | null> {
    const snap = await this.rewardRules.doc(REFERRAL_REWARD_RULE_ID).get();
    return snap.exists ? (snap.data() as RewardRule) : null;
  }
}

export const referralRepository = new ReferralRepository();

import { api } from './client';

/** Mirrors backend-firestore/src/types/referral.ts. */
export interface ReferralRecord {
  id: string;
  referrerUid: string;
  referredUid: string;
  referrerRewardDays: number;
  referredRewardDays: number;
  createdAt: unknown;
}

export interface RewardRuleSummary {
  active: boolean;
  referrerRewardDays: number;
  referredRewardDays: number;
}

export interface MyReferrals {
  referralCode: string;
  referrals: ReferralRecord[];
  rewardRule: RewardRuleSummary;
}

export const referralsApi = {
  async listMine(): Promise<MyReferrals> {
    const { data } = await api.get('/users/referrals');
    return data;
  },
};

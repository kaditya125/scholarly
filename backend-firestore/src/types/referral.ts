/**
 * Referrals + entitlements (Phase 3L).
 *
 * ── What counts as a referral, deliberately narrow ─────────────────────────────────────
 * A referral completes the moment a genuinely NEW account is bootstrapped with someone else's
 * uid attached (`?ref=<uid>` at signup). There is no "stayed active N days" or "made a purchase"
 * qualifying criterion — like teacher verification's "what is actually checked" (D-3), that is a
 * policy nobody has set, and inventing one would be worse than the honest, simple rule: signing
 * up counts. `rewardRules` exists so this can be tightened later (e.g. reward only after
 * onboarding completes) without a schema change — the trigger just isn't wired to anything else
 * yet. See enrollment.service.ts's own note: "A referral is neither [invitation nor purchase]" —
 * it grants Sadhya access to nobody; the referrer already had an account, and the referred
 * person still goes through ordinary signup. It only ever grants a Pro-days reward.
 *
 * ── Reward mechanism: Pro days, not a new currency ─────────────────────────────────────
 * There is no credits/coupon system anywhere in this codebase. Reusing the EXISTING
 * `users/{uid}.plan` / `subscription.currentPeriodEnd` fields payments.service.ts already writes
 * means the reward shows up in the same Pro badge, Settings billing page and capability checks
 * every other Pro grant already does — no surface has to learn a new concept.
 *
 * ── Why `rewardRules` is a Firestore collection, not a checked-in const ────────────────
 * Unlike config/monetization.ts's commission rate, TEACHER_ECOSYSTEM_PLAN.md calls out reward
 * amounts specifically as a risk if hardcoded ("Reward amounts hardcoded → Medium risk →
 * Mitigation: rewardRules config-as-data from day one"). Storing it in Firestore means it can
 * change without a redeploy — `active: false` is the kill switch the same plan calls for. There
 * is no admin endpoint to edit it in THIS phase; an operator edits the
 * `rewardRules/referral_signup` document directly (Firebase Console) until that's worth building.
 */

export const REFERRAL_REWARD_RULE_ID = 'referral_signup';

/** `rewardRules/{id}` */
export interface RewardRule {
  id: string;
  active: boolean;
  referrerRewardDays: number;
  referredRewardDays: number;
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

/** Applied only when no rule document exists yet — a working default, not a hidden decision. */
export const DEFAULT_REWARD_RULE = {
  active: true,
  referrerRewardDays: 7,
  referredRewardDays: 7,
} as const;

export type EffectiveRewardRule = {
  active: boolean;
  referrerRewardDays: number;
  referredRewardDays: number;
};

/** `referrals/{referrerUid}_{referredUid}` — composite id makes a duplicate structurally impossible. */
export interface ReferralRecord {
  id: string;
  referrerUid: string;
  referredUid: string;
  referrerRewardDays: number;
  referredRewardDays: number;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export function referralId(referrerUid: string, referredUid: string): string {
  return `${referrerUid}_${referredUid}`;
}

export const ENTITLEMENT_KINDS = ['pro_days'] as const;
export type EntitlementKind = (typeof ENTITLEMENT_KINDS)[number];

/** `entitlementGrants/{id}` — the audit trail behind every entitlement this system ever grants. */
export interface EntitlementGrant {
  id: string;
  userId: string;
  source: 'referral';
  sourceId: string;
  kind: EntitlementKind;
  amount: number;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { entitlementService, MeteredFeature, PLAN_LIMITS, PlanType } from './entitlement.service';

export interface QuotaCheckResult {
  allowed: boolean;
  feature: MeteredFeature;
  plan: PlanType;
  used: number;
  limit: number;
  remaining: number;
  resetsAt: number;
  percentUsed: number;
}

export interface UserUsageSummary {
  plan: PlanType;
  isPro: boolean;
  periodKey: string;
  periodStart: number;
  periodEnd: number;
  resetsAt: number;
  metrics: {
    chat: { used: number; limit: number; remaining: number; percent: number };
    voice: { usedSeconds: number; usedMinutes: number; limitMinutes: number; remainingMinutes: number; percent: number };
    documents: { used: number; limit: number; remaining: number; percent: number };
    podcasts: { used: number; limit: number; remaining: number; percent: number };
    mockTests: { used: number; limit: number; remaining: number; percent: number };
  };
}

export interface UsageDocData {
  userId: string;
  periodKey: string;
  chatMessages: number;
  voiceSeconds: number;
  documentsUploaded: number;
  podcastsGenerated: number;
  mockTestsGenerated: number;
  periodStart: number;
  periodEnd: number;
  updatedAt: number;
}

export class UsageService {
  /**
   * Computes the billing or monthly cycle period window for a user.
   */
  getPeriodWindow(subscription?: any): { periodKey: string; periodStart: number; periodEnd: number } {
    const now = Date.now();
    const end = Number(subscription?.currentPeriodEnd || 0);
    const start = Number(subscription?.activatedAt || 0);

    if (subscription?.status === 'active' && end > now && start > 0) {
      // Pro subscriber: billing cycle period
      const cycleKey = `sub_${new Date(start).toISOString().slice(0, 10)}`;
      return {
        periodKey: cycleKey,
        periodStart: start,
        periodEnd: end,
      };
    }

    // Free tier: monthly calendar cycle
    const date = new Date();
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const periodStart = Date.UTC(year, month, 1);
    const periodEnd = Date.UTC(year, month + 1, 1);
    const periodKey = `free_${year}-${String(month + 1).padStart(2, '0')}`;

    return {
      periodKey,
      periodStart,
      periodEnd,
    };
  }

  private docRef(userId: string, periodKey: string) {
    return db.collection('user_usage').doc(`${userId}_${periodKey}`);
  }

  /**
   * Fetches the current usage record for the user's active period.
   */
  async getUsageRecord(userId: string, periodKey: string, periodStart: number, periodEnd: number): Promise<UsageDocData> {
    const ref = this.docRef(userId, periodKey);
    const snap = await ref.get();
    if (!snap.exists) {
      return {
        userId,
        periodKey,
        chatMessages: 0,
        voiceSeconds: 0,
        documentsUploaded: 0,
        podcastsGenerated: 0,
        mockTestsGenerated: 0,
        periodStart,
        periodEnd,
        updatedAt: Date.now(),
      };
    }
    return snap.data() as UsageDocData;
  }

  /**
   * Atomically checks quota and consumes `amount` in one transaction to eliminate race conditions.
   * If quota would be exceeded, throws a structured Error with code 'QUOTA_EXHAUSTED'.
   */
  async consumeQuota(userId: string, feature: MeteredFeature, amount = 1): Promise<QuotaCheckResult> {
    const { plan, subscription } = await entitlementService.getUserPlan(userId);
    const limits = PLAN_LIMITS[plan];
    const limit = limits[feature];
    const { periodKey, periodStart, periodEnd } = this.getPeriodWindow(subscription);
    const ref = this.docRef(userId, periodKey);

    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const currentData = snap.exists ? (snap.data() as UsageDocData) : null;
      const currentUsed = Number(currentData?.[feature] || 0);

      if (currentUsed + amount > limit) {
        const err: any = new Error(
          `Monthly ${feature} allowance exhausted (${currentUsed}/${limit}). Upgrade to Pro for higher limits.`,
        );
        err.code = 'QUOTA_EXHAUSTED';
        err.statusCode = 403;
        err.feature = feature;
        err.plan = plan;
        err.used = currentUsed;
        err.limit = limit;
        err.remaining = Math.max(0, limit - currentUsed);
        err.resetsAt = periodEnd;
        throw err;
      }

      const newUsed = currentUsed + amount;
      tx.set(
        ref,
        {
          userId,
          periodKey,
          periodStart,
          periodEnd,
          [feature]: FieldValue.increment(amount),
          updatedAt: Date.now(),
        },
        { merge: true },
      );

      const remaining = Math.max(0, limit - newUsed);
      const percentUsed = Math.min(100, Math.round((newUsed / limit) * 100));

      return {
        allowed: true,
        feature,
        plan,
        used: newUsed,
        limit,
        remaining,
        resetsAt: periodEnd,
        percentUsed,
      };
    });
  }

  /**
   * Read-only check of the user's remaining quota for a feature.
   */
  async checkQuota(userId: string, feature: MeteredFeature, requestedAmount = 1): Promise<QuotaCheckResult> {
    const { plan, subscription } = await entitlementService.getUserPlan(userId);
    const limits = PLAN_LIMITS[plan];
    const limit = limits[feature];
    const { periodKey, periodStart, periodEnd } = this.getPeriodWindow(subscription);
    const usage = await this.getUsageRecord(userId, periodKey, periodStart, periodEnd);
    const used = Number(usage[feature] || 0);
    const remaining = Math.max(0, limit - used);
    const allowed = used + requestedAmount <= limit;
    const percentUsed = Math.min(100, Math.round((used / limit) * 100));

    return {
      allowed,
      feature,
      plan,
      used,
      limit,
      remaining,
      resetsAt: periodEnd,
      percentUsed,
    };
  }

  /**
   * Returns a complete, transparent breakdown of usage across all metered tools.
   */
  async getUsageSummary(userId: string): Promise<UserUsageSummary> {
    const { plan, isPro, subscription } = await entitlementService.getUserPlan(userId);
    const limits = PLAN_LIMITS[plan];
    const { periodKey, periodStart, periodEnd } = this.getPeriodWindow(subscription);
    const usage = await this.getUsageRecord(userId, periodKey, periodStart, periodEnd);

    const chatUsed = Number(usage.chatMessages || 0);
    const voiceSecondsUsed = Number(usage.voiceSeconds || 0);
    const docsUsed = Number(usage.documentsUploaded || 0);
    const podcastsUsed = Number(usage.podcastsGenerated || 0);
    const mockTestsUsed = Number(usage.mockTestsGenerated || 0);

    const voiceMinutesUsed = Math.ceil(voiceSecondsUsed / 60);
    const voiceMinutesLimit = Math.round(limits.voiceSeconds / 60);

    return {
      plan,
      isPro,
      periodKey,
      periodStart,
      periodEnd,
      resetsAt: periodEnd,
      metrics: {
        chat: {
          used: chatUsed,
          limit: limits.chatMessages,
          remaining: Math.max(0, limits.chatMessages - chatUsed),
          percent: Math.min(100, Math.round((chatUsed / limits.chatMessages) * 100)),
        },
        voice: {
          usedSeconds: voiceSecondsUsed,
          usedMinutes: voiceMinutesUsed,
          limitMinutes: voiceMinutesLimit,
          remainingMinutes: Math.max(0, voiceMinutesLimit - voiceMinutesUsed),
          percent: Math.min(100, Math.round((voiceSecondsUsed / limits.voiceSeconds) * 100)),
        },
        documents: {
          used: docsUsed,
          limit: limits.documentsUploaded,
          remaining: Math.max(0, limits.documentsUploaded - docsUsed),
          percent: Math.min(100, Math.round((docsUsed / limits.documentsUploaded) * 100)),
        },
        podcasts: {
          used: podcastsUsed,
          limit: limits.podcastsGenerated,
          remaining: Math.max(0, limits.podcastsGenerated - podcastsUsed),
          percent: Math.min(100, Math.round((podcastsUsed / limits.podcastsGenerated) * 100)),
        },
        mockTests: {
          used: mockTestsUsed,
          limit: limits.mockTestsGenerated,
          remaining: Math.max(0, limits.mockTestsGenerated - mockTestsUsed),
          percent: Math.min(100, Math.round((mockTestsUsed / limits.mockTestsGenerated) * 100)),
        },
      },
    };
  }
}

export const usageService = new UsageService();

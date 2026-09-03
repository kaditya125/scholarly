import { db } from '../../config/firebase';
import { paymentsService } from '../../services/payments.service';

/**
 * Subscriptions — who currently has Pro, computed the same way the app itself decides it.
 *
 * ─── WHY THIS REUSES evaluateEntitlement ────────────────────────────────────────────
 * There is no dedicated `subscriptions` collection. Subscription state lives entirely as
 * `users/{uid}.subscription`, a denormalised object payments.service.ts writes. Its raw
 * `status` field is not reliable on its own — payments.service.ts's own header explains
 * why: a prior version trusted `plan === 'pro'` alone and showed a lapsed subscriber as
 * still Pro. `evaluateEntitlement(plan, subscription)` is the fix, and the single
 * definition of "is this user Pro right now" the rest of the app uses. Reusing it here
 * rather than re-deriving active/inactive from the raw fields is the same "no duplicate
 * quota logic" principle adminStudents.service.ts already documents for usage - two
 * copies of an entitlement check WILL drift.
 *
 * ─── THE DISCREPANCY THIS SURFACES ──────────────────────────────────────────────────
 * Found while building this: one real subscription record has `status: 'active'` and a
 * `currentPeriodEnd` about a year out — which evaluateEntitlement correctly reports as
 * active — while the SAME object also carries `refundedAt`, `cancelledAt` and a
 * `refundId`, and its `orderId` matches a payments-collection record whose `status` is
 * `'refunded'`. Per the app's own authorization logic that account currently has a live
 * Pro entitlement despite the underlying payment being refunded. That might be a real gap
 * in the refund flow, or it might be test/migration residue on one account (the fields
 * present - `entitlementSource: 'test'`, `expirationReason: 'TEST_MODE_PAYMENT'` - suggest
 * the latter) - not something to guess at here, so this service flags it rather than
 * silently hiding or silently trusting either signal.
 */

const SCAN_LIMIT = 5000;

export interface SubscriptionRow {
  userId: string;
  email: string | null;
  displayName: string | null;
  planName: string | null;
  billing: string | null;
  rawStatus: string | null;
  active: boolean;
  currentPeriodEnd: number | null;
  amountRupees: number | null;
  refundedAt: number | null;
  cancelledAt: number | null;
  /** True when evaluateEntitlement says active but the record also shows a refund or
   *  cancellation - worth an operator's attention regardless of which signal is right. */
  flagged: boolean;
}

export interface SubscriptionsOverview {
  generatedAt: number;
  totalProUsers: number;
  activeCount: number;
  inactiveCount: number;
  flaggedCount: number;
  subscriptions: SubscriptionRow[];
  truncated: boolean;
}

export class AdminSubscriptionsService {
  async getOverview(): Promise<SubscriptionsOverview> {
    const snap = await db.collection('users').where('plan', '==', 'pro').limit(SCAN_LIMIT).get();

    const rows: SubscriptionRow[] = snap.docs.map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      const sub = (d.subscription as Record<string, unknown>) || {};
      const { active, currentPeriodEnd } = paymentsService.evaluateEntitlement(String(d.plan || ''), sub);

      const refundedAt = typeof sub.refundedAt === 'number' ? sub.refundedAt : null;
      const cancelledAt = typeof sub.cancelledAt === 'number' ? sub.cancelledAt : null;

      return {
        userId: doc.id,
        email: (d.email as string) ?? null,
        displayName: (d.displayName as string) ?? null,
        planName: (sub.planName as string) ?? null,
        billing: (sub.billing as string) ?? null,
        rawStatus: (sub.status as string) ?? null,
        active,
        currentPeriodEnd: currentPeriodEnd ?? null,
        amountRupees: typeof sub.amountRupees === 'number' ? sub.amountRupees : null,
        refundedAt,
        cancelledAt,
        flagged: active && (refundedAt !== null || cancelledAt !== null),
      };
    });

    rows.sort((a, b) => (b.currentPeriodEnd || 0) - (a.currentPeriodEnd || 0));

    return {
      generatedAt: Date.now(),
      totalProUsers: snap.size,
      activeCount: rows.filter((r) => r.active).length,
      inactiveCount: rows.filter((r) => !r.active).length,
      flaggedCount: rows.filter((r) => r.flagged).length,
      subscriptions: rows,
      truncated: snap.size === SCAN_LIMIT,
    };
  }
}

export const adminSubscriptionsService = new AdminSubscriptionsService();

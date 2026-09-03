import { db } from '../../config/firebase';

/**
 * Revenue — aggregated server-side from `payments`.
 *
 * ─── GROSS VS STATUS ────────────────────────────────────────────────────────────────
 * "Gross collected" sums every document with `paidAt` set, not every document with
 * `status === 'paid'`. A refunded order still has `paidAt` — money changed hands before
 * it went back — so counting only the current `status` undercounts what was actually
 * collected. Refunds are then subtracted separately to reach net. (This was gotten wrong
 * once already while building this: an earlier pass only checked `status === 'paid'` and
 * reported ₹0 net when the real figure was ₹199 — verified against the real documents
 * before writing this version.)
 *
 * ─── WHAT THIS IS, HONESTLY ─────────────────────────────────────────────────────────
 * `payments` has 9 documents today. One is `userId: 'e2e_checkout_probe_uid'`, a test
 * fixture. The other 8 all belong to a single account — the product owner's own, used to
 * exercise the checkout flow. There is no evidence yet of a genuine third-party paying
 * customer. This service reports exactly what is there; it does not filter out the test
 * activity, because "is this real" is a judgement call for the person reading the page,
 * not something to decide silently in the aggregation.
 */

const SCAN_LIMIT = 5000;
const RECENT_LIMIT = 20;

export interface BillingBreakdown {
  billing: string;
  count: number;
  grossRupees: number;
}

export interface RecentPayment {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  status: string;
  amountRupees: number | null;
  planName: string | null;
  createdAt: number | null;
}

export interface RevenueOverview {
  generatedAt: number;
  totalOrders: number;
  grossCollectedRupees: number;
  refundedRupees: number;
  netRevenueRupees: number;
  paidCount: number;
  refundedCount: number;
  cancelledCount: number;
  abandonedCount: number;
  byBilling: BillingBreakdown[];
  recentPayments: RecentPayment[];
  truncated: boolean;
}

export class AdminRevenueService {
  async getOverview(): Promise<RevenueOverview> {
    const snap = await db.collection('payments').limit(SCAN_LIMIT).get();

    let grossCollected = 0;
    let refunded = 0;
    let paidCount = 0;
    let refundedCount = 0;
    let cancelledCount = 0;
    let abandonedCount = 0;
    const byBilling = new Map<string, { count: number; gross: number }>();
    const recentCandidates: RecentPayment[] = [];

    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const status = String(d.status || 'unknown');
      const amount = typeof d.amountRupees === 'number' ? d.amountRupees : 0;

      if (d.paidAt) {
        grossCollected += amount;
        const billing = String(d.billing || 'unknown');
        const entry = byBilling.get(billing) || { count: 0, gross: 0 };
        entry.count += 1;
        entry.gross += amount;
        byBilling.set(billing, entry);
      }
      if (status === 'paid') paidCount++;
      if (status === 'refunded') {
        refunded += amount;
        refundedCount++;
      }
      if (status === 'cancelled') cancelledCount++;
      if (status === 'created') abandonedCount++;

      recentCandidates.push({
        id: doc.id,
        userId: String(d.userId || ''),
        email: null,
        displayName: null,
        status,
        amountRupees: typeof d.amountRupees === 'number' ? d.amountRupees : null,
        planName: (d.planName as string) ?? null,
        createdAt: typeof d.createdAt === 'number' ? d.createdAt : null,
      });
    }

    recentCandidates.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const recentPayments = recentCandidates.slice(0, RECENT_LIMIT);
    await this.attachIdentities(recentPayments);

    return {
      generatedAt: Date.now(),
      totalOrders: snap.size,
      grossCollectedRupees: grossCollected,
      refundedRupees: refunded,
      netRevenueRupees: grossCollected - refunded,
      paidCount,
      refundedCount,
      cancelledCount,
      abandonedCount,
      byBilling: [...byBilling.entries()].map(([billing, v]) => ({ billing, count: v.count, grossRupees: v.gross })),
      recentPayments,
      truncated: snap.size === SCAN_LIMIT,
    };
  }

  private async attachIdentities(rows: RecentPayment[]): Promise<void> {
    const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
    if (ids.length === 0) return;

    const docs = await Promise.all(
      ids.map((id) =>
        db
          .collection('users')
          .doc(id)
          .get()
          .catch(() => null),
      ),
    );

    const identities = new Map<string, { email: string | null; displayName: string | null }>();
    docs.forEach((doc, i) => {
      if (!doc || !doc.exists) return;
      const u = doc.data() as Record<string, unknown>;
      identities.set(ids[i], {
        email: (u.email as string) ?? null,
        displayName: (u.displayName as string) ?? null,
      });
    });

    for (const row of rows) {
      const found = identities.get(row.userId);
      if (found) {
        row.email = found.email;
        row.displayName = found.displayName;
      }
    }
  }
}

export const adminRevenueService = new AdminRevenueService();

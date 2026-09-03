import { db } from '../../config/firebase';

/**
 * Payments directory — every order, whatever its outcome.
 *
 * A capped scan, not cursor pagination: `payments` has 9 documents today, and
 * SCAN_LIMIT gives headroom before this needs the real pagination adminStudents.service.ts
 * has (search this file for `SCAN_LIMIT` elsewhere in the admin area for the same
 * pattern - it is the standard here for a collection too small to justify cursor logic
 * yet, not a one-off shortcut). Revisit if this collection grows the way `users` did.
 *
 * No card data is ever stored (payments.service.ts's own comment confirms this); the
 * field list here is the same administrative metadata that service already exposes to
 * a student's own profile panel, nothing more.
 */

const SCAN_LIMIT = 5000;

export interface PaymentRecord {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  status: string;
  amountRupees: number | null;
  currency: string;
  billing: string | null;
  planName: string | null;
  paymentId: string | null;
  method: string | null;
  createdAt: number | null;
  paidAt: number | null;
}

export interface PaymentsOverview {
  generatedAt: number;
  total: number;
  payments: PaymentRecord[];
  truncated: boolean;
}

export class AdminPaymentsService {
  async list(): Promise<PaymentsOverview> {
    const snap = await db.collection('payments').orderBy('createdAt', 'desc').limit(SCAN_LIMIT).get();

    const payments: PaymentRecord[] = snap.docs.map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        userId: String(d.userId || ''),
        email: null,
        displayName: null,
        status: String(d.status || 'unknown'),
        amountRupees: typeof d.amountRupees === 'number' ? d.amountRupees : null,
        currency: (d.currency as string) ?? 'INR',
        billing: (d.billing as string) ?? null,
        planName: (d.planName as string) ?? null,
        paymentId: (d.paymentId as string) ?? null,
        method: (d.method as string) ?? null,
        createdAt: typeof d.createdAt === 'number' ? d.createdAt : null,
        paidAt: typeof d.paidAt === 'number' ? d.paidAt : null,
      };
    });

    await this.attachIdentities(payments);

    return {
      generatedAt: Date.now(),
      total: snap.size,
      payments,
      truncated: snap.size === SCAN_LIMIT,
    };
  }

  private async attachIdentities(rows: PaymentRecord[]): Promise<void> {
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

export const adminPaymentsService = new AdminPaymentsService();

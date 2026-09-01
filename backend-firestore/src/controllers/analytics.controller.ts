import { Request, Response } from 'express';
import { AggregateField, Query } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { currencyService } from '../services/currency.service';
import { isAdmin } from '../middlewares/auth';

/**
 * Sum `estimatedCostUSD` server-side instead of reading every matching document.
 *
 * WHY. This endpoint used to fetch the whole `cost_records` collection and add the
 * field up in Node. `telemetry.service.ts` writes one record per AI call, so the
 * collection grows without bound and every request re-read all of it.
 *
 * On Firestore Enterprise edition that is billed in READ UNITS, which scale with the
 * volume of data scanned rather than the number of documents returned — so a full
 * scan of a growing collection is far more expensive than the document count
 * suggests. It billed 81,731,965 read units in Aug 2026 (₹770 of a ₹773 bill)
 * against only 671,716 writes: 120 reads for every write, on a 30-user product.
 *
 * An aggregation query computes the sum in the backend and returns a single value,
 * so the response size no longer grows with history.
 */
async function sumCostUsd(query: Query): Promise<number> {
  try {
    const snap = await query.aggregate({ total: AggregateField.sum('estimatedCostUSD') }).get();
    return snap.data().total ?? 0;
  } catch (error: any) {
    // The per-user split filters on (userId, operation) and needs a composite index. If the
    // code reaches production before `firebase deploy --only firestore:indexes` does,
    // Firestore answers FAILED_PRECONDITION and this endpoint would 500 for every
    // non-admin caller. Falling back keeps it correct while the index builds — but the
    // fallback IS the expensive scan this commit exists to remove, so it shouts.
    if (error?.code !== 9 && error?.code !== 'failed-precondition') throw error;
    console.error(
      '[analytics] Aggregation unavailable — the (userId, operation) composite index on ' +
      'cost_records is missing or still building. Falling back to a FULL COLLECTION SCAN, ' +
      'which is the read-unit cost this endpoint was rewritten to avoid. ' +
      'Fix: firebase deploy --only firestore:indexes',
    );
    let total = 0;
    const snap = await query.select('estimatedCostUSD').get();
    snap.forEach((doc) => { total += doc.data().estimatedCostUSD || 0; });
    return total;
  }
}

export const getCostAnalytics = async (req: Request, res: Response) => {
  try {
    /**
     * SECURITY (Phase 0): `userId` used to come straight off the query string, and
     * omitting it returned system-wide totals to any caller. Scope is now decided by the
     * verified token:
     *   - administrator  → may query any user, or omit userId for system-wide totals
     *   - everyone else  → forced to their own uid, whatever the query string says
     */
    const requestedUserId = req.query.userId as string | undefined;
    const callerIsAdmin = isAdmin(req);
    const userId = callerIsAdmin ? requestedUserId : req.user!.uid;
    // Scope first, then aggregate. Two sums rather than three: `llm` is the remainder,
    // which keeps this to two aggregations and avoids depending on the exact set of
    // non-embedding `operation` values.
    const base = userId
      ? db.collection('cost_records').where('userId', '==', userId)
      : db.collection('cost_records');

    const [totalCostUsd, embeddingCostUsd] = await Promise.all([
      sumCostUsd(base),
      sumCostUsd(base.where('operation', '==', 'embedding')),
    ]);
    const llmCostUsd = totalCostUsd - embeddingCostUsd;

    const conversionRate = await currencyService.getUsdToInrRate();
    
    res.status(200).json({
      currency: 'INR',
      conversionRate,
      costs: {
        llmCostInr: llmCostUsd * conversionRate,
        embeddingCostInr: embeddingCostUsd * conversionRate,
        totalCostInr: totalCostUsd * conversionRate,
        llmCostUsd,
        embeddingCostUsd,
        totalCostUsd
      }
    });
  } catch (error) {
    console.error('Error fetching cost analytics:', error);
    res.status(500).json({ error: 'Failed to fetch cost analytics' });
  }
};

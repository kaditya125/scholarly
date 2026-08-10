import { Request, Response } from 'express';
import { db } from '../config/firebase';
import { currencyService } from '../services/currency.service';
import { isAdmin } from '../middlewares/auth';

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
    let llmCostUsd = 0;
    let embeddingCostUsd = 0;
    let totalCostUsd = 0;

    if (userId) {
      const userRecords = await db.collection('cost_records').where('userId', '==', userId).get();
      userRecords.forEach(doc => {
        const data = doc.data();
        totalCostUsd += data.estimatedCostUSD || 0;
        if (data.operation === 'embedding') embeddingCostUsd += data.estimatedCostUSD || 0;
        else llmCostUsd += data.estimatedCostUSD || 0;
      });
    } else {
      const allRecords = await db.collection('cost_records').get();
      allRecords.forEach(doc => {
        const data = doc.data();
        totalCostUsd += data.estimatedCostUSD || 0;
        if (data.operation === 'embedding') embeddingCostUsd += data.estimatedCostUSD || 0;
        else llmCostUsd += data.estimatedCostUSD || 0;
      });
    }

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

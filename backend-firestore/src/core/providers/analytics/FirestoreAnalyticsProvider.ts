import { db } from '../../../config/firebase';
import { IAnalyticsProvider, RetrievalMetrics } from '../../interfaces/IAnalyticsProvider';

export class FirestoreAnalyticsProvider implements IAnalyticsProvider {
  /**
   * Logs a single execution workflow's retrieval analytics.
   */
  async logWorkflowMetrics(userId: string, metrics: RetrievalMetrics): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      await db.collection('users').doc(userId).collection('analytics_logs').add({
        ...metrics,
        timestamp
      });
      console.log(`[Analytics] Logged workflow metrics for user ${userId}`);
    } catch (error) {
      console.error('Failed to log workflow metrics:', error);
    }
  }
}

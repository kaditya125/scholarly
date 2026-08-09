import { getFirestore } from 'firebase-admin/firestore';
import { logger } from '../../utils/logger';

export interface TTSCostEntry {
  id: string;
  userId: string;
  podcastId?: string;
  provider: string;
  characterCount: number;
  estimatedCost: number;
  voice: string;
  speaker: string;
  timestamp: number;
  month: string; // YYYY-MM for aggregation
}

export interface MonthlyCostSummary {
  month: string;
  totalCost: number;
  totalCharacters: number;
  totalRequests: number;
  byProvider: Record<string, number>;
  lastUpdated: number;
}

/**
 * Cost tracking service for TTS operations
 * Tracks individual synthesis calls and monthly aggregates
 */
export class CostTrackingService {
  private readonly db = getFirestore();
  private readonly costsCollection = 'podcast_costs';
  private readonly monthlyCollection = 'podcast_monthly_costs';
  
  // Cost per 1M characters for different providers
  private readonly COST_PER_MILLION_CHARS: Record<string, number> = {
    'google-cloud-wavenet': 16.0,  // WaveNet voices (Journey, Studio)
    'google-cloud-standard': 4.0,  // Standard voices
    'google-cloud-neural2': 16.0,  // Neural2 voices
    'elevenlabs': 30.0,             // ElevenLabs (future)
    'gemini': 0.0,                  // TBD when available
  };

  /**
   * Track a TTS synthesis cost
   */
  async trackSynthesis(entry: Omit<TTSCostEntry, 'id' | 'timestamp' | 'month'>): Promise<void> {
    const now = Date.now();
    const month = this.getMonth(now);
    
    const costEntry: TTSCostEntry = {
      ...entry,
      id: `cost_${now}_${Math.random().toString(36).substring(7)}`,
      timestamp: now,
      month,
    };

    try {
      // Store individual cost entry
      await this.db.collection(this.costsCollection).doc(costEntry.id).set(costEntry);

      // Update monthly aggregate
      await this.updateMonthlyCost(entry.userId, month, entry.estimatedCost, entry.characterCount, entry.provider);

      logger.info('[CostTracking] Tracked TTS synthesis', {
        userId: entry.userId,
        podcastId: entry.podcastId,
        characterCount: entry.characterCount,
        estimatedCost: entry.estimatedCost.toFixed(4),
        month
      });
    } catch (err) {
      logger.error('[CostTracking] Failed to track cost:', err);
      // Don't throw - cost tracking failure shouldn't block synthesis
    }
  }

  /**
   * Get total cost for a podcast
   */
  async getPodcastCost(podcastId: string): Promise<number> {
    try {
      const snapshot = await this.db
        .collection(this.costsCollection)
        .where('podcastId', '==', podcastId)
        .get();

      return snapshot.docs.reduce((sum, doc) => sum + (doc.data().estimatedCost || 0), 0);
    } catch (err) {
      logger.error('[CostTracking] Failed to get podcast cost:', err);
      return 0;
    }
  }

  /**
   * Get monthly cost for a user
   */
  async getMonthlyCost(userId: string, month?: string): Promise<MonthlyCostSummary | null> {
    const targetMonth = month || this.getMonth(Date.now());
    
    try {
      const doc = await this.db
        .collection(this.monthlyCollection)
        .doc(`${userId}_${targetMonth}`)
        .get();

      if (!doc.exists) {
        return {
          month: targetMonth,
          totalCost: 0,
          totalCharacters: 0,
          totalRequests: 0,
          byProvider: {},
          lastUpdated: Date.now()
        };
      }

      return doc.data() as MonthlyCostSummary;
    } catch (err) {
      logger.error('[CostTracking] Failed to get monthly cost:', err);
      return null;
    }
  }

  /**
   * Check if user would exceed monthly budget
   */
  async wouldExceedBudget(userId: string, additionalCost: number, monthlyBudget: number): Promise<boolean> {
    const monthlySummary = await this.getMonthlyCost(userId);
    if (!monthlySummary) return false; // Fail open if we can't check

    const projectedTotal = monthlySummary.totalCost + additionalCost;
    return projectedTotal > monthlyBudget;
  }

  /**
   * Calculate estimated cost for character count
   */
  calculateCost(characterCount: number, provider: string = 'google-cloud-wavenet'): number {
    const costPerMillion = this.COST_PER_MILLION_CHARS[provider] || 16.0;
    return (characterCount / 1_000_000) * costPerMillion;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private getMonth(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private async updateMonthlyCost(
    userId: string,
    month: string,
    cost: number,
    characters: number,
    provider: string
  ): Promise<void> {
    const docId = `${userId}_${month}`;
    const docRef = this.db.collection(this.monthlyCollection).doc(docId);

    try {
      await this.db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        if (!doc.exists) {
          // Create new monthly summary
          const newSummary: MonthlyCostSummary = {
            month,
            totalCost: cost,
            totalCharacters: characters,
            totalRequests: 1,
            byProvider: { [provider]: cost },
            lastUpdated: Date.now()
          };
          transaction.set(docRef, newSummary);
        } else {
          // Update existing summary
          const existing = doc.data() as MonthlyCostSummary;
          transaction.update(docRef, {
            totalCost: existing.totalCost + cost,
            totalCharacters: existing.totalCharacters + characters,
            totalRequests: existing.totalRequests + 1,
            [`byProvider.${provider}`]: (existing.byProvider[provider] || 0) + cost,
            lastUpdated: Date.now()
          });
        }
      });
    } catch (err) {
      logger.error('[CostTracking] Failed to update monthly cost:', err);
      // Don't throw - let synthesis continue
    }
  }
}

export const costTrackingService = new CostTrackingService();

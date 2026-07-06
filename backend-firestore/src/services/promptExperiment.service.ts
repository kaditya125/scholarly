import { getFirestore } from 'firebase-admin/firestore';
import { logger } from '../utils/logger';
import { PromptVersion } from '../types/observability';

/**
 * PromptExperimentService — Prompt A/B Testing
 * 
 * Manages prompt experiments:
 * - Randomly assigns users to Group A or Group B
 * - Tracks which prompt version was used per response
 * - Collects metrics (student rating, completion rate, hallucination) per group
 * - Recommends the winning variant based on statistical significance
 * 
 * Example experiment:
 *   Teacher Prompt V7 (Group A) vs Teacher Prompt V8 (Group B)
 *   Compared on: student rating, completion rate, follow-up questions, hallucination
 */
export class PromptExperimentService {
  private db = getFirestore();
  private readonly COLLECTION = 'prompt_experiments';

  /**
   * Get the active prompt for a user, randomly assigning to A/B group if an experiment is running.
   */
  async getExperimentalPrompt(
    promptName: string, 
    userId: string, 
    defaultContent: string
  ): Promise<{ content: string; version: string; abGroup: 'A' | 'B' | 'control' }> {
    try {
      // Check if there's an active experiment for this prompt
      const experimentSnap = await this.db.collection(this.COLLECTION)
        .where('promptName', '==', promptName)
        .where('status', '==', 'active')
        .limit(1)
        .get();

      if (experimentSnap.empty) {
        return { content: defaultContent, version: 'default', abGroup: 'control' };
      }

      const experiment = experimentSnap.docs[0].data();

      // Deterministic assignment based on userId hash
      const hash = this.simpleHash(userId + experiment.id);
      const group: 'A' | 'B' = hash % 2 === 0 ? 'A' : 'B';

      const promptContent = group === 'A' ? experiment.variantA.content : experiment.variantB.content;
      const version = group === 'A' ? experiment.variantA.version : experiment.variantB.version;

      logger.info(`A/B test assignment`, {
        userId,
        promptName,
        experimentId: experiment.id,
        group,
        version,
      });

      return { content: promptContent, version, abGroup: group };
    } catch (error) {
      logger.error('Failed to resolve A/B test', { error, promptName });
      return { content: defaultContent, version: 'default', abGroup: 'control' };
    }
  }

  /**
   * Create a new prompt experiment
   */
  async createExperiment(params: {
    promptName: string;
    variantA: { version: string; content: string };
    variantB: { version: string; content: string };
    description: string;
    createdBy: string;
  }): Promise<string> {
    const id = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await this.db.collection(this.COLLECTION).doc(id).set({
      id,
      ...params,
      status: 'active',
      metricsA: { totalResponses: 0, avgRating: 0, completionRate: 0, hallucinationRate: 0 },
      metricsB: { totalResponses: 0, avgRating: 0, completionRate: 0, hallucinationRate: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    logger.info(`Created prompt experiment: ${id}`, { promptName: params.promptName });
    return id;
  }

  /**
   * Record experiment metrics for a response
   */
  async recordExperimentMetric(
    experimentId: string,
    group: 'A' | 'B',
    metrics: { rating?: number; completed?: boolean; hallucination?: boolean }
  ): Promise<void> {
    const ref = this.db.collection(this.COLLECTION).doc(experimentId);
    const doc = await ref.get();
    if (!doc.exists) return;

    const data = doc.data()!;
    const metricsKey = group === 'A' ? 'metricsA' : 'metricsB';
    const current = data[metricsKey];

    const newTotal = current.totalResponses + 1;
    const updates: any = {
      [`${metricsKey}.totalResponses`]: newTotal,
    };

    if (metrics.rating !== undefined) {
      updates[`${metricsKey}.avgRating`] = 
        ((current.avgRating * current.totalResponses) + metrics.rating) / newTotal;
    }

    await ref.update(updates);
  }

  /**
   * Get experiment results with recommendation
   */
  async getExperimentResults(experimentId: string): Promise<any> {
    const doc = await this.db.collection(this.COLLECTION).doc(experimentId).get();
    if (!doc.exists) return null;

    const data = doc.data()!;
    const { metricsA, metricsB } = data;

    let recommendation = 'insufficient_data';
    if (metricsA.totalResponses >= 30 && metricsB.totalResponses >= 30) {
      if (metricsA.avgRating > metricsB.avgRating + 0.5) {
        recommendation = `Variant A (${data.variantA.version}) is significantly better`;
      } else if (metricsB.avgRating > metricsA.avgRating + 0.5) {
        recommendation = `Variant B (${data.variantB.version}) is significantly better`;
      } else {
        recommendation = 'No significant difference detected';
      }
    }

    return {
      id: experimentId,
      promptName: data.promptName,
      description: data.description,
      status: data.status,
      variantA: { version: data.variantA.version, ...metricsA },
      variantB: { version: data.variantB.version, ...metricsB },
      recommendation,
    };
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

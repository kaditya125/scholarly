import { getFirestore } from 'firebase-admin/firestore';
import { logger } from '../utils/logger';
import { AIResponseFeedback, FeedbackRating } from '../types/observability';

/**
 * FeedbackService — Deep User Feedback Collection
 * 
 * Captures rich, contextual feedback mapped to:
 * - Prompt Version used
 * - Retrieval IDs and Context Chunks
 * - Provider and Model used
 * - Exam Mode / Learning Mode
 * - Confidence + Verification Scores
 * 
 * Feeds into: Continuous Eval Pipeline, AI Improvement Dashboard, Prompt A/B Testing
 */
export class FeedbackService {
  private db = getFirestore();
  private readonly COLLECTION = 'user_feedback';

  async submitFeedback(feedback: Omit<AIResponseFeedback, 'id' | 'createdAt'>): Promise<string> {
    const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const record: AIResponseFeedback = {
      ...feedback,
      id,
      createdAt: Date.now(),
    };

    await this.db.collection(this.COLLECTION).doc(id).set(record);
    
    logger.info('Feedback recorded', {
      traceId: feedback.traceId,
      userId: feedback.userId,
      rating: feedback.rating,
      messageId: feedback.messageId,
      promptVersion: feedback.promptVersion,
      provider: feedback.providerUsed,
    });

    return id;
  }

  async getFeedbackForMessage(messageId: string): Promise<AIResponseFeedback[]> {
    const snap = await this.db.collection(this.COLLECTION)
      .where('messageId', '==', messageId)
      .get();
    return snap.docs.map(d => d.data() as AIResponseFeedback);
  }

  async getFeedbackByUser(userId: string, limit: number = 50): Promise<AIResponseFeedback[]> {
    const snap = await this.db.collection(this.COLLECTION)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => d.data() as AIResponseFeedback);
  }

  async getRecentFeedback(limit: number = 100): Promise<AIResponseFeedback[]> {
    const snap = await this.db.collection(this.COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => d.data() as AIResponseFeedback);
  }

  async getFeedbackSummary(days: number = 7): Promise<any> {
    const since = Date.now() - (days * 86400000);
    const snap = await this.db.collection(this.COLLECTION)
      .where('createdAt', '>=', since)
      .get();
    
    const docs = snap.docs.map(d => d.data() as AIResponseFeedback);
    
    const distribution: Record<FeedbackRating, number> = {
      thumbs_up: 0, thumbs_down: 0, incorrect: 0, outdated: 0,
      too_easy: 0, too_hard: 0, hallucination: 0, needs_citation: 0,
      very_helpful: 0, report_issue: 0,
    };
    
    for (const fb of docs) {
      distribution[fb.rating]++;
    }

    const positive = distribution.thumbs_up + distribution.very_helpful;
    const negative = distribution.thumbs_down + distribution.incorrect + distribution.hallucination;
    const total = docs.length;

    return {
      period: `${days} days`,
      total,
      positive,
      negative,
      satisfactionRate: total > 0 ? parseFloat(((positive / total) * 100).toFixed(1)) : 0,
      distribution,
      byExamMode: this.groupBy(docs, 'examMode'),
      byProvider: this.groupBy(docs, 'providerUsed'),
      byPromptVersion: this.groupBy(docs, 'promptVersion'),
    };
  }

  private groupBy(docs: AIResponseFeedback[], field: keyof AIResponseFeedback): Record<string, number> {
    const result: Record<string, number> = {};
    for (const doc of docs) {
      const key = String(doc[field] || 'unknown');
      result[key] = (result[key] || 0) + 1;
    }
    return result;
  }
}

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from '../utils/logger';
import { 
  TelemetryRecord, 
  CostRecord, 
  AdminAlert,
  AIResponseFeedback 
} from '../types/observability';

/**
 * TelemetryService — Production Observability Layer
 * 
 * Records every AI request's full lifecycle metrics:
 * retrieval → reranking → verification → generation → streaming → feedback
 * 
 * All records share the same traceId for end-to-end correlation.
 */
export class TelemetryService {
  private db = getFirestore();

  // ─── Telemetry Recording ────────────────────────────────────────────

  async recordTelemetry(record: TelemetryRecord): Promise<void> {
    try {
      await this.db.collection('telemetry').add({
        ...record,
        timestamp: Date.now(),
      });

      // Check for alert conditions
      await this.checkAlertThresholds(record);

      logger.info('Telemetry recorded', { 
        traceId: record.traceId, 
        provider: record.provider,
        latencyMs: record.totalLatencyMs,
        tokens: record.totalTokens,
        cost: record.estimatedCostUSD,
      });
    } catch (error) {
      logger.error('Failed to record telemetry', { traceId: record.traceId, error });
    }
  }

  // ─── Cost Recording ─────────────────────────────────────────────────

  async recordCost(cost: CostRecord): Promise<void> {
    try {
      await this.db.collection('cost_records').add({
        ...cost,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to record cost', { error });
    }
  }

  // ─── Alert System ───────────────────────────────────────────────────

  private async checkAlertThresholds(record: TelemetryRecord): Promise<void> {
    const alerts: Partial<AdminAlert>[] = [];

    // Latency > 5 seconds
    if (record.totalLatencyMs > 5000) {
      alerts.push({
        type: 'latency',
        severity: record.totalLatencyMs > 10000 ? 'critical' : 'warning',
        message: `High latency detected: ${record.totalLatencyMs}ms for ${record.provider}/${record.model}`,
        metadata: { traceId: record.traceId, latencyMs: record.totalLatencyMs },
      });
    }

    // Verification failure
    if (!record.verificationPassed) {
      alerts.push({
        type: 'verification_failure',
        severity: 'warning',
        message: `Verification failed for trace ${record.traceId}`,
        metadata: { traceId: record.traceId, provider: record.provider },
      });
    }

    // High token usage (> 10k tokens in single request)
    if (record.totalTokens > 10000) {
      alerts.push({
        type: 'token_usage',
        severity: 'info',
        message: `High token usage: ${record.totalTokens} tokens for ${record.provider}/${record.model}`,
        metadata: { traceId: record.traceId, tokens: record.totalTokens, cost: record.estimatedCostUSD },
      });
    }

    for (const alert of alerts) {
      await this.db.collection('admin_alerts').add({
        ...alert,
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        resolved: false,
        createdAt: Date.now(),
      });
      logger.warn(`Alert triggered: ${alert.type}`, { severity: alert.severity, message: alert.message });
    }
  }

  // ─── Admin Metrics Aggregation ──────────────────────────────────────

  async getSystemHealth(): Promise<any> {
    const now = Date.now();
    const dayAgo = now - 86400000;

    const [telemetrySnap, alertsSnap, feedbackSnap] = await Promise.all([
      this.db.collection('telemetry').where('timestamp', '>=', dayAgo).get(),
      this.db.collection('admin_alerts').where('resolved', '==', false).get(),
      this.db.collection('user_feedback').where('createdAt', '>=', dayAgo).get(),
    ]);

    const telemetryDocs = telemetrySnap.docs.map(d => d.data() as TelemetryRecord);
    
    // Provider health
    const providerStats: Record<string, { requests: number; failures: number; avgLatency: number; totalTokens: number; totalCost: number }> = {};
    for (const t of telemetryDocs) {
      if (!providerStats[t.provider]) {
        providerStats[t.provider] = { requests: 0, failures: 0, avgLatency: 0, totalTokens: 0, totalCost: 0 };
      }
      const ps = providerStats[t.provider];
      ps.requests++;
      ps.totalTokens += t.totalTokens;
      ps.totalCost += t.estimatedCostUSD;
      ps.avgLatency = ((ps.avgLatency * (ps.requests - 1)) + t.totalLatencyMs) / ps.requests;
      if (!t.verificationPassed) ps.failures++;
    }

    // RAG metrics
    const avgChunkCount = telemetryDocs.length > 0 
      ? telemetryDocs.reduce((s, t) => s + t.chunkCount, 0) / telemetryDocs.length 
      : 0;
    const cacheHitRate = telemetryDocs.length > 0
      ? telemetryDocs.filter(t => t.cacheHit).length / telemetryDocs.length
      : 0;
    const avgSimilarity = telemetryDocs.length > 0
      ? telemetryDocs.reduce((s, t) => s + t.averageSimilarityScore, 0) / telemetryDocs.length
      : 0;
    const avgPineconeTime = telemetryDocs.length > 0
      ? telemetryDocs.reduce((s, t) => s + t.pineconeQueryTimeMs, 0) / telemetryDocs.length
      : 0;

    return {
      timestamp: now,
      requestsToday: telemetryDocs.length,
      activeAlerts: alertsSnap.size,
      feedbackToday: feedbackSnap.size,
      
      aiMetrics: {
        avgLatencyMs: telemetryDocs.length > 0
          ? Math.round(telemetryDocs.reduce((s, t) => s + t.totalLatencyMs, 0) / telemetryDocs.length)
          : 0,
        avgTimeToFirstToken: telemetryDocs.length > 0
          ? Math.round(telemetryDocs.reduce((s, t) => s + t.timeToFirstTokenMs, 0) / telemetryDocs.length)
          : 0,
        totalTokensToday: telemetryDocs.reduce((s, t) => s + t.totalTokens, 0),
        totalCostToday: parseFloat(telemetryDocs.reduce((s, t) => s + t.estimatedCostUSD, 0).toFixed(4)),
        verificationSuccessRate: telemetryDocs.length > 0
          ? parseFloat((telemetryDocs.filter(t => t.verificationPassed).length / telemetryDocs.length * 100).toFixed(1))
          : 100,
        providerStats,
      },

      ragMetrics: {
        avgChunkCount: parseFloat(avgChunkCount.toFixed(1)),
        cacheHitRate: parseFloat((cacheHitRate * 100).toFixed(1)),
        avgSimilarityScore: parseFloat(avgSimilarity.toFixed(3)),
        avgPineconeQueryTimeMs: Math.round(avgPineconeTime),
      },
    };
  }

  // ─── Cost Analytics ─────────────────────────────────────────────────

  async getCostAnalytics(days: number = 30): Promise<any> {
    const since = Date.now() - (days * 86400000);
    const snapshot = await this.db.collection('cost_records').where('timestamp', '>=', since).get();
    const records = snapshot.docs.map(d => d.data() as CostRecord);

    const byProvider: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    const byOperation: Record<string, number> = {};
    let totalCost = 0;

    for (const r of records) {
      byProvider[r.provider] = (byProvider[r.provider] || 0) + r.estimatedCostUSD;
      byUser[r.userId] = (byUser[r.userId] || 0) + r.estimatedCostUSD;
      const op = r.operation || 'chat';
      byOperation[op] = (byOperation[op] || 0) + r.estimatedCostUSD;
      totalCost += r.estimatedCostUSD;
    }

    const uniqueUsers = new Set(records.map(r => r.userId)).size;
    const uniqueNotebooks = new Set(records.filter(r => r.notebookId).map(r => r.notebookId)).size;
    const uniqueSessions = new Set(records.filter(r => r.sessionId).map(r => r.sessionId)).size;

    const dailyCostsMap: Record<string, number> = {};
    for (const r of records) {
      const date = new Date(r.timestamp).toISOString().split('T')[0];
      dailyCostsMap[date] = (dailyCostsMap[date] || 0) + r.estimatedCostUSD;
    }
    const dailyCosts = Object.entries(dailyCostsMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, cost]) => ({ date, cost: parseFloat(cost.toFixed(4)) }));

    return {
      period: `${days} days`,
      recordCount: records.length,
      totalCostUSD: parseFloat(totalCost.toFixed(4)),
      estimatedMonthlyCost: parseFloat((totalCost / days * 30).toFixed(4)),
      costPerUser: uniqueUsers > 0 ? parseFloat((totalCost / uniqueUsers).toFixed(4)) : 0,
      costPerNotebook: uniqueNotebooks > 0 ? parseFloat((totalCost / uniqueNotebooks).toFixed(4)) : 0,
      costPerChat: uniqueSessions > 0 ? parseFloat((totalCost / uniqueSessions).toFixed(4)) : 0,
      byProvider,
      byOperation,
      dailyCosts,
      topUsers: Object.entries(byUser)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([userId, cost]) => ({ userId, cost: parseFloat(cost.toFixed(4)) })),
    };
  }

  // ─── AI Improvement Insights ────────────────────────────────────────

  async getAIImprovementInsights(): Promise<any> {
    const thirtyDaysAgo = Date.now() - 30 * 86400000;

    // Get feedback data
    const feedbackSnap = await this.db.collection('user_feedback')
      .where('createdAt', '>=', thirtyDaysAgo)
      .get();
    const feedbackDocs = feedbackSnap.docs.map(d => d.data() as AIResponseFeedback);

    // Most helpful responses
    const helpfulResponses = feedbackDocs
      .filter(f => f.rating === 'very_helpful' || f.rating === 'thumbs_up')
      .length;

    // Lowest rated responses (by examMode)
    const negativeByExam: Record<string, number> = {};
    const hallucinationByExam: Record<string, number> = {};

    for (const f of feedbackDocs) {
      if (['thumbs_down', 'incorrect', 'hallucination'].includes(f.rating)) {
        negativeByExam[f.examMode] = (negativeByExam[f.examMode] || 0) + 1;
      }
      if (f.rating === 'hallucination') {
        hallucinationByExam[f.examMode] = (hallucinationByExam[f.examMode] || 0) + 1;
      }
    }

    // Most expensive prompts
    const costByPrompt: Record<string, { totalCost: number; count: number }> = {};
    const telemetrySnap = await this.db.collection('telemetry')
      .where('timestamp', '>=', thirtyDaysAgo)
      .get();
    
    for (const doc of telemetrySnap.docs) {
      const t = doc.data() as TelemetryRecord;
      const key = t.promptVersion || 'unknown';
      if (!costByPrompt[key]) costByPrompt[key] = { totalCost: 0, count: 0 };
      costByPrompt[key].totalCost += t.estimatedCostUSD;
      costByPrompt[key].count++;
    }

    return {
      totalFeedback: feedbackDocs.length,
      helpfulResponses,
      negativeResponses: feedbackDocs.filter(f => ['thumbs_down', 'incorrect', 'hallucination'].includes(f.rating)).length,
      
      highestHallucinationTopics: Object.entries(hallucinationByExam)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([topic, count]) => ({ topic, count })),

      lowestRatedExamModes: Object.entries(negativeByExam)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([examMode, count]) => ({ examMode, count })),

      mostExpensivePrompts: Object.entries(costByPrompt)
        .sort((a, b) => b[1].totalCost - a[1].totalCost)
        .slice(0, 10)
        .map(([prompt, data]) => ({ prompt, ...data, avgCost: parseFloat((data.totalCost / data.count).toFixed(6)) })),

      feedbackDistribution: {
        thumbs_up: feedbackDocs.filter(f => f.rating === 'thumbs_up').length,
        thumbs_down: feedbackDocs.filter(f => f.rating === 'thumbs_down').length,
        very_helpful: feedbackDocs.filter(f => f.rating === 'very_helpful').length,
        incorrect: feedbackDocs.filter(f => f.rating === 'incorrect').length,
        hallucination: feedbackDocs.filter(f => f.rating === 'hallucination').length,
        too_easy: feedbackDocs.filter(f => f.rating === 'too_easy').length,
        too_hard: feedbackDocs.filter(f => f.rating === 'too_hard').length,
        outdated: feedbackDocs.filter(f => f.rating === 'outdated').length,
        needs_citation: feedbackDocs.filter(f => f.rating === 'needs_citation').length,
        report_issue: feedbackDocs.filter(f => f.rating === 'report_issue').length,
      },
    };
  }

  // ─── Alerts Management ──────────────────────────────────────────────

  async getActiveAlerts(): Promise<AdminAlert[]> {
    const snap = await this.db.collection('admin_alerts')
      .where('resolved', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    return snap.docs.map(d => d.data() as AdminAlert);
  }

  async resolveAlert(alertId: string): Promise<void> {
    const snap = await this.db.collection('admin_alerts').where('id', '==', alertId).limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.update({ resolved: true, resolvedAt: Date.now() });
    }
  }
}

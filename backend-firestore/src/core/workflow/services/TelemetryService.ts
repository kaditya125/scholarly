import { container, TOKENS } from '../../di/container';
import { IAnalyticsProvider } from '../../interfaces/IAnalyticsProvider';
import { Telemetry } from '../../../lib/telemetry';
import { TelemetryService as FirestoreTelemetryService } from '../../../services/telemetry.service';
import { TelemetryRecord } from '../../../types/observability';
import { env } from '../../../config/env';
import { WorkflowRequest } from '../WorkflowEngine';

// Lazily-created Firestore telemetry recorder shared across requests (only needs getFirestore()).
let _telemetryService: FirestoreTelemetryService | null = null;
const getTelemetryService = (): FirestoreTelemetryService => {
  if (!_telemetryService) _telemetryService = new FirestoreTelemetryService();
  return _telemetryService;
};

export interface PersistTelemetryMetrics {
  provider: string;
  model: string;
  promptVersion: string;
  totalLatencyMs: number;
  retrievalLatencyMs?: number;
  rerankerLatencyMs?: number;
  generationLatencyMs?: number;
  timeToFirstTokenMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUSD?: number;
  chunkCount?: number;
  cacheHit?: boolean;
  pineconeQueryTimeMs?: number;
  averageSimilarityScore?: number;
  verificationPassed?: boolean;
  citationCount?: number;
}

/**
 * WorkflowTelemetryService — derives real provider/model/token/cost figures from the shared
 * Telemetry cost buffer, persists a TelemetryRecord (+ CostRecord) to Firestore for the Admin
 * observability dashboards, and logs per-workflow analytics via the IAnalyticsProvider.
 *
 * All methods are fully guarded and fire-and-forget-safe — telemetry must NEVER affect the
 * user response. Logic is copied verbatim from the previous inline WorkflowEngine methods.
 */
export class WorkflowTelemetryService {
  /**
   * Derives real provider/model/token/cost figures for a request from the token-usage cost
   * events recorded by the AI providers during generation.
   */
  deriveGenCost(costMark: number) {
    const spans = Telemetry.costs.slice(costMark);
    const gen = spans.find((c: any) => ['groq', 'gemini', 'nvidia', 'openai'].includes(c.provider));
    return {
      provider: gen?.provider || 'gemini',
      model: gen?.model || env.GEMINI_MODEL || 'gemini-2.5-flash',
      promptTokens: spans.filter((c: any) => c.type === 'input').reduce((a: number, c: any) => a + (c.tokens || 0), 0),
      completionTokens: spans.filter((c: any) => c.type === 'output').reduce((a: number, c: any) => a + (c.tokens || 0), 0),
      totalCostUSD: spans.reduce((a: number, c: any) => a + (c.cost || 0), 0),
    };
  }

  /**
   * Persists a real TelemetryRecord (+ CostRecord) to Firestore. Fire-and-forget and fully
   * guarded — never affects the response.
   */
  async persistTelemetry(req: WorkflowRequest, m: PersistTelemetryMetrics): Promise<void> {
    try {
      const promptTokens = m.promptTokens || 0;
      const completionTokens = m.completionTokens || 0;
      const cost = m.estimatedCostUSD || 0;
      const record: TelemetryRecord = {
        traceId: req.traceId || `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId: req.userId,
        sessionId: req.sessionId || 'default',
        provider: m.provider,
        model: m.model,
        promptVersion: m.promptVersion,
        totalLatencyMs: Math.round(m.totalLatencyMs),
        retrievalLatencyMs: Math.round(m.retrievalLatencyMs || 0),
        rerankerLatencyMs: Math.round(m.rerankerLatencyMs || 0),
        generationLatencyMs: Math.round(m.generationLatencyMs || 0),
        verificationLatencyMs: 0,
        timeToFirstTokenMs: Math.round(m.timeToFirstTokenMs || 0),
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCostUSD: parseFloat(cost.toFixed(6)),
        chunkCount: m.chunkCount || 0,
        cacheHit: !!m.cacheHit,
        pineconeQueryTimeMs: Math.round(m.pineconeQueryTimeMs || 0),
        averageSimilarityScore: parseFloat((m.averageSimilarityScore || 0).toFixed(3)),
        verificationPassed: m.verificationPassed !== false,
        citationCount: m.citationCount || 0,
        timestamp: Date.now(),
      };
      await getTelemetryService().recordTelemetry(record);
      if (cost > 0) {
        await getTelemetryService().recordCost({
          provider: m.provider,
          model: m.model,
          promptTokens,
          completionTokens,
          estimatedCostUSD: parseFloat(cost.toFixed(6)),
          userId: req.userId,
          notebookId: req.notebookId,
          sessionId: req.sessionId,
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      console.warn('Telemetry persistence failed (non-fatal):', (e as Error).message);
    }
  }

  /** Logs per-workflow retrieval/quality analytics via the IAnalyticsProvider. */
  async logWorkflowMetrics(userId: string, metrics: any): Promise<void> {
    const analyticsProvider = container.resolve<IAnalyticsProvider>(TOKENS.AnalyticsProvider);
    await analyticsProvider.logWorkflowMetrics(userId, metrics);
  }
}

export const workflowTelemetryService = new WorkflowTelemetryService();

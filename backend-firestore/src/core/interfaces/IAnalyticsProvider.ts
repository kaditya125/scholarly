export interface RetrievalMetrics {
  query: string;
  cacheHit: boolean;
  retrievalLatencyMs: number;
  rerankingLatencyMs: number;
  generationLatencyMs: number;
  hallucinationRate: number; // 0.0 to 1.0 based on verification
  averageConfidence: number;
  citationCoverage: number;
  workflowDurationMs: number;
  embeddingCost: number;
  generationCost: number;
}

export interface IAnalyticsProvider {
  /**
   * Logs a single execution workflow's retrieval analytics.
   */
  logWorkflowMetrics(userId: string, metrics: RetrievalMetrics): Promise<void>;
}

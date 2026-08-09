/**
 * Pure aggregation of per-source ingestion diagnostics (Part 14 observability).
 *
 * Derives ingestion metrics from the fields the pipeline persists on each source document
 * (processingDurationMs, processingMetrics.stageDurations, processingMetrics.cost, failure
 * counters, verification, and the *Version fields). No I/O — unit-testable. The service layer
 * fetches the source docs and enriches this with live graph/vector counts.
 */

const READY = 'READY';
const READY_DEGRADED = 'READY_DEGRADED';
const FAILED = 'FAILED';
const FAILED_NONRETRYABLE = 'FAILED_NONRETRYABLE';
// Phase 3: failed-rate now includes both kinds of terminal-failure status. Without
// this, sources whose file is genuinely missing (e.g. user re-uploaded without
// re-supplying the original) silently don't count as failures — dashboards would
// show a healthier-than-real failure rate.
const isFailedTerminal = (s: string) => s === FAILED || s === FAILED_NONRETRYABLE;

function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export interface IngestionMetrics {
  scanned: number;
  byStatus: Record<string, number>;
  completed: number;
  failureRatePct: number;
  degradedRatePct: number;
  avgIngestionMs: number | null;
  stageLatencyMs: Record<string, number>;
  retryRate: number | null;
  failureCounters: { llm: number; embedding: number; asset: number; graph: number };
  cost: { inputTokens: number; outputTokens: number; embeddingTokens: number; llmCostUsd: number; embeddingCostUsd: number; totalCostUsd: number };
  totalChunks: number;
  throughputLast24h: number;
  versionAdoption: {
    chunkVersion: Record<string, number>;
    metadataVersion: Record<string, number>;
    graphVersion: Record<string, number>;
    verificationVersion: Record<string, number>;
  };
}

const bump = (m: Record<string, number>, key: string) => { m[key] = (m[key] || 0) + 1; };

export function aggregateIngestionMetrics(sources: any[], now: number = Date.now()): IngestionMetrics {
  const byStatus: Record<string, number> = {};
  const stageSum: Record<string, number> = {};
  const stageCount: Record<string, number> = {};
  const failureCounters = { llm: 0, embedding: 0, asset: 0, graph: 0 };
  const cost = { inputTokens: 0, outputTokens: 0, embeddingTokens: 0, llmCostUsd: 0, embeddingCostUsd: 0, totalCostUsd: 0 };
  const chunkVersion: Record<string, number> = {};
  const metadataVersion: Record<string, number> = {};
  const graphVersion: Record<string, number> = {};
  const verificationVersion: Record<string, number> = {};

  let completed = 0;
  let failed = 0;
  let degraded = 0;
  let ingestSum = 0, ingestCount = 0;
  let retrySum = 0;
  let totalChunks = 0;
  let throughputLast24h = 0;
  const dayAgo = now - 86400000;

  for (const s of sources) {
    const status = String(s?.status || 'UNKNOWN');
    bump(byStatus, status);
    if (isFailedTerminal(status)) failed++;
    const isCompleted = status === READY || status === READY_DEGRADED;
    if (isCompleted) completed++;
    if (status === READY_DEGRADED) degraded++;

    if (typeof s?.chunksExtracted === 'number') totalChunks += s.chunksExtracted;

    if (isCompleted && typeof s?.processingDurationMs === 'number' && s.processingDurationMs > 0) {
      ingestSum += s.processingDurationMs; ingestCount++;
    }
    if (isCompleted && (s?.createdAt || 0) >= dayAgo) throughputLast24h++;

    const metrics = s?.processingMetrics;
    if (metrics?.stageDurations) {
      for (const [stage, ms] of Object.entries(metrics.stageDurations)) {
        if (typeof ms === 'number') { stageSum[stage] = (stageSum[stage] || 0) + ms; stageCount[stage] = (stageCount[stage] || 0) + 1; }
      }
    }
    if (metrics?.cost) {
      cost.inputTokens += metrics.cost.inputTokens || 0;
      cost.outputTokens += metrics.cost.outputTokens || 0;
      cost.embeddingTokens += metrics.cost.embeddingTokens || 0;
      cost.llmCostUsd += metrics.cost.llmCostUsd || 0;
      cost.embeddingCostUsd += metrics.cost.embeddingCostUsd || 0;
      cost.totalCostUsd += metrics.cost.totalCostUsd || 0;
    }

    retrySum += s?.retryCount || 0;
    failureCounters.llm += s?.llmFailures || 0;
    failureCounters.embedding += s?.embeddingFailures || 0;
    failureCounters.asset += s?.assetFailures || 0;
    failureCounters.graph += s?.graphFailures || 0;

    bump(chunkVersion, s?.chunkVersion != null ? String(s.chunkVersion) : 'none');
    bump(metadataVersion, s?.metadataVersion != null ? String(s.metadataVersion) : 'none');
    bump(graphVersion, s?.graphVersion != null ? String(s.graphVersion) : 'none');
    bump(verificationVersion, s?.verificationVersion != null ? String(s.verificationVersion) : 'none');
  }

  const stageLatencyMs: Record<string, number> = {};
  for (const stage of Object.keys(stageSum)) stageLatencyMs[stage] = Math.round(stageSum[stage] / stageCount[stage]);

  const scanned = sources.length;
  return {
    scanned,
    byStatus,
    completed,
    failureRatePct: scanned > 0 ? round((failed / scanned) * 100, 2) : 0,
    degradedRatePct: completed > 0 ? round((degraded / completed) * 100, 2) : 0,
    avgIngestionMs: ingestCount > 0 ? Math.round(ingestSum / ingestCount) : null,
    stageLatencyMs,
    retryRate: completed > 0 ? round(retrySum / completed, 3) : null,
    failureCounters,
    cost: {
      inputTokens: cost.inputTokens,
      outputTokens: cost.outputTokens,
      embeddingTokens: cost.embeddingTokens,
      llmCostUsd: round(cost.llmCostUsd, 6),
      embeddingCostUsd: round(cost.embeddingCostUsd, 6),
      totalCostUsd: round(cost.totalCostUsd, 6),
    },
    totalChunks,
    throughputLast24h,
    versionAdoption: { chunkVersion, metadataVersion, graphVersion, verificationVersion },
  };
}

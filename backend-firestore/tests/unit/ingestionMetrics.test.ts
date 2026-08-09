import { aggregateIngestionMetrics } from '../../src/admin/services/ingestionMetrics';

const NOW = 1_700_000_000_000;

const source = (over: any = {}) => ({
  status: 'READY',
  chunksExtracted: 10,
  processingDurationMs: 5000,
  createdAt: NOW - 1000,
  processingMetrics: { stageDurations: { embedding: 2000, metadataExtraction: 1000 }, cost: { inputTokens: 100, outputTokens: 50, embeddingTokens: 40, llmCostUsd: 0.001, embeddingCostUsd: 0.0002, totalCostUsd: 0.0012 } },
  retryCount: 1, llmFailures: 0, embeddingFailures: 0, assetFailures: 1, graphFailures: 0,
  chunkVersion: 2, metadataVersion: 1, graphVersion: 2, verificationVersion: 1,
  ...over,
});

describe('aggregateIngestionMetrics', () => {
  it('computes status counts, rates, averages and throughput', () => {
    const m = aggregateIngestionMetrics([
      source(),
      source({ status: 'READY_DEGRADED' }),
      source({ status: 'FAILED', processingDurationMs: 0 }),
      source({ status: 'EMBEDDING', processingDurationMs: 0 }), // in-flight
    ], NOW);

    expect(m.scanned).toBe(4);
    expect(m.byStatus.READY).toBe(1);
    expect(m.byStatus.READY_DEGRADED).toBe(1);
    expect(m.byStatus.FAILED).toBe(1);
    expect(m.completed).toBe(2);
    expect(m.failureRatePct).toBe(25); // 1/4
    expect(m.degradedRatePct).toBe(50); // 1/2 completed
    expect(m.avgIngestionMs).toBe(5000); // only the 2 completed with duration
    expect(m.throughputLast24h).toBe(2); // 2 completed within 24h
    expect(m.totalChunks).toBe(40);
  });

  it('averages stage latencies across sources that have them', () => {
    const m = aggregateIngestionMetrics([
      source({ processingMetrics: { stageDurations: { embedding: 1000 } } }),
      source({ processingMetrics: { stageDurations: { embedding: 3000 } } }),
    ], NOW);
    expect(m.stageLatencyMs.embedding).toBe(2000);
  });

  it('sums cost and failure counters, and computes retry rate', () => {
    const m = aggregateIngestionMetrics([source(), source()], NOW);
    expect(m.cost.inputTokens).toBe(200);
    expect(m.cost.totalCostUsd).toBeCloseTo(0.0024, 6);
    expect(m.failureCounters.asset).toBe(2);
    expect(m.retryRate).toBe(1); // 2 retries / 2 completed
  });

  it('tracks pipeline-version adoption incl. legacy "none"', () => {
    const m = aggregateIngestionMetrics([
      source({ chunkVersion: 2, graphVersion: 2 }),
      source({ chunkVersion: undefined, graphVersion: undefined }), // legacy source
    ], NOW);
    expect(m.versionAdoption.chunkVersion['2']).toBe(1);
    expect(m.versionAdoption.chunkVersion['none']).toBe(1);
    expect(m.versionAdoption.graphVersion['none']).toBe(1);
  });

  it('handles an empty corpus without dividing by zero', () => {
    const m = aggregateIngestionMetrics([], NOW);
    expect(m.scanned).toBe(0);
    expect(m.failureRatePct).toBe(0);
    expect(m.degradedRatePct).toBe(0);
    expect(m.avgIngestionMs).toBeNull();
    expect(m.retryRate).toBeNull();
  });
});

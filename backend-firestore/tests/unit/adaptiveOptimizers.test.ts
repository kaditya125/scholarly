import { RetrievalOptimizer, RetrievalHistory, DEFAULT_TUNING } from '../../src/core/intelligence/RetrievalOptimizer';
import { ModelOptimizer } from '../../src/core/intelligence/ModelOptimizer';

const hist = (o: Partial<RetrievalHistory> = {}): RetrievalHistory => ({
  samples: 50, avgRecall: 0.8, avgNdcg: 0.8, avgChunkUtilization: 0.5,
  avgRetrievalConfidence: 0.7, avgGraphContribution: 0.5, avgHallucinationRisk: 0.05, ...o,
});

describe('RetrievalOptimizer (advisory, pure)', () => {
  const o = new RetrievalOptimizer();

  it('returns defaults with insufficient history', () => {
    const t = o.optimize('graphrag', hist({ samples: 3 }));
    expect(t.vectorTopK).toBe(DEFAULT_TUNING.vectorTopK);
    expect(t.rationale).toContain('insufficient-history→defaults');
  });

  it('none strategy disables retrieval', () => {
    const t = o.optimize('none');
    expect(t.vectorTopK).toBe(0);
    expect(t.hybrid).toBe(false);
    expect(t.graphExpansion).toBe(false);
  });

  it('vector strategy drops graph fusion', () => {
    const t = o.optimize('vector', hist());
    expect(t.hybrid).toBe(false);
    expect(t.graphDepth).toBe(0);
  });

  it('shrinks top-k when chunk utilization is low', () => {
    const t = o.optimize('graphrag', hist({ avgChunkUtilization: 0.1 }));
    expect(t.vectorTopK).toBeLessThan(DEFAULT_TUNING.vectorTopK);
    expect(t.rationale).toContain('low-utilization→smaller-topk');
  });

  it('widens top-k when recall is low', () => {
    const t = o.optimize('graphrag', hist({ avgRecall: 0.3, avgChunkUtilization: 0.5 }));
    expect(t.vectorTopK).toBeGreaterThan(DEFAULT_TUNING.vectorTopK);
  });

  it('deepens graph when grounding is weak', () => {
    const t = o.optimize('graphrag', hist({ avgHallucinationRisk: 0.5 }));
    expect(t.graphDepth).toBeGreaterThan(DEFAULT_TUNING.graphDepth);
    expect(t.graphExpansion).toBe(true);
  });

  it('stops graph expansion when the graph barely contributes', () => {
    const t = o.optimize('graphrag', hist({ avgGraphContribution: 0.02 }));
    expect(t.graphExpansion).toBe(false);
  });
});

describe('ModelOptimizer (advisory, pure)', () => {
  const o = new ModelOptimizer();

  it('maps complexity to tier like the router by default', () => {
    expect(o.optimize({ complexity: 5 }).providerToken).toBe('ReasoningProvider');
    expect(o.optimize({ complexity: 1 }).providerToken).toBe('AIProvider');
    expect(o.optimize({ complexity: 3 }).tier).toBe('balanced');
  });

  it('forces the base provider when reasoning is unavailable/unhealthy', () => {
    expect(o.optimize({ complexity: 5, reasoningAvailable: false }).providerToken).toBe('AIProvider');
    expect(o.optimize({ complexity: 5, providerHealthy: false }).tier).toBe('fast');
  });

  it('falls back to fast when context exceeds the token budget', () => {
    const m = o.optimize({ complexity: 5, contextTokens: 9000, tokenBudget: 4000 });
    expect(m.tier).toBe('fast');
    expect(m.factors).toContain('context-exceeds-budget→fast');
  });

  it('downgrades a light query under high provider latency', () => {
    const m = o.optimize({ complexity: 3, providerLatencyMs: 12000 });
    expect(m.tier).toBe('fast');
    expect(m.factors).toContain('high-latency→downgrade');
  });

  it('upgrades to reasoning when historical quality is poor on a demanding query', () => {
    const m = o.optimize({ complexity: 3, historicalQuality: 0.3 });
    expect(m.tier).toBe('reasoning');
    expect(m.factors).toContain('low-historical-quality→reasoning');
  });

  it('exhausted cost budget forces fast', () => {
    expect(o.optimize({ complexity: 5, costBudgetUsd: 0 }).tier).toBe('fast');
  });
});

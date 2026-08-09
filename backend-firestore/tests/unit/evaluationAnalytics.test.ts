import {
  recallAtK, reciprocalRank, dcgAtK, ndcgAtK, chunkUtilization, retrievalConfidence,
  graphContribution, computeRetrievalQuality,
} from '../../src/core/intelligence/RetrievalMetrics';
import { EvaluationService, EvaluationStore, EvaluationResult } from '../../src/core/intelligence/EvaluationService';
import { AnalyticsService, AnalyticsStore, AnalyticsRecord } from '../../src/core/intelligence/AnalyticsService';

describe('RetrievalMetrics (pure IR math)', () => {
  it('recallAtK', () => {
    expect(recallAtK(['a', 'b', 'c', 'd'], ['b', 'd'], 2)).toBe(0.5);   // only 'b' in top2
    expect(recallAtK(['a', 'b', 'c', 'd'], ['b', 'd'], 4)).toBe(1);
    expect(recallAtK(['a'], [], 5)).toBe(0);                             // no relevant
  });

  it('reciprocalRank', () => {
    expect(reciprocalRank(['a', 'b', 'c'], ['b'])).toBeCloseTo(1 / 2);
    expect(reciprocalRank(['a', 'b', 'c'], ['a'])).toBe(1);
    expect(reciprocalRank(['a', 'b'], ['z'])).toBe(0);
  });

  it('dcg / ndcg', () => {
    expect(dcgAtK([3, 2, 1], 3)).toBeCloseTo(3 / Math.log2(2) + 2 / Math.log2(3) + 1 / Math.log2(4));
    // Perfectly-ordered gains → nDCG = 1; reversed order < 1.
    expect(ndcgAtK([3, 2, 1], 3)).toBeCloseTo(1);
    expect(ndcgAtK([1, 2, 3], 3)).toBeLessThan(1);
    expect(ndcgAtK([0, 0, 0], 3)).toBe(0);
  });

  it('chunkUtilization + retrievalConfidence + graphContribution', () => {
    expect(chunkUtilization(['a', 'b', 'c', 'd'], ['a', 'c'])).toBe(0.5);
    expect(retrievalConfidence([{ id: 'a', score: 0.9 }, { id: 'b', score: 0.7 }])).toBeCloseTo(0.8);
    expect(retrievalConfidence([])).toBe(0);
    expect(graphContribution(undefined)).toBe(0);
    expect(graphContribution({ nodeCount: 0, matched: 0 })).toBe(0);
    expect(graphContribution({ nodeCount: 10, matched: 3 })).toBeGreaterThan(0);
  });

  it('computeRetrievalQuality bundles the metrics', () => {
    const items = [{ id: 'a', score: 0.9 }, { id: 'b', score: 0.6 }, { id: 'c', score: 0.2 }];
    const q = computeRetrievalQuality(items, { citedIds: ['a'], relevanceThreshold: 0.5 });
    expect(q.recallAt5).toBeGreaterThan(0);   // a,b are relevant (>=0.5)
    expect(q.mrr).toBe(1);                     // first item relevant
    expect(q.chunkUtilization).toBeCloseTo(1 / 3);
    expect(q.retrievalConfidence).toBeGreaterThan(0);
  });
});

describe('EvaluationService', () => {
  it('evaluates a grounded, well-cited turn highly', () => {
    const svc = new EvaluationService();
    const r = svc.evaluate({
      category: 'concept_explanation', workflow: 'concept', model: 'reasoning',
      items: [{ id: 'a', score: 0.9 }, { id: 'b', score: 0.8 }], citedIds: ['a', 'b'],
      hallucinationRate: 0, citationCoverage: 1, confidence: 0.9, latencyMs: 3000, cacheHit: false,
      graphMeta: { nodeCount: 12, matched: 3 }, retrievalExpected: true,
    });
    expect(r.grounding).toBe(1);
    expect(r.hallucinationRisk).toBe(0);
    expect(r.citationQuality).toBeGreaterThan(0.9);
    expect(r.workflowSelectionOk).toBe(true);
    expect(r.overall).toBeGreaterThan(0.7);
  });

  it('flags a retrieval-expected turn that produced nothing as poor workflow selection', () => {
    const svc = new EvaluationService();
    const r = svc.evaluate({ workflow: 'concept', items: [], citedIds: [], hallucinationRate: 0.5, retrievalExpected: true });
    expect(r.workflowSelectionOk).toBe(false);
    expect(r.grounding).toBe(0.5);
  });

  it('record() persists via the injected store', async () => {
    const stored: EvaluationResult[] = [];
    const store: EvaluationStore = { append: async (r) => { stored.push(r); } };
    await new EvaluationService(store).record({ category: 'definition', confidence: 0.8 });
    expect(stored).toHaveLength(1);
    expect(stored[0].category).toBe('definition');
  });
});

describe('AnalyticsService', () => {
  it('build() normalizes an analytics record with defaults', () => {
    const rec = new AnalyticsService().build({ category: 'research', workflow: 'research', graphUsed: true, latencyMs: 5000.7 });
    expect(rec.category).toBe('research');
    expect(rec.retrievalStrategy).toBe('graphrag'); // default
    expect(rec.graphUsed).toBe(true);
    expect(rec.vectorUsed).toBe(false);
    expect(rec.latencyMs).toBe(5001);
    expect(rec.ts).toBeGreaterThan(0);
  });

  it('record() persists via the injected store', async () => {
    const stored: AnalyticsRecord[] = [];
    const store: AnalyticsStore = { append: async (r) => { stored.push(r); } };
    await new AnalyticsService(store).record({ category: 'quiz_generation', workflow: 'quiz' });
    expect(stored).toHaveLength(1);
    expect(stored[0].workflow).toBe('quiz');
  });
});

describe('AnalyticsService — Phase 3 observability dimensions (additive)', () => {
  it('build() defaults the new dimensions without breaking the core record', () => {
    const rec = new AnalyticsService().build({ category: 'concept_explanation' });
    expect(rec.bloomLevel).toBe('unknown');
    expect(rec.intentSource).toBe('heuristic');
    expect(rec.promptTemplate).toBe('teacher');
    expect(rec.promptSignals).toEqual([]);
    expect(rec.explanationDepth).toBe('standard');
    expect(rec.followup).toBe(false);
    expect(rec.diagramUsed).toBe(false);
    expect(rec.avgMastery).toBe(0);
    expect(rec.learningGain).toBe(0);
  });

  it('build() captures supplied Phase-3 dimensions', () => {
    const rec = new AnalyticsService().build({
      category: 'comparison', bloomLevel: 'analyze', intentSource: 'merged', promptTemplate: 'tutor',
      promptSignals: ['bloom:analyze', 'depth:advanced'], retrievalConfidence: 0.7, followup: true,
      diagramUsed: true, explanationDepth: 'deep', avgMastery: 0.6, learningGain: 0.05,
    });
    expect(rec.bloomLevel).toBe('analyze');
    expect(rec.intentSource).toBe('merged');
    expect(rec.promptTemplate).toBe('tutor');
    expect(rec.promptSignals).toContain('depth:advanced');
    expect(rec.diagramUsed).toBe(true);
    expect(rec.explanationDepth).toBe('deep');
    expect(rec.avgMastery).toBeCloseTo(0.6);
  });

  it('record() persists the extended record via the injected store', async () => {
    const stored: AnalyticsRecord[] = [];
    const store: AnalyticsStore = { append: async (r) => { stored.push(r); } };
    await new AnalyticsService(store).record({ category: 'quiz_generation', bloomLevel: 'apply' });
    expect(stored).toHaveLength(1);
    expect(stored[0].bloomLevel).toBe('apply');
  });
});

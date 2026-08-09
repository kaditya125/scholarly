import { LearningEngine } from '../../src/core/intelligence/LearningEngine';
import { EvaluationResult } from '../../src/core/intelligence/EvaluationService';
import { AnalyticsRecord } from '../../src/core/intelligence/AnalyticsService';
import { FeedbackSummary } from '../../src/core/intelligence/FeedbackService';

function evalResult(over: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    retrieval: { recallAt5: 0.8, recallAt10: 0.9, mrr: 1, ndcgAt10: 0.9, chunkUtilization: 0.6, retrievalConfidence: 0.7, graphContribution: 0.5 },
    grounding: 1, hallucinationRisk: 0, citationQuality: 0.9, modelQuality: 0.9,
    workflowSelectionOk: true, latencyMs: 3000, cacheHit: false, overall: 0.85, ts: Date.now(),
    ...over,
  };
}
function analyticsRec(over: Partial<AnalyticsRecord> = {}): AnalyticsRecord {
  return {
    category: 'concept_explanation', workflow: 'concept', model: 'reasoning', retrievalStrategy: 'graphrag',
    graphUsed: true, vectorUsed: true, cacheHit: false, latencyMs: 3000, costUsd: 0.001, tokens: 900,
    grounding: 1, citationCount: 3, confidence: 0.9,
    bloomLevel: 'understand', intentSource: 'heuristic', promptTemplate: 'teacher', promptSignals: [],
    retrievalConfidence: 0.7, followup: false, diagramUsed: false, explanationDepth: 'standard',
    avgMastery: 0, learningGain: 0, ts: Date.now(), ...over,
  };
}

describe('LearningEngine (advisory, pure, no mutation)', () => {
  const engine = new LearningEngine();

  it('returns a healthy report with no urgent recommendations when everything is good', () => {
    const report = engine.analyze({
      evaluations: Array.from({ length: 10 }, () => evalResult()),
      analytics: Array.from({ length: 10 }, () => analyticsRec()),
      feedback: { total: 20, thumbsUp: 15, thumbsDown: 2, regenerated: 1, copied: 5, followups: 3, citationsOpened: 8, quizzesRequested: 2, avgDwellMs: 5000, satisfaction: 15 / 17 } as FeedbackSummary,
    });
    expect(report.health.avgHallucinationRisk).toBe(0);
    expect(report.health.satisfaction).toBeGreaterThan(0.8);
    // No grounding/retrieval/model alarms.
    expect(report.recommendations.find((r) => r.kind === 'retrieval')).toBeUndefined();
    expect(report.recommendations.find((r) => r.kind === 'model')).toBeUndefined();
  });

  it('recommends retrieval + prompt fixes when hallucination risk is high', () => {
    const report = engine.analyze({
      evaluations: Array.from({ length: 6 }, () => evalResult({ hallucinationRisk: 0.6, grounding: 0.4 })),
    });
    const kinds = report.recommendations.map((r) => r.kind);
    expect(kinds).toContain('retrieval');
    expect(kinds).toContain('prompt');
    expect(report.recommendations[0].confidence).toBeGreaterThan(0.4);
  });

  it('recommends low-confidence + low-utilization retrieval tuning', () => {
    const report = engine.analyze({
      evaluations: Array.from({ length: 5 }, () =>
        evalResult({ retrieval: { recallAt5: 0.1, recallAt10: 0.1, mrr: 0.2, ndcgAt10: 0.2, chunkUtilization: 0.05, retrievalConfidence: 0.2, graphContribution: 0 } })),
    });
    const actions = report.recommendations.map((r) => r.action).join(' | ');
    expect(actions).toMatch(/retrieval confidence is low|Widen top-k/);
    expect(actions).toMatch(/uncited|Reduce top-k/);
  });

  it('flags poor workflow selection', () => {
    const report = engine.analyze({
      evaluations: Array.from({ length: 6 }, () => evalResult({ workflowSelectionOk: false })),
    });
    expect(report.health.workflowSelectionOkRate).toBe(0);
    expect(report.recommendations.find((r) => r.kind === 'routing')).toBeDefined();
  });

  it('recommends a higher tier when explicit satisfaction is low', () => {
    const report = engine.analyze({
      feedback: { total: 10, thumbsUp: 2, thumbsDown: 6, regenerated: 3, copied: 0, followups: 0, citationsOpened: 0, quizzesRequested: 0, avgDwellMs: 1000, satisfaction: 2 / 8 } as FeedbackSummary,
    });
    const kinds = report.recommendations.map((r) => r.kind);
    expect(kinds).toContain('model');    // low satisfaction
    expect(kinds).toContain('prompt');   // high regeneration rate
  });

  it('suggests cache tuning from analytics', () => {
    const lowHit = engine.analyze({ analytics: Array.from({ length: 12 }, () => analyticsRec({ cacheHit: false })) });
    expect(lowHit.recommendations.find((r) => r.kind === 'cache')?.action).toMatch(/Lower/);
    const highHit = engine.analyze({
      analytics: Array.from({ length: 12 }, (_, i) => analyticsRec({ cacheHit: i % 2 === 0 })),
      feedback: { total: 5, thumbsUp: 4, thumbsDown: 1, regenerated: 0, copied: 0, followups: 0, citationsOpened: 0, quizzesRequested: 0, avgDwellMs: 0, satisfaction: 0.8 } as FeedbackSummary,
    });
    expect(highHit.recommendations.find((r) => r.kind === 'cache')?.action).toMatch(/Raise cache TTL/);
  });

  it('emits personalization recommendations from learned preferences', () => {
    const report = engine.analyze({ preferences: { depth: 'brief', preferShortAnswers: true, visualLearner: true } });
    const kinds = report.recommendations.filter((r) => r.kind === 'personalization');
    expect(kinds.length).toBe(2);
  });

  it('never mutates its inputs', () => {
    const evals = [evalResult({ hallucinationRisk: 0.6 })];
    const frozen = Object.freeze({ ...evals[0] });
    engine.analyze({ evaluations: [frozen as EvaluationResult] });
    expect(frozen.hallucinationRisk).toBe(0.6); // unchanged
  });
});

describe('LearningEngine — closed feedback loop + mastery (Phase 3)', () => {
  const engine = new LearningEngine();
  const fb = (o: Partial<FeedbackSummary> = {}): FeedbackSummary => ({
    total: 20, thumbsUp: 10, thumbsDown: 2, regenerated: 1, copied: 3, followups: 2,
    citationsOpened: 2, quizzesRequested: 1, avgDwellMs: 4000, satisfaction: 10 / 12, ...o,
  });

  it('recommends more depth when follow-ups are frequent', () => {
    const r = engine.analyze({ feedback: fb({ followups: 9 }) });
    expect(r.recommendations.find((x) => x.action.match(/explanation depth/i))).toBeDefined();
  });

  it('recommends prompt revision when thumbs-down dominates', () => {
    const r = engine.analyze({ feedback: fb({ thumbsUp: 2, thumbsDown: 6, satisfaction: 2 / 8 }) });
    expect(r.recommendations.find((x) => x.action.match(/negative votes dominate/i))).toBeDefined();
  });

  it('recommends surfacing citations when opened frequently', () => {
    const r = engine.analyze({ feedback: fb({ citationsOpened: 12 }) });
    expect(r.recommendations.find((x) => x.action.match(/citations more prominently/i))).toBeDefined();
  });

  it('reinforces the current style when answers are frequently copied', () => {
    const r = engine.analyze({ feedback: fb({ copied: 12 }) });
    expect(r.recommendations.find((x) => x.action.match(/Reinforce the current answer style/i))).toBeDefined();
  });

  it('emits mastery recommendations for weak + declining cohorts', () => {
    const r = engine.analyze({ mastery: { concepts: 10, avgMastery: 0.35, weak: 6, improving: 1, declining: 4 } });
    const mastery = r.recommendations.filter((x) => x.kind === 'mastery');
    expect(mastery.length).toBe(2); // weak-ratio + declining
    expect(r.health.avgMastery).toBeCloseTo(0.35);
    expect(r.health.weakConceptRatio).toBeCloseTo(0.6);
  });

  it('flags an underperforming prompt template', () => {
    const r = engine.analyze({ promptPerformance: [{ template: 'quiz', uses: 20, satisfaction: 0.3, regenerationRate: 0.1 }] });
    const rec = r.recommendations.find((x) => x.action.match(/"quiz" template/));
    expect(rec).toBeDefined();
    expect(rec!.kind).toBe('prompt');
  });

  it('does not fire mastery/prompt-perf rules below sample thresholds', () => {
    const r = engine.analyze({ mastery: { concepts: 2, avgMastery: 0.1, weak: 2, improving: 0, declining: 2 }, promptPerformance: [{ template: 'teacher', uses: 3, satisfaction: 0.1, regenerationRate: 0.9 }] });
    expect(r.recommendations.filter((x) => x.kind === 'mastery').length).toBe(0);
    expect(r.recommendations.find((x) => x.action.match(/template/))).toBeUndefined();
  });
});

import { ScoredItem, RetrievalQuality, computeRetrievalQuality } from './RetrievalMetrics';

/** Inputs for evaluating a completed workflow turn (all optional — evaluation degrades gracefully). */
export interface EvaluationInput {
  category?: string;
  workflow?: string;
  model?: string;
  /** Ranked retrieved items with similarity scores. */
  items?: ScoredItem[];
  /** Ids of retrieved items actually cited in the answer. */
  citedIds?: string[];
  hallucinationRate?: number;   // 0..1
  citationCoverage?: number;    // 0..1
  confidence?: number;          // 0..1
  latencyMs?: number;
  cacheHit?: boolean;
  graphMeta?: { nodeCount?: number; matched?: number };
  /** True when the selected workflow implies retrieval should have produced grounding. */
  retrievalExpected?: boolean;
}

export interface EvaluationResult {
  category?: string;
  workflow?: string;
  model?: string;
  retrieval: RetrievalQuality;
  grounding: number;          // 1 - hallucinationRate
  hallucinationRisk: number;  // = hallucinationRate
  citationQuality: number;    // coverage-weighted
  modelQuality: number;       // confidence proxy
  workflowSelectionOk: boolean;
  latencyMs: number;
  cacheHit: boolean;
  overall: number;            // 0..1 blended score
  ts: number;
}

/** Persistence seam for testability. */
export interface EvaluationStore {
  append(result: EvaluationResult): Promise<void>;
}

class FirestoreEvaluationStore implements EvaluationStore {
  async append(result: EvaluationResult): Promise<void> {
    try {
      const { db } = require('../../config/firebase');
      await db.collection('intelligence_evaluations').add(result);
    } catch { /* non-fatal */ }
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Continuous Evaluation Engine (Task 9) — automatically scores every completed turn on retrieval
 * quality, citation quality, grounding, hallucination risk, latency, cache and model quality, and
 * whether the workflow was well-selected. Pure `evaluate()` (unit-testable); `record()` is guarded
 * and runs off the critical path (never affects the response).
 */
export class EvaluationService {
  constructor(private readonly store: EvaluationStore = new FirestoreEvaluationStore()) {}

  evaluate(input: EvaluationInput): EvaluationResult {
    const items = input.items || [];
    const retrieval = computeRetrievalQuality(items, {
      citedIds: input.citedIds,
      graphMeta: input.graphMeta,
    });
    const hallucinationRisk = clamp01(input.hallucinationRate ?? 0);
    const grounding = clamp01(1 - hallucinationRisk);
    const coverage = clamp01(input.citationCoverage ?? 0);
    const citationCount = (input.citedIds || []).length;
    // Citation quality rewards both coverage and having ≥1 citation.
    const citationQuality = clamp01(coverage * 0.7 + (citationCount > 0 ? 0.3 : 0));
    const modelQuality = clamp01(input.confidence ?? 0.7);
    // Workflow selection looks wrong if retrieval was expected but produced nothing usable.
    const workflowSelectionOk = !(input.retrievalExpected && citationCount === 0 && retrieval.retrievalConfidence < 0.2);

    const overall = clamp01(
      grounding * 0.35 +
      citationQuality * 0.2 +
      retrieval.retrievalConfidence * 0.2 +
      modelQuality * 0.15 +
      (workflowSelectionOk ? 0.1 : 0),
    );

    return {
      category: input.category,
      workflow: input.workflow,
      model: input.model,
      retrieval,
      grounding,
      hallucinationRisk,
      citationQuality,
      modelQuality,
      workflowSelectionOk,
      latencyMs: Math.round(input.latencyMs ?? 0),
      cacheHit: !!input.cacheHit,
      overall,
      ts: Date.now(),
    };
  }

  /** Evaluate + persist (guarded). Intended to run in the BackgroundExecutor. */
  async record(input: EvaluationInput): Promise<void> {
    await this.store.append(this.evaluate(input));
  }
}

export const evaluationService = new EvaluationService();

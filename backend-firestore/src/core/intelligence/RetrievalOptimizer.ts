import { RetrievalStrategy } from './types';

/**
 * Adaptive Retrieval Optimization (Task 9) — turns HISTORICAL retrieval-quality evidence into an
 * advisory tuning for the next similar query (graph depth, vector top-k, reranker, hybrid, graph
 * expansion, notebook priority). It is PURE and advisory: the RetrievalRouter/Orchestrator may
 * consult it behind a flag, and the behavior-preserving default reproduces today's parameters, so
 * with the flag off nothing changes.
 */

/** Historical retrieval metrics for one category/strategy (rolled up from EvaluationResults). */
export interface RetrievalHistory {
  samples: number;
  avgRecall: number;             // 0..1
  avgNdcg: number;               // 0..1
  avgChunkUtilization: number;   // 0..1
  avgRetrievalConfidence: number;// 0..1
  avgGraphContribution: number;  // 0..1
  avgHallucinationRisk: number;  // 0..1
}

export interface RetrievalTuning {
  vectorTopK: number;
  graphDepth: number;
  rerankerEnabled: boolean;
  hybrid: boolean;
  graphExpansion: boolean;
  notebookPriority: boolean;
  rationale: string[];
}

/** Behavior-preserving defaults — today's GraphRAG parameters. */
export const DEFAULT_TUNING: RetrievalTuning = {
  vectorTopK: 10,
  graphDepth: 2,
  rerankerEnabled: true,
  hybrid: true,
  graphExpansion: true,
  notebookPriority: false,
  rationale: ['default'],
};

const MIN_SAMPLES = 10;

export class RetrievalOptimizer {
  /**
   * Recommend a retrieval tuning from history (pure). With too little evidence it returns the
   * defaults unchanged. Adjustments are bounded and monotonic so the recommendation is explainable.
   */
  optimize(strategy: RetrievalStrategy, history?: RetrievalHistory): RetrievalTuning {
    const t: RetrievalTuning = { ...DEFAULT_TUNING, rationale: [] };

    // Strategy-shaped starting point (still equals today's effective behavior per strategy).
    if (strategy === 'none') return { vectorTopK: 0, graphDepth: 0, rerankerEnabled: false, hybrid: false, graphExpansion: false, notebookPriority: false, rationale: ['strategy:none'] };
    if (strategy === 'vector') { t.hybrid = false; t.graphExpansion = false; t.graphDepth = 0; t.rationale.push('strategy:vector'); }
    if (strategy === 'notebook') { t.notebookPriority = true; t.rationale.push('strategy:notebook'); }
    if (strategy === 'graph_web' || strategy === 'graphrag_reasoning') { t.graphDepth = 3; t.rationale.push(`strategy:${strategy}`); }

    if (!history || history.samples < MIN_SAMPLES) {
      t.rationale.push('insufficient-history→defaults');
      return t;
    }

    // Low chunk utilization → over-fetching → reduce top-k.
    if (history.avgChunkUtilization < 0.2) { t.vectorTopK = Math.max(3, t.vectorTopK - 4); t.rationale.push('low-utilization→smaller-topk'); }
    // Low recall/ndcg → under-fetching → widen top-k + ensure reranker.
    else if (history.avgRecall < 0.5 || history.avgNdcg < 0.5) { t.vectorTopK = Math.min(20, t.vectorTopK + 5); t.rerankerEnabled = true; t.rationale.push('low-recall→wider-topk+rerank'); }

    // Weak grounding → deepen graph + keep expansion (only where graph applies).
    if (history.avgHallucinationRisk > 0.3 && t.graphDepth > 0) { t.graphDepth = Math.min(4, t.graphDepth + 1); t.graphExpansion = true; t.rationale.push('weak-grounding→deeper-graph'); }

    // Graph barely contributing → stop expanding (noise + cost) where it isn't the point.
    if (history.avgGraphContribution < 0.1 && strategy !== 'graphrag_reasoning') { t.graphExpansion = false; t.rationale.push('low-graph-contribution→no-expansion'); }

    // Low retrieval confidence overall → make sure reranker is on.
    if (history.avgRetrievalConfidence < 0.4) { t.rerankerEnabled = true; t.rationale.push('low-confidence→rerank'); }

    return t;
  }
}

export const retrievalOptimizer = new RetrievalOptimizer();

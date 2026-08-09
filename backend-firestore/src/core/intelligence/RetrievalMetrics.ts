/**
 * Retrieval Quality Metrics (Task 11) — pure, deterministic IR metric math.
 *
 * These are standard information-retrieval formulas (Recall@k, MRR, nDCG, chunk utilization,
 * retrieval confidence, graph contribution). They take EXPLICIT inputs so they are trivially
 * unit-testable; the EvaluationService supplies production proxies for relevance (there are no
 * human relevance labels at runtime, so it uses score thresholds + citation-usage as proxies).
 */

export interface ScoredItem {
  id: string;
  score: number;
}

/** Recall@k = |topK ∩ relevant| / |relevant|. Returns 0 when there are no relevant items. */
export function recallAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  if (relevantIds.length === 0) return 0;
  const rel = new Set(relevantIds);
  const top = retrievedIds.slice(0, Math.max(0, k));
  const hits = top.filter((id) => rel.has(id)).length;
  return hits / relevantIds.length;
}

/** Mean Reciprocal Rank contribution for a single query: 1/rank of the first relevant item. */
export function reciprocalRank(retrievedIds: string[], relevantIds: string[]): number {
  const rel = new Set(relevantIds);
  for (let i = 0; i < retrievedIds.length; i++) {
    if (rel.has(retrievedIds[i])) return 1 / (i + 1);
  }
  return 0;
}

/** Discounted Cumulative Gain @k over graded relevances (gains aligned to ranked order). */
export function dcgAtK(gains: number[], k: number): number {
  const kk = Math.max(0, k);
  return gains.slice(0, kk).reduce((acc, g, i) => acc + g / Math.log2(i + 2), 0);
}

/** Normalized DCG@k = DCG@k / ideal DCG@k. Returns 0 when there is no gain. */
export function ndcgAtK(gains: number[], k: number): number {
  const dcg = dcgAtK(gains, k);
  const ideal = dcgAtK([...gains].sort((a, b) => b - a), k);
  return ideal === 0 ? 0 : dcg / ideal;
}

/** Chunk utilization = fraction of retrieved chunks that were actually cited in the answer. */
export function chunkUtilization(retrievedIds: string[], citedIds: string[]): number {
  if (retrievedIds.length === 0) return 0;
  const cited = new Set(citedIds);
  const used = retrievedIds.filter((id) => cited.has(id)).length;
  return used / retrievedIds.length;
}

/** Retrieval confidence = mean similarity score of the top-k retrieved items (0..1, clamped). */
export function retrievalConfidence(items: ScoredItem[], k = 5): number {
  const top = items.slice(0, k);
  if (top.length === 0) return 0;
  const mean = top.reduce((a, i) => a + (i.score || 0), 0) / top.length;
  return Math.max(0, Math.min(1, mean));
}

/** Graph contribution proxy: did the knowledge graph meaningfully participate? (0..1) */
export function graphContribution(graphMeta: { nodeCount?: number; matched?: number } | undefined): number {
  if (!graphMeta) return 0;
  const matched = graphMeta.matched || 0;
  const nodes = graphMeta.nodeCount || 0;
  if (nodes === 0) return 0;
  // Small, monotonic proxy: more matched seeds + traversed nodes → higher contribution, capped.
  return Math.min(1, matched * 0.15 + Math.min(nodes, 20) * 0.03);
}

export interface RetrievalQuality {
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  ndcgAt10: number;
  chunkUtilization: number;
  retrievalConfidence: number;
  graphContribution: number;
}

/**
 * Convenience: compute the full quality bundle from ranked items using score-threshold relevance
 * and citation-usage proxies. `relevanceThreshold` marks an item "relevant" for recall/MRR.
 */
export function computeRetrievalQuality(
  items: ScoredItem[],
  opts: { citedIds?: string[]; relevanceThreshold?: number; graphMeta?: { nodeCount?: number; matched?: number } } = {},
): RetrievalQuality {
  const threshold = opts.relevanceThreshold ?? 0.5;
  const ids = items.map((i) => i.id);
  const relevant = items.filter((i) => (i.score || 0) >= threshold).map((i) => i.id);
  const gains = items.map((i) => Math.max(0, i.score || 0));
  return {
    recallAt5: recallAtK(ids, relevant, 5),
    recallAt10: recallAtK(ids, relevant, 10),
    mrr: reciprocalRank(ids, relevant),
    ndcgAt10: ndcgAtK(gains, 10),
    chunkUtilization: chunkUtilization(ids, opts.citedIds || []),
    retrievalConfidence: retrievalConfidence(items),
    graphContribution: graphContribution(opts.graphMeta),
  };
}

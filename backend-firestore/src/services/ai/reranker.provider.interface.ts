export interface RerankedDocument {
  index: number;
  relevanceScore: number;
  /**
   * True when the reranker did NOT actually run and this entry is a pass-through fallback.
   *
   * A provider that fails returns every document with relevanceScore 0, which is indistinguishable
   * from "the reranker ran and judged everything irrelevant" — and those two need opposite
   * handling. A caller applying a relevance threshold must skip it when this is set, or an API
   * outage silently turns into zero retrieval instead of degraded retrieval.
   */
  degraded?: boolean;
}

/**
 * Reranker relevance below which a passage is dropped rather than cited or put in front of the
 * model. Measured on production (24 Sep 2026): relevant NCERT passages scored 0.22–0.999, while
 * the passages that got cited for "How are time and work questions asked in SSC CGL?" (Class 5
 * English, Class 6 Hindi) and "latest SSC CGL notification" (Hindi, Political Science) scored
 * 0.000–0.03. Callers must skip it for `degraded` results (see above).
 */
export const MIN_RERANK_RELEVANCE = 0.1;

export interface RerankerProvider {
  /**
   * Reranks a list of documents against a query.
   * @param query The search query.
   * @param documents Array of strings representing the document contents.
   * @param topN Number of top results to return.
   * @returns Array of RerankedDocument containing the original index and new score.
   */
  rerank(query: string, documents: string[], topN?: number): Promise<RerankedDocument[]>;
}

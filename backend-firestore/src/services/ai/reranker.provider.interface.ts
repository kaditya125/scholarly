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

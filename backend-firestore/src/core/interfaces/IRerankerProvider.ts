export interface RerankedDocument {
  index: number;
  relevanceScore: number;
}

export interface IRerankerProvider {
  /**
   * Reranks a list of documents against a query.
   * @param query The search query.
   * @param documents Array of strings representing the document contents.
   * @param topN Number of top results to return.
   * @returns Array of RerankedDocument containing the original index and new score.
   */
  rerank(query: string, documents: string[], topN?: number): Promise<RerankedDocument[]>;
}

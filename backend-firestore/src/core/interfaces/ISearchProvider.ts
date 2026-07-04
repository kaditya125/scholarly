export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface ISearchProvider {
  /**
   * Performs a web search.
   * @param query The search query.
   * @param maxResults Maximum number of results to return.
   */
  search(query: string, maxResults?: number): Promise<SearchResult[]>;
}

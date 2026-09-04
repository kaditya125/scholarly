import { env } from '../../config/env';
import { getSecret } from '../runtimeSecrets.service';

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

export class SearchService {
  /**
   * Resolved fresh on every call rather than cached on `this` at construction time.
   * `searchService` below is a module-load-time singleton, so a cached field would have
   * baked in whatever TAVILY_API_KEY was effective at process start for the rest of its
   * life — exactly what an admin rotating the key through Settings needs to NOT happen. A
   * plain string lookup costs nothing, so there is no reason to cache it.
   */
  private get apiKey(): string {
    return getSecret('TAVILY_API_KEY') || env.TAVILY_API_KEY || '';
  }

  /**
   * Perform a web search using Tavily API
   */
  async search(query: string, limit: number = 5): Promise<SearchResult[]> {
    if (!this.apiKey) {
      console.warn('TAVILY_API_KEY is not defined. Web search will fail.');
      return [];
    }

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query: query,
          search_depth: 'advanced', // advanced or basic
          include_answer: false,
          include_images: false,
          max_results: limit,
          include_raw_content: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily search failed with status ${response.status}`);
      }

      const data = await response.json();
      
      return data.results.map((result: any) => ({
        title: result.title,
        url: result.url,
        content: result.content,
        score: result.score,
        published_date: result.published_date,
      }));
    } catch (error) {
      console.error('Error during web search:', error);
      return [];
    }
  }
}

export const searchService = new SearchService();

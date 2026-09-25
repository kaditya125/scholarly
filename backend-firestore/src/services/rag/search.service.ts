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
   * Perform a web search using Tavily API. `includeDomains` / `excludeDomains` pass straight
   * through; a suffix such as 'gov.in' matches every subdomain (ssc.gov.in, sscsr.gov.in, …).
   */
  async search(
    query: string,
    limit: number = 5,
    opts?: { includeDomains?: string[]; excludeDomains?: string[] },
  ): Promise<SearchResult[]> {
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
          ...(opts?.includeDomains?.length ? { include_domains: opts.includeDomains } : {}),
          ...(opts?.excludeDomains?.length ? { exclude_domains: opts.excludeDomains } : {}),
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

  /**
   * The web search every chat mode uses: government sites only (where notifications, corrigenda
   * and results are actually published) and the open web minus video/social/forum platforms, run
   * in parallel, official results first and flagged. A plain search for "SSC CGL notification
   * changes" returned only coaching sites and a YouTube video; this one leads with ssc.gov.in.
   * Two advanced searches per call.
   */
  async searchOfficialFirst(query: string): Promise<Array<SearchResult & { official: boolean }>> {
    const [official, general] = await Promise.all([
      this.search(query, 3, { includeDomains: OFFICIAL_WEB_DOMAINS }),
      this.search(query, 3, { excludeDomains: EXCLUDED_WEB_DOMAINS }),
    ]);
    const seen = new Set<string>();
    return [
      ...official.map((r) => ({ ...r, official: true })),
      ...general.map((r) => ({ ...r, official: false })),
    ].filter((r) => r.url && !seen.has(r.url) && seen.add(r.url));
  }
}

/** Where Indian exam notifications are published ('gov.in' matches ssc.gov.in, sscsr.gov.in, …). */
export const OFFICIAL_WEB_DOMAINS = ['gov.in', 'nic.in'];
/** Video, social and forum platforms — not citable sources for exam facts. */
export const EXCLUDED_WEB_DOMAINS = [
  'youtube.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 't.me', 'telegram.me',
  'pinterest.com', 'quora.com', 'reddit.com',
];

export const searchService = new SearchService();

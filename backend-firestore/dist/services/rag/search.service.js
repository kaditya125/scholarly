"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchService = exports.SearchService = void 0;
const env_1 = require("../../config/env");
class SearchService {
    apiKey;
    constructor() {
        this.apiKey = env_1.env.TAVILY_API_KEY || '';
        if (!this.apiKey) {
            console.warn('TAVILY_API_KEY is not defined. Web search will fail.');
        }
    }
    /**
     * Perform a web search using Tavily API
     */
    async search(query, limit = 5) {
        if (!this.apiKey)
            return [];
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
            return data.results.map((result) => ({
                title: result.title,
                url: result.url,
                content: result.content,
                score: result.score,
                published_date: result.published_date,
            }));
        }
        catch (error) {
            console.error('Error during web search:', error);
            return [];
        }
    }
}
exports.SearchService = SearchService;
exports.searchService = new SearchService();

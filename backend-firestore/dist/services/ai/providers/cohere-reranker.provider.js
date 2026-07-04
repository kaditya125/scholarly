"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CohereRerankerProvider = void 0;
const env_1 = require("../../../config/env");
class CohereRerankerProvider {
    apiKey;
    model;
    constructor(model = 'rerank-english-v3.0') {
        this.model = model;
        this.apiKey = env_1.env.COHERE_API_KEY || '';
        if (!this.apiKey) {
            console.warn('COHERE_API_KEY is missing. Cohere Reranking will fail.');
        }
    }
    async rerank(query, documents, topN) {
        if (!this.apiKey || documents.length === 0)
            return [];
        // Cohere limits top_n to the number of documents
        const actualTopN = topN ? Math.min(topN, documents.length) : documents.length;
        try {
            const response = await fetch('https://api.cohere.ai/v1/rerank', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    query: query,
                    documents: documents,
                    top_n: actualTopN,
                    return_documents: false
                })
            });
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Cohere API error: ${response.status} - ${errText}`);
            }
            const data = await response.json();
            // Map response to our internal interface
            // data.results is an array of { index, relevance_score }
            return (data.results || []).map((res) => ({
                index: res.index,
                relevanceScore: res.relevance_score
            }));
        }
        catch (error) {
            console.error('Error during Cohere reranking:', error);
            // Fallback: return unreranked with 0 scores
            return documents.map((_, i) => ({ index: i, relevanceScore: 0 }));
        }
    }
}
exports.CohereRerankerProvider = CohereRerankerProvider;

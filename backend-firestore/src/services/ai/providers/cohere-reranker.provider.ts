import { env } from '../../../config/env';
import { RerankerProvider, RerankedDocument } from '../reranker.provider.interface';

export class CohereRerankerProvider implements RerankerProvider {
  private apiKey: string;
  private model: string;

  constructor(model: string = 'rerank-english-v3.0') {
    this.model = model;
    this.apiKey = env.COHERE_API_KEY || '';
    if (!this.apiKey) {
      console.warn('COHERE_API_KEY is missing. Cohere Reranking will fail.');
    }
  }

  async rerank(query: string, documents: string[], topN?: number): Promise<RerankedDocument[]> {
    if (!this.apiKey || documents.length === 0) return [];
    
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
      return (data.results || []).map((res: any) => ({
        index: res.index,
        relevanceScore: res.relevance_score
      }));

    } catch (error) {
      console.error('Error during Cohere reranking:', error);
      /*
       * Fallback: pass the documents through in their original order, unranked.
       *
       * `degraded` is what makes this honest. The scores below are 0 because nothing scored them,
       * not because the documents are irrelevant, and a caller filtering on score cannot tell those
       * apart from the numbers alone. Without the flag, a threshold downstream would convert a
       * Cohere outage into silent, total retrieval failure.
       */
      return documents.map((_, i) => ({ index: i, relevanceScore: 0, degraded: true }));
    }
  }
}

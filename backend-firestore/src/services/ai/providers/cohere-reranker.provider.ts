import { env } from '../../../config/env';
import { RerankerProvider, RerankedDocument } from '../reranker.provider.interface';

export class CohereRerankerProvider implements RerankerProvider {
  private apiKey: string;
  private model: string;

  /**
   * Multilingual by default, and that is not a preference — it is a correctness requirement.
   *
   * The corpus is English (NCERT), but Sadhya's students ask in English, Hindi and Hinglish; the
   * voice tutor's own instruction tells it to answer in whichever the student uses. So the
   * reranker's real job here is CROSS-lingual: score an English document against a Hindi query.
   *
   * Measured on 2026-08-27, scoring a genuinely relevant English photosynthesis passage:
   *
   *                              rerank-english-v3.0    rerank-multilingual-v3.0
   *   "what is photosynthesis"       0.9994                  1.0000
   *   "photosynthesis kya hota hai"  0.5041                  1.0000
   *   "प्रकाश संश्लेषण क्या है"              0.0359                  0.3827
   *   "पौधे भोजन कैसे बनाते हैं"            0.0015                  0.9926
   *
   * The English model scores a correct Devanagari match at 0.0015 — inside the noise band that
   * the relevance floor in retrieval.service.ts exists to remove (noise measured at <= 0.0013).
   * Signal and noise are therefore INSEPARABLE for Devanagari under the English model: no floor
   * can keep one and drop the other, so this could not be fixed by tuning the threshold. The
   * multilingual model restores the separation in every language — noise stays at 0.0006, real
   * matches clear 0.38 — and the floor works unchanged.
   */
  constructor(model: string = 'rerank-multilingual-v3.0') {
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

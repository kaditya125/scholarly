import { GoogleGenAI } from '@google/genai';
import { env, assertAIEnabled } from '../../../config/env';
import { EmbeddingProvider } from '../embedding.provider.interface';
import { withRetry, withTimeout } from '../../../utils/retry';

// The Pinecone index 'edtech-ai-rag' has dimension 768. `text-embedding-004` (which
// produced 768-dim vectors) has been deprecated by Google and now returns 404 for
// embedContent. The current model `gemini-embedding-001` defaults to 3072 dims, so we
// request outputDimensionality: 768 to keep vectors compatible with the existing index.
const EMBEDDING_DIM = 768;

export class GoogleEmbeddingProvider implements EmbeddingProvider {
  private ai: GoogleGenAI;
  private modelName: string;

  constructor(modelName: string = 'gemini-embedding-001') {
    this.modelName = modelName;
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not defined in environment.');
    }
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async generateEmbedding(text: string, userId?: string): Promise<number[]> {
    assertAIEnabled('embedding');
    // Resilience: 20s timeout + retry with backoff on transient errors.
    const response: any = await withRetry(
      () => withTimeout(
        this.ai.models.embedContent({
          model: this.modelName,
          contents: text,
          config: { outputDimensionality: EMBEDDING_DIM },
        }) as Promise<any>,
        20000,
        'gemini.embedContent'
      ),
      // More retries + honoring the server's 429 retry delay lets us ride out
      // free-tier per-minute rate limits during bulk ingestion.
      { label: 'gemini.embedContent', retries: 6 }
    );
    
    // Track cost (approximate 4 chars per token if API doesn't return usageMetadata for embeddings)
    const tokens = Math.ceil(text.length / 4);
    const { Telemetry } = require('../../../lib/telemetry');
    Telemetry.logCost('gemini-embedding', tokens, 'input', { userId, operationType: 'embedding' });

    return response.embeddings?.[0]?.values || [];
  }

  async generateEmbeddings(texts: string[], userId?: string): Promise<number[][]> {
    // gemini-embedding-001 via embedContent returns a single embedding per call and does
    // not reliably return one-per-item for an array `contents`. Embed each text using the
    // proven single-item path, with small concurrency to respect rate limits.
    const results: number[][] = [];
    // Process completely sequentially to avoid burst limits on the free tier
    for (let i = 0; i < texts.length; i++) {
      const embedded = await this.generateEmbedding(texts[i], userId);
      results.push(embedded);
      
      // Delay 1 second between EVERY single request. (60 req/min, safely under 100/min limit)
      await new Promise(r => setTimeout(r, 1000));
    }
    return results;
  }
}

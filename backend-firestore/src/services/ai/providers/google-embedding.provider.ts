import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';
import { env, assertAIEnabled } from '../../../config/env';
import { EmbeddingProvider } from '../embedding.provider.interface';
import { withRetry, withTimeout } from '../../../utils/retry';
import { cacheService } from '../../cache.service';

// The Pinecone index 'edtech-ai-rag' has dimension 768. `text-embedding-004` (which
// produced 768-dim vectors) has been deprecated by Google and now returns 404 for
// embedContent. The current model `gemini-embedding-001` defaults to 3072 dims, so we
// request outputDimensionality: 768 to keep vectors compatible with the existing index.
const EMBEDDING_DIM = 768;

/**
 * ── EMBEDDING CACHE ───────────────────────────────────────────────────────────────────────
 *
 * An embedding is a pure function of (model, dimensionality, text): the same input always
 * yields the same 768 floats. So a second call for text already seen is a paid, ~2 s round trip
 * to be told something we already know. Measured on this deployment, the embedding is the
 * slowest step in retrieval by a wide margin — 2681 ms against Pinecone's 535 ms and Cohere's
 * 385 ms — so a hit removes the dominant latency, not just a line on the bill.
 *
 * ── WHY ONLY SHORT TEXTS ─────────────────────────────────────────────────────────────────
 * Two callers use this provider for very different things. QUERIES are short and repeat across
 * users; DOCUMENT CHUNKS during ingestion are long and almost never repeat. InMemoryCache is
 * bounded at 5000 entries, so caching ingestion would evict every useful query vector to store
 * thousands of single-use ones — strictly worse than no cache. The length test separates the two
 * without needing a flag threaded through fourteen call sites.
 *
 * ── WHY NO TTL ───────────────────────────────────────────────────────────────────────────
 * Two reasons, and both matter. First, the value cannot go stale: the model is pinned in the key,
 * so a model or dimension change lands on a different key rather than returning a vector that no
 * longer matches the index. Second, UpstashRedisCache.set puts the value in the URL PATH when
 * given a TTL, and a 768-float array serialises to roughly 10 KB — long enough to risk a
 * 414 from the REST endpoint. The no-TTL branch sends the value in the request body, which is
 * the correct shape for a payload this size.
 */
const EMBEDDING_CACHE_MAX_TEXT = Number(process.env.EMBEDDING_CACHE_MAX_TEXT || 512);
const EMBEDDING_CACHE_ENABLED = process.env.EMBEDDING_CACHE_DISABLED !== 'true';

export class GoogleEmbeddingProvider implements EmbeddingProvider {
  private ai: GoogleGenAI;
  private modelName: string;

  constructor(modelName: string = 'gemini-embedding-001') {
    this.modelName = modelName;
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not defined in environment.');
    }
    const { createGoogleGenAIClient } = require('../googleGenAIClient');
    this.ai = createGoogleGenAIClient();
  }

  /**
   * Cache key. The model and dimensionality are IN the key, not just the text.
   *
   * Without them, changing either would serve vectors from the old configuration — dimensionally
   * or semantically incompatible with what is in Pinecone — and retrieval would quietly degrade
   * with nothing in the logs to explain it. Including them makes a config change a cache miss
   * instead of a silent correctness bug.
   *
   * Whitespace is collapsed so that a query differing only in spacing or a trailing newline
   * shares an entry. Case is deliberately NOT folded: "Hg" and "hg" are not the same token to an
   * embedding model, and returning a vector for text the caller did not pass would make the
   * cache lie about what it holds.
   */
  private embeddingCacheKey(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const digest = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
    return `emb:${this.modelName}:${EMBEDDING_DIM}:${digest}`;
  }

  private isCacheable(text: string): boolean {
    return EMBEDDING_CACHE_ENABLED && text.length > 0 && text.length <= EMBEDDING_CACHE_MAX_TEXT;
  }

  async generateEmbedding(text: string, userId?: string): Promise<number[]> {
    return (await this.embedOnce(text, userId)).vector;
  }

  /**
   * The single embedding path, reporting whether the answer came from cache.
   *
   * `generateEmbeddings` needs to know: it sleeps 1 s between items to stay under the rate limit,
   * and a cache hit issues no request, so sleeping after one would be waiting for a quota it
   * never spent. Re-running an ingestion over already-seen text now completes at memory speed
   * instead of one second per item.
   */
  private async embedOnce(text: string, userId?: string): Promise<{ vector: number[]; cached: boolean }> {
    assertAIEnabled('embedding');
    const { Telemetry } = require('../../../lib/telemetry');

    const cacheable = this.isCacheable(text);
    const key = cacheable ? this.embeddingCacheKey(text) : '';

    if (cacheable) {
      /*
       * Fail open. A cache that is down, over quota or returning nonsense must cost us a slower
       * call, never a wrong vector and never an exception — so the dimension is checked rather
       * than trusted, and any throw falls through to the live call below.
       */
      try {
        const hit = await cacheService.get<number[]>(key);
        if (Array.isArray(hit) && hit.length === EMBEDDING_DIM) {
          Telemetry.logCacheHit('embedding', true, { model: this.modelName });
          return { vector: hit, cached: true };
        }
      } catch { /* treated as a miss */ }
      Telemetry.logCacheHit('embedding', false, { model: this.modelName });
    }

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
    Telemetry.logCost('gemini-embedding', tokens, 'input', { userId, operationType: 'embedding' });

    const vector: number[] = response.embeddings?.[0]?.values || [];

    /*
     * Store only a well-formed vector. A short or empty result means the call degraded, and
     * caching that would turn one bad response into a permanent one — the exact failure the
     * no-TTL choice above would otherwise make unrecoverable.
     */
    if (cacheable && vector.length === EMBEDDING_DIM) {
      try {
        await cacheService.set(key, vector);
      } catch { /* a cache we cannot write to is not a reason to fail the request */ }
    }

    return { vector, cached: false };
  }

  async generateEmbeddings(texts: string[], userId?: string): Promise<number[][]> {
    // gemini-embedding-001 via embedContent returns a single embedding per call and does
    // not reliably return one-per-item for an array `contents`. Embed each text using the
    // proven single-item path, with small concurrency to respect rate limits.
    const results: number[][] = [];
    // Process completely sequentially to avoid burst limits on the free tier
    for (let i = 0; i < texts.length; i++) {
      const { vector, cached } = await this.embedOnce(texts[i], userId);
      results.push(vector);

      /*
       * Delay 1 second between EVERY single request. (60 req/min, safely under 100/min limit)
       *
       * Skipped on a cache hit, and not as an optimisation for its own sake: the pause exists to
       * space out REQUESTS, and a hit made none. Sleeping after one would throttle against a
       * quota that was never touched — and on the last item there is nothing left to space out.
       */
      if (!cached && i < texts.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    return results;
  }
}

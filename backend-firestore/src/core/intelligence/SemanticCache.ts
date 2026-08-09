import { cacheService, CacheService } from '../../services/cache.service';
import { cosineSimilarity } from '../../utils/kgSimilarity';
import { GoogleEmbeddingProvider } from '../../services/ai/providers/google-embedding.provider';

/** Minimal embedder contract (so tests can inject a mock without a real embedding call). */
export interface Embedder {
  generateEmbedding(text: string, userId?: string): Promise<number[]>;
}

export interface CachedAnswer {
  question: string;
  answer: string;
  citations: any[];
  workflow: string;
  model: string;
  confidence: number;
  ts: number;
}

interface CachedEntry extends CachedAnswer {
  embedding: number[];
}

export interface CacheHit {
  entry: CachedAnswer;
  similarity: number;
}

const MAX_ENTRIES_PER_SCOPE = 50;

/**
 * SemanticCache (Task 6) — reuse a prior answer when a semantically-similar question arrives,
 * avoiding a full GraphRAG execution.
 *
 * The production cache backend (`cacheService`) is a KV store (in-memory dev / Upstash Redis),
 * so nearest-neighbor is done in-process: we keep a small, bounded, scoped list of
 * {embedding, answer, …} and cosine-compare the incoming query embedding against it. Scope is
 * the notebook id (or 'global' for curriculum-grounded answers), so a notebook's cache never
 * leaks across notebooks. Fully guarded — any failure degrades to a normal (uncached) request.
 */
export class SemanticCache {
  constructor(
    private readonly embedder: Embedder = new GoogleEmbeddingProvider(),
    private readonly cache: CacheService = cacheService,
  ) {}

  private key(scope: string): string {
    return `semcache:${scope || 'global'}`;
  }

  /** Look up a semantically-similar cached answer. Returns null on miss/low-similarity/error. */
  async lookup(query: string, scope: string, threshold: number): Promise<CacheHit | null> {
    try {
      const list = (await this.cache.get<CachedEntry[]>(this.key(scope))) || [];
      if (list.length === 0) return null;
      const qv = await this.embedder.generateEmbedding(query);
      if (!qv || qv.length === 0) return null;

      let best: CachedEntry | null = null;
      let bestSim = -1;
      for (const e of list) {
        const sim = cosineSimilarity(qv, e.embedding);
        if (sim > bestSim) { bestSim = sim; best = e; }
      }
      if (best && bestSim >= threshold) {
        const { embedding, ...answer } = best;
        return { entry: answer, similarity: bestSim };
      }
      return null;
    } catch {
      return null; // never fail the request because of the cache
    }
  }

  /** Store an answer for future semantic reuse (bounded, most-recent-first). Guarded. */
  async store(answer: CachedAnswer, scope: string, ttlSeconds: number): Promise<void> {
    try {
      const qv = await this.embedder.generateEmbedding(answer.question);
      if (!qv || qv.length === 0) return;
      const key = this.key(scope);
      const list = (await this.cache.get<CachedEntry[]>(key)) || [];
      list.unshift({ embedding: qv, ...answer });
      if (list.length > MAX_ENTRIES_PER_SCOPE) list.length = MAX_ENTRIES_PER_SCOPE;
      await this.cache.set(key, list, ttlSeconds);
    } catch {
      /* non-fatal — a failed cache write must never affect the response */
    }
  }

  /** Scope helper used by the workflow: notebook-scoped, else global. */
  static scopeFor(notebookId?: string): string {
    return notebookId ? `nb:${notebookId}` : 'global';
  }
}

export const semanticCache = new SemanticCache();

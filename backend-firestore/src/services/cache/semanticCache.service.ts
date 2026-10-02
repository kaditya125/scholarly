import { QdrantClient } from '@qdrant/js-client-rest';
import * as crypto from 'crypto';
import { env } from '../../config/env';
import { getSecret } from '../runtimeSecrets.service';
import { cacheService } from '../cache.service';
import { GoogleEmbeddingProvider } from '../ai/providers/google-embedding.provider';
import { Telemetry } from '../../lib/telemetry';
import { logger } from '../../utils/logger';

export const SEMANTIC_CACHE_COLLECTION = 'semantic_cache';
export const DEFAULT_SEMANTIC_THRESHOLD = Number(process.env.SEMANTIC_CACHE_THRESHOLD || 0.86);
export const DEFAULT_CACHE_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

export interface SemanticCacheEntry {
  query: string;
  answer: string;
  citations?: any[];
  examScope?: string;
  subject?: string;
  confidenceScore: number;
  metadata?: Record<string, any>;
  ttlSeconds?: number;
}

export interface SemanticCacheHit {
  id: string;
  query: string;
  answer: string;
  citations: any[];
  similarity: number;
  tier: 'L1_EXACT' | 'L2_SEMANTIC';
  examScope?: string;
  subject?: string;
  cachedAt: number;
  hitCount: number;
}

export class SemanticCacheService {
  private threshold: number;
  private embeddingProvider: GoogleEmbeddingProvider;
  private collectionInitialized = false;

  constructor(threshold: number = DEFAULT_SEMANTIC_THRESHOLD) {
    this.threshold = threshold;
    this.embeddingProvider = new GoogleEmbeddingProvider();
  }

  private client(): QdrantClient {
    const apiKey = getSecret('QDRANT_API_KEY') || env.QDRANT_API_KEY;
    return new QdrantClient({
      url: env.QDRANT_URL,
      apiKey: apiKey || undefined,
      checkCompatibility: false,
    });
  }

  /**
   * Normalizes a query for exact hash matching (collapsing spaces, lowercasing, punctuation trimming).
   */
  public normalizeQuery(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private l1Key(normalized: string, examScope?: string): string {
    const scope = (examScope || 'GLOBAL').toUpperCase();
    const digest = crypto.createHash('sha256').update(`${scope}:${normalized}`).digest('hex').slice(0, 32);
    return `sem_cache:l1:${digest}`;
  }

  /**
   * Ensures the Qdrant semantic_cache collection exists with 768-dim Cosine configuration.
   */
  async ensureCollection(): Promise<void> {
    if (this.collectionInitialized) return;
    try {
      const client = this.client();
      const exists = await client.collectionExists(SEMANTIC_CACHE_COLLECTION);
      if (!exists.exists) {
        await client.createCollection(SEMANTIC_CACHE_COLLECTION, {
          vectors: { size: 768, distance: 'Cosine' },
          optimizers_config: { indexing_threshold: 1 },
          quantization_config: {
            scalar: {
              type: 'int8',
              quantile: 0.99,
              always_ram: true,
            },
          },
          on_disk_payload: true,
        });

        // Create payload index on examScope for isolated exam filtering
        await client.createPayloadIndex(SEMANTIC_CACHE_COLLECTION, {
          field_name: 'examScope',
          field_schema: 'keyword',
        });
        logger.info(`[SemanticCache] Initialized collection ${SEMANTIC_CACHE_COLLECTION} in Qdrant with int8 scalar quantization.`);
      } else {
        const info: any = await client.getCollection(SEMANTIC_CACHE_COLLECTION);
        if (info?.config?.quantization_config?.scalar?.type !== 'int8') {
          await (client as any).updateCollection(SEMANTIC_CACHE_COLLECTION, {
            quantization_config: {
              scalar: {
                type: 'int8',
                quantile: 0.99,
                always_ram: true,
              },
            },
          });
          logger.info(`[SemanticCache] Upgraded ${SEMANTIC_CACHE_COLLECTION} to int8 scalar quantization.`);
        }
      }
      this.collectionInitialized = true;
    } catch (err: any) {
      logger.warn('[SemanticCache] Failed to ensure collection (will retry on next call):', err?.message || err);
    }
  }

  /**
   * Look up a query in the two-tier cache (L1 Exact Hash -> L2 Qdrant Vector Semantic).
   */
  async lookup(
    query: string,
    examScope?: string,
    subject?: string
  ): Promise<SemanticCacheHit | null> {
    const tStart = performance.now();
    const normalized = this.normalizeQuery(query);
    if (!normalized || normalized.length < 5) return null;

    // ── Tier 1: L1 Exact Match in Redis / Memory (< 2ms) ───────────────────
    const l1CacheKey = this.l1Key(normalized, examScope);
    const l1Cached = await cacheService.get<SemanticCacheHit>(l1CacheKey);
    if (l1Cached) {
      const elapsed = performance.now() - tStart;
      Telemetry.logLatency('semantic_cache_l1_hit', elapsed, { query: normalized });
      logger.info(`[SemanticCache] Tier 1 L1 EXACT Hit in ${elapsed.toFixed(1)}ms for "${normalized.slice(0, 50)}"`);
      void this.incrementHitCount(l1Cached.id);
      return {
        ...l1Cached,
        tier: 'L1_EXACT',
        similarity: 1.0,
      };
    }

    // ── Tier 2: L2 Qdrant Vector Semantic Search (~25-35ms) ────────────────
    try {
      await this.ensureCollection();
      const tEmbed = performance.now();
      const queryVector = await this.embeddingProvider.generateEmbedding(query);
      const embedLatency = performance.now() - tEmbed;

      const client = this.client();
      const targetScope = (examScope || 'GLOBAL').toUpperCase();

      const qdrantFilter: any = {};
      if (targetScope !== 'GLOBAL') {
        qdrantFilter.should = [
          { key: 'examScope', match: { value: targetScope } },
          { key: 'examScope', match: { value: 'GLOBAL' } },
        ];
      }

      const tQdrant = performance.now();
      const results = await client.query(SEMANTIC_CACHE_COLLECTION, {
        query: queryVector,
        limit: 1,
        score_threshold: this.threshold,
        filter: Object.keys(qdrantFilter).length > 0 ? qdrantFilter : undefined,
        with_payload: true,
        params: {
          quantization: {
            rescore: true,
            oversampling: 2.0,
          },
        } as any,
      });
      const qdrantLatency = performance.now() - tQdrant;

      const topPoint = results.points?.[0];
      if (topPoint && typeof topPoint.score === 'number' && topPoint.score >= this.threshold) {
        const payload = (topPoint.payload || {}) as Record<string, any>;
        const hit: SemanticCacheHit = {
          id: String(topPoint.id),
          query: String(payload.query || ''),
          answer: String(payload.answer || ''),
          citations: Array.isArray(payload.citations) ? payload.citations : [],
          similarity: topPoint.score,
          tier: 'L2_SEMANTIC',
          examScope: payload.examScope,
          subject: payload.subject,
          cachedAt: Number(payload.cachedAt || Date.now()),
          hitCount: Number(payload.hitCount || 1) + 1,
        };

        const totalLatency = performance.now() - tStart;
        Telemetry.logLatency('semantic_cache_l2_hit', totalLatency, {
          query: normalized,
          similarity: topPoint.score,
          embedLatency,
          qdrantLatency,
        });
        logger.info(
          `[SemanticCache] Tier 2 L2 SEMANTIC Hit (score: ${topPoint.score.toFixed(4)}) in ${totalLatency.toFixed(1)}ms for "${query.slice(0, 50)}"`
        );

        // Populate L1 cache for this exact query variation so next identical query hits Tier 1
        await cacheService.set(l1CacheKey, hit, DEFAULT_CACHE_TTL_SECONDS);
        void this.incrementHitCount(hit.id);

        return hit;
      }
    } catch (err: any) {
      logger.warn('[SemanticCache] L2 lookup error (degrading to cache miss):', err?.message || err);
    }

    Telemetry.logLatency('semantic_cache_miss', performance.now() - tStart, { query: normalized });
    return null;
  }

  /**
   * Stores a verified high-confidence response in both Qdrant (L2) and Redis/Memory (L1).
   */
  async store(entry: SemanticCacheEntry): Promise<void> {
    if (!entry.query || !entry.answer || entry.confidenceScore < 0.85) {
      return; // Do not cache low confidence or empty responses
    }

    try {
      await this.ensureCollection();
      const normalized = this.normalizeQuery(entry.query);
      const scope = (entry.examScope || 'GLOBAL').toUpperCase();
      const ttl = entry.ttlSeconds || DEFAULT_CACHE_TTL_SECONDS;

      const vector = await this.embeddingProvider.generateEmbedding(entry.query);
      const pointId = crypto.randomUUID();
      const cachedAt = Date.now();

      const payload = {
        query: entry.query,
        normalizedQuery: normalized,
        answer: entry.answer,
        citations: entry.citations || [],
        examScope: scope,
        subject: entry.subject || 'general',
        confidenceScore: entry.confidenceScore,
        metadata: entry.metadata || {},
        cachedAt,
        hitCount: 0,
        expiresAt: cachedAt + ttl * 1000,
      };

      const client = this.client();
      await client.upsert(SEMANTIC_CACHE_COLLECTION, {
        wait: false, // Non-blocking write
        points: [
          {
            id: pointId,
            vector,
            payload,
          },
        ],
      });

      // Write to L1 exact hash cache
      const l1CacheKey = this.l1Key(normalized, scope);
      const hitObj: SemanticCacheHit = {
        id: pointId,
        query: entry.query,
        answer: entry.answer,
        citations: entry.citations || [],
        similarity: 1.0,
        tier: 'L1_EXACT',
        examScope: scope,
        subject: entry.subject,
        cachedAt,
        hitCount: 0,
      };
      await cacheService.set(l1CacheKey, hitObj, ttl);

      logger.info(`[SemanticCache] Successfully cached verified answer for: "${normalized.slice(0, 50)}"`);
    } catch (err: any) {
      logger.warn('[SemanticCache] Failed to store cache entry (non-fatal):', err?.message || err);
    }
  }

  /**
   * Asynchronously increments the hit count in Qdrant payload for analytics.
   */
  async incrementHitCount(pointId: string): Promise<void> {
    try {
      const client = this.client();
      const existing = await client.retrieve(SEMANTIC_CACHE_COLLECTION, {
        ids: [pointId],
        with_payload: true,
      });
      if (existing.length > 0) {
        const currentCount = Number(existing[0].payload?.hitCount || 0);
        await client.setPayload(SEMANTIC_CACHE_COLLECTION, {
          payload: { hitCount: currentCount + 1, lastHitAt: Date.now() },
          points: [pointId],
          wait: false,
        });
      }
    } catch {
      // Non-fatal telemetry update
    }
  }
}

export const semanticCacheService = new SemanticCacheService();

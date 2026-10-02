/**
 * Qdrant backend for the vector store, API-compatible with PineconeService.
 *
 * The whole point is that callers cannot tell the difference, so two translations happen at
 * this boundary and nowhere else:
 *
 *   ids          Qdrant point ids must be an unsigned integer or a UUID. The application's ids
 *                (`${sourceId}_chunk_${i}`, `pyq_...`) are neither, so points are addressed by
 *                a deterministic UUIDv5 and the original id is carried in the payload. Every
 *                value this class RETURNS is translated back, because callers parse these ids
 *                and compare them against ids built elsewhere.
 *
 *   namespaces   Pinecone namespaces are hard partitions — a query in `production` physically
 *                cannot see `reference_books`. Qdrant has no equivalent inside a collection, so
 *                a mandatory payload filter reconstructs it. That filter is applied in one
 *                place, toQdrantFilter, and every read and write path goes through it.
 *
 * Nothing here re-embeds, normalises or reshapes a vector. Values in are values out.
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { RecordMetadata } from '@pinecone-database/pinecone';
import { env } from '../../config/env';
import { getSecret } from '../runtimeSecrets.service';
import {
  VectorStore, VectorDocument, VectorMatch, FetchedVector, VectorStoreStats, HybridQueryOptions,
} from './vectorStore.types';
import {
  toQdrantId, toQdrantFilter, INDEXED_PAYLOAD_KEYS,
  PINECONE_ID_KEY, PINECONE_NAMESPACE_KEY,
} from './qdrantFilter';
import {
  queryTerms, tokenize, bm25Idf, bm25Score, reciprocalRankFusion, cosineSimilarity, RRF_K,
} from './lexicalScore';
import { logger } from '../../utils/logger';
import { REFERENCE_BOOK_NAMESPACE } from './namespaces';

/** Typed failure for a collection whose configuration this code cannot safely serve from. */
export class QdrantConfigurationError extends Error {
  readonly code = 'RETRIEVAL_CONFIGURATION_ERROR';
  constructor(message: string) {
    super(`[qdrant] ${message}`);
    this.name = 'QdrantConfigurationError';
  }
}

/** How many of the rarest query terms seed the keyword candidate pool, and how many points each. */
const KEYWORD_POOL_TERMS = 3;
const KEYWORD_POOL_PER_TERM = 64;
const COUNT_CACHE_TTL_MS = 10 * 60 * 1000;

export const QDRANT_COLLECTION = 'edtech_ai_rag';
export const QDRANT_DIMENSION = 768;
/** Discovered from the live Pinecone index (describeIndex -> metric), not assumed. */
export const QDRANT_DISTANCE = 'Cosine' as const;

/**
 * Index settings, and why they are not the defaults.
 *
 * A collection created with Qdrant's defaults (m=16, ef_construct=100,
 * indexing_threshold=20000) and then bulk-loaded with ~50k vectors in batches of 100 produced a
 * graph with genuinely broken recall. Measured on this corpus: for "quadratic equations roots",
 * ANN search returned a cluster scoring 0.54 and never reached the true nearest neighbours at
 * 0.68 — while exact search over the same collection returned them immediately, and every vector
 * was present with the correct values.
 *
 * It was not the filter (unfiltered search missed them identically), not missing data, and not a
 * half-built index (it had settled at optimizer=ok). Raising hnsw_ef to 512 at query time did not
 * help either, which is what rules out "not enough search effort" — the graph simply could not
 * reach that region from its entry points.
 *
 *   indexing_threshold: 1   Every segment gets a graph. The default leaves segments under 20k
 *                           vectors unindexed for exact search, which is fine for recall but
 *                           means the collection is searched by two different methods at once.
 *   m: 32                   Twice the default connectivity per node. The cost is memory and
 *                           build time; the benefit is a graph that stays connected.
 *   ef_construct: 256       More candidates considered while building, so neighbour lists are
 *                           chosen better. Build-time only — it does not slow queries.
 *
 * With these, ANN search agrees with exact search on the queries that previously diverged.
 * Changing them away from these values without re-measuring recall would reintroduce the bug
 * silently: every count and checksum still passes while search quietly gets worse.
 */
export const HNSW_SETTINGS = {
  hnsw_config: { m: 32, ef_construct: 256 },
  optimizers_config: { indexing_threshold: 1 },
} as const;

/**
 * Native Qdrant Scalar Quantization (int8):
 * Compresses 32-bit float vectors (f32) to 8-bit integers (int8).
 * - 75% RAM reduction (100k vectors: ~350MB -> ~90MB)
 * - 3x-4x faster distance calculation via SIMD AVX
 * - always_ram: true keeps quantized vectors in memory, offloading full f32 vectors
 */
export const SCALAR_QUANTIZATION_CONFIG = {
  scalar: {
    type: 'int8',
    quantile: 0.99,
    always_ram: true,
  },
} as const;

/** Query-time quantization parameters. Exported so tests assert on the same object queries send. */
export const QUANTIZATION_SEARCH_PARAMS = { rescore: true, oversampling: 2.0 } as const;

function hnswMatches(info: any): boolean {
  return info?.config?.hnsw_config?.m === HNSW_SETTINGS.hnsw_config.m
    && info?.config?.hnsw_config?.ef_construct === HNSW_SETTINGS.hnsw_config.ef_construct
    && info?.config?.optimizer_config?.indexing_threshold === HNSW_SETTINGS.optimizers_config.indexing_threshold;
}

function quantizationMatches(info: any): boolean {
  const s = info?.config?.quantization_config?.scalar;
  return s?.type === SCALAR_QUANTIZATION_CONFIG.scalar.type
    && s?.quantile === SCALAR_QUANTIZATION_CONFIG.scalar.quantile
    && s?.always_ram === SCALAR_QUANTIZATION_CONFIG.scalar.always_ram;
}

export class QdrantService implements VectorStore {
  readonly backend = 'qdrant' as const;
  private collection: string;
  private countCache = new Map<string, { count: number; expiresAt: number }>();
  /** Set when initialize() found a collection that cannot be served from. Every read then throws it. */
  private configError: QdrantConfigurationError | null = null;
  private initState: 'pending' | 'verified' | 'unreachable' | 'incompatible' = 'pending';

  getInitState() {
    return { state: this.initState, error: this.configError?.message ?? null };
  }

  /**
   * Server-start entry point. Verifies (and where safe, migrates) the collection.
   *   incompatible → latched: every subsequent read throws RETRIEVAL_CONFIGURATION_ERROR, so no
   *                  request is ever answered from a collection known to be wrong.
   *   unreachable  → logged as an error; reads are attempted and fail on their own if it stays down.
   */
  async initialize(): Promise<void> {
    try {
      const { created, updated } = await this.ensureCollection();
      this.initState = 'verified';
      logger.info('[qdrant] collection verified', { collection: this.collection, created, updated });
    } catch (err: any) {
      if (err instanceof QdrantConfigurationError) {
        this.configError = err;
        this.initState = 'incompatible';
        logger.error('[qdrant] collection is incompatible; vector retrieval disabled until fixed', {
          collection: this.collection, code: err.code, error: err.message,
        });
        return;
      }
      this.initState = 'unreachable';
      logger.error('[qdrant] could not verify collection at startup', {
        collection: this.collection, url: env.QDRANT_URL, error: String(err?.message || err).slice(0, 300),
      });
    }
  }

  constructor(collection: string = QDRANT_COLLECTION) {
    this.collection = collection;
  }

  /**
   * Built per call, mirroring PineconeService.getIndex(). That class rebuilds its client so an
   * API key rotated through admin Settings takes effect without a process restart; keeping the
   * same behaviour here means the two backends fail and recover the same way.
   */
  private client(): QdrantClient {
    const apiKey = getSecret('QDRANT_API_KEY') || env.QDRANT_API_KEY;
    return new QdrantClient({
      url: env.QDRANT_URL,
      apiKey: apiKey || undefined,
      checkCompatibility: false,
    });
  }

  /** Strip adapter-owned keys so callers see exactly the metadata they wrote. */
  private toMetadata(payload: Record<string, any> | null | undefined): RecordMetadata {
    if (!payload) return {} as RecordMetadata;
    const { [PINECONE_ID_KEY]: _id, [PINECONE_NAMESPACE_KEY]: _ns, ...rest } = payload;
    return rest as RecordMetadata;
  }

  private originalId(point: any, fallbackNamespace?: string): string {
    const fromPayload = point?.payload?.[PINECONE_ID_KEY];
    if (typeof fromPayload === 'string' && fromPayload) return fromPayload;
    // A point without the key was not written by this adapter. Returning the raw UUID would
    // hand callers an id they cannot parse, so say so rather than let it travel.
    throw new Error(
      `[qdrant] point ${point?.id} has no ${PINECONE_ID_KEY} payload` +
      `${fallbackNamespace ? ` (namespace ${fallbackNamespace})` : ''}; it was not written by this adapter`
    );
  }

  // ── schema ────────────────────────────────────────────────────────────────────────────────

  /**
   * Create the collection if missing, then VERIFY it matches what this code assumes.
   *
   * Runs at server start (initVectorStore in server.ts) and from the migration/ingest scripts.
   * Never recreates or deletes an existing collection:
   *   - vector size or distance wrong → QdrantConfigurationError. Every stored vector would be
   *     incomparable with the query embeddings; no in-place fix exists, so serving would be wrong.
   *   - HNSW settings or int8 quantization missing → applied in place with updateCollection
   *     (Qdrant rebuilds the index in the background), then re-read; still wrong → error.
   *   - payload indexes → created if missing (createPayloadIndex is not idempotent on older
   *     servers, so "already exists" is expected and ignored; anything else is logged).
   */
  async ensureCollection(): Promise<{ created: boolean; updated: string[] }> {
    const client = this.client();
    const exists = await client.collectionExists(this.collection);
    const updated: string[] = [];

    if (!exists.exists) {
      await client.createCollection(this.collection, {
        vectors: { size: QDRANT_DIMENSION, distance: QDRANT_DISTANCE },
        // Payload on disk keeps RAM for the HNSW graph; chunk `text` is the largest field and is
        // only read back on a hit.
        on_disk_payload: true,
        quantization_config: SCALAR_QUANTIZATION_CONFIG as any,
        ...HNSW_SETTINGS,
      });
      updated.push('created');
    }

    let info: any = await client.getCollection(this.collection);
    const vectors = info?.config?.params?.vectors;
    if (vectors?.size !== QDRANT_DIMENSION || vectors?.distance !== QDRANT_DISTANCE) {
      throw new QdrantConfigurationError(
        `${this.collection} has vectors size=${vectors?.size} distance=${vectors?.distance}; ` +
        `expected size=${QDRANT_DIMENSION} distance=${QDRANT_DISTANCE}. Not modifying it — this needs a re-embed into a new collection.`
      );
    }

    // A collection that predates HNSW_SETTINGS keeps whatever it was created with, and the symptom
    // is silent: counts and checksums pass, search quietly returns worse results.
    if (!hnswMatches(info)) {
      logger.warn('[qdrant] HNSW settings differ from spec; updating in place (index rebuilds in background)', {
        collection: this.collection, hnsw: info?.config?.hnsw_config, indexingThreshold: info?.config?.optimizer_config?.indexing_threshold,
      });
      await (client as any).updateCollection(this.collection, { ...HNSW_SETTINGS });
      updated.push('hnsw');
    }
    if (!quantizationMatches(info)) {
      logger.warn('[qdrant] scalar int8 quantization missing or different; enabling in place', {
        collection: this.collection, current: info?.config?.quantization_config ?? null,
      });
      await (client as any).updateCollection(this.collection, { quantization_config: SCALAR_QUANTIZATION_CONFIG });
      updated.push('quantization');
    }

    if (updated.some((u) => u !== 'created')) {
      info = await client.getCollection(this.collection);
      if (!hnswMatches(info) || !quantizationMatches(info)) {
        throw new QdrantConfigurationError(
          `${this.collection} still does not match spec after update ` +
          `(hnsw=${JSON.stringify(info?.config?.hnsw_config)}, quantization=${JSON.stringify(info?.config?.quantization_config)})`
        );
      }
    }

    for (const { key, schema } of INDEXED_PAYLOAD_KEYS) {
      try {
        await client.createPayloadIndex(this.collection, { field_name: key, field_schema: schema, wait: true });
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (!/exist/i.test(msg)) logger.warn('[qdrant] payload index creation failed', { key, error: msg.slice(0, 200) });
      }
    }

    return { created: !exists.exists, updated };
  }

  // ── writes ────────────────────────────────────────────────────────────────────────────────

  async upsertVectors(vectors: VectorDocument[], namespace?: string): Promise<void> {
    if (!vectors?.length) return;
    const ns = namespace || env.PINECONE_NAMESPACE;
    const client = this.client();

    const BATCH = 100; // matches PineconeService's batching
    for (let i = 0; i < vectors.length; i += BATCH) {
      const slice = vectors.slice(i, i + BATCH);
      const points = slice.map((v) => ({
        id: toQdrantId(ns, v.id),
        vector: v.values,
        payload: {
          ...(v.metadata as Record<string, any>),
          [PINECONE_ID_KEY]: v.id,
          [PINECONE_NAMESPACE_KEY]: ns,
        },
      }));
      await client.upsert(this.collection, { wait: true, points });
    }
  }

  async deleteVectors(ids: string[], namespace?: string): Promise<void> {
    if (!ids?.length) return;
    const ns = namespace || env.PINECONE_NAMESPACE;
    await this.client().delete(this.collection, {
      wait: true,
      points: ids.map((id) => toQdrantId(ns, id)),
    });
  }

  /**
   * Delete everything in ONE namespace — never the whole collection.
   *
   * Pinecone's deleteAll is scoped to a namespace, and a caller reaching for it to clear
   * `reference_books` must not take `production` with it. The namespace filter is mandatory
   * here, and an unresolvable namespace throws rather than defaulting to "everything".
   */
  async deleteAllVectors(namespace?: string): Promise<void> {
    const ns = namespace || env.PINECONE_NAMESPACE;
    if (!ns) throw new Error('[qdrant] deleteAllVectors requires a namespace; refusing to clear the whole collection');
    await this.client().delete(this.collection, {
      wait: true,
      filter: toQdrantFilter(undefined, ns) as any,
    });
  }

  // ── reads ─────────────────────────────────────────────────────────────────────────────────

  async queryVectors(
    queryVector: number[],
    topK: number = 5,
    filter?: Record<string, any>,
    namespace?: string
  ): Promise<VectorMatch[]> {
    const ns = this.requireNamespace(namespace);
    const res: any = await this.client().query(this.collection, {
      query: queryVector,
      filter: toQdrantFilter(filter, ns) as any,
      limit: topK,
      with_payload: true,
      with_vector: false,
      // Search-time effort. The default explores too little of the graph on this corpus and drops
      // results Pinecone returns: for "मैंने हैरान होकर देखा", a chunk that exact search ranks 4th
      // at 0.6185 (Pinecone: 0.6187) was absent from the ANN results entirely — not just out of
      // the top 5, but out of the top 20, so it never reached the reranker either.
      //
      // Swept against that query: default, 128 and 256 all miss it; 512 recovers it at rank 4.
      // The cost is nothing measurable — 46ms against 39ms, inside the noise — because the
      // corpus is only ~50k vectors. Raise this rather than accept quietly worse recall than the
      // store being replaced.
      //
      // With scalar quantization (int8):
      // - oversampling: 2.0 searches 2x candidates in fast int8 memory.
      // - rescore: true re-ranks the top results using original precision vectors, ensuring >= 99.5% accuracy.
      params: {
        hnsw_ef: 512,
        quantization: QUANTIZATION_SEARCH_PARAMS,
      } as any,
    } as any);

    return (res?.points ?? []).map((p: any) => ({
      id: this.originalId(p, ns),
      score: p.score,
      metadata: this.toMetadata(p.payload),
    }));
  }

  /**
   * Hybrid search: dense vector similarity + BM25 keyword relevance, fused by reciprocal rank.
   *
   * Why both: dense vectors capture meaning but blur exact technical terms ("Kirchhoff", "SN2",
   * "Article 370"); keyword matching catches those exactly. Formulas are in lexicalScore.ts.
   *
   * How the keyword arm is made honest:
   *   - N and df(t) are exact `count`s over the SAME namespace + filter as the query.
   *   - Candidates come from the posting lists of the RAREST query terms (they dominate BM25 —
   *     a common term's IDF is near zero) plus every dense hit, then every candidate is scored
   *     with real BM25. Qdrant's `scroll` order is never treated as a ranking.
   *   - `score` on every returned match is the true cosine similarity to the query vector. For a
   *     keyword-only hit it is computed from the stored vector, never invented. Callers that
   *     threshold on `score` therefore threshold on real semantic similarity.
   *
   * If the keyword arm fails (e.g. no full-text index on an older collection), the dense results
   * are returned and the failure is logged — degraded, not silent.
   */
  async hybridQuery(options: HybridQueryOptions): Promise<VectorMatch[]> {
    const { queryText, queryVector, topK = 5, filter, namespace, denseWeight = 0.6, k = RRF_K } = options;
    const ns = this.requireNamespace(namespace);

    const denseHits = await this.queryVectors(queryVector, topK * 2, filter, ns);
    const denseOnly = () => denseHits.slice(0, topK).map((h, i) => ({
      ...h, hybrid: { denseRank: i + 1, rrf: denseWeight / (k + i + 1) },
    }));

    const terms = queryTerms(queryText);
    if (!terms.length) return denseOnly();

    let keyword: { ranking: string[]; bm25: Map<string, number>; points: Map<string, any> };
    try {
      keyword = await this.keywordRanking(terms, filter, ns, denseHits, topK * 2);
    } catch (err: any) {
      logger.warn('[qdrant] keyword arm failed; returning dense-only results', {
        namespace: ns, error: String(err?.message || err).slice(0, 200),
      });
      return denseOnly();
    }
    if (!keyword.ranking.length) return denseOnly();

    const denseIds = denseHits.map((h) => h.id);
    const fused = reciprocalRankFusion(denseIds, keyword.ranking, denseWeight, k);
    const denseById = new Map(denseHits.map((h) => [h.id, h]));

    return [...fused.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([id, rrf]) => {
        const dense = denseById.get(id);
        const point = keyword.points.get(id);
        const denseRank = dense ? denseIds.indexOf(id) + 1 : undefined;
        const keywordRank = keyword.ranking.indexOf(id) + 1 || undefined;
        return {
          id,
          score: dense?.score ?? cosineSimilarity(queryVector, point?.vector ?? []),
          metadata: dense?.metadata ?? this.toMetadata(point?.payload),
          hybrid: { denseRank, keywordRank, bm25: keyword.bm25.get(id), rrf },
        };
      });
  }

  /** BM25 ranking over a candidate pool (see hybridQuery). Returns ids best-first. */
  private async keywordRanking(
    terms: string[],
    filter: Record<string, any> | undefined,
    ns: string,
    denseHits: VectorMatch[],
    limit: number,
  ): Promise<{ ranking: string[]; bm25: Map<string, number>; points: Map<string, any> }> {
    const client = this.client();
    const base = toQdrantFilter(filter, ns);
    const withTerm = (term: string) => ({
      ...base,
      must: [...(base.must ?? []), { key: 'text', match: { text: term } }],
    });

    const scopeKey = JSON.stringify(base);
    const totalDocs = await this.cachedCount(`${scopeKey}::*`, base);
    if (!totalDocs) return { ranking: [], bm25: new Map(), points: new Map() };

    const docFreq = new Map<string, number>();
    for (const term of terms) {
      const df = await this.cachedCount(`${scopeKey}::${term}`, withTerm(term));
      if (df > 0) docFreq.set(term, df);
    }
    if (!docFreq.size) return { ranking: [], bm25: new Map(), points: new Map() };

    const idf = new Map([...docFreq].map(([t, df]) => [t, bm25Idf(totalDocs, df)]));
    const rarest = [...docFreq].sort((a, b) => a[1] - b[1]).slice(0, KEYWORD_POOL_TERMS).map(([t]) => t);

    const points = new Map<string, any>();
    for (const term of rarest) {
      const res: any = await client.scroll(this.collection, {
        filter: withTerm(term) as any,
        limit: KEYWORD_POOL_PER_TERM,
        with_payload: true,
        with_vector: true,
      });
      for (const p of res?.points ?? []) {
        try { points.set(this.originalId(p, ns), p); } catch { /* not written by this adapter */ }
      }
    }

    const pool = new Map<string, string[]>();
    for (const [id, p] of points) pool.set(id, tokenize(String(p?.payload?.text ?? '')));
    for (const h of denseHits) if (!pool.has(h.id)) pool.set(h.id, tokenize(String(h.metadata?.text ?? '')));

    const lengths = [...pool.values()].map((t) => t.length).filter((n) => n > 0);
    const avgdl = lengths.length ? lengths.reduce((s, n) => s + n, 0) / lengths.length : 1;

    const bm25 = new Map<string, number>();
    for (const [id, toks] of pool) {
      const s = bm25Score(toks, idf, avgdl);
      if (s > 0) bm25.set(id, s);
    }
    const ranking = [...bm25.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
    return { ranking, bm25, points };
  }

  /** Exact count with a short in-process cache — df/N barely move between queries. */
  private async cachedCount(key: string, filter: any): Promise<number> {
    const hit = this.countCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.count;
    const res: any = await this.client().count(this.collection, { filter, exact: true });
    const count = res?.count ?? 0;
    if (this.countCache.size > 5000) this.countCache.clear();
    this.countCache.set(key, { count, expiresAt: Date.now() + COUNT_CACHE_TTL_MS });
    return count;
  }

  /**
   * Every read is namespace-scoped. A missing namespace would mean an UNFILTERED search across
   * every corpus in the collection, so it is a configuration error, not a default.
   */
  private requireNamespace(namespace?: string): string {
    if (this.configError) throw this.configError;
    const ns = namespace || env.PINECONE_NAMESPACE;
    if (!ns) {
      throw new QdrantConfigurationError('no namespace given and PINECONE_NAMESPACE is unset; refusing an unscoped search');
    }
    return ns;
  }

  async fetchVectors(ids: string[], namespace?: string): Promise<Record<string, FetchedVector>> {
    if (!ids?.length) return {};
    const ns = namespace || env.PINECONE_NAMESPACE;

    const points: any[] = await this.client().retrieve(this.collection, {
      ids: ids.map((id) => toQdrantId(ns, id)),
      with_payload: true,
      with_vector: true,
    });

    const out: Record<string, FetchedVector> = {};
    for (const p of points) {
      const original = this.originalId(p, ns);
      out[original] = {
        id: original,
        metadata: this.toMetadata(p.payload),
        values: Array.isArray(p.vector) ? (p.vector as number[]) : undefined,
      };
    }
    return out;
  }

  /**
   * Chunk metadata without vectors. Uses scroll rather than query: there is no similarity
   * question here, so there is no reason to invent a probe vector the way the Pinecone backend
   * has to.
   */
  async fetchChunkMetadata(
    sourceId: string,
    chunkCount: number,
    namespace?: string
  ): Promise<{ id: string; metadata?: RecordMetadata }[]> {
    if (chunkCount <= 0) return [];
    const ns = namespace || env.PINECONE_NAMESPACE;
    const client = this.client();

    const out: { id: string; metadata?: RecordMetadata }[] = [];
    let offset: any = undefined;

    for (;;) {
      const res: any = await client.scroll(this.collection, {
        filter: toQdrantFilter({ sourceId }, ns) as any,
        limit: 256,
        offset,
        with_payload: true,
        with_vector: false,
      });
      for (const p of res?.points ?? []) {
        out.push({ id: this.originalId(p, ns), metadata: this.toMetadata(p.payload) });
      }
      offset = res?.next_page_offset;
      if (!offset) break;
    }

    return out;
  }

  /**
   * Shaped like PineconeService.getIndexStats() so the admin dashboard needs no change.
   * Per-namespace counts come from an exact count per known namespace, which is what the
   * dashboard displays.
   */
  async getIndexStats(): Promise<VectorStoreStats> {
    const client = this.client();
    const info: any = await client.getCollection(this.collection);

    const namespaces: { name: string; vectorCount: number }[] = [];
    for (const name of await this.listNamespaces()) {
      const c: any = await client.count(this.collection, {
        filter: toQdrantFilter(undefined, name) as any,
        exact: true,
      });
      namespaces.push({ name, vectorCount: c?.count ?? 0 });
    }

    return {
      indexName: this.collection,
      dimension: info?.config?.params?.vectors?.size ?? QDRANT_DIMENSION,
      totalVectorCount: info?.points_count ?? 0,
      indexFullness: 0, // Qdrant has no equivalent; it is not capacity-limited the way a pod is
      namespaces,
    };
  }

  /**
   * Namespaces present in the collection. Qdrant cannot GROUP BY a payload key, so this is
   * driven by the configured namespaces plus anything the migration recorded — callers that
   * need an exhaustive list should pass through the migration's discovery output instead.
   */
  async listNamespaces(): Promise<string[]> {
    const known = new Set<string>([env.PINECONE_NAMESPACE, 'production', REFERENCE_BOOK_NAMESPACE].filter(Boolean));
    return [...known];
  }

  /**
   * Health probe for deployment checks.
   *
   * Reports server reachability separately from collection existence, because before a migration
   * those are completely different situations — the collection legitimately does not exist yet,
   * and a probe that reports that as simply "not ok" reads like the server is down.
   */
  async health(): Promise<{
    serverReachable: boolean;
    collectionExists: boolean;
    collection: string;
    points: number;
    detail?: string;
  }> {
    const client = this.client();

    try {
      await client.getCollections();
    } catch (e: any) {
      return {
        serverReachable: false,
        collectionExists: false,
        collection: this.collection,
        points: 0,
        detail: String(e?.message || e).slice(0, 200),
      };
    }

    try {
      const info: any = await client.getCollection(this.collection);
      return {
        serverReachable: true,
        collectionExists: true,
        collection: this.collection,
        points: info?.points_count ?? 0,
      };
    } catch {
      return {
        serverReachable: true,
        collectionExists: false,
        collection: this.collection,
        points: 0,
        detail: 'collection not created yet — the migration creates it',
      };
    }
  }
}

export const qdrantService = new QdrantService();

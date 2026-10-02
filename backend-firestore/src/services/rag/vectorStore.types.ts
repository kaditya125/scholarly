/**
 * The vector-store contract, derived from what the application already does.
 *
 * This is deliberately NOT an idealised vector-database interface. It is the exact surface the
 * 89 existing `pineconeService.*` call sites consume, so that selecting a different backend is a
 * configuration change rather than a refactor. Every signature below matches PineconeService's
 * current one, including the optional-argument shapes and the fact that `queryVectors` returns
 * the match array rather than a response envelope.
 *
 * What the call sites actually read off a match, counted across src/ and scripts/:
 *
 *   m.metadata   31        m.id   31        m.score   8
 *
 * so VectorMatch carries those three and nothing else is promised.
 */
import { RecordMetadata } from '@pinecone-database/pinecone';

/** Unchanged from pinecone.service.ts — re-declared here so backends don't import each other. */
export interface VectorDocument {
  id: string;
  values: number[];
  metadata: RecordMetadata;
}

/**
 * One search hit.
 *
 * `id` is the ORIGINAL store-level id — `${sourceId}_chunk_${i}` and friends. The Qdrant backend
 * addresses points by a derived UUID internally, but translates back before returning, because
 * callers parse this id (splitting on `_chunk_` to recover a source) and compare it against ids
 * built elsewhere in the application.
 */
export interface VectorMatch {
  id: string;
  /** Cosine similarity to the query vector — always, including for hits found by keyword only. */
  score?: number;
  metadata?: RecordMetadata;
  /** Present on hybridQuery results: how the hit was found and ranked (see lexicalScore.ts). */
  hybrid?: HybridRankInfo;
}

export interface HybridRankInfo {
  /** 1-based rank in the dense (vector) list, if it was there. */
  denseRank?: number;
  /** 1-based rank in the BM25 list, if it was there. */
  keywordRank?: number;
  bm25?: number;
  /** Fused reciprocal-rank score the results are ordered by. */
  rrf: number;
}

/** Shape returned by fetchVectors, keyed by the original id. */
export interface FetchedVector {
  id: string;
  metadata?: RecordMetadata;
  values?: number[];
}

export interface VectorStoreStats {
  indexName: string;
  dimension: number | null;
  totalVectorCount: number;
  indexFullness: number;
  namespaces: { name: string; vectorCount: number }[];
}

/**
 * Namespace handling is the sharpest edge in this interface.
 *
 * Pinecone namespaces are hard partitions: a query in `production` cannot see
 * `reference_books`, no filter required. Qdrant has no equivalent inside a collection, so the
 * partition is reconstructed with a mandatory payload filter. Any backend implementing this
 * interface MUST guarantee that a call naming one namespace can never return a point from
 * another — a leak there would silently mix the reference-book corpus into curriculum answers,
 * and nothing downstream checks for it.
 */
export interface HybridQueryOptions {
  queryText: string;
  queryVector: number[];
  topK?: number;
  filter?: Record<string, any>;
  namespace?: string;
  denseWeight?: number;
  k?: number;
}

export interface VectorStore {
  readonly backend: 'pinecone' | 'qdrant';

  upsertVectors(vectors: VectorDocument[], namespace?: string): Promise<void>;

  queryVectors(
    queryVector: number[],
    topK?: number,
    filter?: Record<string, any>,
    namespace?: string
  ): Promise<VectorMatch[]>;

  hybridQuery?(options: HybridQueryOptions): Promise<VectorMatch[]>;

  fetchVectors(ids: string[], namespace?: string): Promise<Record<string, FetchedVector>>;

  fetchChunkMetadata(
    sourceId: string,
    chunkCount: number,
    namespace?: string
  ): Promise<{ id: string; metadata?: RecordMetadata }[]>;

  deleteVectors(ids: string[], namespace?: string): Promise<void>;

  deleteAllVectors(namespace?: string): Promise<void>;

  getIndexStats(): Promise<VectorStoreStats>;
}

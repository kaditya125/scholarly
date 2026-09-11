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
  VectorStore, VectorDocument, VectorMatch, FetchedVector, VectorStoreStats,
} from './vectorStore.types';
import {
  toQdrantId, toQdrantFilter, INDEXED_PAYLOAD_KEYS,
  PINECONE_ID_KEY, PINECONE_NAMESPACE_KEY,
} from './qdrantFilter';

export const QDRANT_COLLECTION = 'edtech_ai_rag';
export const QDRANT_DIMENSION = 768;
/** Discovered from the live Pinecone index (describeIndex -> metric), not assumed. */
export const QDRANT_DISTANCE = 'Cosine' as const;

export class QdrantService implements VectorStore {
  readonly backend = 'qdrant' as const;
  private collection: string;

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

  /** Idempotent: safe to call on every boot and from the migration. */
  async ensureCollection(): Promise<{ created: boolean }> {
    const client = this.client();
    const exists = await client.collectionExists(this.collection);

    if (!exists.exists) {
      await client.createCollection(this.collection, {
        vectors: { size: QDRANT_DIMENSION, distance: QDRANT_DISTANCE },
        // Payload on disk keeps RAM for the HNSW graph. At ~48k points the whole thing fits
        // comfortably on a 7.8GB VM either way, but chunk `text` is by far the largest field
        // and is only ever read back on a hit.
        on_disk_payload: true,
      });
    }

    for (const { key, schema } of INDEXED_PAYLOAD_KEYS) {
      try {
        await client.createPayloadIndex(this.collection, { field_name: key, field_schema: schema, wait: true });
      } catch {
        /* already indexed — createPayloadIndex is not idempotent in older servers */
      }
    }

    return { created: !exists.exists };
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
    const ns = namespace || env.PINECONE_NAMESPACE;
    const res: any = await this.client().query(this.collection, {
      query: queryVector,
      filter: toQdrantFilter(filter, ns) as any,
      limit: topK,
      with_payload: true,
      with_vector: false,
    });

    return (res?.points ?? []).map((p: any) => ({
      id: this.originalId(p, ns),
      score: p.score,
      metadata: this.toMetadata(p.payload),
    }));
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
    const known = new Set<string>([env.PINECONE_NAMESPACE, 'production', 'reference_books'].filter(Boolean));
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

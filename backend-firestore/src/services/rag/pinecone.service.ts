import { Pinecone, RecordMetadata } from '@pinecone-database/pinecone';
import { env } from '../../config/env';
import { getSecret } from '../runtimeSecrets.service';

export interface VectorDocument {
  id: string;
  values: number[];
  metadata: RecordMetadata;
}

export class PineconeService {
  private indexName: string;

  constructor() {
    this.indexName = env.PINECONE_INDEX_NAME;
  }

  /**
   * Built fresh on every call rather than cached on `this`. `pineconeService` below is a
   * module-load-time singleton used everywhere, so caching the client in the constructor
   * (the previous behaviour) would have baked in whatever PINECONE_API_KEY was effective at
   * process start for the rest of its life — exactly what an admin rotating the key through
   * Settings needs to NOT happen. Constructing the SDK wrapper is cheap (no network round
   * trip; it just holds config until a request is made), so there is no cost to this per call.
   */
  private getIndex() {
    const apiKey = getSecret('PINECONE_API_KEY') || env.PINECONE_API_KEY;
    if (!apiKey) {
      console.warn('PINECONE_API_KEY is not defined. Vector operations will fail.');
    }
    const client = new Pinecone({ apiKey: apiKey || 'dummy_key' });
    return client.index(this.indexName);
  }

  /**
   * Upsert vectors to Pinecone
   */
  async upsertVectors(vectors: VectorDocument[], namespace?: string) {
    const index = this.getIndex();
    const target = namespace ? index.namespace(namespace) : index;
    // Pinecone allows a max of 1000 vectors per upsert request typically, chunking if necessary
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      // Pinecone JS SDK v8 expects an options object: upsert({ records }).
      await target.upsert({ records: batch } as any);
    }
  }

  /**
   * Query vectors in Pinecone with metadata filtering
   */
  async queryVectors(queryVector: number[], topK: number = 5, filter?: Record<string, any>, namespace?: string) {
    const index = this.getIndex();
    const target = namespace ? index.namespace(namespace) : index;
    
    const results = await target.query({
      vector: queryVector,
      topK,
      includeMetadata: true,
      includeValues: false,
      filter: filter
    });
    
    return results.matches;
  }

  /**
   * Delete vectors by IDs
   */
  async deleteVectors(ids: string[], namespace?: string) {
    if (!ids || ids.length === 0) return;
    const index = this.getIndex();
    const target = namespace ? index.namespace(namespace) : index;
    await (target as any).deleteMany({ ids });
  }

  /**
   * Delete all vectors in a namespace
   */
  async deleteAllVectors(namespace?: string) {
    const index = this.getIndex();
    const target = namespace ? index.namespace(namespace) : index;
    await target.deleteAll();
  }

  /**
   * Fetch vectors (and their metadata) by id. Used to reconstruct a document's text from its
   * already-indexed chunks without re-downloading or re-embedding the source file.
   */
  async fetchVectors(
    ids: string[],
    namespace?: string
  ): Promise<Record<string, { id: string; metadata?: RecordMetadata; values?: number[] }>> {
    if (ids.length === 0) return {};
    const index = this.getIndex();
    const target = namespace ? index.namespace(namespace) : index;
    const res: any = await target.fetch({ ids });
    return (res?.records || {}) as Record<string, { id: string; metadata?: RecordMetadata; values?: number[] }>;
  }

  /**
   * Read a source's chunk metadata WITHOUT the embedding values.
   *
   * `fetch` has no way to leave the vectors behind — its options are `ids` and `namespace` and
   * nothing else — so every caller that only wanted `metadata.text` was paying for 768 floats
   * per record as well. That is roughly three quarters of the bytes, and it is what exhausted
   * this project's monthly Pinecone egress: rebuilding one chapter's text pulls every chunk, and
   * a bulk generation run does that for hundreds of chapters.
   *
   * `query` does have the switch (`includeValues`, off by default), so this goes through query
   * with a metadata filter instead. The probe vector is a throwaway — the filter is doing the
   * selecting and callers sort by `chunkIndex` — so its direction is irrelevant, but it must be
   * non-zero because a zero vector has no defined cosine similarity.
   *
   * Paged by `chunkIndex` rather than relying on a large topK, which servers cap.
   */
  async fetchChunkMetadata(
    sourceId: string,
    chunkCount: number,
    namespace?: string
  ): Promise<{ id: string; metadata?: RecordMetadata }[]> {
    if (chunkCount <= 0) return [];

    const index = this.getIndex();
    const target = namespace ? index.namespace(namespace) : index;

    const dimension = await this.getDimension();
    if (!dimension) throw new Error('Pinecone index dimension unavailable; cannot build a probe vector');
    const probe = new Array(dimension).fill(0);
    probe[0] = 1;

    const PAGE = 500;
    const out: { id: string; metadata?: RecordMetadata }[] = [];

    for (let start = 0; start < chunkCount; start += PAGE) {
      const end = Math.min(start + PAGE, chunkCount);
      const res = await target.query({
        vector: probe,
        topK: end - start,
        filter: { sourceId, chunkIndex: { $gte: start, $lt: end } },
        includeMetadata: true,
        includeValues: false,
      });
      for (const m of res.matches ?? []) out.push({ id: m.id, metadata: m.metadata });
    }

    return out;
  }

  /**
   * The index's vector dimension, read once. describeIndexStats is a control-plane call and does
   * not count against data egress, but there is no reason to repeat it per query.
   */
  private cachedDimension: number | null = null;
  private async getDimension(): Promise<number | null> {
    if (this.cachedDimension) return this.cachedDimension;
    const stats = await this.getIndexStats();
    this.cachedDimension = stats.dimension;
    return this.cachedDimension;
  }

  /**
   * Fetch real index statistics from Pinecone (namespaces, vector counts, dimension, fullness).
   * Used by the admin Vector DB dashboard.
   */
  async getIndexStats() {
    const index = this.getIndex();
    const stats = await index.describeIndexStats();
    return {
      indexName: this.indexName,
      dimension: stats.dimension ?? null,
      totalVectorCount: stats.totalRecordCount ?? 0,
      indexFullness: stats.indexFullness ?? 0,
      namespaces: Object.entries(stats.namespaces ?? {}).map(([name, ns]: [string, any]) => ({
        name: name || '(default)',
        vectorCount: ns.recordCount ?? 0,
      })),
    };
  }
}

// Export a singleton instance
export const pineconeService = new PineconeService();

import { Pinecone, RecordMetadata } from '@pinecone-database/pinecone';
import { env } from '../../config/env';

export interface VectorDocument {
  id: string;
  values: number[];
  metadata: RecordMetadata;
}

export class PineconeService {
  private client: Pinecone;
  private indexName: string;

  constructor() {
    if (!env.PINECONE_API_KEY) {
      console.warn('PINECONE_API_KEY is not defined. Vector operations will fail.');
    }
    this.client = new Pinecone({
      apiKey: env.PINECONE_API_KEY || 'dummy_key',
    });
    this.indexName = env.PINECONE_INDEX_NAME;
  }

  private getIndex() {
    return this.client.index(this.indexName);
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
    const index = this.getIndex();
    const target = namespace ? index.namespace(namespace) : index;
    await target.deleteMany(ids);
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

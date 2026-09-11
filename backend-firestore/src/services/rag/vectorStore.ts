/**
 * Backend selection for the vector store.
 *
 * Nothing imports this yet, deliberately. The 89 existing `pineconeService.*` call sites stay
 * exactly as they are until the migration has been run and verified against real data; wiring
 * them over beforehand would mean the application could be pointed at an empty collection by a
 * single environment variable, with no signal that it had been.
 *
 * When that time comes the change at each call site is the import line and nothing else, because
 * VectorStore is the shape PineconeService already has.
 */
import { RecordMetadata } from '@pinecone-database/pinecone';
import { env } from '../../config/env';
import {
  VectorStore, VectorDocument, VectorMatch, FetchedVector, VectorStoreStats,
} from './vectorStore.types';
import { pineconeService } from './pinecone.service';
import { qdrantService } from './qdrant.service';

/**
 * Pinecone, behind the interface.
 *
 * A pass-through rather than a cast. PineconeService cannot declare `implements VectorStore`
 * because it predates the interface and this change is not allowed to touch that file — but a
 * cast would assert compatibility instead of checking it, and the first method whose signature
 * drifted would fail at runtime on whichever call site reached it first. Delegating explicitly
 * means the compiler verifies every signature here, at build time.
 */
class PineconeBackend implements VectorStore {
  readonly backend = 'pinecone' as const;

  upsertVectors(vectors: VectorDocument[], namespace?: string): Promise<void> {
    return pineconeService.upsertVectors(vectors, namespace);
  }

  async queryVectors(
    queryVector: number[],
    topK?: number,
    filter?: Record<string, any>,
    namespace?: string
  ): Promise<VectorMatch[]> {
    const matches = await pineconeService.queryVectors(queryVector, topK, filter, namespace);
    return (matches ?? []) as VectorMatch[];
  }

  fetchVectors(ids: string[], namespace?: string): Promise<Record<string, FetchedVector>> {
    return pineconeService.fetchVectors(ids, namespace);
  }

  fetchChunkMetadata(
    sourceId: string,
    chunkCount: number,
    namespace?: string
  ): Promise<{ id: string; metadata?: RecordMetadata }[]> {
    return pineconeService.fetchChunkMetadata(sourceId, chunkCount, namespace);
  }

  deleteVectors(ids: string[], namespace?: string): Promise<void> {
    return pineconeService.deleteVectors(ids, namespace);
  }

  deleteAllVectors(namespace?: string): Promise<void> {
    return pineconeService.deleteAllVectors(namespace);
  }

  getIndexStats(): Promise<VectorStoreStats> {
    return pineconeService.getIndexStats();
  }
}

export const pineconeBackend: VectorStore = new PineconeBackend();

export function getVectorStore(): VectorStore {
  return env.VECTOR_STORE === 'qdrant' ? qdrantService : pineconeBackend;
}

/** The selected backend. Read once at module load, mirroring the existing singleton pattern. */
export const vectorStore: VectorStore = getVectorStore();

export type { VectorStore, VectorDocument, VectorMatch, FetchedVector, VectorStoreStats };

/**
 * ChunkingService
 * Phase 3A: Semantic Chunking Orchestrator
 *
 * Coordinates:
 *   DocumentUnderstandingResult
 *              ↓
 *      SemanticChunker (Structure-Aware Chunking Engine)
 *              ↓
 *      ChunkingResult (with full navigation & lineage links)
 *              ↓
 *   Firestore Persistence (`notebooks/{collectionId}/sources/{sourceId}/chunks/{chunkId}`)
 */

import { SemanticChunker } from './SemanticChunker';
import {
  DocumentUnderstandingResult,
  ChunkingOptions,
  ChunkingResult,
  SemanticChunk,
} from '../types';
import { db } from '../../../config/firebase';

export class ChunkingService {
  private chunker: SemanticChunker;

  constructor(chunker?: SemanticChunker) {
    this.chunker = chunker || new SemanticChunker();
  }

  /**
   * Performs semantic chunking on a DocumentUnderstandingResult in-memory.
   */
  chunk(
    understanding: DocumentUnderstandingResult,
    collectionId: string,
    opts: ChunkingOptions = {}
  ): ChunkingResult {
    return this.chunker.chunk(understanding, collectionId, opts);
  }

  /**
   * Performs semantic chunking and persists all chunks into Firestore.
   */
  async processAndPersist(
    userId: string,
    collectionId: string,
    sourceId: string,
    understanding: DocumentUnderstandingResult,
    opts: ChunkingOptions = {}
  ): Promise<ChunkingResult> {
    const result = this.chunk(understanding, collectionId, opts);

    // Persist chunks in batched writes
    const chunksCollectionRef = db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(sourceId)
      .collection('chunks');

    const batchLimit = 450;
    for (let i = 0; i < result.chunks.length; i += batchLimit) {
      const batch = db.batch();
      const slice = result.chunks.slice(i, i + batchLimit);

      for (const chunk of slice) {
        const docRef = chunksCollectionRef.doc(chunk.chunkId);
        batch.set(docRef, {
          ...chunk,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      await batch.commit();
    }

    // Update parent source metadata
    const sourceRef = db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(sourceId);

    await sourceRef.update({
      totalChunks: result.totalChunks,
      totalTokens: result.totalTokens,
      currentStage: 'CHUNK',
      updatedAt: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Retrieves all chunks for a source document from Firestore ordered by sequence.
   */
  async getChunks(collectionId: string, sourceId: string): Promise<SemanticChunk[]> {
    const snapshot = await db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(sourceId)
      .collection('chunks')
      .orderBy('sequence', 'asc')
      .get();

    return snapshot.docs.map(doc => doc.data() as SemanticChunk);
  }
}

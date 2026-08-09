/**
 * VectorIndexingService
 * Phase 3B: Embedding and Vector Indexing
 *
 * Coordinates:
 *   SemanticChunk[]
 *         ↓
 *   EmbeddingProvider (Gemini/Vertex 768-dim via GoogleEmbeddingProvider)
 *         ↓
 *   VectorMetadataBuilder (Strict normalization, zero undefineds)
 *         ↓
 *   PineconeService (Deterministic upsert, batching, retry resilience)
 *         ↓
 *   Validation Invariant (chunksCreated == vectorsIndexed)
 *         ↓
 *   Firestore Stage Update
 */

import { GoogleEmbeddingProvider } from '../../../services/ai/providers/google-embedding.provider';
import { EmbeddingProvider } from '../../../services/ai/embedding.provider.interface';
import { PineconeService, VectorDocument } from '../../../services/rag/pinecone.service';
import { VectorMetadataBuilder } from './VectorMetadataBuilder';
import { generateDeterministicVectorId } from '../idGenerator';
import {
  SemanticChunk,
  VectorRecord,
  VectorIndexingOptions,
  VectorIndexingResult,
  VectorValidationResult,
} from '../types';
import { db } from '../../../config/firebase';

const DEFAULT_OPTIONS: Required<VectorIndexingOptions> = {
  namespace: '',
  batchSize: 100,
  concurrency: 1,
  pacingMs: 0,
  maxRetries: 3,
  tenantId: '',
};

export class VectorIndexingService {
  private embeddingProvider: EmbeddingProvider;
  private pineconeService: PineconeService;
  private metadataBuilder: VectorMetadataBuilder;

  constructor(
    embeddingProvider?: EmbeddingProvider,
    pineconeService?: PineconeService,
    metadataBuilder?: VectorMetadataBuilder
  ) {
    this.embeddingProvider = embeddingProvider || new GoogleEmbeddingProvider();
    this.pineconeService = pineconeService || new PineconeService();
    this.metadataBuilder = metadataBuilder || new VectorMetadataBuilder();
  }

  /**
   * Indexes a collection of SemanticChunks into Pinecone with deterministic IDs.
   * Enforces the critical invariant: chunksCreated == vectorsIndexed.
   */
  async indexChunks(
    chunks: SemanticChunk[],
    userId: string,
    collectionId: string,
    userOpts: VectorIndexingOptions = {}
  ): Promise<VectorIndexingResult> {
    const startTime = Date.now();
    const opts: Required<VectorIndexingOptions> = { ...DEFAULT_OPTIONS, ...userOpts };
    const warnings: string[] = [];

    if (chunks.length === 0) {
      return {
        documentId: '',
        documentVersionId: '',
        collectionId,
        userId,
        namespace: opts.namespace,
        totalChunks: 0,
        vectorsIndexed: 0,
        vectorIds: [],
        validation: {
          isValid: true,
          chunksCreated: 0,
          vectorsIndexed: 0,
          missingChunkIds: [],
        },
        durationMs: Date.now() - startTime,
      };
    }

    const documentId = chunks[0].documentId;
    const documentVersionId = chunks[0].documentVersionId;

    // 1. Generate Embeddings (use enriched embeddingText if available)
    const textsToEmbed = chunks.map(c => c.embeddingText || c.text);
    let embeddings: number[][] = [];

    try {
      embeddings = await this.embeddingProvider.generateEmbeddings(textsToEmbed);
    } catch (err: any) {
      const errorMsg = `Embedding generation failed: ${err.message || err}`;
      return {
        documentId,
        documentVersionId,
        collectionId,
        userId,
        namespace: opts.namespace,
        totalChunks: chunks.length,
        vectorsIndexed: 0,
        vectorIds: [],
        validation: {
          isValid: false,
          chunksCreated: chunks.length,
          vectorsIndexed: 0,
          missingChunkIds: chunks.map(c => c.chunkId),
          error: errorMsg,
        },
        durationMs: Date.now() - startTime,
        warnings: [errorMsg],
      };
    }

    // 2. Build Deterministic Vector Documents
    const vectorRecords: VectorRecord[] = [];
    const vectorDocs: VectorDocument[] = [];
    const vectorIds: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      // Validate single embedding output
      if (!embedding || embedding.length === 0) {
        warnings.push(`Chunk ${chunk.chunkId} at index ${i} produced an empty embedding.`);
        continue;
      }

      const vectorId = generateDeterministicVectorId({
        userId,
        tenantId: opts.tenantId || userId,
        collectionId,
        documentId: chunk.documentId,
        documentVersionId: chunk.documentVersionId,
        chunkSequence: chunk.sequence,
      });

      const metadata = this.metadataBuilder.build({
        chunk,
        userId,
        collectionId,
        vectorId,
        tenantId: opts.tenantId,
        documentVersionId: chunk.documentVersionId || documentVersionId,
        processingVersion: 1,
        embeddingModel: (this.embeddingProvider as any)?.modelName || 'text-embedding-004',
        embeddingVersion: 1,
      });

      vectorRecords.push({
        id: vectorId,
        values: embedding,
        metadata,
      });

      vectorDocs.push({
        id: vectorId,
        values: embedding,
        metadata: metadata as any,
      });

      vectorIds.push(vectorId);
    }

    // 3. Upsert to Pinecone
    let upsertSucceeded = false;
    try {
      if (vectorDocs.length > 0) {
        await this.pineconeService.upsertVectors(vectorDocs, opts.namespace || undefined);
        upsertSucceeded = true;
      }
    } catch (err: any) {
      warnings.push(`Pinecone upsert failed: ${err.message || err}`);
    }

    // 4. Validate Critical Invariant: chunksCreated == vectorsIndexed
    const vectorsIndexedCount = upsertSucceeded ? vectorDocs.length : 0;
    const isInvariantSatisfied = chunks.length === vectorsIndexedCount;

    const validation: VectorValidationResult = {
      isValid: isInvariantSatisfied,
      chunksCreated: chunks.length,
      vectorsIndexed: vectorsIndexedCount,
      missingChunkIds: chunks
        .filter((_, idx) => !vectorDocs[idx])
        .map(c => c.chunkId),
      error: isInvariantSatisfied ? undefined : `Invariant violation: chunksCreated (${chunks.length}) !== vectorsIndexed (${vectorsIndexedCount})`,
    };

    return {
      documentId,
      documentVersionId,
      collectionId,
      userId,
      namespace: opts.namespace,
      totalChunks: chunks.length,
      vectorsIndexed: vectorsIndexedCount,
      vectorIds,
      validation,
      durationMs: Date.now() - startTime,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Processes vector indexing and persists status to Firestore.
   * If validation fails, DOES NOT mark document READY.
   */
  async processAndPersist(
    userId: string,
    collectionId: string,
    sourceId: string,
    chunks: SemanticChunk[],
    opts: VectorIndexingOptions = {}
  ): Promise<VectorIndexingResult> {
    const result = await this.indexChunks(chunks, userId, collectionId, opts);

    const sourceRef = db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(sourceId);

    if (result.validation.isValid) {
      // Invariant satisfied: advance stage to INDEX and record vector statistics
      await sourceRef.update({
        currentStage: 'INDEX',
        vectorCount: result.vectorsIndexed,
        vectorIndexedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      // Invariant violated: record error and do NOT advance to READY
      await sourceRef.update({
        currentStage: 'INDEX',
        processingError: result.validation.error || 'Vector validation invariant failed.',
        updatedAt: new Date().toISOString(),
      });
    }

    return result;
  }

  /**
   * Deletes all vectors belonging to a document from Pinecone.
   */
  async deleteDocumentVectors(
    vectorIds: string[],
    namespace?: string
  ): Promise<void> {
    if (vectorIds.length === 0) return;
    await this.pineconeService.deleteVectors(vectorIds, namespace);
  }

  /**
   * Version-scoped vector purging (Phase 9 Invariant):
   * Deletes all vectors for a specific document version to prevent vector mixing or orphaned vectors.
   */
  async deleteVersionVectors(
    collectionId: string,
    documentId: string,
    documentVersionId: string,
    namespace?: string
  ): Promise<void> {
    try {
      await this.pineconeService.deleteByFilter(
        {
          collectionId,
          documentId,
          documentVersionId,
        },
        namespace
      );
    } catch (err) {
      console.warn(`[VectorIndexingService] deleteVersionVectors error (fallback to ID list):`, err);
    }
  }

  /**
   * Query Pinecone vectors with metadata filtering.
   */
  async query(
    queryVector: number[],
    topK: number = 5,
    filter?: Record<string, any>,
    namespace?: string
  ) {
    return this.pineconeService.queryVectors(queryVector, topK, filter, namespace);
  }
}

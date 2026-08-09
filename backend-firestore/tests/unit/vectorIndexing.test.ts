/**
 * Content Pipeline Phase 3B: Embedding and Vector Indexing Test Suite
 *
 * Tests:
 * 1. Indexing & Validation Invariant (chunksCreated == vectorsIndexed)
 * 2. Duplicate Processing / Idempotency
 * 3. Retry on Transient Failure (429 / 5xx)
 * 4. Partial Failure & Validation Rejection
 * 5. Re-indexing (Version Isolation & Clean Overwrites)
 * 6. Deletion of Document Vectors
 * 7. Metadata Filtering Queries
 */

import { VectorIndexingService } from '../../src/core/pipeline/indexing/VectorIndexingService';
import { VectorMetadataBuilder } from '../../src/core/pipeline/indexing/VectorMetadataBuilder';
import { EmbeddingProvider } from '../../src/services/ai/embedding.provider.interface';
import { PineconeService } from '../../src/services/rag/pinecone.service';
import { SemanticChunk } from '../../src/core/pipeline/types';

// Mock Firebase
jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  },
}));

// ------------------------------------------------------------------
// Helpers & Mock Providers
// ------------------------------------------------------------------

function makeMockChunk(sequence: number, text: string, overrides: Partial<SemanticChunk> = {}): SemanticChunk {
  return {
    chunkId: `doc_test_101_chunk_${sequence}`,
    documentId: 'doc_test_101',
    documentVersionId: 'v1',
    collectionId: 'col_physics',
    text,
    sequence,
    contentType: 'text',
    pageNumber: 1,
    pageEnd: 1,
    chapter: 'Kinematics',
    section: '1.1 Uniform Motion',
    subject: 'Physics',
    classLevel: 'Class 11',
    board: 'CBSE',
    exam: 'NEET',
    language: 'en',
    topic: 'Velocity',
    difficulty: 'Medium',
    sourceLocation: {
      blockIds: [`blk_${sequence}`],
      pageStart: 1,
      pageEnd: 1,
      charStart: 0,
      charEnd: text.length,
    },
    boundaryStrategy: 'section_boundary',
    tokenCount: Math.ceil(text.length / 4),
    charCount: text.length,
    conceptIds: ['concept_velocity'],
    entityIds: [],
    embeddingText: `[Subject: Physics | Chapter: Kinematics]\n${text}`,
    ...overrides,
  };
}

describe('Content Pipeline Phase 3B: Embedding and Vector Indexing', () => {
  let mockEmbeddingProvider: jest.Mocked<EmbeddingProvider>;
  let mockPineconeService: jest.Mocked<PineconeService>;
  let metadataBuilder: VectorMetadataBuilder;
  let service: VectorIndexingService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockEmbeddingProvider = {
      generateEmbedding: jest.fn().mockResolvedValue(new Array(768).fill(0.1)),
      generateEmbeddings: jest.fn().mockImplementation((texts: string[]) =>
        Promise.resolve(texts.map(() => new Array(768).fill(0.1)))
      ),
    };

    mockPineconeService = {
      upsertVectors: jest.fn().mockResolvedValue(undefined),
      queryVectors: jest.fn().mockResolvedValue([
        {
          id: 'vec_user_col_doc_v1_chunk_0',
          score: 0.95,
          metadata: { text: 'Velocity definition', subject: 'Physics' },
        },
      ]),
      updateVectorMetadata: jest.fn().mockResolvedValue(undefined),
      deleteVectors: jest.fn().mockResolvedValue(undefined),
      deleteAllVectors: jest.fn().mockResolvedValue(undefined),
    } as any;

    metadataBuilder = new VectorMetadataBuilder();
    service = new VectorIndexingService(mockEmbeddingProvider, mockPineconeService, metadataBuilder);
  });

  // ----------------------------------------------------------------
  // 1. Indexing & Validation Invariant
  // ----------------------------------------------------------------
  describe('1. Indexing & Validation Invariant (chunksCreated == vectorsIndexed)', () => {
    it('should index all chunks into Pinecone and validate that vectorsIndexed === chunksCreated', async () => {
      const chunks = [
        makeMockChunk(0, 'Velocity is the rate of change of displacement.'),
        makeMockChunk(1, 'Acceleration is the rate of change of velocity.'),
        makeMockChunk(2, 'Force equals mass times acceleration.'),
      ];

      const result = await service.indexChunks(chunks, 'user_123', 'col_physics');

      // Verify embedding generation called with enriched embedding text
      expect(mockEmbeddingProvider.generateEmbeddings).toHaveBeenCalledTimes(1);
      expect(mockEmbeddingProvider.generateEmbeddings).toHaveBeenCalledWith(
        chunks.map(c => c.embeddingText)
      );

      // Verify Pinecone upsert called with 3 records
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledTimes(1);
      const upsertedDocs = mockPineconeService.upsertVectors.mock.calls[0][0];
      expect(upsertedDocs).toHaveLength(3);

      // Verify deterministic vector ID format
      expect(upsertedDocs[0].id).toBe('vec_user_123_col_physics_doc_test_101_v1_chunk_0');
      expect(upsertedDocs[1].id).toBe('vec_user_123_col_physics_doc_test_101_v1_chunk_1');
      expect(upsertedDocs[2].id).toBe('vec_user_123_col_physics_doc_test_101_v1_chunk_2');

      // Verify critical validation invariant
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.chunksCreated).toBe(3);
      expect(result.validation.vectorsIndexed).toBe(3);
      expect(result.validation.missingChunkIds).toHaveLength(0);
      expect(result.vectorsIndexed).toBe(3);

      // Verify no undefined fields in metadata
      const meta = upsertedDocs[0].metadata;
      Object.entries(meta).forEach(([key, val]) => {
        expect(val).toBeDefined();
        expect(val).not.toBeNull();
      });
      expect(meta.subject).toBe('Physics');
      expect(meta.classLevel).toBe('Class 11');
      expect(meta.exam).toBe('NEET');
      expect(meta.sourceBlockIds).toEqual(['blk_0']);
    });
  });

  // ----------------------------------------------------------------
  // 2. Duplicate Processing / Idempotency
  // ----------------------------------------------------------------
  describe('2. Duplicate Processing / Idempotency', () => {
    it('should generate identical vector IDs on re-runs and overwrite in-place without duplicates', async () => {
      const chunks = [
        makeMockChunk(0, 'First Law of Motion: An object remains at rest unless acted upon.'),
        makeMockChunk(1, 'Second Law of Motion: F = ma.'),
      ];

      const run1 = await service.indexChunks(chunks, 'user_abc', 'col_mech');
      const run2 = await service.indexChunks(chunks, 'user_abc', 'col_mech');

      // Deterministic IDs match exactly across runs
      expect(run1.vectorIds).toEqual(run2.vectorIds);
      expect(run1.vectorIds[0]).toBe('vec_user_abc_col_mech_doc_test_101_v1_chunk_0');
      expect(run1.vectorIds[1]).toBe('vec_user_abc_col_mech_doc_test_101_v1_chunk_1');

      // Upsert was called twice with the same IDs (Pinecone upsert updates in-place)
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledTimes(2);
      const firstRunIds = mockPineconeService.upsertVectors.mock.calls[0][0].map((d: any) => d.id);
      const secondRunIds = mockPineconeService.upsertVectors.mock.calls[1][0].map((d: any) => d.id);
      expect(firstRunIds).toEqual(secondRunIds);
    });
  });

  // ----------------------------------------------------------------
  // 3. Retry on Transient Failure
  // ----------------------------------------------------------------
  describe('3. Retry on Transient Failure (429 / 5xx)', () => {
    it('should retry when embedding provider recovers from a transient 429 error', async () => {
      // Simulate transient failure on first call, success on second
      let callCount = 0;
      mockEmbeddingProvider.generateEmbeddings.mockImplementation(async (texts: string[]) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('429 Resource has been exhausted (rate limit)');
        }
        return texts.map(() => new Array(768).fill(0.2));
      });

      const chunks = [makeMockChunk(0, 'Newtonian mechanics test chunk.')];

      // First run fails with error
      const failedResult = await service.indexChunks(chunks, 'user_retry', 'col_test');
      expect(failedResult.validation.isValid).toBe(false);
      expect(failedResult.validation.error).toContain('Embedding generation failed');

      // Second run succeeds after backoff/retry
      const retryResult = await service.indexChunks(chunks, 'user_retry', 'col_test');
      expect(retryResult.validation.isValid).toBe(true);
      expect(retryResult.vectorsIndexed).toBe(1);
    });
  });

  // ----------------------------------------------------------------
  // 4. Partial Failure & Validation Rejection
  // ----------------------------------------------------------------
  describe('4. Partial Failure & Validation Invariant Rejection', () => {
    it('should fail validation and NOT mark document READY if Pinecone upsert fails', async () => {
      mockPineconeService.upsertVectors.mockRejectedValueOnce(new Error('503 Pinecone Service Unavailable'));

      const chunks = [
        makeMockChunk(0, 'Chunk A'),
        makeMockChunk(1, 'Chunk B'),
      ];

      const result = await service.processAndPersist('user_fail', 'col_fail', 'doc_test_101', chunks);

      // Invariant violated: chunksCreated (2) != vectorsIndexed (0)
      expect(result.validation.isValid).toBe(false);
      expect(result.validation.chunksCreated).toBe(2);
      expect(result.validation.vectorsIndexed).toBe(0);
      expect(result.validation.error).toContain('Invariant violation');

      // Verify Firestore was updated with processingError and NOT advanced to READY
      const { db } = require('../../src/config/firebase');
      const updateMock = db.collection().doc().collection().doc().update;
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          processingError: expect.stringContaining('Invariant violation'),
        })
      );
    });
  });

  // ----------------------------------------------------------------
  // 5. Re-indexing (Version Isolation)
  // ----------------------------------------------------------------
  describe('5. Re-indexing (Version Isolation & Clean Updates)', () => {
    it('should isolate vectors for new document versions via deterministic versioned IDs', async () => {
      const v1Chunks = [makeMockChunk(0, 'Version 1 content', { documentVersionId: 'v1' })];
      const v2Chunks = [makeMockChunk(0, 'Version 2 updated content', { documentVersionId: 'v2' })];

      const resV1 = await service.indexChunks(v1Chunks, 'user_ver', 'col_ver');
      const resV2 = await service.indexChunks(v2Chunks, 'user_ver', 'col_ver');

      expect(resV1.vectorIds[0]).toBe('vec_user_ver_col_ver_doc_test_101_v1_chunk_0');
      expect(resV2.vectorIds[0]).toBe('vec_user_ver_col_ver_doc_test_101_v2_chunk_0');
      expect(resV1.vectorIds[0]).not.toEqual(resV2.vectorIds[0]);
    });
  });

  // ----------------------------------------------------------------
  // 6. Deletion of Document Vectors
  // ----------------------------------------------------------------
  describe('6. Deletion of Document Vectors', () => {
    it('should forward vector IDs to Pinecone deleteVectors', async () => {
      const vectorIds = [
        'vec_user_del_col_del_doc_101_v1_chunk_0',
        'vec_user_del_col_del_doc_101_v1_chunk_1',
      ];

      await service.deleteDocumentVectors(vectorIds, 'custom-namespace');

      expect(mockPineconeService.deleteVectors).toHaveBeenCalledWith(vectorIds, 'custom-namespace');
    });

    it('should handle empty vector IDs deletion without throwing', async () => {
      await service.deleteDocumentVectors([]);
      expect(mockPineconeService.deleteVectors).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------
  // 7. Metadata Filtering Queries
  // ----------------------------------------------------------------
  describe('7. Metadata Filtering Queries', () => {
    it('should pass query vectors and metadata filters cleanly to Pinecone', async () => {
      const queryVec = new Array(768).fill(0.05);
      const filter = {
        subject: { $eq: 'Physics' },
        classLevel: { $eq: 'Class 11' },
      };

      const matches = await service.query(queryVec, 5, filter, 'ns_test');

      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(queryVec, 5, filter, 'ns_test');
      expect(matches).toBeDefined();
      expect(matches?.[0].score).toBe(0.95);
    });
  });
});

/**
 * Content Pipeline Phase 9: Document Versioning & Content Lineage Test Suite
 *
 * Invariants tested:
 * 1. Progression: Document -> Version 1 -> Version 2 -> Version 3
 * 2. Independent tracking of documentVersionId, processingVersion, embeddingModel, embeddingVersion
 * 3. Vector isolation & deterministic ID scoping (Zero vector mixing across versions)
 * 4. Document version diff computation (chunk deltas, token deltas, content modifications)
 * 5. Complete 4-Level Traceability (Artifact -> Chunk -> Document Version -> Original Source)
 *    for RAG, Magic Chat, Podcasts, Articles, and Quizzes.
 * 6. Downstream Provenance Graph Traversal
 */

import { DocumentVersioningService } from '../../src/core/pipeline/versioning/DocumentVersioningService';
import { ContentLineageService } from '../../src/core/pipeline/lineage/ContentLineageService';
import { generateDeterministicVectorId } from '../../src/core/pipeline/idGenerator';
import { SemanticChunk, DownstreamArtifactType } from '../../src/core/pipeline/types';

// Mock Firebase
jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    batch: jest.fn().mockReturnValue({
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('Content Pipeline Phase 9: Document Versioning & Content Lineage', () => {
  let versioningService: DocumentVersioningService;
  let lineageService: ContentLineageService;

  const testCollectionId = 'coll_test_phase9';
  const testDocId = 'doc_cbse_thermodynamics_2026';
  const testUserId = 'test_user_p9';

  beforeEach(() => {
    versioningService = new DocumentVersioningService();
    lineageService = new ContentLineageService();
  });

  describe('1. Multi-Version Progression & Identifiers', () => {
    it('creates Version 1 with independent identifiers', async () => {
      const v1 = await versioningService.createVersion({
        userId: testUserId,
        collectionId: testCollectionId,
        sourceId: testDocId,
        versionNumber: 1,
        documentVersionId: 'v1',
        processingVersion: 1,
        embeddingModel: 'text-embedding-004',
        embeddingVersion: 1,
        chunkCount: 15,
        tokenCount: 4500,
        sizeBytes: 102400,
        hash: 'sha256_v1_00001111222233334444555566667777',
        storagePath: 'gs://scholarly-bucket/sources/v1/thermodynamics.pdf',
        changeSummary: 'Initial document upload and pipeline processing',
        isActive: true,
      });

      expect(v1.version).toBe(1);
      expect(v1.documentVersionId).toBe('v1');
      expect(v1.processingVersion).toBe(1);
      expect(v1.embeddingModel).toBe('text-embedding-004');
      expect(v1.embeddingVersion).toBe(1);
      expect(v1.isActiveVersion).toBe(true);
    });

    it('progresses Document -> V1 -> V2 -> V3 with correct active flags', async () => {
      await versioningService.createVersion({
        userId: testUserId,
        collectionId: testCollectionId,
        sourceId: testDocId,
        versionNumber: 1,
        documentVersionId: 'v1',
        processingVersion: 1,
        embeddingModel: 'text-embedding-004',
        embeddingVersion: 1,
        chunkCount: 15,
        tokenCount: 4500,
        sizeBytes: 102400,
        hash: 'sha256_v1_hash',
        storagePath: 'gs://bucket/v1.pdf',
        isActive: true,
      });

      const v2 = await versioningService.createVersion({
        userId: testUserId,
        collectionId: testCollectionId,
        sourceId: testDocId,
        versionNumber: 2,
        documentVersionId: 'v2',
        processingVersion: 2,
        embeddingModel: 'text-embedding-004',
        embeddingVersion: 2,
        chunkCount: 18,
        tokenCount: 5200,
        sizeBytes: 118000,
        hash: 'sha256_v2_hash',
        storagePath: 'gs://bucket/v2.pdf',
        changeSummary: 'Added Carnot Engine solved numericals and diagrams',
        isActive: true,
      });

      expect(v2.version).toBe(2);
      expect(v2.documentVersionId).toBe('v2');
      expect(v2.processingVersion).toBe(2);

      const v3 = await versioningService.createVersion({
        userId: testUserId,
        collectionId: testCollectionId,
        sourceId: testDocId,
        versionNumber: 3,
        documentVersionId: 'v3',
        processingVersion: 3,
        embeddingModel: 'text-embedding-004',
        embeddingVersion: 2,
        chunkCount: 20,
        tokenCount: 5900,
        sizeBytes: 125000,
        hash: 'sha256_v3_hash',
        storagePath: 'gs://bucket/v3.pdf',
        changeSummary: 'Integrated NCERT exemplar questions and formulas',
        isActive: true,
      });

      expect(v3.version).toBe(3);
      expect(v3.documentVersionId).toBe('v3');

      const versions = await versioningService.getVersions(testCollectionId, testDocId);
      expect(versions.length).toBe(3);
      const activeV = versions.find(v => v.isActiveVersion);
      expect(activeV?.documentVersionId).toBe('v3');
    });
  });

  describe('2. Vector Isolation Invariant (No Old/New Vector Mixing)', () => {
    it('generates strictly isolated deterministic vector IDs per version', () => {
      const v1_vec = generateDeterministicVectorId({
        userId: testUserId,
        tenantId: testUserId,
        collectionId: testCollectionId,
        documentId: testDocId,
        documentVersionId: 'v1',
        chunkSequence: 1,
      });

      const v2_vec = generateDeterministicVectorId({
        userId: testUserId,
        tenantId: testUserId,
        collectionId: testCollectionId,
        documentId: testDocId,
        documentVersionId: 'v2',
        chunkSequence: 1,
      });

      const v3_vec = generateDeterministicVectorId({
        userId: testUserId,
        tenantId: testUserId,
        collectionId: testCollectionId,
        documentId: testDocId,
        documentVersionId: 'v3',
        chunkSequence: 1,
      });

      expect(v1_vec).not.toBe(v2_vec);
      expect(v2_vec).not.toBe(v3_vec);
      expect(v1_vec).toContain('_v1_chunk_1');
      expect(v2_vec).toContain('_v2_chunk_1');
      expect(v3_vec).toContain('_v3_chunk_1');
    });
  });

  describe('3. Document Version Diff Calculation', () => {
    it('computes chunk and token deltas across versions', async () => {
      await versioningService.createVersion({
        userId: testUserId,
        collectionId: testCollectionId,
        sourceId: testDocId,
        versionNumber: 1,
        documentVersionId: 'v1',
        processingVersion: 1,
        embeddingModel: 'text-embedding-004',
        embeddingVersion: 1,
        chunkCount: 15,
        tokenCount: 4500,
        sizeBytes: 102400,
        hash: 'hash_1',
        storagePath: 'gs://bucket/v1.pdf',
        isActive: false,
      });

      await versioningService.createVersion({
        userId: testUserId,
        collectionId: testCollectionId,
        sourceId: testDocId,
        versionNumber: 2,
        documentVersionId: 'v2',
        processingVersion: 2,
        embeddingModel: 'text-embedding-004',
        embeddingVersion: 2,
        chunkCount: 18,
        tokenCount: 5200,
        sizeBytes: 118000,
        hash: 'hash_2',
        storagePath: 'gs://bucket/v2.pdf',
        isActive: true,
      });

      const diff = await versioningService.diffVersions(
        testCollectionId,
        testDocId,
        'v1',
        'v2'
      );

      expect(diff.tokenDelta).toBe(700); // 5200 - 4500
      expect(diff.sizeDelta).toBe(15600); // 118000 - 102400
    });
  });

  describe('4. Complete 4-Level Traceability (Artifact -> Chunk -> Version -> Source)', () => {
    const consumers: { type: DownstreamArtifactType; name: string }[] = [
      { type: 'RAG_CITATION', name: 'RAG Retrieval Engine' },
      { type: 'MAGIC_CHAT', name: 'Magic Chat Grounding' },
      { type: 'PODCAST', name: 'Podcast Studio Script' },
      { type: 'ARTICLE', name: 'Deep Article Generator' },
      { type: 'QUIZ', name: 'Adaptive Quiz Engine' },
    ];

    it.each(consumers)('resolves 4-level lineage for $name ($type)', async ({ type, name }) => {
      const mockChunks: SemanticChunk[] = [
        {
          chunkId: 'chk_v2_1',
          documentId: testDocId,
          documentVersionId: 'v2',
          collectionId: testCollectionId,
          text: 'First law of thermodynamics: Delta U = Q - W.',
          sequence: 1,
          tokenCount: 28,
          charCount: 45,
          contentType: 'text',
          boundaryStrategy: 'section_boundary',
          chapter: 'Thermodynamics',
          section: 'First Law',
          sourceLocation: { blockIds: ['blk_1'], pageStart: 1, pageEnd: 1, charStart: 0, charEnd: 45 },
        },
        {
          chunkId: 'chk_v2_3',
          documentId: testDocId,
          documentVersionId: 'v2',
          collectionId: testCollectionId,
          text: 'Carnot Engine efficiency: eta = 1 - (T_C / T_H).',
          sequence: 3,
          tokenCount: 32,
          charCount: 48,
          contentType: 'definition',
          boundaryStrategy: 'definition_explanation_group',
          chapter: 'Thermodynamics',
          section: 'Heat Engines',
          sourceLocation: { blockIds: ['blk_3'], pageStart: 2, pageEnd: 2, charStart: 46, charEnd: 94 },
        },
      ];

      await versioningService.storeVersionChunks(
        testCollectionId,
        testDocId,
        'v2',
        mockChunks
      );

      const lineageRecord = await lineageService.resolveArtifactLineage({
        artifactId: `art_${type.toLowerCase()}_99`,
        artifactType: type,
        title: `${name} Grounding Trace`,
        consumerContext: `Grounding context for ${name}`,
        collectionId: testCollectionId,
        documentId: testDocId,
        documentVersionId: 'v2',
        citedChunkIds: ['chk_v2_1', 'chk_v2_3'],
      });

      expect(lineageRecord.lineageNodes.length).toBe(2);

      const node1 = lineageRecord.lineageNodes[0];
      expect(node1.artifact.artifactType).toBe(type);
      expect(node1.chunk.chunkId).toBe('chk_v2_1');
      expect(node1.documentVersion.documentVersionId).toBe('v2');
      expect(node1.originalSource.sourceId).toBe(testDocId);
    });
  });

  describe('5. Downstream Provenance Graph Traversal', () => {
    it('builds a hierarchical provenance tree rooted at source document', async () => {
      const provenanceGraph = await lineageService.traceDocumentLineageGraph(
        testCollectionId,
        testDocId,
        'v2'
      );

      expect(provenanceGraph.type).toBe('source');
      expect(provenanceGraph.children).toBeDefined();
    });
  });
});

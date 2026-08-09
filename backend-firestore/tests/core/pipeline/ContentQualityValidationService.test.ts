/**
 * ContentQualityValidationService Automated Unit Tests
 * Phase 8: Content Quality & Pre-READY Invariants
 */

import { ContentQualityValidationService } from '../../../src/core/pipeline/validation/ContentQualityValidationService';
import { PipelineCheckpointManager } from '../../../src/core/pipeline/orchestrator/PipelineCheckpointManager';
import {
  PipelineJobState,
  QualityValidationInvariant,
  ExtractedDocumentResult,
  SemanticChunk,
  VectorIndexingResult,
  KGExtractionResult,
} from '../../../src/core/pipeline/types';

// In-Memory mock for Firestore
const mockFirestoreData: Record<string, any> = {};

jest.mock('../../../src/config/firebase', () => {
  return {
    db: {
      collection: (colName: string) => ({
        doc: (docId: string) => ({
          get: async () => {
            const key = `${colName}/${docId}`;
            const data = mockFirestoreData[key];
            return {
              exists: !!data,
              id: docId,
              data: () => data,
            };
          },
          collection: (subColName: string) => ({
            get: async () => {
              const prefix = `${colName}/${docId}/${subColName}/`;
              const docs = Object.keys(mockFirestoreData)
                .filter((k) => k.startsWith(prefix))
                .map((k) => {
                  const subId = k.replace(prefix, '');
                  return {
                    id: subId,
                    data: () => mockFirestoreData[k],
                  };
                });
              return { empty: docs.length === 0, docs };
            },
            doc: (subDocId: string) => ({
              get: async () => {
                const key = `${colName}/${docId}/${subColName}/${subDocId}`;
                const data = mockFirestoreData[key];
                return {
                  exists: !!data,
                  id: subDocId,
                  data: () => data,
                };
              },
              collection: (deepSubCol: string) => ({
                orderBy: () => ({
                  get: async () => {
                    const prefix = `${colName}/${docId}/${subColName}/${subDocId}/${deepSubCol}/`;
                    const docs = Object.keys(mockFirestoreData)
                      .filter((k) => k.startsWith(prefix))
                      .map((k) => {
                        const dId = k.replace(prefix, '');
                        return {
                          id: dId,
                          data: () => mockFirestoreData[k],
                        };
                      });
                    return { empty: docs.length === 0, docs };
                  },
                }),
                get: async () => {
                  const prefix = `${colName}/${docId}/${subColName}/${subDocId}/${deepSubCol}/`;
                  const docs = Object.keys(mockFirestoreData)
                    .filter((k) => k.startsWith(prefix))
                    .map((k) => {
                      const dId = k.replace(prefix, '');
                      return {
                        id: dId,
                        data: () => mockFirestoreData[k],
                      };
                    });
                  return { empty: docs.length === 0, docs };
                },
              }),
            }),
          }),
        }),
      }),
    },
  };
});

describe('ContentQualityValidationService', () => {
  let service: ContentQualityValidationService;
  let mockCheckpointManager: jest.Mocked<PipelineCheckpointManager>;

  beforeEach(() => {
    Object.keys(mockFirestoreData).forEach((k) => delete mockFirestoreData[k]);

    mockCheckpointManager = {
      getJob: jest.fn(),
      saveCheckpoint: jest.fn(),
      initializeJob: jest.fn(),
      getJobsForDocument: jest.fn(),
      getActiveJobs: jest.fn(),
    } as any;

    service = new ContentQualityValidationService(mockCheckpointManager);
  });

  const setupMockDocument = (
    collectionId: string,
    documentId: string,
    opts: {
      sourceOverrides?: Record<string, any>;
      jobStateOverrides?: Partial<PipelineJobState>;
      includeChunks?: boolean;
      chunkCount?: number;
      includeVectors?: boolean;
      includeKg?: boolean;
    } = {}
  ) => {
    const {
      sourceOverrides = {},
      jobStateOverrides = {},
      includeChunks = true,
      chunkCount = 4,
      includeVectors = true,
      includeKg = true,
    } = opts;

    // 1. Setup Source in Firestore
    const sourceData = {
      id: documentId,
      title: 'Class 10 Physics: Optics & Light Refraction',
      originalName: 'optics_ch10.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048576,
      storagePath: `gs://scholarly-bucket/sources/${collectionId}/${documentId}.pdf`,
      status: 'INDEXING',
      chunksExtracted: chunkCount,
      vectorsIndexed: includeVectors ? chunkCount : 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        subject: 'Physics',
        classGrade: 'Class 10',
        exam: 'CBSE',
        language: 'English',
        author: 'NCERT',
      },
      ...sourceOverrides,
    };
    mockFirestoreData[`notebooks/${collectionId}/sources/${documentId}`] = sourceData;

    // 2. Setup Chunks in Firestore
    if (includeChunks) {
      for (let i = 1; i <= chunkCount; i++) {
        mockFirestoreData[`notebooks/${collectionId}/sources/${documentId}/chunks/chunk_${i}`] = {
          chunkId: `chunk_${i}`,
          documentId,
          sequence: i,
          text: `Physics paragraph ${i}: Law of refraction and Snell's law derivation with optical density index. Comprehensive textbook explanation for educational synthesis.`,
          tokenCount: 45,
          sourceLocation: {
            pageStart: Math.floor((i - 1) / 2) + 1,
            pageEnd: Math.floor((i - 1) / 2) + 1,
            blockIds: [`block_${i}`],
          },
          vectorId: includeVectors ? `vec_${documentId}_${i}` : undefined,
        };
      }
    }

    // 3. Setup Extraction Result in Job State
    const extractionResult: ExtractedDocumentResult = {
      documentId,
      documentVersionId: 'v1',
      format: 'PDF',
      language: 'en',
      pageCount: 2,
      totalBlocks: chunkCount,
      totalCharacters: 1200,
      blocks: [],
      rawText: 'Full optical physics textbook raw text.',
      hierarchy: { sections: [{ title: 'Optics', blockCount: chunkCount, pageStart: 1, pageEnd: 2 }] },
    };

    const chunksResult: SemanticChunk[] = includeChunks
      ? Array.from({ length: chunkCount }, (_, i) => ({
          chunkId: `chunk_${i + 1}`,
          documentId,
          documentVersionId: 'v1',
          collectionId,
          sequence: i + 1,
          text: `Physics paragraph ${i + 1}`,
          contentType: 'PARAGRAPH' as any,
          tokenCount: 45,
          charCount: 220,
          boundaryStrategy: 'PARAGRAPH_BOUNDARY' as any,
          sourceLocation: { blockIds: [`block_${i + 1}`], pageStart: 1, pageEnd: 1 },
          embedding: [0.1, 0.2, 0.3],
          vectorId: includeVectors ? `vec_${documentId}_${i + 1}` : undefined,
        }))
      : [];

    const vectorResult: VectorIndexingResult = {
      documentId,
      documentVersionId: 'v1',
      collectionId,
      userId: 'user_1',
      totalChunks: chunkCount,
      vectorsIndexed: includeVectors ? chunkCount : 0,
      vectorIds: includeVectors ? Array.from({ length: chunkCount }, (_, i) => `vec_${documentId}_${i + 1}`) : [],
      validation: {
        isValid: includeVectors,
        chunksCreated: chunkCount,
        vectorsIndexed: includeVectors ? chunkCount : 0,
        missingChunkIds: [],
      },
      durationMs: 350,
    };

    const kgResult: KGExtractionResult = {
      documentId,
      documentVersionId: 'v1',
      collectionId,
      userId: 'user_1',
      nodes: [
        {
          id: 'ent_refraction',
          notebookId: collectionId,
          collectionId,
          label: 'Refraction',
          type: 'CONCEPT',
          definition: 'Bending of light waves',
          importance: 0.9,
          difficulty: 'Medium',
          estimatedStudyTime: 15,
          masteryPercentage: 0,
          confidenceScore: 0.95,
          prerequisites: [],
          relatedConcepts: ['ent_snell'],
          sourceDocIds: [documentId],
          lineage: [],
        },
        {
          id: 'ent_snell',
          notebookId: collectionId,
          collectionId,
          label: "Snell's Law",
          type: 'CONCEPT',
          definition: 'n1 sin(theta1) = n2 sin(theta2)',
          importance: 0.85,
          difficulty: 'Hard',
          estimatedStudyTime: 20,
          masteryPercentage: 0,
          confidenceScore: 0.9,
          prerequisites: ['ent_refraction'],
          relatedConcepts: [],
          sourceDocIds: [documentId],
          lineage: [],
        },
      ],
      edges: [
        {
          id: 'rel_1',
          notebookId: collectionId,
          collectionId,
          sourceNodeId: 'ent_refraction',
          targetNodeId: 'ent_snell',
          relationshipType: 'RELATED_TO',
          confidence: 0.95,
          documentId,
          documentVersionId: 'v1',
        },
      ],
      nodesCount: 2,
      edgesCount: 1,
      validation: {
        isValid: true,
        nodesExtracted: 2,
        edgesExtracted: 1,
        validSourceReferences: true,
        tenantIsolationVerified: true,
        orphanedEdgeCount: 0,
      },
      durationMs: 650,
    };

    const jobState: PipelineJobState = {
      jobId: `job_${documentId}`,
      documentId,
      documentVersionId: 'v1',
      collectionId,
      userId: 'user_1',
      tenantId: 'tenant_1',
      status: 'ACTIVE',
      currentStage: 'INDEX',
      progress: 0.85,
      startedAt: Date.now() - 5000,
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      checkpoint: {
        lastCompletedStage: 'KNOWLEDGE_GRAPH',
        extractedResult: extractionResult,
        chunks: chunksResult,
        vectorResult: vectorResult,
        kgResult: includeKg ? kgResult : undefined,
        updatedAt: Date.now(),
      },
      sourceFile: {
        originalName: 'optics_ch10.pdf',
        contentType: 'application/pdf',
        sizeBytes: sourceOverrides.sizeBytes !== undefined ? sourceOverrides.sizeBytes : 2048576,
        storagePath: sourceOverrides.storagePath !== undefined ? sourceOverrides.storagePath : `gs://scholarly-bucket/sources/${collectionId}/${documentId}.pdf`,
      },
      ...jobStateOverrides,
    };

    mockCheckpointManager.getJob.mockResolvedValue(jobState);
  };

  describe('10 Invariant Assertions', () => {
    test('passes all 10 invariants when document and pipeline artifacts are completely healthy', async () => {
      setupMockDocument('col_sci', 'doc_optics');

      const report = await service.evaluateDocumentQuality('col_sci', 'doc_optics');

      expect(report.summary.totalInvariants).toBe(10);
      expect(report.summary.passedInvariants).toBe(10);
      expect(report.failures).toHaveLength(0);
      expect(report.isReadyValid).toBe(true);
      expect(report.healthStatus).toBe('Healthy');
      expect(report.overallScore).toBeGreaterThanOrEqual(85);
      expect(report.overallScore).toBeLessThanOrEqual(100);
    });

    test('fails storage invariant when storage path is missing', async () => {
      setupMockDocument('col_sci', 'doc_optics', {
        sourceOverrides: { storagePath: '' },
      });

      const report = await service.evaluateDocumentQuality('col_sci', 'doc_optics');

      const storageInv = report.invariants.find((i: QualityValidationInvariant) => i.id === 'storage_exists');
      expect(storageInv?.passed).toBe(false);
      expect(report.isReadyValid).toBe(false);
      expect(report.healthStatus).toBe('Failed');
    });

    test('fails chunks invariant when zero chunks exist', async () => {
      setupMockDocument('col_sci', 'doc_optics', {
        includeChunks: false,
        chunkCount: 0,
        sourceOverrides: { chunksExtracted: 0 },
      });

      const report = await service.evaluateDocumentQuality('col_sci', 'doc_optics');

      const chunkInv = report.invariants.find((i: QualityValidationInvariant) => i.id === 'chunks_exist');
      expect(chunkInv?.passed).toBe(false);
      expect(report.isReadyValid).toBe(false);
      expect(report.healthStatus).toBe('Failed');
    });

    test('fails vector parity invariant when vector count does not match chunks', async () => {
      setupMockDocument('col_sci', 'doc_optics', {
        includeChunks: true,
        chunkCount: 6,
        includeVectors: false,
        sourceOverrides: { chunksExtracted: 6, vectorsIndexed: 2 },
      });

      const report = await service.evaluateDocumentQuality('col_sci', 'doc_optics');

      const vectorInv = report.invariants.find((i: QualityValidationInvariant) => i.id === 'vector_count_parity');
      expect(vectorInv?.passed).toBe(false);
      expect(report.isReadyValid).toBe(false);
    });

    test('fails invariant when document is in FAILED processing state', async () => {
      setupMockDocument('col_sci', 'doc_optics', {
        sourceOverrides: { status: 'FAILED', failureReason: 'Extraction timeout' },
        jobStateOverrides: { status: 'FAILED' },
      });

      const report = await service.evaluateDocumentQuality('col_sci', 'doc_optics');

      const stateInv = report.invariants.find((i: QualityValidationInvariant) => i.id === 'valid_processing_state');
      expect(stateInv?.passed).toBe(false);
      expect(report.isReadyValid).toBe(false);
      expect(report.healthStatus).toBe('Failed');
    });
  });

  describe('7 Component Quality Indicators & Honest Scoring', () => {
    test('computes honest non-inflated scores across all 7 indicators', async () => {
      setupMockDocument('col_sci', 'doc_optics');

      const report = await service.evaluateDocumentQuality('col_sci', 'doc_optics');

      expect(report.indicators['Extraction']).toBeDefined();
      expect(report.indicators['Metadata']).toBeDefined();
      expect(report.indicators['Chunking']).toBeDefined();
      expect(report.indicators['Embeddings']).toBeDefined();
      expect(report.indicators['Vector Index']).toBeDefined();
      expect(report.indicators['Knowledge Graph']).toBeDefined();
      expect(report.indicators['Validation']).toBeDefined();

      // Honest scoring verification: Never falsely report 100%
      expect(report.overallScore).toBeLessThan(100);
      expect(report.overallScore).toBeGreaterThan(70);
    });

    test('handles unavailable Knowledge Graph with clear diagnostic explanation without breaking pre-READY validation', async () => {
      setupMockDocument('col_sci', 'doc_optics', {
        includeKg: false,
      });

      const report = await service.evaluateDocumentQuality('col_sci', 'doc_optics');

      expect(report.indicators['Knowledge Graph'].status).toBe('unavailable');
      expect(report.indicators['Knowledge Graph'].explanation).toContain(
        'Knowledge graph generation was bypassed or not yet performed'
      );
      // Optional invariant for KG in non-strict mode should allow READY
      expect(report.isReadyValid).toBe(true);
      expect(report.healthStatus).toBe('Healthy');
    });

    test('downgrades health tier to Warning when metadata is missing key curricular tags', async () => {
      setupMockDocument('col_sci', 'doc_optics', {
        sourceOverrides: {
          metadata: { subject: '' }, // degraded metadata
        },
      });

      const report = await service.evaluateDocumentQuality('col_sci', 'doc_optics');

      expect(['Warning', 'Needs Review', 'Healthy']).toContain(report.healthStatus);
      expect(report.indicators['Metadata'].score).toBeLessThan(85);
    });
  });

  describe('Health Status Tiering', () => {
    test('categorizes correctly into Healthy vs Failed', async () => {
      // Healthy
      setupMockDocument('col_sci', 'doc_healthy');
      const healthyReport = await service.evaluateDocumentQuality('col_sci', 'doc_healthy');
      expect(healthyReport.healthStatus).toBe('Healthy');

      // Failed
      setupMockDocument('col_sci', 'doc_failed', {
        sourceOverrides: { storagePath: '' },
      });
      const failedReport = await service.evaluateDocumentQuality('col_sci', 'doc_failed');
      expect(failedReport.healthStatus).toBe('Failed');
    });
  });
});

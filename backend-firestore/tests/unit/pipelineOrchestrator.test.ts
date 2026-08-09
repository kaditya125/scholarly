/**
 * Content Pipeline Phase 5: Pipeline Orchestrator & Failure Recovery Tests
 *
 * Tests:
 * 1. Happy Path End-to-End Pipeline (UPLOAD -> READY)
 * 2. Asynchronous Job Model & State Polling
 * 3. Stage-Level Retry (Skip already completed stages)
 * 4. Worker Crash / Interruption & Checkpoint Resume
 * 5. Gemini 429 Rate Limit Recovery
 * 6. Pinecone Failure & Retry
 * 7. Extraction Failure Handling
 * 8. Idempotency across duplicate runs
 */

import { ContentPipelineOrchestrator, IngestionInput } from '../../src/core/pipeline/orchestrator/ContentPipelineOrchestrator';
import { PipelineCheckpointManager } from '../../src/core/pipeline/orchestrator/PipelineCheckpointManager';
import { DocumentExtractionService } from '../../src/core/pipeline/DocumentExtractionService';
import { IntelligentOcrService } from '../../src/core/pipeline/ocr/IntelligentOcrService';
import { DocumentUnderstandingService } from '../../src/core/pipeline/understanding/DocumentUnderstandingService';
import { ChunkingService } from '../../src/core/pipeline/chunking/ChunkingService';
import { VectorIndexingService } from '../../src/core/pipeline/indexing/VectorIndexingService';
import { KnowledgeGraphService } from '../../src/core/pipeline/graph/KnowledgeGraphService';
import { ExtractedDocumentResult, DocumentUnderstandingResult, ChunkingResult } from '../../src/core/pipeline/types';

// Mock Firebase & Repositories
jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../src/repositories/notebook.repository', () => ({
  notebookRepository: {
    addKGNodes: jest.fn().mockResolvedValue(undefined),
    getKGNodes: jest.fn().mockResolvedValue([]),
    addKGEdges: jest.fn().mockResolvedValue(undefined),
    getKGEdges: jest.fn().mockResolvedValue([]),
  },
}));

describe('Content Pipeline Phase 5: Pipeline Orchestrator & Recovery', () => {
  let orchestrator: ContentPipelineOrchestrator;
  let checkpointManager: PipelineCheckpointManager;
  let extractionService: DocumentExtractionService;
  let ocrService: IntelligentOcrService;
  let understandingService: DocumentUnderstandingService;
  let chunkingService: ChunkingService;
  let indexingService: VectorIndexingService;
  let graphService: KnowledgeGraphService;

  const samplePdfText = 'Chapter 1: Quantum Mechanics\nDefinition: Wave Particle Duality: matter exhibits wave-like and particle-like properties.\nFormula: E = h f.';
  const sampleBuffer = Buffer.from(samplePdfText);

  const mockExtractionResult: ExtractedDocumentResult = {
    documentId: 'doc_123',
    documentVersionId: 'v1',
    format: 'PDF',
    language: 'en',
    pageCount: 1,
    totalBlocks: 1,
    totalCharacters: samplePdfText.length,
    rawText: samplePdfText,
    hierarchy: {
      sections: [{ title: 'Quantum Mechanics', blockCount: 1, pageStart: 1, pageEnd: 1 }],
    },
    blocks: [
      {
        documentId: 'doc_123',
        documentVersionId: 'v1',
        blockId: 'blk_1',
        type: 'paragraph',
        content: samplePdfText,
        sequence: 0,
        sourceLocation: { pageNumber: 1, charStart: 0, charEnd: samplePdfText.length },
      },
    ],
  };

  const mockUnderstandingResult: DocumentUnderstandingResult = {
    documentId: 'doc_123',
    documentVersionId: 'v1',
    structuredBlocks: [
      {
        blockId: 'blk_1',
        structureType: 'definition',
        content: 'Definition: Wave Particle Duality: matter exhibits wave-like and particle-like properties.',
        pageNumber: 1,
        sequence: 0,
        confidence: 0.95,
      },
    ],
    documentOutline: { title: 'Quantum Mechanics', chapters: [] },
    resolvedMetadata: {
      subject: { value: 'Physics', confidence: 0.95, source: 'ai' },
    },
    educationalMetadata: {
      subject: { value: 'Physics', confidence: 0.95, source: 'ai' },
    },
    stats: {
      totalStructuredBlocks: 1,
      structureTypeDistribution: { definition: 1 } as any,
      metadataFieldsExtracted: 1,
      averageMetadataConfidence: 0.95,
      userOverriddenFields: [],
    },
    durationMs: 40,
  };

  const mockChunkingResult: ChunkingResult = {
    documentId: 'doc_123',
    documentVersionId: 'v1',
    collectionId: 'col_physics',
    chunks: [
      {
        chunkId: 'doc_123_chunk_0',
        documentId: 'doc_123',
        documentVersionId: 'v1',
        collectionId: 'col_physics',
        text: samplePdfText,
        sequence: 0,
        contentType: 'definition',
        pageNumber: 1,
        pageEnd: 1,
        chapter: 'Quantum Mechanics',
        section: 'Wave Properties',
        subject: 'Physics',
        classLevel: 'Class 12',
        board: 'CBSE',
        exam: 'JEE',
        language: 'en',
        topic: 'Quantum Mechanics',
        difficulty: 'Medium',
        sourceLocation: { blockIds: ['blk_1'], pageStart: 1, pageEnd: 1, charStart: 0, charEnd: samplePdfText.length },
        boundaryStrategy: 'section_boundary',
        tokenCount: 25,
        charCount: samplePdfText.length,
        conceptIds: [],
        entityIds: [],
      },
    ],
    totalChunks: 1,
    totalTokens: 25,
    averageChunkTokens: 25,
    boundaryStrategyDistribution: { section_boundary: 1 } as any,
    durationMs: 20,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    checkpointManager = new PipelineCheckpointManager();
    extractionService = new DocumentExtractionService();
    ocrService = new IntelligentOcrService();
    understandingService = new DocumentUnderstandingService();
    chunkingService = new ChunkingService();
    indexingService = new VectorIndexingService();
    graphService = new KnowledgeGraphService();

    // Mock Extraction Service
    jest.spyOn(extractionService, 'extractFromBuffer').mockResolvedValue(mockExtractionResult);

    // Mock Understanding Service
    jest.spyOn(understandingService, 'understand').mockResolvedValue(mockUnderstandingResult);

    // Mock Chunking Service
    jest.spyOn(chunkingService, 'chunk').mockReturnValue(mockChunkingResult);

    // Mock Indexing Service
    jest.spyOn(indexingService, 'indexChunks').mockResolvedValue({
      documentId: 'doc_123',
      documentVersionId: 'v1',
      collectionId: 'col_physics',
      userId: 'user_1',
      totalChunks: 1,
      vectorsIndexed: 1,
      vectorIds: ['col_physics:doc_123:v1:doc_123_chunk_0'],
      validation: { isValid: true, chunksCreated: 1, vectorsIndexed: 1, missingChunkIds: [] },
      durationMs: 60,
    });

    // Mock Graph Service
    jest.spyOn(graphService, 'processAndPersist').mockResolvedValue({
      documentId: 'doc_123',
      documentVersionId: 'v1',
      collectionId: 'col_physics',
      userId: 'user_1',
      nodes: [
        {
          id: 'kg_col_physics_concept_wave_particle_duality',
          notebookId: 'col_physics',
          collectionId: 'col_physics',
          label: 'Wave Particle Duality',
          type: 'CONCEPT',
          definition: 'matter exhibits wave-like and particle-like properties.',
          importance: 0.85,
          difficulty: 'Medium',
          estimatedStudyTime: 10,
          masteryPercentage: 0,
          confidenceScore: 0.95,
          prerequisites: [],
          relatedConcepts: [],
          sourceDocIds: ['doc_123'],
          lineage: [],
        },
      ],
      edges: [],
      nodesCount: 1,
      edgesCount: 0,
      validation: {
        isValid: true,
        nodesExtracted: 1,
        edgesExtracted: 0,
        validSourceReferences: true,
        tenantIsolationVerified: true,
        orphanedEdgeCount: 0,
      },
      durationMs: 30,
    });

    orchestrator = new ContentPipelineOrchestrator(
      checkpointManager,
      extractionService,
      ocrService,
      understandingService,
      chunkingService,
      indexingService,
      graphService
    );
  });

  // ----------------------------------------------------------------
  // 1. Happy Path End-to-End Pipeline
  // ----------------------------------------------------------------
  describe('1. Happy Path End-to-End Pipeline', () => {
    it('should complete all stages from UPLOAD to READY with valid stats', async () => {
      const input: IngestionInput = {
        documentId: 'doc_123',
        documentVersionId: 'v1',
        collectionId: 'col_physics',
        userId: 'user_1',
        fileBuffer: sampleBuffer,
        fileName: 'quantum.pdf',
        contentType: 'application/pdf',
      };

      const job = await orchestrator.enqueuePipeline(input);
      expect(job.status).toBe('QUEUED');
      expect(job.currentStage).toBe('QUEUE');

      const result = await orchestrator.executePipeline(job.jobId);
      expect(result.status).toBe('COMPLETED');
      expect(result.finalStage).toBe('READY');
      expect(result.chunksIndexed).toBe(1);
      expect(result.vectorsIndexed).toBe(1);
      expect(result.kgNodesCreated).toBe(1);

      // Verify stage calls
      expect(extractionService.extractFromBuffer).toHaveBeenCalledTimes(1);
      expect(understandingService.understand).toHaveBeenCalledTimes(1);
      expect(chunkingService.chunk).toHaveBeenCalledTimes(1);
      expect(indexingService.indexChunks).toHaveBeenCalledTimes(1);
      expect(graphService.processAndPersist).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------------
  // 2. Asynchronous Job Model & State Polling
  // ----------------------------------------------------------------
  describe('2. Asynchronous Job Model & State Polling', () => {
    it('should allow polling job state and tracking progress', async () => {
      const input: IngestionInput = {
        documentId: 'doc_async',
        documentVersionId: 'v1',
        collectionId: 'col_physics',
        userId: 'user_1',
        fileBuffer: sampleBuffer,
        fileName: 'async.pdf',
        contentType: 'application/pdf',
      };

      const initialJob = await orchestrator.enqueuePipeline(input);
      const stateBefore = await orchestrator.getJobState(initialJob.jobId);
      expect(stateBefore).toBeDefined();
      expect(stateBefore?.status).toBe('QUEUED');

      await orchestrator.executePipeline(initialJob.jobId);

      const stateAfter = await orchestrator.getJobState(initialJob.jobId);
      expect(stateAfter?.status).toBe('COMPLETED');
      expect(stateAfter?.progress).toBe(1.0);
    });
  });

  // ----------------------------------------------------------------
  // 3. Stage-Level Retry (Avoid duplicate execution)
  // ----------------------------------------------------------------
  describe('3. Stage-Level Retry', () => {
    it('should retry only the failed embedding stage and NOT re-run extraction or chunking', async () => {
      // First attempt fails at indexing
      jest.spyOn(indexingService, 'indexChunks').mockRejectedValueOnce(new Error('Pinecone connection timeout'));

      const input: IngestionInput = {
        documentId: 'doc_retry',
        documentVersionId: 'v1',
        collectionId: 'col_physics',
        userId: 'user_1',
        fileBuffer: sampleBuffer,
        fileName: 'retry.pdf',
        contentType: 'application/pdf',
      };

      const job = await orchestrator.enqueuePipeline(input);
      const run1 = await orchestrator.executePipeline(job.jobId);

      expect(run1.status).toBe('FAILED');
      expect(run1.error?.message).toContain('Pinecone connection timeout');

      // Verify intermediate stages were completed and checkpointed
      const state1 = await orchestrator.getJobState(job.jobId);
      expect(state1?.checkpoint?.lastCompletedStage).toBe('CHUNK');
      expect(state1?.checkpoint?.chunks).toHaveLength(1);

      // Clear spy call counts before retry
      (extractionService.extractFromBuffer as jest.Mock).mockClear();
      (understandingService.understand as jest.Mock).mockClear();
      (chunkingService.chunk as jest.Mock).mockClear();
      (indexingService.indexChunks as jest.Mock).mockClear();

      // Second attempt (retry) succeeds
      const run2 = await orchestrator.resumeJob(job.jobId);

      expect(run2.status).toBe('COMPLETED');
      // Critical check: Extraction, Understanding, and Chunking were NOT re-executed!
      expect(extractionService.extractFromBuffer).not.toHaveBeenCalled();
      expect(understandingService.understand).not.toHaveBeenCalled();
      expect(chunkingService.chunk).not.toHaveBeenCalled();
      // Indexing and Graph WERE executed
      expect(indexingService.indexChunks).toHaveBeenCalledTimes(1);
      expect(graphService.processAndPersist).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------------
  // 4. Worker Crash / Interruption & Checkpoint Resume
  // ----------------------------------------------------------------
  describe('4. Worker Crash & Checkpoint Resume', () => {
    it('should resume seamlessly from last completed checkpoint after a crash', async () => {
      const jobId = 'job_crashed_1';
      // Simulate existing job where worker crashed after METADATA stage
      await checkpointManager.createJob({
        jobId,
        documentId: 'doc_crash',
        documentVersionId: 'v1',
        collectionId: 'col_physics',
        userId: 'user_1',
        currentStage: 'METADATA',
        status: 'ACTIVE',
        progress: 0.55,
        startedAt: Date.now() - 5000,
        updatedAt: Date.now() - 1000,
        retryCount: 0,
        maxRetries: 3,
        sourceFile: {
          originalName: 'crash.pdf',
          contentType: 'application/pdf',
          sizeBytes: sampleBuffer.length,
          buffer: sampleBuffer,
        },
        checkpoint: {
          lastCompletedStage: 'METADATA',
          extractedText: samplePdfText,
          understandingResult: mockUnderstandingResult,
          updatedAt: Date.now(),
        },
      });

      const res = await orchestrator.resumeJob(jobId);
      expect(res.status).toBe('COMPLETED');
      expect(res.finalStage).toBe('READY');

      // Extraction and Understanding were skipped
      expect(extractionService.extractFromBuffer).not.toHaveBeenCalled();
      expect(understandingService.understand).not.toHaveBeenCalled();
      // Chunking and Indexing resumed
      expect(chunkingService.chunk).toHaveBeenCalledTimes(1);
      expect(indexingService.indexChunks).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------------
  // 5. Gemini 429 Rate Limit Recovery
  // ----------------------------------------------------------------
  describe('5. Gemini 429 Rate Limit Recovery', () => {
    it('should flag 429 errors as recoverable in job error state', async () => {
      jest.spyOn(understandingService, 'understand').mockRejectedValueOnce(
        new Error('Google AI Gemini 429: Resource has been exhausted (rate limit exceeded)')
      );

      const input: IngestionInput = {
        documentId: 'doc_429',
        documentVersionId: 'v1',
        collectionId: 'col_physics',
        userId: 'user_1',
        fileBuffer: sampleBuffer,
        fileName: 'rate_limit.pdf',
        contentType: 'application/pdf',
      };

      const job = await orchestrator.enqueuePipeline(input);
      const res = await orchestrator.executePipeline(job.jobId);

      expect(res.status).toBe('FAILED');
      expect(res.error?.recoverable).toBe(true);
      expect(res.error?.message).toContain('429');
    });
  });

  // ----------------------------------------------------------------
  // 6. Extraction Failure Handling
  // ----------------------------------------------------------------
  describe('6. Extraction Failure Handling', () => {
    it('should record extraction failure and stop pipeline progression', async () => {
      jest.spyOn(extractionService, 'extractFromBuffer').mockRejectedValueOnce(
        new Error('Corrupt or password-protected PDF document')
      );

      const input: IngestionInput = {
        documentId: 'doc_corrupt',
        documentVersionId: 'v1',
        collectionId: 'col_physics',
        userId: 'user_1',
        fileBuffer: Buffer.from('corrupt data'),
        fileName: 'corrupt.pdf',
        contentType: 'application/pdf',
      };

      const job = await orchestrator.enqueuePipeline(input);
      const res = await orchestrator.executePipeline(job.jobId);

      expect(res.status).toBe('FAILED');
      expect(res.error?.message).toContain('Corrupt or password-protected PDF');
      // Downstream services should not have been called
      expect(chunkingService.chunk).not.toHaveBeenCalled();
      expect(indexingService.indexChunks).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------
  // 7. Idempotency across duplicate runs
  // ----------------------------------------------------------------
  describe('7. Idempotency across duplicate runs', () => {
    it('should produce identical deterministic outputs when executed repeatedly', async () => {
      const input: IngestionInput = {
        documentId: 'doc_idempotent',
        documentVersionId: 'v1',
        collectionId: 'col_physics',
        userId: 'user_1',
        fileBuffer: sampleBuffer,
        fileName: 'idempotent.pdf',
        contentType: 'application/pdf',
      };

      const job1 = await orchestrator.enqueuePipeline(input);
      const res1 = await orchestrator.executePipeline(job1.jobId);

      const job2 = await orchestrator.enqueuePipeline(input);
      const res2 = await orchestrator.executePipeline(job2.jobId);

      expect(res1.status).toBe('COMPLETED');
      expect(res2.status).toBe('COMPLETED');
      expect(res1.chunksIndexed).toBe(res2.chunksIndexed);
      expect(res1.vectorsIndexed).toBe(res2.vectorsIndexed);
      expect(res1.kgNodesCreated).toBe(res2.kgNodesCreated);
    });
  });
});

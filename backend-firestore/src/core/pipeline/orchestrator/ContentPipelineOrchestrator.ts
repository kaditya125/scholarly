/**
 * Content Pipeline Orchestrator
 * Phase 5: End-to-End Orchestration, Checkpointing, and Failure Recovery
 *
 * Pipeline Flow:
 * UPLOAD -> QUEUE -> EXTRACT -> OCR (if required) -> STRUCTURE -> METADATA -> CHUNK -> EMBED -> INDEX -> KNOWLEDGE_GRAPH -> VALIDATE -> READY
 */

import {
  PipelineJobState,
  OrchestratorOptions,
  OrchestratorResult,
  ProcessingStageName,
  ProcessingError,
  DocumentUnderstandingResult,
  SemanticChunk,
  ExtractedBlock,
  ExtractedDocumentResult,
  VectorIndexingResult,
  KGExtractionResult,
} from '../types';
import { PipelineCheckpointManager } from './PipelineCheckpointManager';
import { PipelineRealtimeService } from './PipelineRealtimeService';
import { DocumentExtractionService } from '../DocumentExtractionService';
import { IntelligentOcrService } from '../ocr/IntelligentOcrService';
import { DocumentUnderstandingService } from '../understanding/DocumentUnderstandingService';
import { ChunkingService } from '../chunking/ChunkingService';
import { VectorIndexingService } from '../indexing/VectorIndexingService';
import { KnowledgeGraphService } from '../graph/KnowledgeGraphService';
import { ContentQualityValidationService } from '../validation/ContentQualityValidationService';
import { generateJobId } from '../idGenerator';
import { notebookRepository } from '../../../repositories/notebook.repository';
import * as admin from 'firebase-admin';
import { db } from '../../../config/firebase';

export interface IngestionInput {
  documentId: string;
  documentVersionId?: string;
  collectionId: string;
  userId: string;
  fileBuffer: Buffer;
  fileName: string;
  contentType: string;
  options?: OrchestratorOptions;
}

export class ContentPipelineOrchestrator {
  private checkpointManager: PipelineCheckpointManager;
  private extractionService: DocumentExtractionService;
  private ocrService: IntelligentOcrService;
  private understandingService: DocumentUnderstandingService;
  private chunkingService: ChunkingService;
  private indexingService: VectorIndexingService;
  private graphService: KnowledgeGraphService;
  private qualityValidationService: ContentQualityValidationService;
  private realtimeService: PipelineRealtimeService;
  private cancelledJobs: Set<string> = new Set();

  constructor(
    checkpointManager?: PipelineCheckpointManager,
    extractionService?: DocumentExtractionService,
    ocrService?: IntelligentOcrService,
    understandingService?: DocumentUnderstandingService,
    chunkingService?: ChunkingService,
    indexingService?: VectorIndexingService,
    graphService?: KnowledgeGraphService,
    realtimeService?: PipelineRealtimeService,
    qualityValidationService?: ContentQualityValidationService
  ) {
    this.checkpointManager = checkpointManager || new PipelineCheckpointManager();
    this.extractionService = extractionService || new DocumentExtractionService();
    this.ocrService = ocrService || new IntelligentOcrService();
    this.understandingService = understandingService || new DocumentUnderstandingService();
    this.chunkingService = chunkingService || new ChunkingService();
    this.indexingService = indexingService || new VectorIndexingService();
    this.graphService = graphService || new KnowledgeGraphService();
    this.qualityValidationService = qualityValidationService || new ContentQualityValidationService(this.checkpointManager);
    this.realtimeService = realtimeService || PipelineRealtimeService.getInstance();
  }

  /**
   * Enqueues an ingestion job asynchronously.
   * Returns immediately with the initial QUEUED job state.
   */
  async enqueuePipeline(input: IngestionInput): Promise<PipelineJobState> {
    const jobId = generateJobId();
    const docVersionId = input.documentVersionId || 'v1';

    const initialState: PipelineJobState = {
      jobId,
      documentId: input.documentId,
      documentVersionId: docVersionId,
      collectionId: input.collectionId,
      userId: input.userId,
      tenantId: input.options?.tenantId || input.userId,
      currentStage: 'QUEUE',
      status: 'QUEUED',
      progress: 0.10,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: input.options?.maxRetries ?? 3,
      sourceFile: {
        originalName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.fileBuffer.length,
        buffer: input.fileBuffer,
      },
      options: input.options,
    };

    await this.checkpointManager.createJob(initialState);

    // Initialize realtime snapshot for SSE subscribers
    this.realtimeService.createDefaultSnapshot({
      jobId,
      documentId: input.documentId,
      documentVersionId: docVersionId,
      collectionId: input.collectionId,
      userId: input.userId,
    });
    this.realtimeService.updateStage(jobId, {
      internalStage: 'QUEUE',
      stageStatus: 'completed',
      progress: 0.10,
      itemsProcessed: {
        bytesUploaded: input.fileBuffer.length,
        totalBytes: input.fileBuffer.length,
      },
    });

    // Asynchronously kick off processing in the background
    setImmediate(() => {
      this.executePipeline(jobId).catch(() => {
        // Handled in recordFailure
      });
    });

    return initialState;
  }

  /**
   * Cancels an active or queued pipeline job.
   */
  async cancelJob(jobId: string, reason = 'Processing cancelled by user'): Promise<boolean> {
    this.cancelledJobs.add(jobId);
    this.realtimeService.markCancelled(jobId, reason);
    const job = await this.checkpointManager.getJob(jobId);
    if (job) {
      await this.checkpointManager.recordFailure(jobId, {
        code: 'JOB_CANCELLED',
        message: reason,
        stage: job.checkpoint?.lastCompletedStage || 'QUEUE',
        recoverable: true,
        timestamp: Date.now(),
      });
    }
    return true;
  }

  private checkCancelled(jobId: string): void {
    if (this.cancelledJobs.has(jobId)) {
      throw new Error('Processing was cancelled by user');
    }
  }

  /**
   * Retrieves the live job state and progress for polling or status checking.
   */
  async getJobState(jobId: string, collectionId?: string): Promise<PipelineJobState | null> {
    return this.checkpointManager.getJob(jobId, collectionId);
  }

  /**
   * Executes or resumes a pipeline job from its last valid completed stage.
   */
  async executePipeline(jobId: string): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const job = await this.checkpointManager.getJob(jobId);
    if (!job) {
      throw new Error(`Pipeline job ${jobId} not found`);
    }

    const { documentId, documentVersionId, collectionId, userId, sourceFile, options } = job;
    let checkpoint = job.checkpoint || { lastCompletedStage: 'QUEUE', updatedAt: Date.now() };

    try {
      this.checkCancelled(jobId);

      // -------------------------------------------------------------
      // STAGE 1 & 2: EXTRACT
      // -------------------------------------------------------------
      let extractionResult: ExtractedDocumentResult | undefined = checkpoint.extractedResult;

      if (!extractionResult && !this.isStageCompleted('EXTRACT', checkpoint.lastCompletedStage)) {
        this.checkCancelled(jobId);
        this.realtimeService.updateStage(jobId, {
          internalStage: 'EXTRACT',
          stageStatus: 'running',
          progress: 0.15,
        });

        if (!sourceFile?.buffer) {
          throw new Error('Source file buffer not available for extraction');
        }

        extractionResult = await this.extractionService.extractFromBuffer(
          sourceFile.buffer,
          sourceFile.originalName,
          documentId,
          documentVersionId,
          sourceFile.contentType,
          {
            enableIntelligentOcr: !options?.forceOcr,
            forceOcr: options?.forceOcr,
          }
        );

        const updated = await this.checkpointManager.saveCheckpoint(jobId, 'EXTRACT', {
          extractedResult: extractionResult,
          extractedText: extractionResult.blocks.map((b: ExtractedBlock) => b.content).join('\n\n'),
          extractedBlocks: extractionResult.blocks,
        });
        checkpoint = updated.checkpoint!;

        this.realtimeService.updateStage(jobId, {
          internalStage: 'EXTRACT',
          stageStatus: 'completed',
          progress: 0.25,
          itemsProcessed: {
            pages: extractionResult.pageCount,
            blocks: extractionResult.totalBlocks,
          },
        });
      }

      // -------------------------------------------------------------
      // STAGE 3: OCR (if required or forced)
      // -------------------------------------------------------------
      if (!this.isStageCompleted('OCR', checkpoint.lastCompletedStage)) {
        this.checkCancelled(jobId);
        this.realtimeService.updateStage(jobId, {
          internalStage: 'OCR',
          stageStatus: 'running',
          progress: 0.30,
        });

        const updated = await this.checkpointManager.saveCheckpoint(jobId, 'OCR', {
          ocrResult: {
            blocks: extractionResult?.blocks || [],
            requiresOcr: Boolean(options?.forceOcr),
            pageCount: extractionResult?.pageCount || 1,
          },
        });
        checkpoint = updated.checkpoint!;

        this.realtimeService.updateStage(jobId, {
          internalStage: 'OCR',
          stageStatus: 'completed',
          progress: 0.35,
          itemsProcessed: {
            pages: extractionResult?.pageCount || 1,
            blocks: extractionResult?.totalBlocks || 0,
          },
        });
      }

      // -------------------------------------------------------------
      // STAGE 4 & 5: STRUCTURE & METADATA (DOCUMENT UNDERSTANDING)
      // -------------------------------------------------------------
      let understanding = checkpoint.understandingResult;
      if (!understanding || !this.isStageCompleted('METADATA', checkpoint.lastCompletedStage)) {
        this.checkCancelled(jobId);
        this.realtimeService.updateStage(jobId, {
          internalStage: 'METADATA',
          stageStatus: 'running',
          progress: 0.40,
        });

        if (!extractionResult) {
          extractionResult = {
            documentId,
            documentVersionId,
            format: 'PDF',
            language: 'en',
            pageCount: 1,
            totalBlocks: checkpoint.extractedBlocks?.length || 1,
            totalCharacters: checkpoint.extractedText?.length || 0,
            rawText: checkpoint.extractedText || '',
            hierarchy: { sections: [] },
            blocks: checkpoint.extractedBlocks || [
              {
                documentId,
                documentVersionId,
                blockId: 'blk_0',
                type: 'paragraph',
                content: checkpoint.extractedText || '',
                sequence: 0,
                sourceLocation: { pageNumber: 1, charStart: 0, charEnd: (checkpoint.extractedText || '').length },
              },
            ],
          };
        }

        understanding = await this.understandingService.understand(
          extractionResult,
          { maxSampleChars: 5000 }
        );

        const updated = await this.checkpointManager.saveCheckpoint(jobId, 'METADATA', {
          understandingResult: understanding,
        });
        checkpoint = updated.checkpoint!;

        this.realtimeService.updateStage(jobId, {
          internalStage: 'METADATA',
          stageStatus: 'completed',
          progress: 0.50,
          itemsProcessed: {
            blocks: extractionResult.totalBlocks,
          },
        });
      }

      // -------------------------------------------------------------
      // STAGE 6: SEMANTIC CHUNKING
      // -------------------------------------------------------------
      let chunks: SemanticChunk[] = checkpoint.chunks || [];
      if (!chunks.length || !this.isStageCompleted('CHUNK', checkpoint.lastCompletedStage)) {
        this.checkCancelled(jobId);
        this.realtimeService.updateStage(jobId, {
          internalStage: 'CHUNK',
          stageStatus: 'running',
          progress: 0.55,
        });

        const chunkResult = this.chunkingService.chunk(
          understanding,
          collectionId,
          { maxTokensPerChunk: 500, minTokensPerChunk: 50 }
        );

        chunks = chunkResult.chunks;
        const updated = await this.checkpointManager.saveCheckpoint(jobId, 'CHUNK', {
          chunks,
        });
        checkpoint = updated.checkpoint!;

        this.realtimeService.updateStage(jobId, {
          internalStage: 'CHUNK',
          stageStatus: 'completed',
          progress: 0.65,
          itemsProcessed: {
            chunks: chunks.length,
          },
        });
      }

      // -------------------------------------------------------------
      // STAGE 7 & 8: EMBED & VECTOR INDEXING
      // -------------------------------------------------------------
      let vectorResult = checkpoint.vectorResult;
      if (!vectorResult && !options?.skipVectorIndexing && !this.isStageCompleted('INDEX', checkpoint.lastCompletedStage)) {
        this.checkCancelled(jobId);
        this.realtimeService.updateStage(jobId, {
          internalStage: 'INDEX',
          stageStatus: 'running',
          progress: 0.70,
        });

        vectorResult = await this.indexingService.indexChunks(
          chunks,
          userId,
          collectionId,
          { tenantId: options?.tenantId || userId }
        );

        const updated = await this.checkpointManager.saveCheckpoint(jobId, 'INDEX', {
          vectorResult,
        });
        checkpoint = updated.checkpoint!;

        this.realtimeService.updateStage(jobId, {
          internalStage: 'INDEX',
          stageStatus: 'completed',
          progress: 0.80,
          itemsProcessed: {
            chunks: chunks.length,
            vectors: vectorResult?.vectorsIndexed || 0,
          },
        });
      }

      // -------------------------------------------------------------
      // STAGE 9: KNOWLEDGE GRAPH INTEGRATION
      // -------------------------------------------------------------
      let kgResult = checkpoint.kgResult;
      if (!kgResult && !options?.skipKnowledgeGraph && !this.isStageCompleted('KNOWLEDGE_GRAPH', checkpoint.lastCompletedStage)) {
        this.checkCancelled(jobId);
        this.realtimeService.updateStage(jobId, {
          internalStage: 'KNOWLEDGE_GRAPH',
          stageStatus: 'running',
          progress: 0.85,
        });

        kgResult = await this.graphService.processAndPersist(
          understanding,
          chunks,
          userId,
          collectionId,
          documentId,
          { tenantId: options?.tenantId || userId }
        );

        const updated = await this.checkpointManager.saveCheckpoint(jobId, 'KNOWLEDGE_GRAPH', {
          kgResult,
        });
        checkpoint = updated.checkpoint!;

        this.realtimeService.updateStage(jobId, {
          internalStage: 'KNOWLEDGE_GRAPH',
          stageStatus: 'completed',
          progress: 0.92,
          itemsProcessed: {
            chunks: chunks.length,
            vectors: vectorResult?.vectorsIndexed || 0,
            kgNodes: kgResult?.nodesCount || 0,
            kgEdges: kgResult?.edgesCount || 0,
          },
        });
      }

      // -------------------------------------------------------------
      // STAGE 10: VALIDATION (10 PRE-READY INVARIANTS & QUALITY REPORT)
      // -------------------------------------------------------------
      let qualityReport = (checkpoint as any)?.qualityReport;
      if (!qualityReport || !this.isStageCompleted('VALIDATE', checkpoint.lastCompletedStage)) {
        this.checkCancelled(jobId);
        this.realtimeService.updateStage(jobId, {
          internalStage: 'VALIDATE',
          stageStatus: 'running',
          progress: 0.95,
        });

        // Run full 10-invariant validation suite
        qualityReport = await this.qualityValidationService.evaluateDocumentQuality(
          collectionId,
          documentId,
          {
            tenantId: options?.tenantId || userId,
            skipKnowledgeGraph: options?.skipKnowledgeGraph,
            skipVectorIndexing: options?.skipVectorIndexing,
          }
        );

        if (!qualityReport.isReadyValid || qualityReport.healthStatus === 'Failed') {
          const failureMsg = qualityReport.failures.join('; ') || 'Critical pre-READY quality invariants failed';
          throw new Error(`Pipeline quality validation failed: ${failureMsg}`);
        }

        const updated = await this.checkpointManager.saveCheckpoint(jobId, 'VALIDATE', {
          qualityReport,
        });
        checkpoint = updated.checkpoint!;

        this.realtimeService.updateStage(jobId, {
          internalStage: 'VALIDATE',
          stageStatus: 'completed',
          progress: 0.98,
        });
      }

      // -------------------------------------------------------------
      // STAGE 11: READY
      // -------------------------------------------------------------
      await this.checkpointManager.saveCheckpoint(jobId, 'READY', {});

      this.realtimeService.updateStage(jobId, {
        internalStage: 'READY',
        stageStatus: 'completed',
        progress: 1.0,
        itemsProcessed: {
          chunks: chunks.length,
          vectors: vectorResult?.vectorsIndexed || 0,
          kgNodes: kgResult?.nodesCount || 0,
          kgEdges: kgResult?.edgesCount || 0,
        },
      });

      // Mark source status as READY and record quality report metrics in Firestore
      try {
        await db
          .collection('notebooks')
          .doc(collectionId)
          .collection('sources')
          .doc(documentId)
          .set({
            status: 'READY',
            currentStage: 'READY',
            updatedAt: Date.now(),
            chunksExtracted: chunks.length,
            conceptsExtracted: kgResult?.nodesCount || 0,
            qualityScore: qualityReport?.overallScore ?? 92,
            healthStatus: qualityReport?.healthStatus ?? 'Healthy',
            qualitySummary: {
              overallScore: qualityReport?.overallScore ?? 92,
              healthStatus: qualityReport?.healthStatus ?? 'Healthy',
              warningsCount: qualityReport?.warnings?.length ?? 0,
              passedInvariants: qualityReport?.summary?.passedInvariants ?? 10,
              totalInvariants: qualityReport?.summary?.totalInvariants ?? 10,
            },
            // Same fix as ContentSourceService.transitionState: a document that failed once
            // and was later retried to a genuine READY here must not still carry
            // failedAt/failureReason/errorDetails from the dead attempt - {merge:true}
            // preserves whatever isn't listed, so without this a successful retry looks
            // permanently failed to anyone reading the raw record.
            failedAt: admin.firestore.FieldValue.delete(),
            failureReason: admin.firestore.FieldValue.delete(),
            errorDetails: admin.firestore.FieldValue.delete(),
          }, { merge: true });
      } catch {
        // Non-fatal
      }

      return {
        jobId,
        documentId,
        documentVersionId,
        collectionId,
        userId,
        status: 'COMPLETED',
        finalStage: 'READY',
        durationMs: Date.now() - startTime,
        chunksIndexed: chunks.length,
        vectorsIndexed: vectorResult?.vectorsIndexed || 0,
        kgNodesCreated: kgResult?.nodesCount || 0,
        kgEdgesCreated: kgResult?.edgesCount || 0,
      };
    } catch (err: any) {
      const error: ProcessingError = {
        code: err.code || 'PIPELINE_STAGE_ERROR',
        message: err.message || 'Pipeline stage failed',
        stage: checkpoint.lastCompletedStage,
        recoverable: this.isRecoverableError(err),
        timestamp: Date.now(),
      };

      await this.checkpointManager.recordFailure(jobId, error);
      this.realtimeService.updateStage(jobId, {
        internalStage: checkpoint.lastCompletedStage,
        stageStatus: 'failed',
        error,
      });

      // Also mark source as FAILED in Firestore
      try {
        await db
          .collection('notebooks')
          .doc(collectionId)
          .collection('sources')
          .doc(documentId)
          .set({
            status: 'FAILED',
            failureReason: error.message,
            failedAt: Date.now(),
            updatedAt: Date.now(),
          }, { merge: true });
      } catch {
        // Non-fatal
      }

      return {
        jobId,
        documentId,
        documentVersionId,
        collectionId,
        userId,
        status: 'FAILED',
        finalStage: checkpoint.lastCompletedStage,
        durationMs: Date.now() - startTime,
        chunksIndexed: checkpoint.chunks?.length || 0,
        vectorsIndexed: checkpoint.vectorResult?.vectorsIndexed || 0,
        kgNodesCreated: checkpoint.kgResult?.nodesCount || 0,
        kgEdgesCreated: checkpoint.kgResult?.edgesCount || 0,
        error,
      };
    }
  }

  /**
   * Resumes a failed or interrupted job from its last valid checkpoint.
   */
  async resumeJob(jobId: string): Promise<OrchestratorResult> {
    const job = await this.checkpointManager.getJob(jobId);
    if (!job) {
      throw new Error(`Cannot resume: Job ${jobId} not found`);
    }

    if (job.status === 'COMPLETED') {
      return {
        jobId,
        documentId: job.documentId,
        documentVersionId: job.documentVersionId,
        collectionId: job.collectionId,
        userId: job.userId,
        status: 'COMPLETED',
        finalStage: 'READY',
        durationMs: 0,
        chunksIndexed: job.checkpoint?.chunks?.length || 0,
        vectorsIndexed: job.checkpoint?.vectorResult?.vectorsIndexed || 0,
        kgNodesCreated: job.checkpoint?.kgResult?.nodesCount || 0,
        kgEdgesCreated: job.checkpoint?.kgResult?.edgesCount || 0,
      };
    }

    return this.executePipeline(jobId);
  }

  // -------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------

  private isStageCompleted(stage: ProcessingStageName, lastCompleted: ProcessingStageName): boolean {
    const stageOrder: ProcessingStageName[] = [
      'UPLOAD',
      'QUEUE',
      'EXTRACT',
      'OCR',
      'STRUCTURE',
      'METADATA',
      'CHUNK',
      'EMBED',
      'INDEX',
      'KNOWLEDGE_GRAPH',
      'VALIDATE',
      'READY',
      'COMPLETE',
    ];

    const targetIdx = stageOrder.indexOf(stage);
    const lastIdx = stageOrder.indexOf(lastCompleted);
    return lastIdx >= targetIdx;
  }

  private isRecoverableError(err: any): boolean {
    const msg = (err.message || '').toLowerCase();
    return (
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('503') ||
      msg.includes('service unavailable')
    );
  }
}

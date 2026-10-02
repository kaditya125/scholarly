/**
 * usePipelineRealtime — document processing status for the Content Pipeline "Processing" tab.
 *
 * This used to open an SSE stream at /notebooks/:id/sources/:sourceId/stream and offer cancel/
 * retry at .../cancel and .../retry. None of those endpoints exist: real uploads are processed by
 * sourceController.uploadSource, not by ContentPipelineOrchestrator (whose realtime events the
 * stream was meant to relay), so there is no live stage feed to subscribe to and no job to cancel.
 * The hook reconnected against a 404 forever and the tracker said "Reconnecting…".
 *
 * It now reports what IS known — the source document's stored processing status — without any
 * network call, and says plainly that live stage tracking is not available. Retrying a failed
 * document stays with the caller's own `onRetry` (the notebook re-upload path), which does exist.
 */
import { useMemo } from 'react';
import type { PipelineRealtimeSnapshot, PipelineRealtimeStage, VisualStageName } from '../types/pipeline.types';
import type { ProcessingStatus } from '../types';

const STAGES: Array<{ stage: VisualStageName; internalStage: string }> = [
  { stage: 'Uploading', internalStage: 'QUEUE' },
  { stage: 'Extraction', internalStage: 'EXTRACT' },
  { stage: 'OCR', internalStage: 'OCR' },
  { stage: 'Understanding', internalStage: 'METADATA' },
  { stage: 'Chunking', internalStage: 'CHUNK' },
  { stage: 'Embedding', internalStage: 'EMBED' },
  { stage: 'Vector Index', internalStage: 'INDEX' },
  { stage: 'Knowledge Graph', internalStage: 'KNOWLEDGE_GRAPH' },
  { stage: 'Validation', internalStage: 'VALIDATE' },
  { stage: 'Ready', internalStage: 'READY' },
];

/** Index of the stage a stored status says the document is in; -1 = not started. */
const STAGE_OF: Partial<Record<ProcessingStatus, number>> = {
  DRAFT: -1, QUEUED: 0, PENDING: 0, UPLOADING: 0, PROCESSING: 1, EXTRACTING: 1, OCR: 2,
  CHUNKING: 4, EMBEDDING: 5, INDEXING: 6, GENERATING_GRAPH: 7,
};

export interface PipelineStatusSource {
  id: string;
  notebookId: string;
  status: ProcessingStatus;
  processingDurationMs?: number;
  failureReason?: string;
  errorDetails?: string;
}

export function deriveStatusSnapshot(source: PipelineStatusSource): PipelineRealtimeSnapshot {
  const s = source.status;
  const done = s === 'READY' || s === 'ARCHIVED';
  const failed = s === 'FAILED' || s === 'FAILED_NONRETRYABLE';
  const cancelled = s === 'CANCELLED';
  const at = STAGE_OF[s] ?? -1;

  const stages: PipelineRealtimeStage[] = STAGES.map((st, i) => ({
    ...st,
    durationMs: 0,
    status: done ? 'completed' : at < 0 ? 'pending' : i < at ? 'completed' : i === at ? (failed ? 'failed' : 'running') : 'pending',
  }));

  return {
    jobId: source.id,
    documentId: source.id,
    documentVersionId: source.id,
    collectionId: source.notebookId,
    status: done ? 'COMPLETED' : failed ? 'FAILED' : cancelled ? 'CANCELLED' : at < 0 ? 'QUEUED' : 'ACTIVE',
    currentStage: done ? 'Ready' : STAGES[Math.max(0, at)].stage,
    internalStage: done ? 'READY' : STAGES[Math.max(0, at)].internalStage,
    progress: done ? 1 : at < 0 ? 0 : at / STAGES.length,
    durationMs: source.processingDurationMs ?? 0,
    itemsProcessed: {},
    error: failed
      ? { code: s, message: source.failureReason || source.errorDetails || 'Processing failed.', recoverable: s === 'FAILED' }
      : undefined,
    canRetry: s === 'FAILED',
    canCancel: false,
  } as PipelineRealtimeSnapshot;
}

export function usePipelineRealtime(source: PipelineStatusSource) {
  const snapshot = useMemo(() => deriveStatusSnapshot(source), [
    source.id, source.notebookId, source.status, source.processingDurationMs, source.failureReason, source.errorDetails,
  ]);
  return {
    snapshot,
    stages: snapshot.stages,
    currentStage: snapshot.currentStage,
    progress: snapshot.progress,
    status: snapshot.status,
    durationMs: snapshot.durationMs,
    itemsProcessed: snapshot.itemsProcessed,
    error: snapshot.error ?? null,
    canRetry: snapshot.canRetry,
    canCancel: false,
    /** There is no live stage feed for real uploads; the tracker labels the state accordingly. */
    liveTrackingAvailable: false as const,
    isConnected: false,
  };
}

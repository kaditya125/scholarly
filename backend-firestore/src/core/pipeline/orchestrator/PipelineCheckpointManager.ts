/**
 * PipelineCheckpointManager
 * Phase 5: Stage Checkpointing & Failure Recovery
 *
 * Manages intermediate pipeline artifacts and state persistence across all stages:
 * UPLOAD -> QUEUE -> EXTRACT -> OCR -> STRUCTURE -> METADATA -> CHUNK -> EMBED -> INDEX -> KNOWLEDGE_GRAPH -> VALIDATE -> READY
 */

import { db } from '../../../config/firebase';
import {
  PipelineJobState,
  StageCheckpoint,
  ProcessingStageName,
  ProcessingError,
} from '../types';

export const STAGE_PROGRESS_MAP: Record<ProcessingStageName, number> = {
  UPLOAD: 0.05,
  QUEUE: 0.10,
  EXTRACT: 0.20,
  OCR: 0.30,
  STRUCTURE: 0.45,
  METADATA: 0.55,
  CHUNK: 0.65,
  EMBED: 0.75,
  INDEX: 0.85,
  KNOWLEDGE_GRAPH: 0.92,
  VALIDATE: 0.98,
  COMPLETE: 1.00,
  READY: 1.00,
};

export class PipelineCheckpointManager {
  private inMemoryJobs = new Map<string, PipelineJobState>();

  /**
   * Initializes or registers a new pipeline job.
   */
  async createJob(state: PipelineJobState): Promise<PipelineJobState> {
    this.inMemoryJobs.set(state.jobId, { ...state });

    try {
      await db
        .collection('notebooks')
        .doc(state.collectionId)
        .collection('jobs')
        .doc(state.jobId)
        .set({
          jobId: state.jobId,
          documentId: state.documentId,
          documentVersionId: state.documentVersionId,
          collectionId: state.collectionId,
          userId: state.userId,
          tenantId: state.tenantId || state.userId,
          currentStage: state.currentStage,
          status: state.status,
          progress: state.progress,
          startedAt: state.startedAt,
          updatedAt: state.updatedAt,
          retryCount: state.retryCount,
          maxRetries: state.maxRetries,
        }, { merge: true });
    } catch {
      // Non-fatal if Firestore write fails in testing environments
    }

    return this.inMemoryJobs.get(state.jobId)!;
  }

  /**
   * Retrieves the current job state from memory or Firestore.
   */
  async getJob(jobId: string, collectionId?: string): Promise<PipelineJobState | null> {
    const memoryJob = this.inMemoryJobs.get(jobId);
    if (memoryJob) return memoryJob;

    if (collectionId) {
      try {
        const snap = await db
          .collection('notebooks')
          .doc(collectionId)
          .collection('jobs')
          .doc(jobId)
          .get();

        if (snap.exists) {
          return snap.data() as PipelineJobState;
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Updates stage progress and saves the intermediate stage checkpoint.
   */
  async saveCheckpoint(
    jobId: string,
    stage: ProcessingStageName,
    checkpointUpdate: Partial<StageCheckpoint>
  ): Promise<PipelineJobState> {
    const current = this.inMemoryJobs.get(jobId);
    const existingCheckpoint: StageCheckpoint = current?.checkpoint || {
      lastCompletedStage: 'QUEUE',
      updatedAt: Date.now(),
    };

    const updatedCheckpoint: StageCheckpoint = {
      ...existingCheckpoint,
      ...checkpointUpdate,
      lastCompletedStage: stage,
      updatedAt: Date.now(),
    };

    const progress = STAGE_PROGRESS_MAP[stage] || 0.5;

    const updatedState: PipelineJobState = {
      ...(current || {
        jobId,
        documentId: '',
        documentVersionId: 'v1',
        collectionId: '',
        userId: '',
        status: 'ACTIVE',
        startedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
      }),
      currentStage: stage,
      status: stage === 'READY' || stage === 'COMPLETE' ? 'COMPLETED' : 'ACTIVE',
      progress,
      updatedAt: Date.now(),
      completedAt: stage === 'READY' || stage === 'COMPLETE' ? Date.now() : undefined,
      checkpoint: updatedCheckpoint,
    };

    this.inMemoryJobs.set(jobId, updatedState);

    // Update Firestore
    if (updatedState.collectionId) {
      try {
        await db
          .collection('notebooks')
          .doc(updatedState.collectionId)
          .collection('jobs')
          .doc(jobId)
          .set({
            currentStage: stage,
            status: updatedState.status,
            progress,
            updatedAt: Date.now(),
            completedAt: updatedState.completedAt || null,
          }, { merge: true });
      } catch {
        // Non-fatal
      }
    }

    return updatedState;
  }

  /**
   * Marks a job as failed and records the error details.
   */
  async recordFailure(jobId: string, error: ProcessingError): Promise<PipelineJobState | null> {
    const current = this.inMemoryJobs.get(jobId);
    if (!current) return null;

    const updated: PipelineJobState = {
      ...current,
      status: 'FAILED',
      error,
      updatedAt: Date.now(),
      retryCount: current.retryCount + 1,
    };

    this.inMemoryJobs.set(jobId, updated);

    if (current.collectionId) {
      try {
        await db
          .collection('notebooks')
          .doc(current.collectionId)
          .collection('jobs')
          .doc(jobId)
          .set({
            status: 'FAILED',
            error,
            retryCount: updated.retryCount,
            updatedAt: Date.now(),
          }, { merge: true });
      } catch {
        // Non-fatal
      }
    }

    return updated;
  }
}

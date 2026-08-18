/**
 * PipelineRealtimeService
 * Phase 6: Real-Time Processing Experience & SSE Streaming
 * 
 * Reuses the existing Express text/event-stream infrastructure in Sadhya.
 * Provides live stage-by-stage broadcasts, instant snapshot hydration for
 * reconnects and page reloads, and multi-document stream isolation.
 */

import { Response } from 'express';
import { EventEmitter } from 'events';
import {
  ProcessingStageName,
  VisualStageName,
  StageVisualStatus,
  PipelineRealtimeStage,
  PipelineRealtimeSnapshot,
  PipelineRealtimeEvent,
  StageItemMetrics,
  ProcessingError,
} from '../types';

export interface SSEClient {
  id: string;
  res: Response;
  userId?: string;
  collectionId?: string;
  documentId?: string;
  jobId?: string;
  connectedAt: number;
}

export const VISUAL_STAGES_CONFIG: Array<{
  visualName: VisualStageName;
  internalStages: ProcessingStageName[];
}> = [
  { visualName: 'Uploading', internalStages: ['UPLOAD', 'QUEUE'] },
  { visualName: 'Extraction', internalStages: ['EXTRACT'] },
  { visualName: 'OCR', internalStages: ['OCR'] },
  { visualName: 'Understanding', internalStages: ['STRUCTURE', 'METADATA'] },
  { visualName: 'Chunking', internalStages: ['CHUNK'] },
  { visualName: 'Embedding', internalStages: ['EMBED'] },
  { visualName: 'Vector Index', internalStages: ['INDEX'] },
  { visualName: 'Knowledge Graph', internalStages: ['KNOWLEDGE_GRAPH'] },
  { visualName: 'Validation', internalStages: ['VALIDATE'] },
  { visualName: 'Ready', internalStages: ['READY'] },
];

export class PipelineRealtimeService extends EventEmitter {
  private static instance: PipelineRealtimeService;
  private clients: Map<string, SSEClient> = new Map();
  private snapshots: Map<string, PipelineRealtimeSnapshot> = new Map();
  private docToJobMap: Map<string, string> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(200);
    this.startHeartbeat();
  }

  public static getInstance(): PipelineRealtimeService {
    if (!PipelineRealtimeService.instance) {
      PipelineRealtimeService.instance = new PipelineRealtimeService();
    }
    return PipelineRealtimeService.instance;
  }

  // ----------------------------------------------------------------
  // Client Connection Management
  // ----------------------------------------------------------------

  /**
   * Registers an Express Response stream for Server-Sent Events.
   * Immediately delivers a full 'init' snapshot for instant hydration.
   */
  public registerClient(
    res: Response,
    filter: {
      userId?: string;
      collectionId?: string;
      documentId?: string;
      jobId?: string;
    }
  ): () => void {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Set standard SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering (Nginx)
    res.flushHeaders?.();

    const client: SSEClient = {
      id: clientId,
      res,
      ...filter,
      connectedAt: Date.now(),
    };

    this.clients.set(clientId, client);

    // Send instant hydration snapshot
    this.sendInitialHydration(client);

    // Clean up on disconnect
    const cleanup = () => {
      this.clients.delete(clientId);
      try {
        if (!res.writableEnded) {
          res.end();
        }
      } catch {
        // Ignored
      }
    };

    res.on('close', cleanup);
    res.on('finish', cleanup);
    res.on('error', cleanup);

    return cleanup;
  }

  /**
   * Pushes the current snapshot state immediately to a newly connected or reconnected client.
   */
  private sendInitialHydration(client: SSEClient): void {
    let snapshot: PipelineRealtimeSnapshot | undefined;

    if (client.jobId && this.snapshots.has(client.jobId)) {
      snapshot = this.snapshots.get(client.jobId);
    } else if (client.documentId) {
      const jobId = this.docToJobMap.get(client.documentId);
      if (jobId && this.snapshots.has(jobId)) {
        snapshot = this.snapshots.get(jobId);
      }
    }

    if (snapshot) {
      this.writeEvent(client.res, {
        ...snapshot,
        type: 'init',
      });
    } else if (client.documentId) {
      // Provide an initial pending state for a document not yet initialized
      const initial = this.createDefaultSnapshot({
        jobId: client.jobId || `job_${client.documentId}`,
        documentId: client.documentId,
        documentVersionId: 'v1',
        collectionId: client.collectionId || 'default',
        userId: client.userId,
      });
      this.writeEvent(client.res, {
        ...initial,
        type: 'init',
      });
    }
  }

  // ----------------------------------------------------------------
  // Snapshot & State Initialization
  // ----------------------------------------------------------------

  public createDefaultSnapshot(params: {
    jobId: string;
    documentId: string;
    documentVersionId: string;
    collectionId: string;
    userId?: string;
  }): PipelineRealtimeSnapshot {
    const stages: PipelineRealtimeStage[] = VISUAL_STAGES_CONFIG.map((cfg) => ({
      stage: cfg.visualName,
      internalStage: cfg.internalStages[0],
      status: 'pending',
      durationMs: 0,
    }));

    const snapshot: PipelineRealtimeSnapshot = {
      jobId: params.jobId,
      documentId: params.documentId,
      documentVersionId: params.documentVersionId,
      collectionId: params.collectionId,
      userId: params.userId,
      status: 'QUEUED',
      currentStage: 'Uploading',
      internalStage: 'QUEUE',
      progress: 0.0,
      durationMs: 0,
      itemsProcessed: {},
      stages,
      canRetry: false,
      canCancel: true,
      timestamp: Date.now(),
    };

    this.snapshots.set(params.jobId, snapshot);
    this.docToJobMap.set(params.documentId, params.jobId);
    return snapshot;
  }

  public getSnapshot(jobId: string): PipelineRealtimeSnapshot | null {
    return this.snapshots.get(jobId) || null;
  }

  public getSnapshotByDocument(documentId: string): PipelineRealtimeSnapshot | null {
    const jobId = this.docToJobMap.get(documentId);
    if (!jobId) return null;
    return this.snapshots.get(jobId) || null;
  }

  // ----------------------------------------------------------------
  // Stage Updates & Realtime Broadcasting
  // ----------------------------------------------------------------

  /**
   * Broadcasts a live stage update to matching SSE subscribers.
   */
  public updateStage(
    jobId: string,
    update: {
      internalStage: ProcessingStageName;
      stageStatus: StageVisualStatus;
      progress?: number;
      itemsProcessed?: StageItemMetrics;
      durationMs?: number;
      error?: ProcessingError;
      eventType?: PipelineRealtimeEvent['type'];
    }
  ): PipelineRealtimeSnapshot {
    let snapshot = this.snapshots.get(jobId);
    if (!snapshot) {
      snapshot = this.createDefaultSnapshot({
        jobId,
        documentId: 'unknown',
        documentVersionId: 'v1',
        collectionId: 'unknown',
      });
    }

    const visualName = this.mapInternalToVisualStage(update.internalStage);
    const now = Date.now();

    // Update the stage in snapshot.stages
    const stageIdx = snapshot.stages.findIndex((s) => s.stage === visualName);
    if (stageIdx !== -1) {
      const currentStageObj = snapshot.stages[stageIdx];
      currentStageObj.status = update.stageStatus;
      currentStageObj.internalStage = update.internalStage;
      if (update.durationMs !== undefined) {
        currentStageObj.durationMs = update.durationMs;
      }
      if (update.stageStatus === 'running' && !currentStageObj.startedAt) {
        currentStageObj.startedAt = now;
      }
      if (update.stageStatus === 'completed') {
        currentStageObj.completedAt = now;
        if (currentStageObj.startedAt) {
          currentStageObj.durationMs = now - currentStageObj.startedAt;
        }
      }
      if (update.error) {
        currentStageObj.error = update.error.message;
      }
    }

    // Mark previous stages as completed if this stage is running/completed
    if (update.stageStatus === 'running' || update.stageStatus === 'completed') {
      for (let i = 0; i < stageIdx; i++) {
        if (snapshot.stages[i].status !== 'completed' && snapshot.stages[i].status !== 'skipped') {
          snapshot.stages[i].status = 'completed';
        }
      }
    }

    // Update overall snapshot metrics
    snapshot.currentStage = visualName;
    snapshot.internalStage = update.internalStage;
    if (update.progress !== undefined) {
      snapshot.progress = update.progress;
    }
    if (update.itemsProcessed) {
      snapshot.itemsProcessed = {
        ...snapshot.itemsProcessed,
        ...update.itemsProcessed,
      };
    }
    if (update.error) {
      snapshot.error = update.error;
      snapshot.status = 'FAILED';
      snapshot.canRetry = true;
      snapshot.canCancel = false;
    } else if (update.internalStage === 'READY' && update.stageStatus === 'completed') {
      snapshot.status = 'COMPLETED';
      snapshot.progress = 1.0;
      snapshot.canRetry = false;
      snapshot.canCancel = false;
    } else {
      snapshot.status = 'ACTIVE';
      snapshot.canCancel = true;
      snapshot.canRetry = false;
    }

    snapshot.timestamp = now;

    // Determine event type
    let eventType: PipelineRealtimeEvent['type'] = update.eventType || 'stage_progress';
    if (!update.eventType) {
      if (update.error) eventType = 'job_error';
      else if (snapshot.status === 'COMPLETED') eventType = 'job_complete';
      else if (update.stageStatus === 'running') eventType = 'stage_start';
      else if (update.stageStatus === 'completed') eventType = 'stage_complete';
    }

    const event: PipelineRealtimeEvent = {
      ...snapshot,
      type: eventType,
    };

    this.broadcast(event);
    this.emit('pipeline_event', event);
    return snapshot;
  }

  /**
   * Broadcasts cancellation event
   */
  public markCancelled(jobId: string, reason = 'Cancelled by user'): PipelineRealtimeSnapshot | null {
    const snapshot = this.snapshots.get(jobId);
    if (!snapshot) return null;

    snapshot.status = 'CANCELLED';
    snapshot.canCancel = false;
    snapshot.canRetry = true;
    snapshot.timestamp = Date.now();

    // Mark current running stage as failed/cancelled
    for (const stage of snapshot.stages) {
      if (stage.status === 'running') {
        stage.status = 'failed';
        stage.error = reason;
      }
    }

    const event: PipelineRealtimeEvent = {
      ...snapshot,
      type: 'job_cancelled',
      error: {
        code: 'JOB_CANCELLED',
        message: reason,
        stage: snapshot.internalStage,
        recoverable: true,
        timestamp: Date.now(),
      },
    };

    this.broadcast(event);
    this.emit('pipeline_event', event);
    return snapshot;
  }

  // ----------------------------------------------------------------
  // Helper & Broadcast Methods
  // ----------------------------------------------------------------

  private mapInternalToVisualStage(stage: ProcessingStageName): VisualStageName {
    for (const cfg of VISUAL_STAGES_CONFIG) {
      if (cfg.internalStages.includes(stage)) {
        return cfg.visualName;
      }
    }
    return 'Uploading';
  }

  private broadcast(event: PipelineRealtimeEvent): void {
    for (const [clientId, client] of this.clients.entries()) {
      // Filter matching subscribers
      if (client.jobId && client.jobId !== event.jobId) continue;
      if (client.documentId && client.documentId !== event.documentId) continue;
      if (client.collectionId && client.collectionId !== event.collectionId) continue;
      if (client.userId && event.userId && client.userId !== event.userId) continue;

      this.writeEvent(client.res, event);
    }
  }

  private writeEvent(res: Response, data: any): void {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      res.flushHeaders?.();
    } catch {
      // Error writing to closed response; handled by close listener
    }
  }

  private startHeartbeat(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    // Heartbeat every 15 seconds to keep SSE connection warm
    this.pingInterval = setInterval(() => {
      for (const client of this.clients.values()) {
        try {
          client.res.write(`: ping\n\n`);
          client.res.flushHeaders?.();
        } catch {
          // Ignored
        }
      }
    }, 15000);
    if (this.pingInterval.unref) {
      this.pingInterval.unref();
    }
  }

  public getConnectedClientsCount(): number {
    return this.clients.size;
  }

  public clear(): void {
    this.snapshots.clear();
    this.docToJobMap.clear();
  }
}

export const pipelineRealtimeService = PipelineRealtimeService.getInstance();

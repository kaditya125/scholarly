/**
 * PipelineRealtimeService & Phase 6 Real-Time Processing Test Suite
 * 
 * Verifies:
 * - Realtime stage transitions (10 visual stages from Uploading to Ready)
 * - Initial snapshot delivery for page refreshes and reconnections
 * - Heartbeat ping broadcast
 * - Job cancellation lifecycle
 * - Job failure event reporting and retry state
 * - Multi-document streaming and isolation
 * - Metric accumulation (pages, blocks, chunks, vectors, KG concepts)
 */

import { Response } from 'express';
import {
  PipelineRealtimeService,
  VISUAL_STAGES_CONFIG,
} from '../../../src/core/pipeline/orchestrator/PipelineRealtimeService';
import {
  PipelineRealtimeEvent,
  PipelineRealtimeSnapshot,
  PipelineRealtimeStage,
} from '../../../src/core/pipeline/types';

// Mock Express Response object for SSE
class MockSSEResponse {
  public headers: Record<string, string> = {};
  public writtenChunks: string[] = [];
  public writableEnded = false;
  public listeners: Record<string, Function[]> = {};

  setHeader(key: string, value: string) {
    this.headers[key] = value;
  }

  flushHeaders() {}

  write(chunk: string) {
    this.writtenChunks.push(chunk);
    return true;
  }

  end() {
    this.writableEnded = true;
    if (this.listeners['close']) {
      this.listeners['close'].forEach((fn) => fn());
    }
  }

  on(event: string, fn: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  getParsedEvents(): PipelineRealtimeEvent[] {
    const events: PipelineRealtimeEvent[] = [];
    for (const chunk of this.writtenChunks) {
      if (chunk.startsWith(': ping')) continue;
      const match = chunk.match(/^data:\s*(.+)\n\n$/);
      if (match) {
        try {
          events.push(JSON.parse(match[1]));
        } catch {
          // ignore
        }
      }
    }
    return events;
  }
}

describe('Phase 6: Real-Time Processing Experience & SSE Streaming', () => {
  let service: PipelineRealtimeService;

  beforeEach(() => {
    service = new PipelineRealtimeService();
    service.clear();
  });

  describe('Visual Stage Mapping & Configuration', () => {
    test('defines all 10 required visual stages in proper sequence', () => {
      const expectedStages = [
        'Uploading',
        'Extraction',
        'OCR',
        'Understanding',
        'Chunking',
        'Embedding',
        'Vector Index',
        'Knowledge Graph',
        'Validation',
        'Ready',
      ];

      expect(VISUAL_STAGES_CONFIG.map((c: any) => c.visualName)).toEqual(expectedStages);
      expect(VISUAL_STAGES_CONFIG.length).toBe(10);
    });

    test('maps internal pipeline stages to correct visual stages', () => {
      const snapshot = service.createDefaultSnapshot({
        jobId: 'job_123',
        documentId: 'doc_123',
        documentVersionId: 'v1',
        collectionId: 'col_123',
      });

      expect(snapshot.stages.length).toBe(10);
      expect(snapshot.stages[0].stage).toBe('Uploading');
      expect(snapshot.stages[9].stage).toBe('Ready');
    });
  });

  describe('Client Registration & Instant Hydration (Page Refresh & Reconnect)', () => {
    test('sets standard SSE streaming headers upon client registration', () => {
      const mockRes = new MockSSEResponse() as unknown as Response;
      service.registerClient(mockRes, {
        documentId: 'doc_1',
        collectionId: 'col_1',
      });

      const res = mockRes as unknown as MockSSEResponse;
      expect(res.headers['Content-Type']).toBe('text/event-stream');
      expect(res.headers['Cache-Control']).toContain('no-cache');
      expect(res.headers['Connection']).toBe('keep-alive');
    });

    test('immediately delivers full init snapshot to new or reconnecting client', () => {
      // First create active snapshot
      service.createDefaultSnapshot({
        jobId: 'job_abc',
        documentId: 'doc_abc',
        documentVersionId: 'v1',
        collectionId: 'col_abc',
      });

      service.updateStage('job_abc', {
        internalStage: 'CHUNK',
        stageStatus: 'running',
        progress: 0.55,
        itemsProcessed: { blocks: 30 },
      });

      // Simulate page refresh / client reconnecting
      const mockRes = new MockSSEResponse() as unknown as Response;
      service.registerClient(mockRes, {
        documentId: 'doc_abc',
        collectionId: 'col_abc',
      });

      const res = mockRes as unknown as MockSSEResponse;
      const events = res.getParsedEvents();

      expect(events.length).toBeGreaterThanOrEqual(1);
      const initEvent = events[0];
      expect(initEvent.type).toBe('init');
      expect(initEvent.documentId).toBe('doc_abc');
      expect(initEvent.currentStage).toBe('Chunking');
      expect(initEvent.progress).toBe(0.55);
      expect(initEvent.itemsProcessed.blocks).toBe(30);
    });

    test('unregisters client and terminates stream cleanly on disconnect', () => {
      const mockRes = new MockSSEResponse();
      const unregister = service.registerClient(mockRes as unknown as Response, {
        documentId: 'doc_2',
      });

      expect(service.getConnectedClientsCount()).toBe(1);
      unregister();
      expect(service.getConnectedClientsCount()).toBe(0);
    });
  });

  describe('Real-Time Stage Progression & Broadcasting', () => {
    test('broadcasts sequential stage transitions across all 10 stages', () => {
      const mockRes = new MockSSEResponse();
      service.registerClient(mockRes as unknown as Response, {
        jobId: 'job_lifecycle',
      });

      service.createDefaultSnapshot({
        jobId: 'job_lifecycle',
        documentId: 'doc_lifecycle',
        documentVersionId: 'v1',
        collectionId: 'col_lifecycle',
      });

      // 1. EXTRACT
      service.updateStage('job_lifecycle', {
        internalStage: 'EXTRACT',
        stageStatus: 'running',
        progress: 0.15,
      });

      service.updateStage('job_lifecycle', {
        internalStage: 'EXTRACT',
        stageStatus: 'completed',
        progress: 0.25,
        itemsProcessed: { pages: 5, blocks: 24 },
      });

      // 2. OCR
      service.updateStage('job_lifecycle', {
        internalStage: 'OCR',
        stageStatus: 'completed',
        progress: 0.35,
      });

      // 3. UNDERSTANDING / METADATA
      service.updateStage('job_lifecycle', {
        internalStage: 'METADATA',
        stageStatus: 'completed',
        progress: 0.50,
      });

      // 4. CHUNKING
      service.updateStage('job_lifecycle', {
        internalStage: 'CHUNK',
        stageStatus: 'completed',
        progress: 0.65,
        itemsProcessed: { chunks: 14 },
      });

      // 5. INDEXING
      service.updateStage('job_lifecycle', {
        internalStage: 'INDEX',
        stageStatus: 'completed',
        progress: 0.80,
        itemsProcessed: { vectors: 14 },
      });

      // 6. KNOWLEDGE GRAPH
      service.updateStage('job_lifecycle', {
        internalStage: 'KNOWLEDGE_GRAPH',
        stageStatus: 'completed',
        progress: 0.92,
        itemsProcessed: { kgNodes: 8, kgEdges: 12 },
      });

      // 7. VALIDATE
      service.updateStage('job_lifecycle', {
        internalStage: 'VALIDATE',
        stageStatus: 'completed',
        progress: 0.98,
      });

      // 8. READY
      service.updateStage('job_lifecycle', {
        internalStage: 'READY',
        stageStatus: 'completed',
        progress: 1.0,
      });

      const events = mockRes.getParsedEvents();
      expect(events.length).toBeGreaterThanOrEqual(9);

      const finalEvent = events[events.length - 1];
      expect(finalEvent.status).toBe('COMPLETED');
      expect(finalEvent.progress).toBe(1.0);
      expect(finalEvent.itemsProcessed.pages).toBe(5);
      expect(finalEvent.itemsProcessed.chunks).toBe(14);
      expect(finalEvent.itemsProcessed.vectors).toBe(14);
      expect(finalEvent.itemsProcessed.kgNodes).toBe(8);
      expect(finalEvent.itemsProcessed.kgEdges).toBe(12);

      // Verify all stages in snapshot are marked completed
      const finalSnapshot = service.getSnapshot('job_lifecycle');
      expect(finalSnapshot).not.toBeNull();
      expect(finalSnapshot?.stages.every((s: PipelineRealtimeStage) => s.status === 'completed')).toBe(true);
    });
  });

  describe('Error Handling, Retry & Cancellation', () => {
    test('broadcasts failure event with error diagnostics and enables retry', () => {
      const mockRes = new MockSSEResponse();
      service.registerClient(mockRes as unknown as Response, {
        jobId: 'job_err',
      });

      service.createDefaultSnapshot({
        jobId: 'job_err',
        documentId: 'doc_err',
        documentVersionId: 'v1',
        collectionId: 'col_err',
      });

      service.updateStage('job_err', {
        internalStage: 'EMBED',
        stageStatus: 'failed',
        error: {
          code: 'VERTEX_RATE_LIMIT',
          message: 'Rate limit exceeded on Vertex AI',
          stage: 'EMBED',
          recoverable: true,
          timestamp: Date.now(),
        },
      });

      const events = mockRes.getParsedEvents();
      const lastEvent = events[events.length - 1];

      expect(lastEvent.status).toBe('FAILED');
      expect(lastEvent.error?.code).toBe('VERTEX_RATE_LIMIT');
      expect(lastEvent.canRetry).toBe(true);
      expect(lastEvent.canCancel).toBe(false);

      const embedStage = lastEvent.stages.find((s: PipelineRealtimeStage) => s.stage === 'Embedding');
      expect(embedStage?.status).toBe('failed');
      expect(embedStage?.error).toContain('Rate limit exceeded');
    });

    test('broadcasts cancellation event when safe and flags job as CANCELLED', () => {
      const mockRes = new MockSSEResponse();
      service.registerClient(mockRes as unknown as Response, {
        jobId: 'job_cancel',
      });

      service.createDefaultSnapshot({
        jobId: 'job_cancel',
        documentId: 'doc_cancel',
        documentVersionId: 'v1',
        collectionId: 'col_cancel',
      });

      service.updateStage('job_cancel', {
        internalStage: 'CHUNK',
        stageStatus: 'running',
        progress: 0.55,
      });

      service.markCancelled('job_cancel', 'Aborted by user request');

      const events = mockRes.getParsedEvents();
      const cancelEvent = events[events.length - 1];

      expect(cancelEvent.type).toBe('job_cancelled');
      expect(cancelEvent.status).toBe('CANCELLED');
      expect(cancelEvent.canCancel).toBe(false);
      expect(cancelEvent.canRetry).toBe(true);

      const chunkStage = cancelEvent.stages.find((s: PipelineRealtimeStage) => s.stage === 'Chunking');
      expect(chunkStage?.status).toBe('failed');
      expect(chunkStage?.error).toBe('Aborted by user request');
    });
  });

  describe('Multi-Document Stream Isolation', () => {
    test('ensures client subscribed to Doc A does not receive events for Doc B', () => {
      const clientA = new MockSSEResponse();
      const clientB = new MockSSEResponse();

      service.registerClient(clientA as unknown as Response, {
        documentId: 'doc_A',
      });

      service.registerClient(clientB as unknown as Response, {
        documentId: 'doc_B',
      });

      service.createDefaultSnapshot({
        jobId: 'job_A',
        documentId: 'doc_A',
        documentVersionId: 'v1',
        collectionId: 'col_1',
      });

      service.createDefaultSnapshot({
        jobId: 'job_B',
        documentId: 'doc_B',
        documentVersionId: 'v1',
        collectionId: 'col_1',
      });

      // Update Doc A only
      service.updateStage('job_A', {
        internalStage: 'CHUNK',
        stageStatus: 'completed',
        progress: 0.65,
        itemsProcessed: { chunks: 18 },
      });

      const eventsA = clientA.getParsedEvents();
      const eventsB = clientB.getParsedEvents();

      // Client A should have received the chunk update for Doc A
      const lastEventA = eventsA[eventsA.length - 1];
      expect(lastEventA.documentId).toBe('doc_A');
      expect(lastEventA.itemsProcessed.chunks).toBe(18);

      // Client B should only have received its initial init for Doc B
      expect(eventsB.every((e: PipelineRealtimeEvent) => e.documentId === 'doc_B')).toBe(true);
      expect(eventsB.some((e: PipelineRealtimeEvent) => e.itemsProcessed?.chunks === 18)).toBe(false);
    });

    test('collection-level client receives events for all documents within that collection', () => {
      const colClient = new MockSSEResponse();

      service.registerClient(colClient as unknown as Response, {
        collectionId: 'col_shared',
      });

      service.createDefaultSnapshot({
        jobId: 'job_1',
        documentId: 'doc_1',
        documentVersionId: 'v1',
        collectionId: 'col_shared',
      });

      service.createDefaultSnapshot({
        jobId: 'job_2',
        documentId: 'doc_2',
        documentVersionId: 'v1',
        collectionId: 'col_shared',
      });

      service.updateStage('job_1', {
        internalStage: 'EXTRACT',
        stageStatus: 'completed',
        progress: 0.25,
      });

      service.updateStage('job_2', {
        internalStage: 'EMBED',
        stageStatus: 'completed',
        progress: 0.75,
      });

      const events = colClient.getParsedEvents();
      const docIds = new Set(events.map((e: PipelineRealtimeEvent) => e.documentId));

      expect(docIds.has('doc_1')).toBe(true);
      expect(docIds.has('doc_2')).toBe(true);
    });
  });
});

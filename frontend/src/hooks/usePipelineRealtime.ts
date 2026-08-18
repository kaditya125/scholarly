/**
 * usePipelineRealtime Hook
 * Phase 6: Real-Time Document Processing SSE Consumer
 * 
 * Reuses existing SSE streaming infrastructure in Sadhya.
 * Provides live stage progression, instant snapshot hydration across page refreshes
 * and reconnects, cancellation, and retry capabilities.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  PipelineRealtimeSnapshot,
  PipelineRealtimeEvent,
  VisualStageName,
  PipelineRealtimeStage,
} from '../types/pipeline.types';
import { api } from '../lib/api/client';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5000/api';

const DEFAULT_STAGES: PipelineRealtimeStage[] = [
  { stage: 'Uploading', internalStage: 'QUEUE', status: 'pending', durationMs: 0 },
  { stage: 'Extraction', internalStage: 'EXTRACT', status: 'pending', durationMs: 0 },
  { stage: 'OCR', internalStage: 'OCR', status: 'pending', durationMs: 0 },
  { stage: 'Understanding', internalStage: 'METADATA', status: 'pending', durationMs: 0 },
  { stage: 'Chunking', internalStage: 'CHUNK', status: 'pending', durationMs: 0 },
  { stage: 'Embedding', internalStage: 'EMBED', status: 'pending', durationMs: 0 },
  { stage: 'Vector Index', internalStage: 'INDEX', status: 'pending', durationMs: 0 },
  { stage: 'Knowledge Graph', internalStage: 'KNOWLEDGE_GRAPH', status: 'pending', durationMs: 0 },
  { stage: 'Validation', internalStage: 'VALIDATE', status: 'pending', durationMs: 0 },
  { stage: 'Ready', internalStage: 'READY', status: 'pending', durationMs: 0 },
];

export interface UsePipelineRealtimeOptions {
  enabled?: boolean;
  onComplete?: (snapshot: PipelineRealtimeSnapshot) => void;
  onError?: (error: any) => void;
}

export function usePipelineRealtime(
  collectionId?: string,
  documentId?: string,
  options: UsePipelineRealtimeOptions = {}
) {
  const { enabled = true, onComplete, onError } = options;
  const { user } = useAuth();

  const [snapshot, setSnapshot] = useState<PipelineRealtimeSnapshot | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const streamUrl = documentId && collectionId
    ? `${API_BASE_URL}/notebooks/${collectionId}/sources/${documentId}/stream`
    : collectionId
    ? `${API_BASE_URL}/notebooks/${collectionId}/sources/stream`
    : null;

  const connect = useCallback(async () => {
    if (!enabled || !streamUrl || !user) return;

    // Clean up existing connection
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsConnecting(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch(streamUrl, {
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`SSE stream connection failed with status ${response.status}`);
      }

      setIsConnecting(false);
      setIsConnected(true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (isMountedRef.current) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          const trimmed = block.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // Ignore heartbeat pings / comments

          const dataLine = trimmed.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;

          const jsonStr = dataLine.replace(/^data:\s*/, '').trim();
          try {
            const event: PipelineRealtimeEvent = JSON.parse(jsonStr);

            if (isMountedRef.current) {
              setSnapshot(event);

              if (event.status === 'COMPLETED' && onComplete) {
                onComplete(event);
              }
              if (event.status === 'FAILED' && onError) {
                onError(event.error);
              }
            }
          } catch {
            // Non-JSON or malformed chunk
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;

      if (isMountedRef.current) {
        setIsConnected(false);
        setIsConnecting(false);
        setError(err.message || 'Stream disconnected');

        // Automatic exponential backoff reconnect if enabled
        if (enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connect();
            }
          }, 3000);
        }
      }
    }
  }, [enabled, streamUrl, user, onComplete, onError]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  // Cancel processing action
  const cancel = useCallback(async () => {
    if (!collectionId || !documentId) return;
    try {
      await api.post(`/notebooks/${collectionId}/sources/${documentId}/cancel`);
    } catch (err: any) {
      console.error('Failed to cancel processing:', err);
    }
  }, [collectionId, documentId]);

  // Retry processing action
  const retry = useCallback(async () => {
    if (!collectionId || !documentId) return;
    try {
      await api.post(`/notebooks/${collectionId}/sources/${documentId}/retry`);
    } catch (err: any) {
      console.error('Failed to retry processing:', err);
    }
  }, [collectionId, documentId]);

  return {
    snapshot,
    stages: snapshot?.stages || DEFAULT_STAGES,
    currentStage: snapshot?.currentStage || ('Uploading' as VisualStageName),
    progress: snapshot?.progress || 0.0,
    status: snapshot?.status || 'QUEUED',
    durationMs: snapshot?.durationMs || 0,
    itemsProcessed: snapshot?.itemsProcessed || {},
    error: snapshot?.error || (error ? { message: error, code: 'STREAM_ERROR' } : null),
    canRetry: snapshot?.canRetry ?? false,
    canCancel: snapshot?.canCancel ?? false,
    isConnected,
    isConnecting,
    cancel,
    retry,
  };
}

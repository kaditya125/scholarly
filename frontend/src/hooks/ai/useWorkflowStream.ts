import { useState, useRef, useCallback } from 'react';
import { useAuth } from '../../lib/AuthContext';

export type WorkflowStage = 'INTENT_DETECTION' | 'MEMORY_RETRIEVAL' | 'GRAPH_RETRIEVAL' | 'RAG_RETRIEVAL' | 'VERIFICATION' | 'AGENT_EXECUTION' | 'FORMATTING' | 'ANALYTICS' | 'MEMORY_UPDATE';

export interface WorkflowProgress {
  stage: WorkflowStage;
  message: string;
}

export interface StreamState {
  isStreaming: boolean;
  content: string;
  /** Reasoning prose streamed by the backend's `reasoning` events (TeacherAgent draft). */
  reasoning: string;
  progressEvents: WorkflowProgress[];
  citations: any[];
  warnings: string[];
  error: string | null;
  done: boolean;
  data: any | null; // Final metadata (citations, confidence)
}

export function useWorkflowStream() {
  const { user } = useAuth();
  const [state, setState] = useState<StreamState>({
    isStreaming: false,
    content: '',
    reasoning: '',
    progressEvents: [],
    citations: [],
    warnings: [],
    error: null,
    done: false,
    data: null
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async (
    payload: any
  ): Promise<{
    content: string;
    data: any;
    progress: WorkflowProgress[];
    reasoning: string;
    reasoningMs: number;
    citations: any[];
    warnings: string[];
  }> => {
    return new Promise(async (resolve, reject) => {
      // Reset state
      setState({
        isStreaming: true,
        content: '',
        reasoning: '',
        progressEvents: [],
        citations: [],
        warnings: [],
        error: null,
        done: false,
        data: null
      });

      // Track progress + reasoning locally so we can resolve with them even
      // though setState is async. The StudioContent chat surface needs these
      // as concrete arrays/strings at resolve time to avoid crashes on
      // `result.progress.length`.
      const localProgress: WorkflowProgress[] = [];
      const localCitations: any[] = [];
      const localWarnings: string[] = [];
      let localReasoning = '';
      let localReasoningMs = 0;
      const streamStartedAt = Date.now();

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      let finalContent = '';

    try {
      const token = await user?.getIdToken();
      
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
      
      // We use native fetch to handle the stream
      const response = await fetch(`${baseURL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported in this browser.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Parse Server-Sent Events format
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep the last incomplete chunk in the buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6).trim();
            if (dataStr === '[DONE]') {
               setState(s => ({ ...s, isStreaming: false, done: true }));
               continue;
            }
            
            try {
              const event = JSON.parse(dataStr);
              
              if (event.type === 'progress') {
                const p: WorkflowProgress = { stage: event.stage, message: event.message };
                localProgress.push(p);
                setState(s => ({
                  ...s,
                  progressEvents: [...s.progressEvents, p]
                }));
              } else if (event.type === 'chunk') {
                finalContent += event.content;
                setState(s => ({
                  ...s,
                  content: finalContent
                }));
              } else if (event.type === 'reasoning') {
                // Server event carrying reasoning text (WorkflowEngine emits the
                // TeacherAgent draft here). Mirrored into state so the reasoning
                // timeline can type it out live, not just at resolve time.
                if (typeof event.content === 'string') localReasoning += event.content;
                else if (typeof event.text === 'string') localReasoning += event.text;
                setState((s) => ({ ...s, reasoning: localReasoning }));
              } else if (event.type === 'citation') {
                localCitations.push(event.citation);
                setState(s => ({
                  ...s,
                  citations: [...s.citations, event.citation]
                }));
              } else if (event.type === 'warning') {
                localWarnings.push(event.message);
                setState(s => ({
                  ...s,
                  warnings: [...s.warnings, event.message]
                }));
              } else if (event.type === 'done') {
                localReasoningMs = Date.now() - streamStartedAt;
                if (event.data && typeof event.data === 'object') {
                  if (typeof event.data.reasoning === 'string') localReasoning = event.data.reasoning;
                  if (typeof event.data.reasoningMs === 'number') localReasoningMs = event.data.reasoningMs;
                }
                setState(s => ({
                  ...s,
                  isStreaming: false,
                  done: true,
                  data: event.data
                }));
                resolve({
                  content: finalContent,
                  data: event.data,
                  progress: localProgress,
                  reasoning: localReasoning,
                  reasoningMs: localReasoningMs,
                  citations: localCitations,
                  warnings: localWarnings,
                });
                return; // Exit loop
              } else if (event.type === 'error') {
                 setState(s => ({
                  ...s,
                  error: event.error,
                  isStreaming: false
                }));
                reject(new Error(event.error));
                return;
              }
            } catch (e) {
              console.warn('Failed to parse SSE JSON chunk:', dataStr);
            }
          }
        }
      }
      
      resolve({
        content: finalContent,
        data: null,
        progress: localProgress,
        reasoning: localReasoning,
        reasoningMs: Date.now() - streamStartedAt,
        citations: localCitations,
        warnings: localWarnings,
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setState(s => ({ ...s, error: err.message || 'Stream failed', isStreaming: false }));
        reject(err);
      } else {
        resolve({
          content: finalContent,
          data: null,
          progress: localProgress,
          reasoning: localReasoning,
          reasoningMs: Date.now() - streamStartedAt,
          citations: localCitations,
          warnings: localWarnings,
        });
      }
    }
    });
  }, [user]);

  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setState(s => ({ ...s, isStreaming: false }));
    }
  }, []);

  return {
    ...state,
    startStream,
    cancelStream
  };
}

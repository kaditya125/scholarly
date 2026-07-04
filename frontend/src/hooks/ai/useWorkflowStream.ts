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
    progressEvents: [],
    citations: [],
    warnings: [],
    error: null,
    done: false,
    data: null
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async (payload: any): Promise<{ content: string, data: any }> => {
    return new Promise(async (resolve, reject) => {
      // Reset state
      setState({
        isStreaming: true,
        content: '',
        progressEvents: [],
        citations: [],
        warnings: [],
        error: null,
        done: false,
        data: null
      });

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
                setState(s => ({
                  ...s,
                  progressEvents: [...s.progressEvents, { stage: event.stage, message: event.message }]
                }));
              } else if (event.type === 'chunk') {
                finalContent += event.content;
                setState(s => ({
                  ...s,
                  content: finalContent
                }));
              } else if (event.type === 'citation') {
                setState(s => ({
                  ...s,
                  citations: [...s.citations, event.citation]
                }));
              } else if (event.type === 'warning') {
                setState(s => ({
                  ...s,
                  warnings: [...s.warnings, event.message]
                }));
              } else if (event.type === 'done') {
                setState(s => ({
                  ...s,
                  isStreaming: false,
                  done: true,
                  data: event.data
                }));
                resolve({ content: finalContent, data: event.data });
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
      
      resolve({ content: finalContent, data: null });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setState(s => ({ ...s, error: err.message || 'Stream failed', isStreaming: false }));
        reject(err);
      } else {
        resolve({ content: finalContent, data: null });
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

import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { scanBaseURL } from '../../lib/api/scan';

export type ScanAction = 'solve' | 'explain' | 'teach' | 'similar';

export interface ScanSource { book?: string; chapter?: string; subject?: string; }
export interface ScanCitation { source: string; text: string; score: number; }

export interface ScanState {
  isStreaming: boolean;
  progress: string;
  questionText: string;
  source: ScanSource | null;
  content: string;
  citations: ScanCitation[];
  error: string | null;
  done: boolean;
}

export interface ScanPayload {
  notebookId: string;
  sourceId: string;
  action: ScanAction;
  imageBase64: string; // data: URL or raw base64
  mimeType?: string;
  page?: number;
  chapterTitle?: string;
  bookTitle?: string;
  subject?: string;
}

const INITIAL: ScanState = {
  isStreaming: false, progress: '', questionText: '', source: null,
  content: '', citations: [], error: null, done: false,
};

/**
 * Streams a scanned-question answer from POST /scan/solve. Parses the SSE events
 * (progress | extracted | citation | chunk | done | error) into reactive state so the panel can
 * show the OCR preview, live progress, streamed answer, and grounding citations.
 */
export function useScanStream() {
  const { user } = useAuth();
  const [state, setState] = useState<ScanState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (payload: ScanPayload) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setState({ ...INITIAL, isStreaming: true, progress: 'Starting…' });

    let content = '';
    try {
      const token = await user?.getIdToken();
      const resp = await fetch(`${scanBaseURL}/scan/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      });
      if (!resp.ok || !resp.body) throw new Error(`Scan request failed (${resp.status})`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') { setState((s) => ({ ...s, isStreaming: false, done: true })); continue; }
          try {
            const ev = JSON.parse(dataStr);
            if (ev.type === 'progress') setState((s) => ({ ...s, progress: ev.message || '' }));
            else if (ev.type === 'extracted') setState((s) => ({ ...s, questionText: ev.questionText || '', source: ev.source || null }));
            else if (ev.type === 'citation') setState((s) => ({ ...s, citations: [...s.citations, ev.citation] }));
            else if (ev.type === 'chunk') { content += ev.content || ''; setState((s) => ({ ...s, content })); }
            else if (ev.type === 'done') setState((s) => ({ ...s, isStreaming: false, done: true }));
            else if (ev.type === 'error') setState((s) => ({ ...s, error: ev.error || 'Scan failed', isStreaming: false }));
          } catch { /* ignore malformed SSE chunk */ }
        }
      }
      setState((s) => ({ ...s, isStreaming: false, done: true }));
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setState((s) => ({ ...s, error: e?.message || 'Scan failed', isStreaming: false }));
      }
    }
  }, [user]);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setState(INITIAL);
  }, []);

  return { ...state, start, reset };
}

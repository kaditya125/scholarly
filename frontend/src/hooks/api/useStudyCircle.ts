import { useCallback, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/AuthContext';
import {
  studyCircleApi,
  CircleKnowledgeItem,
  CircleChatTurn,
  CircleConcept,
  CircleKnowledgeSource,
} from '../../lib/api/studyCircle';

/**
 * The AI Study Circle for one group: a persistent, member-curated knowledge base plus a shared,
 * streaming AI conversation. Knowledge + chat log are react-query resources; `ask` streams tokens
 * over SSE (mirroring useWorkflowStream) and optimistically appends the finished turn to the log.
 */
export function useStudyCircle(groupId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user?.uid && !!groupId;

  const knowledgeKey = ['circleKnowledge', groupId];
  const chatKey = ['circleChat', groupId];
  const conceptsKey = ['circleConcepts', groupId];

  const knowledgeQuery = useQuery<CircleKnowledgeItem[]>({
    queryKey: knowledgeKey,
    queryFn: () => studyCircleApi.listKnowledge(groupId as string),
    enabled,
    staleTime: 1000 * 20,
    retry: false,
  });

  const chatQuery = useQuery<CircleChatTurn[]>({
    queryKey: chatKey,
    queryFn: () => studyCircleApi.chatLog(groupId as string),
    enabled,
    staleTime: 1000 * 20,
    retry: false,
  });

  const addKnowledge = useMutation({
    mutationFn: (input: { text: string; title?: string; source?: CircleKnowledgeSource }) =>
      studyCircleApi.addKnowledge(groupId as string, input),
    onSuccess: (item) => {
      qc.setQueryData<CircleKnowledgeItem[]>(knowledgeKey, (old) => [item, ...(old || [])]);
    },
  });

  const deleteKnowledge = useMutation({
    mutationFn: (itemId: string) => studyCircleApi.deleteKnowledge(groupId as string, itemId),
    onMutate: async (itemId: string) => {
      await qc.cancelQueries({ queryKey: knowledgeKey });
      const prev = qc.getQueryData<CircleKnowledgeItem[]>(knowledgeKey);
      qc.setQueryData<CircleKnowledgeItem[]>(knowledgeKey, (old) =>
        (old || []).filter((k) => k.id !== itemId)
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(knowledgeKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: knowledgeKey }),
  });

  const conceptsQuery = useQuery<CircleConcept[]>({
    queryKey: conceptsKey,
    queryFn: () => studyCircleApi.getGraph(groupId as string),
    enabled,
    staleTime: 1000 * 30,
    retry: false,
  });

  const synthesize = useMutation({
    mutationFn: () => studyCircleApi.synthesizeGraph(groupId as string),
    onSuccess: (concepts) => {
      qc.setQueryData<CircleConcept[]>(conceptsKey, concepts);
    },
  });

  // ─── Streaming ask ───────────────────────────────────────────────────────────
  const [isStreaming, setIsStreaming] = useState(false);
  const [liveQuestion, setLiveQuestion] = useState('');
  const [liveAnswer, setLiveAnswer] = useState('');
  const [askError, setAskError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (question: string) => {
      const q = (question || '').trim();
      if (!q || !groupId) return;

      setIsStreaming(true);
      setLiveQuestion(q);
      setLiveAnswer('');
      setAskError(null);

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      let answer = '';
      try {
        const token = await user?.getIdToken();
        const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
        const response = await fetch(`${baseURL}/study-groups/${groupId}/circle/ask`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ question: q }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          // Validation/membership failures return JSON (headers sent before SSE begins).
          let message = `Request failed (${response.status})`;
          try {
            const err = await response.json();
            if (err?.error) message = err.error;
          } catch {
            /* non-JSON body */
          }
          throw new Error(message);
        }
        if (!response.body) throw new Error('Streaming is not supported in this browser.');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let finished = false;

        while (!finished) {
          const { done: readerDone, value } = await reader.read();
          if (readerDone) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') {
              finished = true;
              continue;
            }
            let event: any;
            try {
              event = JSON.parse(dataStr);
            } catch {
              continue; // ignore partial/non-JSON fragments
            }
            if (event.type === 'chunk') {
              answer += event.content || '';
              setLiveAnswer(answer);
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Error generating response');
            }
          }
        }

        // Keep the answer visible by writing the finished turn into the shared log cache, then
        // reconcile with the server's persisted turn.
        if (answer.trim() && user?.uid) {
          const optimistic: CircleChatTurn = {
            id: `tmp-${Date.now()}`,
            groupId,
            askedBy: user.uid,
            askedByName: user.displayName || 'You',
            question: q,
            answer,
            createdAt: Date.now(),
          };
          qc.setQueryData<CircleChatTurn[]>(chatKey, (old) => [...(old || []), optimistic]);
        }
        qc.invalidateQueries({ queryKey: chatKey });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setAskError(err?.message || 'Failed to reach the Study Circle AI');
        }
      } finally {
        setIsStreaming(false);
        setLiveQuestion('');
        setLiveAnswer('');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupId, user, qc]
  );

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  return {
    knowledge: knowledgeQuery.data || [],
    isLoadingKnowledge: knowledgeQuery.isLoading,
    chatTurns: chatQuery.data || [],
    isLoadingChat: chatQuery.isLoading,
    addKnowledge: addKnowledge.mutateAsync,
    isAddingKnowledge: addKnowledge.isPending,
    deleteKnowledge: deleteKnowledge.mutateAsync,
    concepts: conceptsQuery.data || [],
    isLoadingConcepts: conceptsQuery.isLoading,
    synthesize: synthesize.mutateAsync,
    isSynthesizing: synthesize.isPending,
    ask,
    cancel,
    isStreaming,
    liveQuestion,
    liveAnswer,
    askError,
  };
}

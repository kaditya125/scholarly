import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query as fsQuery, where, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { dmApi, ConversationSummary, ConversationThread, DmMessage, Attachment } from '../../lib/api/dm';
import { toggleReactionLocal } from '../../lib/reactions';

/**
 * The caller's conversation list. A Firestore snapshot listener refetches the enriched list the
 * moment any of the caller's conversations changes; a slow poll remains as a backstop (and covers
 * the case where realtime security rules aren't deployed yet).
 */
export function useConversations() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery<ConversationSummary[]>({
    queryKey: ['dm', user?.uid, 'conversations'],
    queryFn: () => dmApi.conversations(),
    enabled: !!user?.uid,
    staleTime: 1000 * 10,
    refetchInterval: 20000,
  });

  useEffect(() => {
    if (!user?.uid) return;
    let first = true;
    const q = fsQuery(collection(db, 'dmConversations'), where('users', 'array-contains', user.uid));
    const unsub = onSnapshot(
      q,
      () => {
        if (first) {
          first = false;
          return; // ignore the initial snapshot (data already loaded via the query)
        }
        qc.invalidateQueries({ queryKey: ['dm', user.uid, 'conversations'] });
        qc.invalidateQueries({ queryKey: ['dm', user.uid, 'unread'] });
      },
      (err) => console.warn('DM conversations realtime unavailable (using polling):', err.message)
    );
    return () => unsub();
  }, [user?.uid, qc]);

  return {
    conversations: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/** Total unread badge count (polled). */
export function useUnreadCount() {
  const { user } = useAuth();
  const query = useQuery<number>({
    queryKey: ['dm', user?.uid, 'unread'],
    queryFn: () => dmApi.unread(),
    enabled: !!user?.uid,
    staleTime: 1000 * 15,
    refetchInterval: 30000,
  });
  return query.data || 0;
}

/**
 * A single conversation thread with `otherId`. Polls every 5s while open, sends with an optimistic
 * append, and clears the unread badge (server marks read on load; we refresh the list + count).
 */
export function useConversation(otherId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user?.uid && !!otherId;
  const threadKey = ['dm', user?.uid, 'thread', otherId];

  const query = useQuery<ConversationThread>({
    queryKey: threadKey,
    queryFn: () => dmApi.thread(otherId as string),
    enabled,
    staleTime: 1000 * 3,
    refetchInterval: enabled ? 15000 : false,
    retry: false, // a 403 (not connected) shouldn't be retried
  });

  // Opening a thread marks it read server-side; refresh the list + badge so the unread count clears.
  useEffect(() => {
    if (query.data?.id) {
      qc.invalidateQueries({ queryKey: ['dm', user?.uid, 'conversations'] });
      qc.invalidateQueries({ queryKey: ['dm', user?.uid, 'unread'] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data?.id]);

  // Realtime: listen to the conversation doc and refetch the thread on any change.
  useEffect(() => {
    if (!user?.uid || !otherId) return;
    const convId = [user.uid, otherId].sort().join('__');
    let first = true;
    const unsub = onSnapshot(
      doc(db, 'dmConversations', convId),
      () => {
        if (first) {
          first = false;
          return;
        }
        qc.invalidateQueries({ queryKey: ['dm', user.uid, 'thread', otherId] });
        qc.invalidateQueries({ queryKey: ['dm', user.uid, 'conversations'] });
        qc.invalidateQueries({ queryKey: ['dm', user.uid, 'unread'] });
        qc.invalidateQueries({ queryKey: ['dm', user.uid, 'pins', otherId] });
      },
      (err) => console.warn('DM thread realtime unavailable (using polling):', err.message)
    );
    return () => unsub();
  }, [user?.uid, otherId, qc]);

  const send = useMutation({
    mutationFn: (payload: {
      text: string;
      attachments?: Attachment[];
      replyToId?: string;
      replyTo?: { id: string; senderId: string; text: string };
    }) => dmApi.send(otherId as string, payload.text, payload.attachments, payload.replyToId),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: threadKey });
      const prev = qc.getQueryData<ConversationThread>(threadKey);
      if (prev && user?.uid) {
        const optimistic: DmMessage = {
          id: `tmp-${Date.now()}`,
          conversationId: prev.id,
          senderId: user.uid,
          text: payload.text,
          attachments: payload.attachments,
          replyTo: payload.replyTo,
          createdAt: Date.now(),
        };
        qc.setQueryData<ConversationThread>(threadKey, {
          ...prev,
          messages: [...prev.messages, optimistic],
        });
      }
      return { prev };
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.prev) qc.setQueryData(threadKey, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: threadKey });
      qc.invalidateQueries({ queryKey: ['dm', user?.uid, 'conversations'] });
      qc.invalidateQueries({ queryKey: ['dm', user?.uid, 'unread'] });
    },
  });

  const editMessage = useMutation({
    mutationFn: (v: { messageId: string; text: string }) =>
      dmApi.edit(otherId as string, v.messageId, v.text),
    onMutate: async (v: { messageId: string; text: string }) => {
      await qc.cancelQueries({ queryKey: threadKey });
      const prev = qc.getQueryData<ConversationThread>(threadKey);
      if (prev) {
        qc.setQueryData<ConversationThread>(threadKey, {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === v.messageId ? { ...m, text: v.text, editedAt: Date.now() } : m
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(threadKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: threadKey }),
  });

  const deleteMessage = useMutation({
    mutationFn: (messageId: string) => dmApi.remove(otherId as string, messageId),
    onMutate: async (messageId: string) => {
      await qc.cancelQueries({ queryKey: threadKey });
      const prev = qc.getQueryData<ConversationThread>(threadKey);
      if (prev) {
        qc.setQueryData<ConversationThread>(threadKey, {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === messageId
              ? { ...m, deleted: true, text: '', attachments: [], reactions: {} }
              : m
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(threadKey, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: threadKey });
      qc.invalidateQueries({ queryKey: ['dm', user?.uid, 'conversations'] });
    },
  });

  const react = useMutation({
    mutationFn: (v: { messageId: string; emoji: string }) =>
      dmApi.react(otherId as string, v.messageId, v.emoji),
    onMutate: async (v: { messageId: string; emoji: string }) => {
      if (!user?.uid) return { prev: undefined };
      await qc.cancelQueries({ queryKey: threadKey });
      const prev = qc.getQueryData<ConversationThread>(threadKey);
      if (prev) {
        qc.setQueryData<ConversationThread>(threadKey, {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === v.messageId ? toggleReactionLocal(m, user.uid, v.emoji) : m
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(threadKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: threadKey }),
  });

  const pinsQuery = useQuery<DmMessage[]>({
    queryKey: ['dm', user?.uid, 'pins', otherId],
    queryFn: () => dmApi.pins(otherId as string),
    enabled,
    staleTime: 1000 * 30,
  });

  const pinMessage = useMutation({
    mutationFn: (v: { messageId: string; pinned: boolean }) =>
      dmApi.pin(otherId as string, v.messageId, v.pinned),
    onMutate: async (v: { messageId: string; pinned: boolean }) => {
      await qc.cancelQueries({ queryKey: threadKey });
      const prev = qc.getQueryData<ConversationThread>(threadKey);
      if (prev) {
        qc.setQueryData<ConversationThread>(threadKey, {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === v.messageId ? { ...m, pinned: v.pinned } : m
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(threadKey, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: threadKey });
      qc.invalidateQueries({ queryKey: ['dm', user?.uid, 'pins', otherId] });
    },
  });

  return {
    thread: query.data,
    messages: query.data?.messages || [],
    peer: query.data?.peer,
    peerLastReadAt: query.data?.peerLastReadAt,
    pinnedMessages: pinsQuery.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as any,
    send: send.mutateAsync,
    isSending: send.isPending,
    react: react.mutateAsync,
    editMessage: editMessage.mutateAsync,
    deleteMessage: deleteMessage.mutateAsync,
    pinMessage: pinMessage.mutateAsync,
  };
}

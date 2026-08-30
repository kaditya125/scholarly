import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firestore';
import { useAuth } from '../../lib/AuthContext';
import {
  groupChannelsApi,
  GroupChannel,
  ChannelMessagesPage,
  GroupChannelMessage,
  ChannelSender,
  Attachment,
} from '../../lib/api/groupChannels';
import { toggleReactionLocal } from '../../lib/reactions';

/**
 * Channels in a group. A Firestore snapshot listener on the group's channels refetches the enriched
 * list on any change; a slow poll remains as a backstop (and covers the case where realtime rules
 * aren't deployed yet). Also exposes admin create / rename / delete + optimistic mark-read.
 */
export function useGroupChannels(groupId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user?.uid && !!groupId;
  const key = ['groupChannels', groupId];

  const query = useQuery<GroupChannel[]>({
    queryKey: key,
    queryFn: () => groupChannelsApi.list(groupId as string),
    enabled,
    staleTime: 1000 * 10,
    refetchInterval: enabled ? 20000 : false,
    retry: false,
  });

  useEffect(() => {
    if (!enabled || !groupId) return;
    let first = true;
    const unsub = onSnapshot(
      collection(db, 'studyGroups', groupId, 'channels'),
      () => {
        if (first) {
          first = false;
          return;
        }
        qc.invalidateQueries({ queryKey: ['groupChannels', groupId] });
      },
      (err) => console.warn('Group channels realtime unavailable (using polling):', err.message)
    );
    return () => unsub();
  }, [enabled, groupId, qc]);

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: (v: { name: string; description?: string }) =>
      groupChannelsApi.create(groupId as string, v.name, v.description),
    onSuccess: invalidate,
  });
  const rename = useMutation({
    mutationFn: (v: { channelId: string; name?: string; description?: string }) =>
      groupChannelsApi.rename(groupId as string, v.channelId, { name: v.name, description: v.description }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (channelId: string) => groupChannelsApi.remove(groupId as string, channelId),
    onSuccess: invalidate,
  });

  /** Optimistically clear a channel's unread dot (server marks read when messages load). */
  const clearUnread = (channelId: string) => {
    qc.setQueryData<GroupChannel[]>(key, (old) =>
      old?.map((c) => (c.id === channelId ? { ...c, unread: false } : c))
    );
  };

  return {
    channels: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as any,
    createChannel: create.mutateAsync,
    renameChannel: rename.mutateAsync,
    deleteChannel: remove.mutateAsync,
    clearUnread,
  };
}

/** Messages in one channel (polled) with an optimistic send. */
export function useChannelMessages(groupId?: string, channelId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user?.uid && !!groupId && !!channelId;
  const key = ['channelMessages', groupId, channelId];

  const query = useQuery<ChannelMessagesPage>({
    queryKey: key,
    queryFn: () => groupChannelsApi.messages(groupId as string, channelId as string),
    enabled,
    staleTime: 1000 * 3,
    refetchInterval: enabled ? 15000 : false,
    retry: false,
  });

  // Realtime: listen to the channel doc (its lastMessageAt bumps on every send) and refetch.
  useEffect(() => {
    if (!enabled || !groupId || !channelId) return;
    let first = true;
    const unsub = onSnapshot(
      doc(db, 'studyGroups', groupId, 'channels', channelId),
      () => {
        if (first) {
          first = false;
          return;
        }
        qc.invalidateQueries({ queryKey: ['channelMessages', groupId, channelId] });
        qc.invalidateQueries({ queryKey: ['groupChannels', groupId] });
        qc.invalidateQueries({ queryKey: ['channelPins', groupId, channelId] });
      },
      (err) => console.warn('Channel messages realtime unavailable (using polling):', err.message)
    );
    return () => unsub();
  }, [enabled, groupId, channelId, qc]);

  const send = useMutation({
    mutationFn: (payload: {
      text: string;
      attachments?: Attachment[];
      replyToId?: string;
      replyTo?: { id: string; senderId: string; text: string };
    }) =>
      groupChannelsApi.send(
        groupId as string,
        channelId as string,
        payload.text,
        payload.attachments,
        payload.replyToId
      ),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChannelMessagesPage>(key);
      if (prev && user?.uid) {
        const optimistic: GroupChannelMessage = {
          id: `tmp-${Date.now()}`,
          groupId: groupId as string,
          channelId: channelId as string,
          senderId: user.uid,
          text: payload.text,
          attachments: payload.attachments,
          replyTo: payload.replyTo,
          createdAt: Date.now(),
        };
        const senders = { ...prev.senders };
        if (!senders[user.uid]) {
          senders[user.uid] = {
            uid: user.uid,
            displayName: user.displayName || 'You',
            photoURL: user.photoURL || undefined,
          };
        }
        qc.setQueryData<ChannelMessagesPage>(key, {
          ...prev,
          messages: [...prev.messages, optimistic],
          senders,
        });
      }
      return { prev };
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['groupChannels', groupId] });
    },
  });

  const react = useMutation({
    mutationFn: (v: { messageId: string; emoji: string }) =>
      groupChannelsApi.react(groupId as string, channelId as string, v.messageId, v.emoji),
    onMutate: async (v: { messageId: string; emoji: string }) => {
      if (!user?.uid) return { prev: undefined };
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChannelMessagesPage>(key);
      if (prev) {
        qc.setQueryData<ChannelMessagesPage>(key, {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === v.messageId ? toggleReactionLocal(m, user.uid, v.emoji) : m
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const editMessage = useMutation({
    mutationFn: (v: { messageId: string; text: string }) =>
      groupChannelsApi.editMessage(groupId as string, channelId as string, v.messageId, v.text),
    onMutate: async (v: { messageId: string; text: string }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChannelMessagesPage>(key);
      if (prev) {
        qc.setQueryData<ChannelMessagesPage>(key, {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === v.messageId ? { ...m, text: v.text, editedAt: Date.now() } : m
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteMessage = useMutation({
    mutationFn: (messageId: string) =>
      groupChannelsApi.removeMessage(groupId as string, channelId as string, messageId),
    onMutate: async (messageId: string) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChannelMessagesPage>(key);
      if (prev) {
        qc.setQueryData<ChannelMessagesPage>(key, {
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
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['groupChannels', groupId] });
    },
  });

  const pinsQuery = useQuery<{ messages: GroupChannelMessage[]; senders: Record<string, ChannelSender> }>({
    queryKey: ['channelPins', groupId, channelId],
    queryFn: () => groupChannelsApi.pins(groupId as string, channelId as string),
    enabled,
    staleTime: 1000 * 30,
  });

  const pinMessage = useMutation({
    mutationFn: (v: { messageId: string; pinned: boolean }) =>
      groupChannelsApi.pin(groupId as string, channelId as string, v.messageId, v.pinned),
    onMutate: async (v: { messageId: string; pinned: boolean }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChannelMessagesPage>(key);
      if (prev) {
        qc.setQueryData<ChannelMessagesPage>(key, {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === v.messageId ? { ...m, pinned: v.pinned } : m
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['channelPins', groupId, channelId] });
    },
  });

  return {
    messages: query.data?.messages || [],
    senders: query.data?.senders || {},
    hasMore: query.data?.hasMore || false,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as any,
    send: send.mutateAsync,
    isSending: send.isPending,
    react: react.mutateAsync,
    editMessage: editMessage.mutateAsync,
    deleteMessage: deleteMessage.mutateAsync,
    pinnedMessages: pinsQuery.data?.messages || [],
    pinnedSenders: pinsQuery.data?.senders || {},
    pinMessage: pinMessage.mutateAsync,
  };
}

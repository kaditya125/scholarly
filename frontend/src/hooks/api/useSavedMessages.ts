import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/AuthContext';
import {
  savedMessagesApi,
  SavedMessageItem,
  ListSavedMessagesParams,
} from '../../lib/api/savedMessages';

export function useSavedMessages(params?: ListSavedMessagesParams) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<SavedMessageItem[]>({
    queryKey: ['savedMessages', user?.uid, params],
    queryFn: () => savedMessagesApi.list(params),
    enabled: !!user?.uid,
    staleTime: 1000 * 15,
  });

  const idsQuery = useQuery<string[]>({
    queryKey: ['savedMessageIds', user?.uid],
    queryFn: () => savedMessagesApi.ids(),
    enabled: !!user?.uid,
    staleTime: 1000 * 30,
  });

  const savedSet = new Set(idsQuery.data || []);

  const saveMutation = useMutation({
    mutationFn: savedMessagesApi.save,
    onSuccess: (savedItem) => {
      qc.invalidateQueries({ queryKey: ['savedMessages', user?.uid] });
      qc.setQueryData<string[]>(['savedMessageIds', user?.uid], (prev) => [
        ...(prev || []),
        savedItem.messageId,
      ]);
    },
  });

  const removeMutation = useMutation({
    mutationFn: savedMessagesApi.remove,
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['savedMessages', user?.uid] });
      qc.setQueryData<string[]>(['savedMessageIds', user?.uid], (prev) =>
        (prev || []).filter((msgId) => msgId !== id)
      );
    },
  });

  const toggleSave = async (payload: {
    messageId: string;
    sourceType: 'dm' | 'channel' | 'discussion';
    conversationId?: string;
    groupId?: string;
    channelId?: string;
    groupName?: string;
    channelName?: string;
    discussionId?: string;
    peerUid?: string;
    senderId: string;
    senderName: string;
    text: string;
    attachments?: any[];
    messageCreatedAt: number;
  }) => {
    if (savedSet.has(payload.messageId)) {
      await removeMutation.mutateAsync(payload.messageId);
    } else {
      await saveMutation.mutateAsync(payload);
    }
  };

  return {
    savedMessages: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    savedSet,
    isSaved: (messageId: string) => savedSet.has(messageId),
    toggleSave,
    save: saveMutation.mutateAsync,
    remove: removeMutation.mutateAsync,
    refetch: query.refetch,
  };
}

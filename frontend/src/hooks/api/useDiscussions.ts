import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { Discussion } from '../../../../backend-firestore/src/types'; 

export function useDiscussions(roomId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery<Discussion[]>({
    queryKey: ['discussions', roomId],
    queryFn: async () => {
      const url = roomId ? `/discussions?roomId=${roomId}` : '/discussions';
      const { data } = await api.get(url);
      return data;
    },
  });

  const createDiscussionMutation = useMutation({
    mutationFn: async (newThread: { topic: string, title: string, description: string, roomId: string }) => {
      const { data } = await api.post('/discussions', newThread);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions', roomId] });
    }
  });

  return {
    discussions: query.data || [],
    isLoading: query.isLoading,
    createDiscussion: createDiscussionMutation.mutateAsync,
    isCreating: createDiscussionMutation.isPending
  };
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { discussionsApi, Room, DiscussionMessage } from '../../lib/api/discussions';
import { useAuth } from '../../lib/AuthContext';

export function useDiscussions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const roomsQuery = useQuery<Room[]>({
    queryKey: ['discussion_rooms', user?.uid],
    queryFn: () => discussionsApi.getRooms(),
    enabled: !!user?.uid,
  });

  const discussionsQuery = useQuery<DiscussionMessage[]>({
    queryKey: ['discussions', user?.uid],
    queryFn: () => discussionsApi.getDiscussions(),
    enabled: !!user?.uid,
  });
  
  const sendMessageMutation = useMutation({
    mutationFn: (args: {roomId: string | number, content: string}) => discussionsApi.sendMessage(args.roomId, args.content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions', user?.uid] });
    }
  });

  return {
    rooms: roomsQuery.data || [],
    isLoadingRooms: roomsQuery.isLoading,
    discussions: discussionsQuery.data || [],
    isLoadingDiscussions: discussionsQuery.isLoading,
    sendMessage: sendMessageMutation.mutateAsync,
  };
}

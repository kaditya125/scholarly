import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/AuthContext';
import {
  communityApi,
  CommunityDiscussion,
  DiscussionFilters,
  DiscussionStatus,
} from '../../lib/api/discussions';

/** The community discussion feed for the given filters, plus create + like. */
export function useDiscussions(filters: DiscussionFilters) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ['community', 'list', filters];

  const query = useQuery<CommunityDiscussion[]>({
    queryKey: key,
    queryFn: () => communityApi.list(filters),
    enabled: !!user?.uid,
    staleTime: 1000 * 10,
  });

  const create = useMutation({
    mutationFn: (input: { topic: string; title: string; description: string; tags?: string[] }) =>
      communityApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community', 'list'] }),
  });

  const vote = useMutation({
    mutationFn: (id: string) => communityApi.vote(id),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<CommunityDiscussion[]>(key);
      if (prev) {
        qc.setQueryData<CommunityDiscussion[]>(
          key,
          prev.map((d) =>
            d.id === id
              ? { ...d, liked: !d.liked, likeCount: d.likeCount + (d.liked ? -1 : 1) }
              : d
          )
        );
      }
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['community', 'list'] }),
  });

  return {
    discussions: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    createDiscussion: create.mutateAsync,
    isCreating: create.isPending,
    vote: vote.mutateAsync,
  };
}

/** One discussion's responses + author actions (respond, best answer, status). */
export function useDiscussion(id?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user?.uid && !!id;
  const key = ['community', 'detail', id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => communityApi.get(id as string),
    enabled,
    staleTime: 1000 * 10,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['community', 'list'] });
  };

  const respond = useMutation({
    mutationFn: (text: string) => communityApi.respond(id as string, text),
    onSuccess: invalidate,
  });
  const setBest = useMutation({
    mutationFn: (responseId: string) => communityApi.setBest(id as string, responseId),
    onSuccess: invalidate,
  });
  const setStatus = useMutation({
    mutationFn: (status: DiscussionStatus) => communityApi.setStatus(id as string, status),
    onSuccess: invalidate,
  });

  return {
    discussion: query.data?.discussion,
    responses: query.data?.responses || [],
    isLoading: query.isLoading,
    respond: respond.mutateAsync,
    isResponding: respond.isPending,
    setBest: setBest.mutateAsync,
    setStatus: setStatus.mutateAsync,
  };
}

export function useTrending() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['community', 'trending'],
    queryFn: () => communityApi.trending(),
    enabled: !!user?.uid,
    staleTime: 1000 * 30,
  });
  return { trending: query.data || [], isLoading: query.isLoading };
}

export function useContributors() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['community', 'contributors'],
    queryFn: () => communityApi.contributors(),
    enabled: !!user?.uid,
    staleTime: 1000 * 30,
  });
  return { contributors: query.data || [], isLoading: query.isLoading };
}

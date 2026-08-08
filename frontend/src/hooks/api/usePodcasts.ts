import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { podcastsApi, GeneratePodcastRequest } from '../../lib/api/podcasts';
import { PodcastMetadata } from '../../types';
import { useAuth } from '../../lib/AuthContext';

// Statuses that mean a podcast is still being produced (used to poll the feed live).
const IN_PROGRESS = [
  'PENDING',
  'PLANNING',
  'GENERATING_SCRIPT',
  'GENERATING_AUDIO',
  'STITCHING_AUDIO',
  'UPLOADING',
  'GENERATING_ASSETS',
];

export function usePodcasts() {
  const { user } = useAuth();

  const query = useQuery<PodcastMetadata[]>({
    queryKey: ['podcasts', user?.uid],
    queryFn: () => podcastsApi.list(),
    enabled: !!user?.uid,
    staleTime: 1000 * 30,
    // Poll every 5s while any episode is still generating so the feed updates live.
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      return data.some((p) => IN_PROGRESS.includes(p.status)) ? 5000 : false;
    },
    retry: 2,
  });

  return {
    podcasts: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** Kick off a podcast generation job and refresh the feed. */
export function useGeneratePodcast() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (req: GeneratePodcastRequest) => podcastsApi.generate(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['podcasts', user?.uid] });
    },
  });

  return {
    generate: mutation.mutateAsync,
    isGenerating: mutation.isPending,
    error: mutation.error,
  };
}

/** Hook for bookmarking a point in the podcast */
export function usePodcastBookmark() {
  const mutation = useMutation({
    mutationFn: ({ id, req }: { id: string; req: { timeMs: number; label?: string; note?: string } }) => podcastsApi.bookmark(id, req),
  });

  return {
    bookmark: mutation.mutateAsync,
    isBookmarking: mutation.isPending,
  };
}

/** Hook for logging analytics silently */
export function usePodcastAnalytics() {
  const mutation = useMutation({
    mutationFn: ({ id, req }: { id: string; req: { type: string; timeMs: number; fromMs?: number; toMs?: number; segmentId?: number } }) => podcastsApi.analytics(id, req),
  });

  return {
    logEvent: mutation.mutateAsync,
  };
}

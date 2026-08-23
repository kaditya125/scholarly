import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/AuthContext';
import { connectionsApi, PeerCard, ConnectionRequests } from '../../lib/api/connections';

/**
 * Full social-graph access for the People page: connections, pending requests, and suggestions,
 * plus every mutation (connect / respond / cancel / remove / follow / block). All mutations
 * invalidate the whole `['connections', uid]` scope so every view stays consistent.
 */
export function useConnections() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const scope = ['connections', user?.uid];
  const enabled = !!user?.uid;

  const connectionsQuery = useQuery<PeerCard[]>({
    queryKey: [...scope, 'list'],
    queryFn: () => connectionsApi.list(),
    enabled,
    staleTime: 1000 * 30,
  });

  const requestsQuery = useQuery<ConnectionRequests>({
    queryKey: [...scope, 'requests'],
    queryFn: () => connectionsApi.requests(),
    enabled,
    staleTime: 1000 * 30,
  });

  const suggestionsQuery = useQuery<PeerCard[]>({
    queryKey: [...scope, 'suggestions', 'default'],
    queryFn: () => connectionsApi.suggestions(),
    enabled,
    staleTime: 1000 * 60,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['connections', user?.uid] });

  const sendRequest = useMutation({ mutationFn: (targetId: string) => connectionsApi.sendRequest(targetId), onSuccess: invalidate });
  const accept = useMutation({ mutationFn: (otherId: string) => connectionsApi.accept(otherId), onSuccess: invalidate });
  const decline = useMutation({ mutationFn: (otherId: string) => connectionsApi.decline(otherId), onSuccess: invalidate });
  const cancelRequest = useMutation({ mutationFn: (otherId: string) => connectionsApi.cancelRequest(otherId), onSuccess: invalidate });
  const removeConnection = useMutation({ mutationFn: (otherId: string) => connectionsApi.remove(otherId), onSuccess: invalidate });
  const follow = useMutation({ mutationFn: (targetId: string) => connectionsApi.follow(targetId), onSuccess: invalidate });
  const unfollow = useMutation({ mutationFn: (otherId: string) => connectionsApi.unfollow(otherId), onSuccess: invalidate });
  const block = useMutation({ mutationFn: (targetId: string) => connectionsApi.block(targetId), onSuccess: invalidate });
  const unblock = useMutation({ mutationFn: (otherId: string) => connectionsApi.unblock(otherId), onSuccess: invalidate });

  return {
    connections: connectionsQuery.data || [],
    requests: requestsQuery.data || { incoming: [], outgoing: [] },
    suggestions: suggestionsQuery.data || [],
    isLoading: connectionsQuery.isLoading || requestsQuery.isLoading || suggestionsQuery.isLoading,
    isError: connectionsQuery.isError || requestsQuery.isError || suggestionsQuery.isError,
    refetch: () => {
      connectionsQuery.refetch();
      requestsQuery.refetch();
      suggestionsQuery.refetch();
    },
    sendRequest: sendRequest.mutateAsync,
    accept: accept.mutateAsync,
    decline: decline.mutateAsync,
    cancelRequest: cancelRequest.mutateAsync,
    removeConnection: removeConnection.mutateAsync,
    follow: follow.mutateAsync,
    unfollow: unfollow.mutateAsync,
    block: block.mutateAsync,
    unblock: unblock.mutateAsync,
  };
}

/**
 * Lightweight suggestions + connect action for the dashboard "Find Study Partners" widget — avoids
 * fetching the full connections/requests lists just to show a few suggested partners.
 */
export function useStudyPartnerSuggestions(limit = 4) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<PeerCard[]>({
    queryKey: ['connections', user?.uid, 'suggestions', limit],
    queryFn: () => connectionsApi.suggestions(limit),
    enabled: !!user?.uid,
    staleTime: 1000 * 60,
  });

  const sendRequest = useMutation({
    mutationFn: (targetId: string) => connectionsApi.sendRequest(targetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections', user?.uid] }),
  });

  return {
    suggestions: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    sendRequest: sendRequest.mutateAsync,
    sendingId: sendRequest.isPending ? (sendRequest.variables as string) : null,
  };
}

/**
 * Debounced directory search. Enabled only for terms of 2+ chars so we don't hammer the API on
 * every keystroke; the caller passes an already-debounced term.
 */
export function usePeopleSearch(term: string) {
  const { user } = useAuth();
  const trimmed = term.trim();
  const enabled = !!user?.uid && trimmed.length >= 1;

  const query = useQuery<PeerCard[]>({
    queryKey: ['connections', user?.uid, 'search', trimmed],
    queryFn: () => connectionsApi.search(trimmed),
    enabled,
    staleTime: 1000 * 30,
  });

  return {
    results: query.data || [],
    isSearching: enabled && query.isFetching,
    hasQuery: enabled,
  };
}

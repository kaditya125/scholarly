import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/AuthContext';
import { doubtsApi, DoubtPreview, DoubtStatus } from '../../lib/api/doubts';

/**
 * React-query access to the student's saved doubts (revision notebook). List is keyed on the uid +
 * filter; mutations (update/delete) invalidate the whole doubts scope so every filtered view stays
 * in sync.
 */
export function useDoubts(filter?: { status?: DoubtStatus; subject?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ['doubts', user?.uid, filter?.status || 'all', filter?.subject || 'all'];

  const query = useQuery<DoubtPreview[]>({
    queryKey: key,
    queryFn: () => doubtsApi.list(filter),
    enabled: !!user?.uid,
    staleTime: 1000 * 30,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['doubts', user?.uid] });

  const updateDoubt = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { notes?: string; status?: DoubtStatus; tags?: string[] } }) => doubtsApi.update(id, patch),
    onSuccess: invalidate,
  });
  const removeDoubt = useMutation({
    mutationFn: (id: string) => doubtsApi.remove(id),
    onSuccess: invalidate,
  });

  return {
    doubts: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    updateDoubt: updateDoubt.mutateAsync,
    removeDoubt: removeDoubt.mutateAsync,
  };
}

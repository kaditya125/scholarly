import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/AuthContext';
import { capabilitiesApi, type CapabilitiesResponse } from '../../lib/api/capabilities';

/**
 * The caller's server-derived capabilities.
 *
 * Used to render the teacher workspace honestly — an action the account cannot perform is shown
 * as unavailable with the reason, rather than as a button that returns 403.
 *
 * Refetched on focus and on mount because the underlying `teacherStatus` is admin-mutable: a
 * teacher suspended or approved while the tab sits open should see the change without a reload.
 * Deliberately NOT polled on an interval — an admin decision is rare, and a request every few
 * seconds to learn nothing is waste.
 */
export function useCapabilities() {
  const { user } = useAuth();

  const query = useQuery<CapabilitiesResponse>({
    queryKey: ['capabilities', user?.uid],
    queryFn: () => capabilitiesApi.get(),
    enabled: !!user?.uid,
    staleTime: 1000 * 30,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
  });

  return {
    capabilities: query.data?.capabilities,
    teacherStatus: query.data?.teacherStatus ?? null,
    productRole: query.data?.productRole ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

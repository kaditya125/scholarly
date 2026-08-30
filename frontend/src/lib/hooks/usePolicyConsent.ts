import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { CURRENT_POLICY_METADATA } from '../../content/policies/policyData';

export interface UserConsentStatus {
  hasAcceptedCurrent: boolean;
  currentVersion: string;
  lastAcceptedVersion: string | null;
  lastAcceptedAt: string | null;
  requiresReview: boolean;
}

export function usePolicyConsent(enabled = true) {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery<UserConsentStatus>({
    queryKey: ['policy-consent-status'],
    queryFn: async () => {
      const res = await api.get('/policies/my-consent');
      return res.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const acceptMutation = useMutation({
    mutationFn: async (version: string = CURRENT_POLICY_METADATA.version) => {
      const res = await api.post('/policies/consent', { version });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-consent-status'] });
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  });

  return {
    consentStatus: data,
    isLoading,
    hasAcceptedCurrent: data?.hasAcceptedCurrent ?? false,
    requiresReview: data?.requiresReview ?? false,
    acceptPolicies: acceptMutation.mutateAsync,
    isAccepting: acceptMutation.isPending,
    refetch,
  };
}

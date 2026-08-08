import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/AuthContext';
import { profileApi, ProfileUpdate } from '../../lib/api/profile';
import { LearningProfile } from '../../lib/onboardingOptions';

/**
 * React-query access to the student's learning profile. Mirrors useUserStats: keyed on the uid,
 * gated on auth, and the update mutation writes the fresh profile straight back into the cache so
 * the dashboard card / settings reflect changes immediately (and, since the same profile powers
 * the AI context block, the tutor is re-personalized on the next message with no extra work).
 */
export function useProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['learningProfile', user?.uid];

  const query = useQuery<LearningProfile>({
    queryKey: key,
    queryFn: () => profileApi.get(user!.uid),
    enabled: !!user?.uid,
    staleTime: 1000 * 3,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
  });

  const updateMutation = useMutation({
    mutationFn: (patch: ProfileUpdate) => profileApi.update(user!.uid, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(key, updated);
    },
  });

  return {
    profile: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    updateProfile: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}

import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { LeaderboardEntry } from '../../../../backend-firestore/src/types'; 

export function useLeaderboard(limit: number = 100, exam?: string) {
  const query = useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard', limit, exam],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      if (exam && exam !== 'ALL') {
        params.set('exam', exam);
      }
      const { data } = await api.get(`/leaderboard?${params.toString()}`);
      return data;
    },
    staleTime: 1000 * 60 * 2, // 2 mins
  });

  return {
    leaderboard: query.data || [],
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
  };
}

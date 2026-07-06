import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { LeaderboardEntry } from '../../../../backend-firestore/src/types'; 

export function useLeaderboard(limit: number = 100) {
  const query = useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard', limit],
    queryFn: async () => {
      const { data } = await api.get(`/leaderboard?limit=${limit}`);
      return data;
    },
  });

  return {
    leaderboard: query.data || [],
    isLoading: query.isLoading,
  };
}

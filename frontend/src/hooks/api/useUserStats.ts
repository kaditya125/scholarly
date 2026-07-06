import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useAuth } from '../../lib/AuthContext';

export interface AICoachRecommendation {
  type: 'review' | 'quiz' | 'milestone' | 'warning';
  title: string;
  message: string;
  actionUrl?: string;
  priority: 'low' | 'medium' | 'high';
}

export interface GamificationProfile {
  xp: number;
  level: number;
  rank: string;
  studyStreakDays: number;
  longestStreak: number;
  badges: string[];
}

export interface UserStats {
  userId: string;
  totalTestsAttempted: number;
  averageAccuracy: number; 
  overallRank: number;
  completionPercentage: number;
  performanceHistory: { topic: string; score: number }[];
  weakTopics: string[];
  strongTopics: string[];
  activityHeatmap: { date: string; count: number; intensity: number }[];
  gamification: GamificationProfile;
  aiRecommendations: AICoachRecommendation[];
  learningVelocity: number;
  retentionScore: number;
  examReadiness: number;
}

export function useUserStats() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<UserStats>({
    queryKey: ['userStats', user?.uid],
    queryFn: async () => {
      const { data } = await api.get(`/users/${user?.uid}/stats`);
      return data;
    },
    enabled: !!user?.uid,
    staleTime: 1000 * 60 * 5 // 5 minutes
  });

  const awardXPMutation = useMutation({
    mutationFn: async (actionType: string) => {
      const { data } = await api.post(`/users/${user?.uid}/xp`, { actionType });
      return data;
    },
    onSuccess: (updatedStats) => {
      queryClient.setQueryData(['userStats', user?.uid], updatedStats);
    }
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    awardXP: awardXPMutation.mutate,
    isAwardingXP: awardXPMutation.isPending
  };
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useAuth } from '../../lib/AuthContext';
import { Timetable, StudyGoal } from '../../../../backend-firestore/src/types'; // Using relative path for prototyping types, in real app extract to shared package

export function usePlanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<Timetable>({
    queryKey: ['timetable', user?.uid],
    queryFn: async () => {
      const { data } = await api.get(`/planner/${user?.uid}/timetable`);
      return data;
    },
    enabled: !!user?.uid,
  });

  const generateTimetableMutation = useMutation({
    mutationFn: async (goalData: Partial<StudyGoal>) => {
      const { data } = await api.post(`/planner/${user?.uid}/timetable`, goalData);
      return data.timetable;
    },
    onSuccess: (updatedTimetable) => {
      queryClient.setQueryData(['timetable', user?.uid], updatedTimetable);
    }
  });

  const markCompletedMutation = useMutation({
    mutationFn: async ({ date, taskId }: { date: string, taskId: string }) => {
      const { data } = await api.post(`/planner/${user?.uid}/timetable/complete`, { date, taskId });
      return data;
    },
    onSuccess: (updatedTimetable) => {
      queryClient.setQueryData(['timetable', user?.uid], updatedTimetable);
    }
  });

  const adaptTimetableMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/planner/${user?.uid}/timetable/adapt`, {});
      return data;
    },
    onSuccess: (updatedTimetable) => {
      queryClient.setQueryData(['timetable', user?.uid], updatedTimetable);
    }
  });

  return {
    timetable: query.data,
    isLoading: query.isLoading,
    generateTimetable: generateTimetableMutation.mutateAsync,
    isGenerating: generateTimetableMutation.isPending,
    markCompleted: markCompletedMutation.mutate,
    isAdapting: adaptTimetableMutation.isPending,
    adaptTimetable: adaptTimetableMutation.mutate
  };
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerApi, PlannerTask } from '../../lib/api/planner';
import { useAuth } from '../../lib/AuthContext';

export function usePlanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const queryKey = ['planner_tasks', user?.uid];

  const tasksQuery = useQuery<PlannerTask[]>({
    queryKey,
    queryFn: () => plannerApi.getTasks(),
    enabled: !!user?.uid,
  });

  const addTaskMutation = useMutation({
    mutationFn: plannerApi.addTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  });
  
  const updateStatusMutation = useMutation({
    mutationFn: (args: {id: string, status: string}) => plannerApi.updateTaskStatus(args.id, args.status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  });

  return {
    tasks: tasksQuery.data || [],
    isLoading: tasksQuery.isLoading,
    isError: tasksQuery.isError,
    addTask: addTaskMutation.mutateAsync,
    updateStatus: updateStatusMutation.mutateAsync,
  };
}

import { useQuery } from '@tanstack/react-query';
import { studyPlanApi } from '../../lib/api/studyPlan';

/**
 * Today's plan.
 *
 * Short staleTime for the same reason coverage has one: the plan is derived from mastery, and
 * mastery moves the moment a student answers a question. A stale plan would keep recommending
 * work they have just finished.
 */
export function useTodayPlan(examId?: string, minutes?: number) {
  return useQuery({
    queryKey: ['study-plan-today', examId, minutes],
    queryFn: () => studyPlanApi.today(examId, minutes),
    staleTime: 1000 * 30,
  });
}

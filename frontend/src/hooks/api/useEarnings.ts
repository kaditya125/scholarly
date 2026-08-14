import { useQuery } from '@tanstack/react-query';
import { earningsApi, type TeacherEarningsSummary, type TeacherPayoutRecord } from '../../lib/api/earnings';

export function useEarnings() {
  return useQuery<TeacherEarningsSummary>({
    queryKey: ['teacher-earnings'],
    queryFn: () => earningsApi.get(),
    staleTime: 1000 * 30,
  });
}

export function usePayouts() {
  return useQuery<TeacherPayoutRecord[]>({
    queryKey: ['teacher-payouts'],
    queryFn: () => earningsApi.listPayouts(),
    staleTime: 1000 * 30,
  });
}

import { useQuery } from '@tanstack/react-query';
import { referralsApi, type MyReferrals } from '../../lib/api/referrals';

export function useMyReferrals() {
  return useQuery<MyReferrals>({
    queryKey: ['my-referrals'],
    queryFn: () => referralsApi.listMine(),
    staleTime: 1000 * 30,
  });
}

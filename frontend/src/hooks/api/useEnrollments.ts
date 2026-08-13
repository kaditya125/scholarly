import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/AuthContext';
import {
  enrollmentsApi,
  type EnrollmentRecord,
  type EnrollmentState,
  type InvitationPreview,
  type MyEnrollment,
} from '../../lib/api/enrollments';

/**
 * The roster for one class.
 *
 * Returns every edge in every state — the page groups them, because a teacher needs to see
 * pending requests and active students in one place. Invalidated by every mutation below rather
 * than optimistically patched: an enrolment transition can be refused server-side (full class,
 * paid class, wrong actor), so guessing the outcome would show a membership that does not exist.
 */
export function useRoster(classId: string | undefined) {
  return useQuery<EnrollmentRecord[]>({
    queryKey: ['roster', classId],
    queryFn: () => enrollmentsApi.listRoster(classId as string),
    enabled: !!classId,
    staleTime: 1000 * 10,
  });
}

export function useInvitationPreview(code: string | undefined, enabled = true) {
  return useQuery<InvitationPreview>({
    queryKey: ['invitation', code],
    queryFn: () => enrollmentsApi.previewInvitation(code as string),
    enabled: !!code && enabled,
    retry: false,
  });
}

export function useMyEnrollments() {
  const { user } = useAuth();
  return useQuery<MyEnrollment[]>({
    queryKey: ['enrollments', 'mine', user?.uid],
    queryFn: () => enrollmentsApi.listMine(),
    enabled: !!user?.uid,
    staleTime: 1000 * 15,
  });
}

export function useEnrollmentMutations(classId?: string) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['roster', classId] });
    qc.invalidateQueries({ queryKey: ['classes', 'mine', user?.uid] }); // seat count lives on the class
    qc.invalidateQueries({ queryKey: ['class', classId] });
    qc.invalidateQueries({ queryKey: ['enrollments', 'mine', user?.uid] });
  };

  const createInvitation = useMutation({
    mutationFn: (opts: { expiresAt?: string | null; maxUses?: number | null }) =>
      enrollmentsApi.createInvitation(classId as string, opts),
  });

  const setState = useMutation({
    mutationFn: ({ state, studentUid, forClassId }: { state: EnrollmentState; studentUid?: string; forClassId?: string }) =>
      enrollmentsApi.setState(forClassId ?? (classId as string), state, studentUid),
    onSuccess: refresh,
  });

  const acceptInvitation = useMutation({
    mutationFn: (code: string) => enrollmentsApi.acceptInvitation(code),
    onSuccess: refresh,
  });

  const requestToJoin = useMutation({
    mutationFn: (forClassId: string) => enrollmentsApi.requestToJoin(forClassId),
    onSuccess: refresh,
  });

  return { createInvitation, setState, acceptInvitation, requestToJoin };
}

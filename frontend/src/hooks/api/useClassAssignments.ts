import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  classAssignmentsApi,
  type AssignmentResults,
  type AssignmentStatus,
  type ClassAssignment,
  type CreateAssignmentInput,
} from '../../lib/api/classAssignments';

export function useClassAssignments(classId: string | undefined, enabled = true) {
  return useQuery<ClassAssignment[]>({
    queryKey: ['class-assignments', classId],
    queryFn: () => classAssignmentsApi.list(classId as string),
    enabled: !!classId && enabled,
    staleTime: 1000 * 15,
  });
}

/**
 * Results are NOT polled by default — a teacher watching submissions come in during a live test
 * window is a real use case, so the results page opts into a short interval itself rather than
 * every consumer of this hook paying for it.
 */
export function useAssignmentResults(classId: string | undefined, assignmentId: string | undefined, opts: { poll?: boolean } = {}) {
  return useQuery<AssignmentResults>({
    queryKey: ['assignment-results', classId, assignmentId],
    queryFn: () => classAssignmentsApi.results(classId as string, assignmentId as string),
    enabled: !!classId && !!assignmentId,
    staleTime: 1000 * 10,
    refetchInterval: opts.poll ? 15_000 : false,
  });
}

export function useClassAssignmentMutations(classId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['class-assignments', classId] });

  const create = useMutation({
    mutationFn: (input: CreateAssignmentInput) => classAssignmentsApi.create(classId, input),
    onSuccess: refresh,
  });

  const setStatus = useMutation({
    mutationFn: ({ assignmentId, status }: { assignmentId: string; status: AssignmentStatus }) =>
      classAssignmentsApi.setStatus(classId, assignmentId, status),
    onSuccess: refresh,
  });

  const start = useMutation({
    mutationFn: (assignmentId: string) => classAssignmentsApi.start(classId, assignmentId),
  });

  return { create, setStatus, start };
}

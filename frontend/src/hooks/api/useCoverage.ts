import { useQuery } from '@tanstack/react-query';
import { coverageApi } from '../../lib/api/coverage';

/**
 * Syllabus coverage for one exam.
 *
 * `staleTime` is deliberately short. Mastery changes the moment a student answers a question, and
 * showing yesterday's coverage after this morning's practice is the one thing that would make the
 * whole feature untrustworthy — a student who has just worked through a topic must not be told it
 * is untouched. Correctness beats the saved request.
 */
export function useSyllabusCoverage(examId: string | null | undefined, depth?: number) {
  return useQuery({
    queryKey: ['syllabus-coverage', examId, depth],
    queryFn: () => coverageApi.get(examId!, depth),
    enabled: Boolean(examId),
    staleTime: 1000 * 30,
  });
}

export function useCoverageNode(examId: string | null | undefined, nodeId: string | null) {
  return useQuery({
    queryKey: ['coverage-node', examId, nodeId],
    queryFn: () => coverageApi.getNode(examId!, nodeId!),
    enabled: Boolean(examId && nodeId),
    staleTime: 1000 * 30,
  });
}

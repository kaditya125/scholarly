import { useQuery } from '@tanstack/react-query';
import { quizApi, QuizAttempt, QuizAttemptSummary, ProgressReport } from '../../lib/api/quiz';
import { useAuth } from '../../lib/AuthContext';

/** All tests the platform has generated for the user (newest first). */
export function useQuizAttempts() {
  const { user } = useAuth();
  const query = useQuery<QuizAttemptSummary[]>({
    queryKey: ['quizAttempts', user?.uid],
    queryFn: () => quizApi.listAttempts(),
    enabled: !!user?.uid,
    staleTime: 1000 * 30,
  });
  return {
    attempts: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** Aggregate progress report + weak-section feedback. */
export function useProgressReport() {
  const { user } = useAuth();
  const query = useQuery<ProgressReport>({
    queryKey: ['quizProgress', user?.uid],
    queryFn: () => quizApi.getProgressReport(),
    enabled: !!user?.uid,
    staleTime: 1000 * 30,
  });
  return {
    report: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** A single attempt by id — used by the report screen (completed) and resume flows. */
export function useQuizAttempt(attemptId?: string) {
  const { user } = useAuth();
  const query = useQuery<QuizAttempt>({
    queryKey: ['quizAttempt', user?.uid, attemptId],
    queryFn: () => quizApi.getAttempt(attemptId!),
    enabled: !!user?.uid && !!attemptId,
    staleTime: 1000 * 60,
  });
  return {
    attempt: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

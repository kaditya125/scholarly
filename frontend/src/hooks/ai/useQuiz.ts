import { useQuery, useMutation } from '@tanstack/react-query';
import { quizApi, Question } from '../../lib/api/quiz';
import { useAuth } from '../../lib/AuthContext';

export function useQuiz() {
  const { user } = useAuth();

  const questionsQuery = useQuery<Question[]>({
    queryKey: ['quiz_questions', user?.uid],
    queryFn: () => quizApi.getQuestions(),
    enabled: !!user?.uid,
  });

  const submitMutation = useMutation({
    mutationFn: quizApi.submitQuiz,
  });

  return {
    questions: questionsQuery.data || [],
    isLoading: questionsQuery.isLoading,
    isError: questionsQuery.isError,
    submitQuiz: submitMutation.mutateAsync,
  };
}

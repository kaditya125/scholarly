import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { flashcardsApi, Flashcard } from '../../lib/api/flashcards';
import { useAuth } from '../../lib/AuthContext';

export function useFlashcards() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const queryKey = ['flashcards', user?.uid];

  const cardsQuery = useQuery<Flashcard[]>({
    queryKey,
    queryFn: () => flashcardsApi.getCards(),
    enabled: !!user?.uid,
  });

  const addMutation = useMutation({
    mutationFn: flashcardsApi.addCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: flashcardsApi.deleteCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  });

  return {
    cards: cardsQuery.data || [],
    isLoading: cardsQuery.isLoading,
    isError: cardsQuery.isError,
    addCard: addMutation.mutateAsync,
    deleteCard: deleteMutation.mutateAsync,
  };
}

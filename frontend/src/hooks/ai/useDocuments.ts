import { useQuery } from '@tanstack/react-query';
import { documentsApi, BookSummary, BookDetail } from '../../lib/api/documents';
import { useAuth } from '../../lib/AuthContext';

export function useBookLibrary() {
  const { user } = useAuth();

  const query = useQuery<BookSummary[]>({
    queryKey: ['book_library'],
    queryFn: () => documentsApi.listBooks(),
    staleTime: 1000 * 60 * 10, // the catalog only changes when an admin re-ingests
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });

  return {
    books: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useBookDetail(notebookId: string | null) {
  const { user } = useAuth();

  const query = useQuery<BookDetail>({
    queryKey: ['book_detail', notebookId],
    queryFn: () => documentsApi.getBookDetail(notebookId!),
    enabled: !!notebookId,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });

  return {
    book: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

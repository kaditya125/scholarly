import { useQuery } from '@tanstack/react-query';
import { pyqApi, PyqSource, PyqSourceQuery, PyqQuestion, PyqQuestionQuery } from '../../lib/api/pyq';
import { useAuth } from '../../lib/AuthContext';

/**
 * Previous-year papers for the Documents page.
 *
 * Cached like the book catalog rather than like user data: the registry changes only when an
 * operator runs discovery, so a short stale time would re-fetch a list of thousands on every
 * visit for nothing.
 *
 * Fails soft. Papers are one section of a page that also shows curriculum books and a user's own
 * uploads, and an empty PYQ list must not take the rest of the page down with it — the section
 * renders its own empty state instead.
 */
export function usePyqSources(query: PyqSourceQuery = {}) {
  const { user } = useAuth();

  const q = useQuery<PyqSource[]>({
    queryKey: ['pyq_sources', query],
    queryFn: () => pyqApi.listSources(query),
    enabled: !!user?.uid,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    retry: 1,
  });

  return {
    sources: q.data || [],
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

/**
 * The questions inside one paper.
 *
 * Only fetched once a paper is actually opened — the registry has 173 papers and tens of
 * thousands of questions between them, so this is deliberately not prefetched.
 */
export function usePyqQuestions(query: PyqQuestionQuery | null) {
  const { user } = useAuth();

  const q = useQuery<PyqQuestion[]>({
    queryKey: ['pyq_questions', query],
    queryFn: () => pyqApi.listQuestions(query!),
    enabled: !!user?.uid && !!query,
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  return {
    questions: q.data || [],
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

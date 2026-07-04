import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notebooksApi, Notebook, DocumentSource } from '../../lib/api/notebooks';
import { useAuth } from '../../lib/AuthContext';

export function useNotebooks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const notebooksQuery = useQuery<Notebook[]>({
    queryKey: ['notebooks', user?.uid],
    queryFn: () => notebooksApi.getNotebooks(),
    enabled: !!user?.uid,
  });

  const createNotebookMutation = useMutation({
    mutationFn: ({ title, color }: { title: string, color: string }) => notebooksApi.createNotebook(title, color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebooks', user?.uid] });
    },
  });

  const deleteNotebookMutation = useMutation({
    mutationFn: (notebookId: string) => notebooksApi.deleteNotebook(notebookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebooks', user?.uid] });
    },
  });

  return {
    notebooks: notebooksQuery.data || [],
    isLoading: notebooksQuery.isLoading,
    isError: notebooksQuery.isError,
    createNotebook: createNotebookMutation.mutateAsync,
    isCreating: createNotebookMutation.isPending,
    deleteNotebook: deleteNotebookMutation.mutateAsync,
  };
}

export function useNotebookSources(notebookId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const sourcesQuery = useQuery<DocumentSource[]>({
    queryKey: ['notebookSources', notebookId, user?.uid],
    queryFn: () => notebooksApi.getSources(notebookId!),
    enabled: !!user?.uid && !!notebookId,
    // Poll every 5 seconds if any source is processing
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const isProcessing = data.some(s => ['PENDING', 'CHUNKING', 'EMBEDDING', 'INDEXING'].includes(s.status));
      return isProcessing ? 5000 : false;
    }
  });

  const uploadSourceMutation = useMutation({
    mutationFn: (file: File) => notebooksApi.uploadSource(notebookId!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebookSources', notebookId, user?.uid] });
    },
  });

  return {
    sources: sourcesQuery.data || [],
    isLoading: sourcesQuery.isLoading,
    uploadSource: uploadSourceMutation.mutateAsync,
    isUploading: uploadSourceMutation.isPending,
  };
}

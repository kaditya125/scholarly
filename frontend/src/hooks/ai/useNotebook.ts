import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notebooksApi } from '../../lib/api/notebooks';
import { Notebook, DocumentSource } from '../../types';
import { useAuth } from '../../lib/AuthContext';

export function useNotebooks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const notebooksQuery = useQuery<Notebook[]>({
    queryKey: ['notebooks', user?.uid],
    queryFn: () => notebooksApi.getNotebooks(),
    enabled: !!user?.uid,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    retry: 2,
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
      const isProcessing = data.some(s => ['PENDING', 'UPLOADING', 'PROCESSING', 'OCR', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'GENERATING_GRAPH', 'INDEXING'].includes(s.status));
      return isProcessing ? 5000 : false;
    },
    staleTime: 1000 * 30, // 30 seconds
    retry: 2,
  });

  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadSourceMutation = useMutation({
    mutationFn: (file: File) => notebooksApi.uploadSource(notebookId!, file, (progressEvent) => {
      if (progressEvent.total) {
        setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
      }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebookSources', notebookId, user?.uid] });
      setUploadProgress(0);
    },
    onError: () => setUploadProgress(0),
  });

  return {
    sources: sourcesQuery.data || [],
    isLoading: sourcesQuery.isLoading,
    uploadSource: uploadSourceMutation.mutateAsync,
    isUploading: uploadSourceMutation.isPending,
    uploadProgress,
  };
}

export function useAssets(notebookId: string | null) {
  const { user } = useAuth();

  const assetsQuery = useQuery({
    queryKey: ['notebookAssets', notebookId, user?.uid],
    queryFn: () => notebooksApi.getAssets(notebookId!),
    enabled: !!user?.uid && !!notebookId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });

  return {
    assets: assetsQuery.data || [],
    isLoading: assetsQuery.isLoading,
  };
}

export function useKnowledgeGraph(notebookId: string | null) {
  const { user } = useAuth();

  const graphQuery = useQuery({
    queryKey: ['notebookGraph', notebookId, user?.uid],
    queryFn: () => notebooksApi.getGraph(notebookId!),
    enabled: !!user?.uid && !!notebookId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });

  return {
    graph: graphQuery.data || { nodes: [], edges: [] },
    isLoading: graphQuery.isLoading,
  };
}

/**
 * usePipeline Hook
 * Phase 1B: Content Pipeline Frontend Foundation
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pipelineApi } from '../lib/api/pipeline';
import {
  PipelineSource,
  PipelineCollection,
  PipelineStats,
  PipelineFilterState,
  DocumentWorkspaceTab,
} from '../types/pipeline.types';
import { useAuth } from '../lib/AuthContext';

const DEFAULT_FILTERS: PipelineFilterState = {
  search: '',
  status: 'ALL',
  contentType: 'ALL',
  subject: 'ALL',
  classGrade: 'ALL',
  exam: 'ALL',
  language: 'ALL',
  collectionId: 'ALL',
};

const DEFAULT_STATS: PipelineStats = {
  totalSources: 0,
  processing: 0,
  ready: 0,
  failed: 0,
  totalChunks: 0,
  indexedVectors: 0,
  knowledgeGraphNodes: 0,
};

export function usePipeline() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<PipelineFilterState>(DEFAULT_FILTERS);
  const [selectedSource, setSelectedSource] = useState<PipelineSource | null>(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<DocumentWorkspaceTab>('overview');
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // Main Pipeline Data Query
  const pipelineQuery = useQuery({
    queryKey: ['pipelineData', user?.uid],
    queryFn: () => pipelineApi.getAllSources(),
    enabled: !!user?.uid,
    staleTime: 1000 * 15, // 15 seconds
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const isProcessing = data.sources.some((s) =>
        ['PENDING', 'UPLOADING', 'PROCESSING', 'OCR', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'GENERATING_GRAPH'].includes(s.status)
      );
      return isProcessing ? 4000 : false;
    },
  });

  const sources = pipelineQuery.data?.sources || [];
  const collections = pipelineQuery.data?.collections || [];
  const stats = pipelineQuery.data?.stats || DEFAULT_STATS;

  // Invalidate helper
  const invalidatePipeline = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pipelineData', user?.uid] });
  }, [queryClient, user?.uid]);

  // Create Collection Mutation
  const createCollectionMutation = useMutation({
    mutationFn: ({ title, color }: { title: string; color: string }) =>
      pipelineApi.createCollection(title, color),
    onSuccess: () => {
      invalidatePipeline();
    },
  });

  // Update Collection Mutation
  const updateCollectionMutation = useMutation({
    mutationFn: ({ collectionId, updates }: { collectionId: string; updates: { title?: string; color?: string } }) =>
      pipelineApi.updateCollection(collectionId, updates),
    onSuccess: () => {
      invalidatePipeline();
    },
  });

  // Delete Collection Mutation
  const deleteCollectionMutation = useMutation({
    mutationFn: (collectionId: string) => pipelineApi.deleteCollection(collectionId),
    onSuccess: () => {
      invalidatePipeline();
    },
  });

  // Upload Source Mutation
  const uploadSourceMutation = useMutation({
    mutationFn: ({ collectionId, file }: { collectionId: string; file: File }) =>
      pipelineApi.uploadSource(collectionId, file, (e) => {
        if (e.total) {
          setUploadProgress(Math.round((e.loaded * 100) / e.total));
        }
      }),
    onSuccess: () => {
      invalidatePipeline();
      setUploadProgress(0);
    },
    onError: () => setUploadProgress(0),
  });

  // Delete Source Mutation
  const deleteSourceMutation = useMutation({
    mutationFn: ({ collectionId, sourceId }: { collectionId: string; sourceId: string }) =>
      pipelineApi.deleteSource(collectionId, sourceId),
    onSuccess: () => {
      invalidatePipeline();
      if (selectedSource?.id) {
        setSelectedSource(null);
      }
    },
  });

  // Retry Source Mutation
  const retrySourceMutation = useMutation({
    mutationFn: ({ collectionId, sourceId }: { collectionId: string; sourceId: string }) =>
      pipelineApi.retrySource(collectionId, sourceId),
    onSuccess: () => {
      invalidatePipeline();
    },
  });

  // Filtered Sources computation
  const filteredSources = useMemo(() => {
    return sources.filter((s) => {
      // Search
      if (filters.search.trim()) {
        const q = filters.search.trim().toLowerCase();
        const matchesTitle = s.title.toLowerCase().includes(q);
        const matchesOrig = (s.originalName || '').toLowerCase().includes(q);
        const matchesCol = (s.collectionTitle || '').toLowerCase().includes(q);
        const matchesSubject = (s.metadata?.subject || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesOrig && !matchesCol && !matchesSubject) return false;
      }

      // Status
      if (filters.status !== 'ALL') {
        if (filters.status === 'READY' && s.status !== 'READY') return false;
        if (filters.status === 'FAILED' && (s.status !== 'FAILED' && s.status !== 'FAILED_NONRETRYABLE')) return false;
        if (filters.status === 'PROCESSING' && !['PENDING', 'UPLOADING', 'PROCESSING', 'OCR', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'GENERATING_GRAPH'].includes(s.status)) return false;
        if (filters.status === 'ARCHIVED' && (s.status as string) !== 'ARCHIVED') return false;
      }

      // Content Type
      if (filters.contentType !== 'ALL') {
        const typeStr = (s.type || s.mimeType || s.originalName || '').toLowerCase();
        if (filters.contentType === 'PDF' && !typeStr.includes('pdf')) return false;
        if (filters.contentType === 'EPUB' && !typeStr.includes('epub')) return false;
        if (filters.contentType === 'DOCX' && !typeStr.includes('doc') && !typeStr.includes('docx')) return false;
        if (filters.contentType === 'TXT' && !typeStr.includes('txt') && !typeStr.includes('text')) return false;
        if (filters.contentType === 'MD' && !typeStr.includes('md') && !typeStr.includes('markdown')) return false;
        if (filters.contentType === 'IMAGE' && !typeStr.includes('image') && !typeStr.includes('png') && !typeStr.includes('jpg') && !typeStr.includes('jpeg')) return false;
        if (filters.contentType === 'AUDIO' && !typeStr.includes('audio') && !typeStr.includes('mp3') && !typeStr.includes('wav')) return false;
        if (filters.contentType === 'VIDEO' && !typeStr.includes('video') && !typeStr.includes('mp4')) return false;
      }

      // Collection
      if (filters.collectionId !== 'ALL' && s.notebookId !== filters.collectionId) {
        return false;
      }

      // Subject
      if (filters.subject !== 'ALL' && s.metadata?.subject !== filters.subject) {
        return false;
      }

      // Class / Grade
      if (filters.classGrade !== 'ALL' && s.metadata?.classGrade !== filters.classGrade) {
        return false;
      }

      // Exam
      if (filters.exam !== 'ALL' && s.metadata?.exam !== filters.exam) {
        return false;
      }

      // Language
      if (filters.language !== 'ALL' && s.metadata?.language !== filters.language) {
        return false;
      }

      return true;
    });
  }, [sources, filters]);

  // Derived filter options for dropdowns
  const filterOptions = useMemo(() => {
    const subjects = new Set<string>();
    const classGrades = new Set<string>();
    const exams = new Set<string>();
    const languages = new Set<string>();

    sources.forEach((s) => {
      if (s.metadata?.subject) subjects.add(s.metadata.subject);
      if (s.metadata?.classGrade) classGrades.add(s.metadata.classGrade);
      if (s.metadata?.exam) exams.add(s.metadata.exam);
      if (s.metadata?.language) languages.add(s.metadata.language);
    });

    return {
      subjects: Array.from(subjects).sort(),
      classGrades: Array.from(classGrades).sort(),
      exams: Array.from(exams).sort(),
      languages: Array.from(languages).sort(),
    };
  }, [sources]);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  return {
    // Data
    sources,
    filteredSources,
    collections,
    stats,
    isLoading: pipelineQuery.isLoading,
    isRefetching: pipelineQuery.isRefetching,
    isError: pipelineQuery.isError,

    // Filters
    filters,
    setFilters,
    resetFilters,
    filterOptions,

    // Selection
    selectedSource,
    setSelectedSource,
    activeWorkspaceTab,
    setActiveWorkspaceTab,

    // Mutations
    createCollection: createCollectionMutation.mutateAsync,
    isCreatingCollection: createCollectionMutation.isPending,

    updateCollection: updateCollectionMutation.mutateAsync,
    isUpdatingCollection: updateCollectionMutation.isPending,

    deleteCollection: deleteCollectionMutation.mutateAsync,
    isDeletingCollection: deleteCollectionMutation.isPending,

    uploadSource: uploadSourceMutation.mutateAsync,
    isUploadingSource: uploadSourceMutation.isPending,
    uploadProgress,

    deleteSource: deleteSourceMutation.mutateAsync,
    isDeletingSource: deleteSourceMutation.isPending,

    retrySource: retrySourceMutation.mutateAsync,
    isRetryingSource: retrySourceMutation.isPending,

    refetch: invalidatePipeline,
  };
}

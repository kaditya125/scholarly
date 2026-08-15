/**
 * useContentExploration
 * Phase 7: Content Exploration Hook
 *
 * Provides reactive search query state, hybrid/semantic/keyword retrieval,
 * deep metadata filtering, AST structure hierarchy, and 4-level deterministic lineage tracking.
 */

import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import {
  ExplorationSearchMode,
  ExplorationSearchFilter,
  ExplorationSearchResultItem,
  ExplorationStructureNode,
  SourceLineageNode,
  DocumentChunk,
  PipelineSource,
  DocumentVersion,
  DocumentVersionDiff,
} from '../types/pipeline.types';

const API_BASE = '/api/v1/notebooks';

export function useContentExploration(initialCollectionId?: string) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<ExplorationSearchMode>('hybrid');
  const [filters, setFilters] = useState<ExplorationSearchFilter>({
    collectionId: initialCollectionId || 'ALL',
    subject: 'ALL',
    classGrade: 'ALL',
    exam: 'ALL',
    language: 'ALL',
  });

  const [results, setResults] = useState<ExplorationSearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Deep Document State
  const [activeLineage, setActiveLineage] = useState<SourceLineageNode | null>(null);
  const [documentChunks, setDocumentChunks] = useState<DocumentChunk[]>([]);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);

  const [documentStructure, setDocumentStructure] = useState<ExplorationStructureNode[]>([]);
  const [isLoadingStructure, setIsLoadingStructure] = useState(false);

  const [documentGraph, setDocumentGraph] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);

  /**
   * Execute search across accessible collections or within selected collection.
   */
  const performSearch = useCallback(
    async (
      searchQuery = query,
      activeFilters = filters,
      activeMode = mode
    ) => {
      const q = searchQuery.trim();
      if (!q) {
        setResults([]);
        return;
      }

      setIsSearching(true);
      setSearchError(null);

      try {
        const endpoint =
          activeFilters.collectionId && activeFilters.collectionId !== 'ALL'
            ? `${API_BASE}/${activeFilters.collectionId}/exploration/search`
            : `${API_BASE}/exploration/search`;

        const payload = {
          query: q,
          collectionId: activeFilters.collectionId,
          filter: activeFilters,
          options: {
            mode: activeMode,
            topK: 25,
            semanticWeight: activeMode === 'semantic' ? 1.0 : activeMode === 'keyword' ? 0.0 : 0.65,
            keywordWeight: activeMode === 'keyword' ? 1.0 : activeMode === 'semantic' ? 0.0 : 0.35,
          },
        };

        const res = await axios.post(endpoint, payload);
        const searchResults: ExplorationSearchResultItem[] = res.data?.results || [];
        setResults(searchResults);
      } catch (err: any) {
        console.error('Content exploration search error:', err);
        setSearchError(err.response?.data?.error || err.message || 'Search execution failed');
      } finally {
        setIsSearching(false);
      }
    },
    [query, filters, mode]
  );

  /**
   * Fetches real semantic chunks for a document.
   */
  const fetchDocumentChunks = useCallback(async (collectionId: string, sourceId: string): Promise<DocumentChunk[]> => {
    if (!collectionId || !sourceId) return [];
    setIsLoadingChunks(true);
    try {
      const res = await axios.get(`${API_BASE}/${collectionId}/sources/${sourceId}/chunks`);
      const chunks = res.data?.chunks || [];
      setDocumentChunks(chunks);
      return chunks;
    } catch (err) {
      console.warn('Failed to load live chunks from API:', err);
      return [];
    } finally {
      setIsLoadingChunks(false);
    }
  }, []);

  /**
   * Fetches AST outline structure tree for a document.
   */
  const fetchDocumentStructure = useCallback(async (collectionId: string, sourceId: string): Promise<ExplorationStructureNode[]> => {
    if (!collectionId || !sourceId) return [];
    setIsLoadingStructure(true);
    try {
      const res = await axios.get(`${API_BASE}/${collectionId}/sources/${sourceId}/structure`);
      const structure = res.data?.structure || [];
      setDocumentStructure(structure);
      return structure;
    } catch (err) {
      console.warn('Failed to load live structure from API:', err);
      return [];
    } finally {
      setIsLoadingStructure(false);
    }
  }, []);

  /**
   * Fetches document-scoped Knowledge Graph concepts and relationships.
   */
  const fetchDocumentGraph = useCallback(async (collectionId: string, sourceId: string) => {
    if (!collectionId || !sourceId) return { nodes: [], edges: [] };
    setIsLoadingGraph(true);
    try {
      const res = await axios.get(`${API_BASE}/${collectionId}/sources/${sourceId}/graph`);
      const graph = {
        nodes: res.data?.nodes || [],
        edges: res.data?.edges || [],
      };
      setDocumentGraph(graph);
      return graph;
    } catch (err) {
      console.warn('Failed to load live graph from API:', err);
      return { nodes: [], edges: [] };
    } finally {
      setIsLoadingGraph(false);
    }
  }, []);

  const [documentVersions, setDocumentVersions] = useState<DocumentVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  /**
   * Fetches document version history.
   */
  const fetchDocumentVersions = useCallback(async (collectionId: string, sourceId: string): Promise<DocumentVersion[]> => {
    if (!collectionId || !sourceId) return [];
    setIsLoadingVersions(true);
    try {
      const res = await axios.get(`${API_BASE}/${collectionId}/sources/${sourceId}/versions`);
      const versions = res.data?.versions || [];
      setDocumentVersions(versions);
      return versions;
    } catch (err) {
      console.warn('Failed to load versions from API:', err);
      return [];
    } finally {
      setIsLoadingVersions(false);
    }
  }, []);

  /**
   * Diffs two versions.
   */
  const diffDocumentVersions = useCallback(async (collectionId: string, sourceId: string, baseVersionId: string, targetVersionId: string): Promise<DocumentVersionDiff | null> => {
    try {
      const res = await axios.post(`${API_BASE}/${collectionId}/sources/${sourceId}/versions/diff`, {
        baseVersionId,
        targetVersionId,
      });
      return res.data;
    } catch (err) {
      console.warn('Failed to diff versions:', err);
      return null;
    }
  }, []);

  /**
   * Resolves the full 4-level deterministic lineage for a chunk.
   */
  const fetchDocumentLineage = useCallback(async (collectionId: string, sourceId: string, chunkId: string) => {
    if (!collectionId || !sourceId || !chunkId) return null;
    try {
      const res = await axios.get(`${API_BASE}/${collectionId}/sources/${sourceId}/lineage/${chunkId}`);
      return res.data;
    } catch (err) {
      console.warn('Failed to resolve lineage from API:', err);
      return null;
    }
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearchError(null);
  }, []);

  return {
    query,
    setQuery,
    mode,
    setMode,
    filters,
    setFilters,
    results,
    isSearching,
    searchError,
    activeLineage,
    setActiveLineage,
    documentChunks,
    isLoadingChunks,
    documentStructure,
    isLoadingStructure,
    documentGraph,
    isLoadingGraph,
    documentVersions,
    isLoadingVersions,
    performSearch,
    fetchDocumentChunks,
    fetchDocumentStructure,
    fetchDocumentGraph,
    fetchDocumentLineage,
    fetchDocumentVersions,
    diffDocumentVersions,
    clearSearch,
  };
}

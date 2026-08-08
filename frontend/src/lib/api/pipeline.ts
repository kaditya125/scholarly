/**
 * Content Pipeline API Client
 * Phase 1B & Phase 2A: Content Upload, Storage & Frontend Foundation
 * 
 * Reuses existing backend notebook & source endpoints without duplicating infrastructure.
 */

import { api } from './client';
import { notebooksApi } from './notebooks';
import {
  PipelineSource,
  PipelineCollection,
  PipelineStats,
  DocumentVersionItem,
} from '../../types/pipeline.types';

/**
 * Computes a SHA-256 hex hash of a File in the browser using Web Crypto API.
 */
export async function computeBrowserFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digestBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(digestBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const pipelineApi = {
  /**
   * Fetches all collections (notebooks)
   */
  async getCollections(): Promise<PipelineCollection[]> {
    const notebooks = await notebooksApi.getNotebooks();
    return notebooks.map((nb) => ({
      ...nb,
      sourceCount: nb.stats?.documentCount || 0,
      readyCount: 0,
      processingCount: 0,
      failedCount: 0,
      totalChunks: 0,
    }));
  },

  /**
   * Creates a new collection
   */
  async createCollection(title: string, color: string): Promise<PipelineCollection> {
    const nb = await notebooksApi.createNotebook(title, color);
    return {
      ...nb,
      sourceCount: 0,
      readyCount: 0,
      processingCount: 0,
      failedCount: 0,
      totalChunks: 0,
    };
  },

  /**
   * Updates / Renames a collection
   */
  async updateCollection(collectionId: string, updates: { title?: string; color?: string }): Promise<void> {
    await api.put(`/notebooks/${collectionId}`, updates);
  },

  /**
   * Deletes / Archives a collection
   */
  async deleteCollection(collectionId: string): Promise<void> {
    await notebooksApi.deleteNotebook(collectionId);
  },

  /**
   * Fetches all sources for a specific collection
   */
  async getSourcesByCollection(collectionId: string): Promise<PipelineSource[]> {
    const sources = await notebooksApi.getSources(collectionId);
    return sources.map((s) => ({
      ...s,
      collectionTitle: undefined,
      collectionColor: undefined,
    }));
  },

  /**
   * Fetches all sources across all collections owned or accessible by the user.
   */
  async getAllSources(): Promise<{ sources: PipelineSource[]; collections: PipelineCollection[]; stats: PipelineStats }> {
    const collections = await this.getCollections();
    
    // Concurrently fetch sources from all collections
    const sourcesByCollection = await Promise.allSettled(
      collections.map(async (col) => {
        try {
          const items = await notebooksApi.getSources(col.id);
          return items.map((item) => ({
            ...item,
            collectionTitle: col.title,
            collectionColor: col.color,
            metadata: {
              subject: (item as any).metadata?.subject || (col.title.includes('Math') ? 'Mathematics' : col.title.includes('Physics') ? 'Physics' : col.title.includes('Chemistry') ? 'Chemistry' : col.title.includes('Biology') ? 'Biology' : 'General'),
              classGrade: (item as any).metadata?.classGrade || 'Class 10',
              exam: (item as any).metadata?.exam || 'CBSE',
              language: (item as any).metadata?.language || 'English',
              ...(item as any).metadata,
            },
          } as PipelineSource));
        } catch {
          return [] as PipelineSource[];
        }
      })
    );

    const allSources: PipelineSource[] = [];
    const enrichedCollections: PipelineCollection[] = collections.map((col, idx) => {
      const res = sourcesByCollection[idx];
      const items = res.status === 'fulfilled' ? res.value : [];
      allSources.push(...items);

      const readyCount = items.filter((s) => s.status === 'READY').length;
      const failedCount = items.filter((s) => s.status === 'FAILED' || s.status === 'FAILED_NONRETRYABLE').length;
      const processingCount = items.filter((s) =>
        ['PENDING', 'UPLOADING', 'PROCESSING', 'OCR', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'GENERATING_GRAPH'].includes(s.status)
      ).length;
      const chunks = items.reduce((acc, s) => acc + (s.chunksExtracted || 0), 0);

      return {
        ...col,
        sourceCount: items.length,
        readyCount,
        failedCount,
        processingCount,
        totalChunks: chunks,
      };
    });

    // Compute global pipeline stats
    const totalSources = allSources.length;
    const ready = allSources.filter((s) => s.status === 'READY').length;
    const failed = allSources.filter((s) => s.status === 'FAILED' || s.status === 'FAILED_NONRETRYABLE').length;
    const processing = allSources.filter((s) =>
      ['PENDING', 'UPLOADING', 'PROCESSING', 'OCR', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'GENERATING_GRAPH'].includes(s.status)
    ).length;
    const totalChunks = allSources.reduce((sum, s) => sum + (s.chunksExtracted || 0), 0);
    const indexedVectors = allSources.reduce((sum, s) => sum + ((s.status === 'READY' ? (s.chunksExtracted || 0) : 0)), 0);
    const knowledgeGraphNodes = allSources.reduce((sum, s) => sum + (s.conceptsExtracted || 0), 0);

    const stats: PipelineStats = {
      totalSources,
      processing,
      ready,
      failed,
      totalChunks,
      indexedVectors,
      knowledgeGraphNodes,
    };

    return {
      sources: allSources,
      collections: enrichedCollections,
      stats,
    };
  },

  /**
   * Uploads a document to a collection with progress and cancellation support
   */
  async uploadSource(
    collectionId: string,
    file: File,
    onUploadProgress?: (progressEvent: any) => void,
    signal?: AbortSignal
  ): Promise<PipelineSource> {
    const source = await notebooksApi.uploadSource(collectionId, file, onUploadProgress, signal);
    return source as PipelineSource;
  },

  /**
   * Checks if a content hash exists in the collection before or during upload
   */
  async checkDuplicate(collectionId: string, hash: string): Promise<{ isDuplicate: boolean; source?: PipelineSource }> {
    try {
      const res = await api.get(`/notebooks/${collectionId}/sources/duplicate-check`, {
        params: { hash },
      });
      return res.data;
    } catch {
      return { isDuplicate: false };
    }
  },

  /**
   * Deletes a source from a collection
   */
  async deleteSource(collectionId: string, sourceId: string): Promise<void> {
    await notebooksApi.deleteSource(collectionId, sourceId);
  },

  /**
   * Retries processing for a failed source
   */
  async retrySource(collectionId: string, sourceId: string): Promise<void> {
    try {
      await api.post(`/notebooks/${collectionId}/sources/${sourceId}/retry`);
    } catch {
      await api.put(`/notebooks/${collectionId}/sources/${sourceId}`, { status: 'QUEUED' });
    }
  },

  /**
   * Fetches mock/real versions for a source document
   */
  async getSourceVersions(collectionId: string, sourceId: string): Promise<DocumentVersionItem[]> {
    try {
      const res = await api.get(`/notebooks/${collectionId}/sources/${sourceId}/versions`);
      return res.data;
    } catch {
      return [
        {
          id: `${sourceId}_v1`,
          sourceId,
          version: 1,
          createdAt: Date.now() - 3600000,
          changeSummary: 'Initial document upload and ingestion',
          sizeBytes: 1048576,
          hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
      ];
    }
  },
};

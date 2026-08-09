/**
 * DocumentVersioningService
 * Phase 9: Document Versioning & Content Lineage Subsystem
 *
 * Implements immutable multi-version progression (Document -> Version 1 -> Version 2 -> Version 3),
 * strict vector and chunk isolation (ZERO vector mixing between versions),
 * version diffing, and version activation management.
 */

import { db } from '../../../config/firebase';
import { DocumentVersion, DocumentVersionDiff, SemanticChunk } from '../types';
import { VectorIndexingService } from '../indexing/VectorIndexingService';
import { logger } from '../../../utils/logger';

export interface CreateVersionParams {
  userId: string;
  sourceId: string;
  collectionId: string;
  versionNumber?: number;
  documentVersionId?: string;
  processingVersion?: number;
  embeddingModel?: string;
  embeddingVersion?: string | number;
  chunkCount?: number;
  tokenCount?: number;
  sizeBytes?: number;
  hash?: string;
  storagePath?: string;
  changeSummary?: string;
  metadata?: Record<string, any>;
  isActive?: boolean;
}

export class DocumentVersioningService {
  private _vectorIndexingService?: VectorIndexingService;
  private memoryVersions = new Map<string, DocumentVersion[]>();
  private memoryChunks = new Map<string, SemanticChunk[]>();

  private get vectorIndexingService(): VectorIndexingService {
    if (!this._vectorIndexingService) {
      this._vectorIndexingService = new VectorIndexingService();
    }
    return this._vectorIndexingService;
  }

  /**
   * Registers a new immutable version for a document.
   * Ensures every processed version has an independent identifier and metadata.
   */
  async createVersion(params: CreateVersionParams): Promise<DocumentVersion> {
    const {
      userId,
      sourceId,
      collectionId,
      versionNumber,
      documentVersionId,
      processingVersion = 1,
      embeddingModel = 'text-embedding-004',
      embeddingVersion = 1,
      chunkCount = 0,
      tokenCount = 0,
      sizeBytes = 0,
      hash = '',
      storagePath = '',
      changeSummary = 'Document version update',
      metadata = {},
      isActive = true,
    } = params;

    const cacheKey = `${collectionId}_${sourceId}`;
    const existingList = this.memoryVersions.get(cacheKey) || [];

    // 1. Determine next version number if not explicitly provided
    let nextVersionNum = versionNumber;
    if (!nextVersionNum) {
      nextVersionNum = existingList.length > 0 ? Math.max(...existingList.map(v => v.version)) + 1 : 1;
    }

    const versionTag = documentVersionId || `v${nextVersionNum}`;
    const versionDocId = `${versionTag}_${sourceId}`;

    const versionData: DocumentVersion = {
      id: versionDocId,
      sourceId,
      collectionId,
      userId,
      version: nextVersionNum,
      documentVersionId: versionTag,
      processingVersion,
      embeddingModel,
      embeddingVersion,
      chunkCount,
      tokenCount,
      sizeBytes,
      hash: hash || `hash_v${nextVersionNum}_${Date.now()}`,
      storagePath,
      changeSummary,
      isActiveVersion: isActive,
      metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Update memory store
    if (isActive) {
      existingList.forEach(v => {
        if (v.documentVersionId !== versionTag) v.isActiveVersion = false;
      });
    }
    const filtered = existingList.filter(v => v.documentVersionId !== versionTag);
    filtered.push(versionData);
    this.memoryVersions.set(cacheKey, filtered);

    // 2. Persist version document in Firestore (with timeout guard)
    const withTimeout = <T>(p: Promise<T>, ms = 600): Promise<T> =>
      Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), ms))]);

    try {
      const versionRef = db
        .collection('notebooks')
        .doc(collectionId)
        .collection('sources')
        .doc(sourceId)
        .collection('versions')
        .doc(versionTag);

      await withTimeout(versionRef.set(versionData));

      // 3. If active, deactivate other versions and update parent source document
      if (isActive) {
        const allVersions = await this.getVersions(collectionId, sourceId);
        const batch = db.batch();
        for (const v of allVersions) {
          if (v.documentVersionId !== versionTag && v.isActiveVersion) {
            const otherRef = db
              .collection('notebooks')
              .doc(collectionId)
              .collection('sources')
              .doc(sourceId)
              .collection('versions')
              .doc(v.documentVersionId);
            batch.update(otherRef, { isActiveVersion: false, updatedAt: Date.now() });
          }
        }

        // Update parent source doc
        const sourceRef = db
          .collection('notebooks')
          .doc(collectionId)
          .collection('sources')
          .doc(sourceId);

        batch.update(sourceRef, {
          currentVersion: nextVersionNum,
          documentVersionId: versionTag,
          activeVersionId: versionTag,
          version: nextVersionNum,
          totalChunks: chunkCount,
          totalTokens: tokenCount,
          updatedAt: new Date().toISOString(),
        });

        await withTimeout(batch.commit());
      }
    } catch (err) {
      logger.warn(`[DocumentVersioningService] Firestore sync warning (saved to memory):`, err);
    }

    logger.info(`[DocumentVersioningService] Created version ${versionTag} for document ${sourceId}`);
    return versionData;
  }

  /**
   * Fetches all registered versions for a document ordered by version descending.
   */
  async getVersions(collectionId: string, documentId: string): Promise<DocumentVersion[]> {
    const cacheKey = `${collectionId}_${documentId}`;
    if (this.memoryVersions.has(cacheKey)) {
      return [...(this.memoryVersions.get(cacheKey) || [])].sort((a, b) => b.version - a.version);
    }

    try {
      const snap = await db
        .collection('notebooks')
        .doc(collectionId)
        .collection('sources')
        .doc(documentId)
        .collection('versions')
        .orderBy('version', 'desc')
        .get();

      if (!snap.empty) {
        const list = snap.docs.map(d => d.data() as DocumentVersion);
        this.memoryVersions.set(cacheKey, list);
        return list;
      }
    } catch (err) {
      logger.warn(`[DocumentVersioningService] Firestore fetch error:`, err);
    }

    // Fallback: If no versions subcollection exists yet, synthesize Version 1 from source doc
    try {
      const sourceDoc = await db
        .collection('notebooks')
        .doc(collectionId)
        .collection('sources')
        .doc(documentId)
        .get();

      if (sourceDoc.exists) {
        const data = sourceDoc.data() as any;
        const v1: DocumentVersion = {
          id: `v1_${documentId}`,
          sourceId: documentId,
          collectionId,
          userId: data.userId || 'system',
          version: data.version || 1,
          documentVersionId: data.documentVersionId || 'v1',
          processingVersion: 1,
          embeddingModel: 'text-embedding-004',
          embeddingVersion: 1,
          chunkCount: data.totalChunks || data.chunksExtracted || 0,
          tokenCount: data.totalTokens || 0,
          sizeBytes: data.sizeBytes || 0,
          hash: data.checksum || data.hash || 'initial_hash',
          storagePath: data.storagePath || '',
          changeSummary: 'Initial document upload and pipeline processing',
          isActiveVersion: true,
          metadata: data.metadata || {},
          createdAt: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
        };
        return [v1];
      }
    } catch (err) {
      logger.warn(`[DocumentVersioningService] Firestore doc fetch error:`, err);
    }

    return [];
  }

  /**
   * Retrieves a specific version of a document.
   */
  async getVersion(
    collectionId: string,
    documentId: string,
    documentVersionId: string
  ): Promise<DocumentVersion | null> {
    const versions = await this.getVersions(collectionId, documentId);
    return versions.find(v => v.documentVersionId === documentVersionId || v.id === documentVersionId) || null;
  }

  /**
   * Stores chunks isolated under a specific version subcollection.
   * Path: /notebooks/{collectionId}/sources/{documentId}/versions/{documentVersionId}/chunks/{chunkId}
   */
  async storeVersionChunks(
    collectionId: string,
    documentId: string,
    documentVersionId: string,
    chunks: SemanticChunk[]
  ): Promise<void> {
    const cacheKey = `${collectionId}_${documentId}_${documentVersionId}`;
    this.memoryChunks.set(cacheKey, chunks);

    try {
      const versionChunksRef = db
        .collection('notebooks')
        .doc(collectionId)
        .collection('sources')
        .doc(documentId)
        .collection('versions')
        .doc(documentVersionId)
        .collection('chunks');

      const batchLimit = 450;
      for (let i = 0; i < chunks.length; i += batchLimit) {
        const batch = db.batch();
        const slice = chunks.slice(i, i + batchLimit);

        for (const chunk of slice) {
          const cRef = versionChunksRef.doc(chunk.chunkId);
          batch.set(cRef, {
            ...chunk,
            documentVersionId,
            versionStoredAt: Date.now(),
          });
        }
        await batch.commit();
      }
    } catch (err) {
      logger.warn(`[DocumentVersioningService] Failed to store chunks to Firestore:`, err);
    }
  }

  /**
   * Retrieves semantic chunks for a specific historical document version.
   */
  async getVersionChunks(
    collectionId: string,
    documentId: string,
    documentVersionId: string
  ): Promise<SemanticChunk[]> {
    const cacheKey = `${collectionId}_${documentId}_${documentVersionId}`;
    if (this.memoryChunks.has(cacheKey)) {
      return this.memoryChunks.get(cacheKey) || [];
    }

    try {
      const snap = await db
        .collection('notebooks')
        .doc(collectionId)
        .collection('sources')
        .doc(documentId)
        .collection('versions')
        .doc(documentVersionId)
        .collection('chunks')
        .orderBy('sequence', 'asc')
        .get();

      if (!snap.empty) {
        return snap.docs.map(d => d.data() as SemanticChunk);
      }
    } catch (err) {
      logger.warn(`[DocumentVersioningService] Failed to get chunks from Firestore:`, err);
    }

    return [];
  }

  /**
   * Compares two document versions and calculates structural and text diffs.
   */
  async diffVersions(
    collectionId: string,
    documentId: string,
    baseVersionId: string,
    targetVersionId: string
  ): Promise<DocumentVersionDiff> {
    const baseVersion = await this.getVersion(collectionId, documentId, baseVersionId);
    const targetVersion = await this.getVersion(collectionId, documentId, targetVersionId);

    if (!baseVersion || !targetVersion) {
      throw new Error(`Cannot diff versions: One or both versions not found (${baseVersionId}, ${targetVersionId})`);
    }

    const baseChunks = await this.getVersionChunks(collectionId, documentId, baseVersionId);
    const targetChunks = await this.getVersionChunks(collectionId, documentId, targetVersionId);

    const baseChunkMap = new Map(baseChunks.map(c => [c.sequence, c]));
    const targetChunkMap = new Map(targetChunks.map(c => [c.sequence, c]));

    const addedChunkIds: string[] = [];
    const removedChunkIds: string[] = [];
    const modifiedPairs: { baseChunkId: string; targetChunkId: string; diffSnippet: string }[] = [];

    // Find added or modified chunks
    for (const [seq, tChunk] of targetChunkMap.entries()) {
      const bChunk = baseChunkMap.get(seq);
      if (!bChunk) {
        addedChunkIds.push(tChunk.chunkId);
      } else if (bChunk.text.trim() !== tChunk.text.trim()) {
        modifiedPairs.push({
          baseChunkId: bChunk.chunkId,
          targetChunkId: tChunk.chunkId,
          diffSnippet: `Base: "${bChunk.text.slice(0, 80)}..." -> Target: "${tChunk.text.slice(0, 80)}..."`,
        });
      }
    }

    // Find removed chunks
    for (const [seq, bChunk] of baseChunkMap.entries()) {
      if (!targetChunkMap.has(seq)) {
        removedChunkIds.push(bChunk.chunkId);
      }
    }

    return {
      documentId,
      collectionId,
      baseVersion,
      targetVersion,
      chunksAddedCount: addedChunkIds.length,
      chunksRemovedCount: removedChunkIds.length,
      chunksModifiedCount: modifiedPairs.length,
      tokenDelta: (targetVersion.tokenCount || 0) - (baseVersion.tokenCount || 0),
      sizeDelta: (targetVersion.sizeBytes || 0) - (baseVersion.sizeBytes || 0),
      addedChunkIds,
      removedChunkIds,
      modifiedChunkPairs: modifiedPairs,
    };
  }

  /**
   * Deletes a specific document version and guarantees zero orphaned vectors.
   */
  async deleteVersion(
    collectionId: string,
    documentId: string,
    documentVersionId: string
  ): Promise<void> {
    // 1. Delete Pinecone vectors tagged with this version
    await this.vectorIndexingService.deleteVersionVectors(collectionId, documentId, documentVersionId);

    // 2. Delete version document & its chunks subcollection from Firestore
    const versionChunksRef = db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(documentId)
      .collection('versions')
      .doc(documentVersionId)
      .collection('chunks');

    const chunksSnap = await versionChunksRef.get();
    const batch = db.batch();
    for (const doc of chunksSnap.docs) {
      batch.delete(doc.ref);
    }

    const versionDocRef = db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(documentId)
      .collection('versions')
      .doc(documentVersionId);

    batch.delete(versionDocRef);
    await batch.commit();

    logger.info(`[DocumentVersioningService] Purged version ${documentVersionId} and its isolated vectors.`);
  }
}

export const documentVersioningService = new DocumentVersioningService();

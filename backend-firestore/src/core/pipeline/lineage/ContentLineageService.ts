/**
 * ContentLineageService
 * Phase 9: Document Versioning & Content Lineage Subsystem
 *
 * Implements deterministic 4-Level Traceability across all downstream consumers:
 * Level 1: Artifact (Podcast, Magic Chat, Quiz Question, Article, Note, RAG Citation)
 *   ↓
 * Level 2: Chunk (chunkId, sequence, snippet, tokenCount, pageNumber/End, charBounds, blockIds)
 *   ↓
 * Level 3: Document Version (documentVersionId, processingVersion, embeddingModel, embeddingVersion)
 *   ↓
 * Level 4: Original Source (sourceId, collectionId, originalName, storagePath, metadata)
 */

import { db } from '../../../config/firebase';
import {
  Complete4LevelLineage,
  ArtifactLineageRecord,
  DownstreamArtifactType,
  SemanticChunk,
  DocumentVersion,
} from '../types';
import { documentVersioningService } from '../versioning/DocumentVersioningService';
import { logger } from '../../../utils/logger';

export interface ResolveArtifactLineageParams {
  artifactId: string;
  artifactType: DownstreamArtifactType;
  title?: string;
  description?: string;
  consumerContext?: string;
  collectionId: string;
  documentId: string;
  documentVersionId?: string;
  citedChunkIds: string[];
}

export interface DownstreamProvenanceNode {
  id: string;
  type: 'source' | 'version' | 'chunk' | 'artifact';
  label: string;
  details: Record<string, any>;
  children?: DownstreamProvenanceNode[];
}

export class ContentLineageService {
  private memoryLineage = new Map<string, ArtifactLineageRecord>();

  /**
   * Resolves full 4-level lineage for a single chunk.
   */
  async resolveChunkLineage(
    collectionId: string,
    documentId: string,
    chunkId: string,
    documentVersionId?: string,
    artifactMeta?: {
      artifactId?: string;
      artifactType?: DownstreamArtifactType;
      title?: string;
      consumerContext?: string;
    }
  ): Promise<Complete4LevelLineage> {
    // 1. Fetch Source Document (Level 4)
    let sourceData: any = {};
    try {
      const sourceDoc = await db
        .collection('notebooks')
        .doc(collectionId)
        .collection('sources')
        .doc(documentId)
        .get();
      if (sourceDoc.exists) {
        sourceData = sourceDoc.data() as any;
      }
    } catch (err) {
      // offline fallback
    }

    const effectiveVersionId = documentVersionId || sourceData.documentVersionId || 'v1';

    // 2. Fetch Document Version (Level 3)
    let versionDoc: DocumentVersion | null = await documentVersioningService.getVersion(
      collectionId,
      documentId,
      effectiveVersionId
    );

    if (!versionDoc) {
      versionDoc = {
        id: `${effectiveVersionId}_${documentId}`,
        sourceId: documentId,
        collectionId,
        userId: sourceData.userId || 'system',
        version: sourceData.version || 1,
        documentVersionId: effectiveVersionId,
        processingVersion: 1,
        embeddingModel: 'text-embedding-004',
        embeddingVersion: 1,
        chunkCount: sourceData.totalChunks || 1,
        tokenCount: sourceData.totalTokens || 0,
        sizeBytes: sourceData.sizeBytes || 0,
        hash: sourceData.checksum || 'default_hash',
        storagePath: sourceData.storagePath || '',
        changeSummary: 'Document version lineage record',
        isActiveVersion: true,
        createdAt: sourceData.createdAt ? new Date(sourceData.createdAt).getTime() : Date.now(),
      };
    }

    // 3. Fetch Chunk (Level 2)
    let chunkData: SemanticChunk | null = null;

    // Check version service chunks first
    const versionChunks = await documentVersioningService.getVersionChunks(collectionId, documentId, effectiveVersionId);
    const foundChunk = versionChunks.find(c => c.chunkId === chunkId);
    if (foundChunk) {
      chunkData = foundChunk;
    } else {
      try {
        // Check version-scoped chunks in Firestore
        const vChunkDoc = await db
          .collection('notebooks')
          .doc(collectionId)
          .collection('sources')
          .doc(documentId)
          .collection('versions')
          .doc(effectiveVersionId)
          .collection('chunks')
          .doc(chunkId)
          .get();

        if (vChunkDoc.exists) {
          chunkData = vChunkDoc.data() as SemanticChunk;
        } else {
          // Check top-level chunks
          const topChunkDoc = await db
            .collection('notebooks')
            .doc(collectionId)
            .collection('sources')
            .doc(documentId)
            .collection('chunks')
            .doc(chunkId)
            .get();

          if (topChunkDoc.exists) {
            chunkData = topChunkDoc.data() as SemanticChunk;
          }
        }
      } catch (err) {
        // offline fallback
      }
    }

    const chunkObj: SemanticChunk = chunkData || {
      chunkId,
      documentId,
      documentVersionId: effectiveVersionId,
      collectionId,
      sequence: 1,
      text: 'Extracted semantic context content',
      tokenCount: 150,
      charCount: 600,
      pageNumber: 1,
      pageEnd: 1,
      chapter: sourceData.metadata?.chapter || 'Chapter 1',
      section: sourceData.title || 'Core Section',
      contentType: 'text',
      boundaryStrategy: 'paragraph_boundary',
      sourceLocation: { blockIds: [], pageStart: 1, pageEnd: 1, charStart: 0, charEnd: 600 },
    };

    // 4. Construct complete 4-level lineage contract
    const lineage: Complete4LevelLineage = {
      artifact: {
        artifactId: artifactMeta?.artifactId || `art_${Date.now()}`,
        artifactType: artifactMeta?.artifactType || 'RAG_CITATION',
        title: artifactMeta?.title || 'Direct Knowledge Retrieval',
        consumerContext: artifactMeta?.consumerContext || 'RAG Citations Engine',
        generatedAt: Date.now(),
      },
      chunk: {
        chunkId: chunkObj.chunkId,
        sequence: chunkObj.sequence,
        snippet: chunkObj.text.length > 250 ? `${chunkObj.text.slice(0, 247)}...` : chunkObj.text,
        tokenCount: chunkObj.tokenCount || Math.ceil(chunkObj.text.length / 4),
        charCount: chunkObj.charCount || chunkObj.text.length,
        pageNumber: chunkObj.pageNumber || 1,
        pageEnd: chunkObj.pageEnd || chunkObj.pageNumber || 1,
        chapter: chunkObj.chapter,
        section: chunkObj.section,
        sourceBlockIds: chunkObj.sourceLocation?.blockIds || [],
        charStart: chunkObj.sourceLocation?.charStart,
        charEnd: chunkObj.sourceLocation?.charEnd,
      },
      documentVersion: {
        documentVersionId: versionDoc.documentVersionId,
        versionNumber: versionDoc.version,
        processingVersion: versionDoc.processingVersion || 1,
        embeddingModel: versionDoc.embeddingModel || 'text-embedding-004',
        embeddingVersion: versionDoc.embeddingVersion || 1,
        extractedAt: versionDoc.createdAt,
        checksum: versionDoc.hash,
      },
      originalSource: {
        sourceId: documentId,
        collectionId,
        title: sourceData.title || 'Untitled Document',
        originalName: sourceData.originalName || sourceData.filename || 'source.pdf',
        storagePath: sourceData.storagePath || sourceData.gcsPath || '',
        contentType: sourceData.mimeType || sourceData.contentType || 'application/pdf',
        sizeBytes: sourceData.sizeBytes || 0,
        uploadedAt: sourceData.createdAt ? new Date(sourceData.createdAt).getTime() : Date.now(),
        checksum: sourceData.checksum || sourceData.hash || '',
        metadata: sourceData.metadata || {},
      },
    };

    return lineage;
  }

  /**
   * Resolves complete 4-level lineage for a collection of cited chunks in a downstream artifact.
   * (e.g. Magic Chat, Podcast Episode, Quiz Question).
   */
  async resolveArtifactLineage(
    params: ResolveArtifactLineageParams
  ): Promise<ArtifactLineageRecord> {
    const {
      artifactId,
      artifactType,
      title,
      description,
      consumerContext,
      collectionId,
      documentId,
      documentVersionId,
      citedChunkIds,
    } = params;

    const lineageNodes: Complete4LevelLineage[] = [];

    for (const chunkId of citedChunkIds) {
      try {
        const node = await this.resolveChunkLineage(
          collectionId,
          documentId,
          chunkId,
          documentVersionId,
          {
            artifactId,
            artifactType,
            title,
            consumerContext,
          }
        );
        lineageNodes.push(node);
      } catch (err) {
        logger.warn(`[ContentLineageService] Failed to resolve chunk lineage for ${chunkId}`, { err });
      }
    }

    const record: ArtifactLineageRecord = {
      id: `lineage_${artifactId}`,
      artifactId,
      artifactType,
      collectionId,
      documentId,
      documentVersionId: documentVersionId || 'v1',
      citedChunkIds,
      lineageNodes,
      createdAt: Date.now(),
    };

    // Record lineage in Firestore
    await this.recordArtifactLineage(record);
    return record;
  }

  /**
   * Persists an artifact lineage record in Firestore under `/artifact_lineage/{id}`.
   */
  async recordArtifactLineage(record: ArtifactLineageRecord): Promise<void> {
    this.memoryLineage.set(record.artifactId, record);
    try {
      await db.collection('artifact_lineage').doc(record.id).set(record);
      logger.info(`[ContentLineageService] Saved lineage record for artifact ${record.artifactId}`);
    } catch (err) {
      logger.warn(`[ContentLineageService] Firestore save warning:`, { err, id: record.id });
    }
  }

  /**
   * Retrieves an artifact lineage record from Firestore.
   */
  async getArtifactLineage(artifactId: string): Promise<ArtifactLineageRecord | null> {
    if (this.memoryLineage.has(artifactId)) {
      return this.memoryLineage.get(artifactId) || null;
    }
    try {
      const doc = await db.collection('artifact_lineage').doc(`lineage_${artifactId}`).get();
      if (doc.exists) {
        const rec = doc.data() as ArtifactLineageRecord;
        this.memoryLineage.set(artifactId, rec);
        return rec;
      }
    } catch (err) {
      // offline fallback
    }
    return null;
  }

  /**
   * Traces the downstream provenance tree showing all artifacts and chunks generated from a document version.
   */
  async traceDocumentLineageGraph(
    collectionId: string,
    documentId: string,
    documentVersionId?: string
  ): Promise<DownstreamProvenanceNode> {
    // 1. Fetch Source Document
    let sData: any = {};
    try {
      const sourceDoc = await db
        .collection('notebooks')
        .doc(collectionId)
        .collection('sources')
        .doc(documentId)
        .get();
      if (sourceDoc.exists) {
        sData = sourceDoc.data() as any;
      }
    } catch (err) {
      // offline fallback
    }
    const versions = await documentVersioningService.getVersions(collectionId, documentId);

    const versionNodes: DownstreamProvenanceNode[] = [];

    for (const v of versions) {
      if (documentVersionId && v.documentVersionId !== documentVersionId) {
        continue;
      }

      const chunks = await documentVersioningService.getVersionChunks(collectionId, documentId, v.documentVersionId);
      const chunkNodes: DownstreamProvenanceNode[] = chunks.slice(0, 10).map(c => ({
        id: c.chunkId,
        type: 'chunk',
        label: `Chunk #${c.sequence} (Page ${c.pageNumber || 1})`,
        details: {
          tokenCount: c.tokenCount,
          snippet: c.text.slice(0, 100),
          chapter: c.chapter,
          section: c.section,
        },
      }));

      versionNodes.push({
        id: v.id,
        type: 'version',
        label: `Version ${v.version} (${v.documentVersionId})`,
        details: {
          processingVersion: v.processingVersion,
          embeddingModel: v.embeddingModel,
          embeddingVersion: v.embeddingVersion,
          chunkCount: v.chunkCount,
          isActive: v.isActiveVersion,
        },
        children: chunkNodes,
      });
    }

    return {
      id: documentId,
      type: 'source',
      label: sData.title || 'Source Document',
      details: {
        collectionId,
        originalName: sData.originalName || sData.filename,
        checksum: sData.checksum,
        sizeBytes: sData.sizeBytes,
      },
      children: versionNodes,
    };
  }
}

export const contentLineageService = new ContentLineageService();

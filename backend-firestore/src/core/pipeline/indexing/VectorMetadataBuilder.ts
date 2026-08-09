/**
 * VectorMetadataBuilder
 * Phase 3B: Embedding and Vector Indexing
 *
 * Constructs strictly normalized, undefined-free Pinecone vector metadata records
 * from SemanticChunk and contextual scoping parameters.
 */

import { SemanticChunk, VectorMetadata } from '../types';

export const EMBEDDING_VERSION = 1;
export const CHUNK_VERSION = 2; // Phase 3A Structure-Aware Semantic Chunks
export const METADATA_VERSION = 2;

export interface VectorMetadataBuildParams {
  chunk: SemanticChunk;
  userId: string;
  collectionId: string;
  vectorId: string;
  tenantId?: string;
  extraTags?: string[];
  documentVersionId?: string;
  processingVersion?: number;
  embeddingModel?: string;
  embeddingVersion?: number | string;
}

export class VectorMetadataBuilder {
  /**
   * Transforms a SemanticChunk into a Pinecone-safe VectorMetadata object.
   * Invariant: Never contains undefined fields.
   */
  build(params: VectorMetadataBuildParams): VectorMetadata {
    const {
      chunk,
      userId,
      collectionId,
      vectorId,
      tenantId,
      extraTags,
      documentVersionId,
      processingVersion,
      embeddingModel,
      embeddingVersion,
    } = params;

    const effectiveDocVersionId = documentVersionId || chunk.documentVersionId || 'v1';

    return {
      // Scoping & Multi-tenancy
      userId: userId || '',
      tenantId: tenantId || userId || 'default',
      collectionId: collectionId || '',
      notebookId: collectionId || '',
      documentId: chunk.documentId || '',
      documentVersionId: effectiveDocVersionId,
      sourceId: chunk.documentId || '',
      chunkId: chunk.chunkId || '',
      vectorId,

      // Content
      text: chunk.text || '',
      sequence: chunk.sequence,
      chunkIndex: chunk.sequence,
      contentType: chunk.contentType || 'text',
      tokenCount: chunk.tokenCount || Math.ceil((chunk.text?.length || 0) / 4),
      charCount: chunk.charCount || chunk.text?.length || 0,

      // Document Hierarchy
      chapter: chunk.chapter || '',
      section: chunk.section || '',
      subsection: chunk.subsection || '',
      heading: chunk.section || chunk.chapter || '',
      pageNumber: chunk.pageNumber ?? 0,
      pageEnd: chunk.pageEnd ?? chunk.pageNumber ?? 0,

      // Educational Metadata
      subject: chunk.subject || '',
      classLevel: chunk.classLevel || '',
      board: chunk.board || '',
      exam: chunk.exam || '',
      language: chunk.language || 'en',
      topic: chunk.topic || '',
      difficulty: chunk.difficulty || 'Medium',

      // Source Traceability
      sourceBlockIds: chunk.sourceLocation?.blockIds || [],
      sourceLocationJson: JSON.stringify(chunk.sourceLocation || {}),

      // System & Version Tracking (Phase 9 Invariants)
      processingVersion: processingVersion ?? 1,
      embeddingModel: embeddingModel || 'text-embedding-004',
      embeddingVersion: embeddingVersion ?? EMBEDDING_VERSION,
      chunkVersion: CHUNK_VERSION,
      metadataVersion: METADATA_VERSION,
      indexedAt: new Date().toISOString(),

      // Optional array tags
      tags: extraTags && extraTags.length > 0 ? extraTags.slice(0, 10) : [],
      conceptIds: chunk.conceptIds || [],
      entityIds: chunk.entityIds || [],
    };
  }
}

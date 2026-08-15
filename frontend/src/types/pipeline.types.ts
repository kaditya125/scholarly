/**
 * Content Pipeline Frontend Types
 * Phase 1B & Phase 2A: Content Upload, Storage & Frontend Foundation
 */

import { DocumentSource, Notebook } from '../types';

export type PipelineProcessingStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'UPLOADING'
  | 'PROCESSING'
  | 'OCR'
  | 'EXTRACTING'
  | 'CHUNKING'
  | 'EMBEDDING'
  | 'INDEXING'
  | 'GENERATING_GRAPH'
  | 'READY'
  | 'FAILED'
  | 'FAILED_NONRETRYABLE'
  | 'CANCELLED'
  | 'ARCHIVED';

export type ContentTypeFilter =
  | 'ALL'
  | 'PDF'
  | 'DOCX'
  | 'PPTX'
  | 'XLSX'
  | 'TXT'
  | 'MD'
  | 'HTML'
  | 'IMAGE'
  | 'AUDIO'
  | 'VIDEO'
  | 'EPUB';

export const SUPPORTED_EXTENSIONS = [
  'pdf',
  'docx',
  'pptx',
  'xlsx',
  'txt',
  'md',
  'html',
  'png',
  'jpg',
  'jpeg',
] as const;

export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'text/html',
  'image/png',
  'image/jpeg',
] as const;

export interface PipelineSourceMetadata {
  subject?: string;
  classGrade?: string;
  exam?: string;
  language?: string;
  author?: string;
  publisher?: string;
  edition?: string;
  year?: number;
  tags?: string[];
  [key: string]: any;
}

export interface PipelineSource extends DocumentSource {
  collectionTitle?: string;
  collectionColor?: string;
  metadata?: PipelineSourceMetadata;
  indexedVectors?: number;
  kgNodeCount?: number;
  extractedRawText?: string;
  updatedAt?: number;
  failureReason?: string;
  errorDetails?: string;
  documentVersionId?: string;
  pageCount?: number;
  pagesCount?: number;
  totalChunks?: number;
}

export interface PipelineCollection extends Notebook {
  sourceCount?: number;
  readyCount?: number;
  processingCount?: number;
  failedCount?: number;
  totalChunks?: number;
}

export interface PipelineStats {
  totalSources: number;
  processing: number;
  ready: number;
  failed: number;
  totalChunks: number;
  indexedVectors: number;
  knowledgeGraphNodes: number;
}

export interface PipelineFilterState {
  search: string;
  status: string; // 'ALL' | 'READY' | 'PROCESSING' | 'FAILED' | 'ARCHIVED'
  contentType: ContentTypeFilter;
  subject: string;
  classGrade: string;
  exam: string;
  language: string;
  collectionId: string; // 'ALL' | specific ID
}

export type DocumentWorkspaceTab =
  | 'overview'
  | 'content'
  | 'structure'
  | 'chunks'
  | 'graph'
  | 'metadata'
  | 'quality'
  | 'processing'
  | 'versions'
  | 'usage';

export interface DocumentStructureItem {
  id: string;
  type: string;
  title: string;
  page?: number;
  level?: number;
  children?: DocumentStructureItem[];
}

export interface DocumentChunk {
  id: string;
  index: number;
  content?: string;
  text?: string;
  tokenCount: number;
  pageNumber?: number;
  startChar?: number;
  endChar?: number;
  authorityScore?: number;
  sectionTitle?: string;
  hash?: string;
}

export interface DocumentVersionItem {
  id: string;
  sourceId: string;
  version: number;
  createdAt: number;
  changeSummary: string;
  sizeBytes: number;
  hash: string;
}

export type UploadItemStatus =
  | 'idle'
  | 'validating'
  | 'uploading'
  | 'queued'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface UploadQueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: UploadItemStatus;
  collectionId: string;
  error?: string;
  abortController?: AbortController;
  sourceId?: string;
  hash?: string;
  isDuplicate?: boolean;
}

export type VisualStageName =
  | 'Uploading'
  | 'Extraction'
  | 'OCR'
  | 'Understanding'
  | 'Chunking'
  | 'Embedding'
  | 'Vector Index'
  | 'Knowledge Graph'
  | 'Validation'
  | 'Ready';

export type StageVisualStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface StageItemMetrics {
  pages?: number;
  blocks?: number;
  chunks?: number;
  vectors?: number;
  kgNodes?: number;
  kgEdges?: number;
  bytesUploaded?: number;
  totalBytes?: number;
}

export interface PipelineRealtimeStage {
  stage: VisualStageName;
  internalStage: string;
  status: StageVisualStatus;
  durationMs: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface PipelineRealtimeSnapshot {
  jobId: string;
  documentId: string;
  documentVersionId: string;
  collectionId: string;
  userId?: string;
  status: 'QUEUED' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  currentStage: VisualStageName;
  internalStage: string;
  progress: number; // 0.0 to 1.0
  durationMs: number;
  itemsProcessed: StageItemMetrics;
  stages: PipelineRealtimeStage[];
  error?: {
    code: string;
    message: string;
    stage?: string;
    recoverable?: boolean;
  };
  canRetry: boolean;
  canCancel: boolean;
  timestamp: number;
}

export interface PipelineRealtimeEvent extends PipelineRealtimeSnapshot {
  type:
    | 'init'
    | 'stage_start'
    | 'stage_progress'
    | 'stage_complete'
    | 'job_complete'
    | 'job_error'
    | 'job_cancelled'
    | 'ping';
}

export interface PipelineStageExecution {
  stage: string;
  name: string;
  label: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  durationMs?: number;
  errorDetails?: string;
}

// ----------------------------------------------------------------------------
// Phase 7: Content Exploration, Search & Lineage Types
// ----------------------------------------------------------------------------

export type ExplorationSearchMode = 'hybrid' | 'semantic' | 'keyword';

export interface ExplorationSearchFilter {
  collectionId?: string;
  documentId?: string;
  subject?: string;
  classGrade?: string;
  exam?: string;
  language?: string;
  chapter?: string;
  contentType?: string;
}

export interface ExplorationSearchOptions {
  mode?: ExplorationSearchMode;
  topK?: number;
  minScore?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  highlightSnippetLength?: number;
}

export interface SourceLineageNode {
  documentId: string;
  documentTitle: string;
  collectionId: string;
  collectionTitle?: string;
  pageNumber: number;
  pageEnd?: number;
  chunkId: string;
  chunkSequence: number;
  charStart?: number;
  charEnd?: number;
  chapter?: string;
  section?: string;
  storagePath?: string;
}

export interface ExplorationSearchResultItem {
  chunkId: string;
  documentId: string;
  documentVersionId?: string;
  collectionId: string;
  documentTitle: string;
  title: string;
  snippet: string;
  text: string;
  chapter: string;
  section: string;
  pageNumber: number;
  pageEnd?: number;
  score: number; // 0.0 - 1.0
  relevanceScore: number; // 0 - 100
  searchMode: ExplorationSearchMode;
  sourceLocation: {
    pageNumber: number;
    charStart?: number;
    charEnd?: number;
  };
  metadata: Record<string, any>;
  lineage: SourceLineageNode;
}

export interface ExplorationStructureNode {
  id: string;
  type: 'chapter' | 'section' | 'subsection' | 'unit';
  title: string;
  level: number;
  pageNumber: number;
  pageEnd?: number;
  chunkCount?: number;
  children: ExplorationStructureNode[];
}

export interface ExplorationLineageResponse {
  searchResultId: string;
  chunk: DocumentChunk | null;
  pageNumber: number;
  pageEnd: number;
  document: PipelineSource | null;
  storageUrl?: string;
}

/**
 * Phase 8: Content Quality & Pre-READY Validation Contracts
 */

export type QualityHealthStatus = 'Healthy' | 'Warning' | 'Needs Review' | 'Failed';

export type QualityIndicatorName =
  | 'Extraction'
  | 'Metadata'
  | 'Chunking'
  | 'Embeddings'
  | 'Vector Index'
  | 'Knowledge Graph'
  | 'Validation';

export type QualityIndicatorStatus = 'excellent' | 'good' | 'fair' | 'poor' | 'unavailable' | 'failed';

export type InvariantId =
  | 'source_exists'
  | 'storage_exists'
  | 'extraction_succeeded'
  | 'chunks_exist'
  | 'embeddings_exist'
  | 'vector_count_parity'
  | 'metadata_exists'
  | 'source_lineage_exists'
  | 'kg_exists'
  | 'valid_processing_state';

export interface QualityValidationInvariant {
  id: InvariantId;
  name: string;
  passed: boolean;
  critical: boolean;
  score: number;
  message: string;
  details?: Record<string, any>;
  explanation?: string;
}

export interface QualityIndicatorResult {
  name: QualityIndicatorName;
  score: number; // 0 to 100
  status: QualityIndicatorStatus;
  weight: number;
  summary: string;
  metrics: Record<string, any>;
  explanation?: string;
}

export interface ContentQualityReport {
  documentId: string;
  collectionId: string;
  documentVersionId?: string;
  overallScore: number; // 0 to 100
  healthStatus: QualityHealthStatus;
  isReadyValid: boolean;
  invariants: QualityValidationInvariant[];
  indicators: Record<QualityIndicatorName, QualityIndicatorResult>;
  summary: {
    passedInvariants: number;
    totalInvariants: number;
    warningsCount: number;
    criticalFailuresCount: number;
  };
  warnings: string[];
  failures: string[];
  explanationSummary: string[];
  timestamp: number;
}

// ----------------------------------------------------------------------------
// Phase 9: Document Versioning & Content Lineage Types
// ----------------------------------------------------------------------------

export interface DocumentVersion {
  id: string;
  sourceId: string;
  collectionId: string;
  userId: string;
  version: number;
  documentVersionId: string;
  processingVersion: number;
  embeddingModel: string;
  embeddingVersion: string | number;
  chunkCount: number;
  tokenCount: number;
  sizeBytes: number;
  hash: string;
  storagePath: string;
  changeSummary: string;
  isActiveVersion: boolean;
  metadata?: Record<string, any>;
  createdAt: number;
  updatedAt?: number;
}

export interface DocumentVersionDiff {
  documentId: string;
  collectionId: string;
  baseVersion: DocumentVersion;
  targetVersion: DocumentVersion;
  chunksAddedCount: number;
  chunksRemovedCount: number;
  chunksModifiedCount: number;
  tokenDelta: number;
  sizeDelta: number;
  addedChunkIds: string[];
  removedChunkIds: string[];
  modifiedChunkPairs: { baseChunkId: string; targetChunkId: string; diffSnippet: string }[];
}

export type DownstreamArtifactType =
  | 'RAG_CITATION'
  | 'MAGIC_CHAT'
  | 'PODCAST'
  | 'ARTICLE'
  | 'QUIZ'
  | 'FLASHCARD'
  | 'NOTE';

export interface Complete4LevelLineage {
  artifact: {
    artifactId: string;
    artifactType: DownstreamArtifactType;
    title?: string;
    description?: string;
    consumerContext?: string;
    generatedAt: number;
  };
  chunk: {
    chunkId: string;
    sequence: number;
    snippet: string;
    tokenCount: number;
    charCount: number;
    pageNumber: number;
    pageEnd: number;
    chapter?: string;
    section?: string;
    sourceBlockIds?: string[];
    charStart?: number;
    charEnd?: number;
  };
  documentVersion: {
    documentVersionId: string;
    versionNumber: number;
    processingVersion: number;
    embeddingModel: string;
    embeddingVersion: string | number;
    extractedAt: number;
    checksum: string;
  };
  originalSource: {
    sourceId: string;
    collectionId: string;
    title: string;
    originalName: string;
    storagePath: string;
    contentType: string;
    sizeBytes: number;
    uploadedAt: number;
    checksum: string;
    metadata?: Record<string, any>;
  };
}

export interface ArtifactLineageRecord {
  id: string;
  artifactId: string;
  artifactType: DownstreamArtifactType;
  collectionId: string;
  documentId: string;
  documentVersionId: string;
  citedChunkIds: string[];
  lineageNodes: Complete4LevelLineage[];
  createdAt: number;
}



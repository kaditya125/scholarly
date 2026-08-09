/**
 * Content Pipeline Core Types & Data Contracts
 * Phase 1A: Data Foundation
 */

export type ProcessingState =
  | 'DRAFT'
  | 'UPLOADING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'CANCELLED'
  | 'ARCHIVED';

export type ProcessingStageName =
  | 'UPLOAD'
  | 'QUEUE'
  | 'EXTRACT'
  | 'OCR'
  | 'STRUCTURE'
  | 'METADATA'
  | 'CHUNK'
  | 'EMBED'
  | 'INDEX'
  | 'KNOWLEDGE_GRAPH'
  | 'VALIDATE'
  | 'COMPLETE'
  | 'READY';

export type ProcessingStageStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED';

export type DocumentContentType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'text/plain'
  | 'text/markdown'
  | 'application/epub+zip'
  | 'image/png'
  | 'image/jpeg'
  | 'audio/mpeg'
  | 'audio/wav'
  | 'video/mp4'
  | 'application/json';

/**
 * Structured Processing Error
 */
export interface ProcessingError {
  code: string;
  message: string;
  stage?: ProcessingStageName;
  recoverable: boolean;
  timestamp: number;
  details?: Record<string, any>;
  traceId?: string;
}

/**
 * Content Source Entity (Phase 1A core entity)
 * Strictly compatible with existing DocumentSource schema in Firestore notebooks/{notebookId}/sources/{sourceId}
 */
export interface ContentSource {
  id: string;
  userId: string;
  collectionId: string;
  notebookId?: string; // Alias for collectionId to guarantee 100% backward compatibility
  title: string;
  originalName: string;
  contentType: string;
  mimeType?: string; // Alias for contentType
  sizeBytes: number;
  storagePath: string;
  gcsPath?: string; // Alias for storagePath
  downloadUrl?: string;
  status: ProcessingState;
  metadata: Record<string, any>;
  createdAt: number;
  updatedAt: number;
  version: number;
  hash?: string; // SHA-256 content checksum for deduplication
  checksum?: string; // Alias for hash
  archivedAt?: number;

  // Granular stage and diagnostics tracking
  currentStage?: ProcessingStageName;
  chunksExtracted?: number;
  conceptsExtracted?: number;
  processingDurationMs?: number;
  lastHeartbeatAt?: number;
  failedAt?: number;
  failureReason?: string;
  errorDetails?: string;
  activeJobId?: string;
}

/**
 * Content Collection Entity (adapts Notebook schema)
 */
export interface ContentCollection {
  id: string;
  userId: string;
  title: string;
  description?: string;
  sourceCount: number;
  storageUsedBytes: number;
  createdAt: number;
  updatedAt: number;
  isArchived?: boolean;
  tags?: string[];
  editors?: string[];
  viewers?: string[];
}

/**
 * Document Version Entity (tracks content lineage and version snapshots)
 * Stored at notebooks/{notebookId}/sources/{sourceId}/versions/{versionId}
 */
export interface DocumentVersion {
  id: string;
  sourceId: string;
  collectionId: string;
  userId: string;
  version: number;
  hash: string;
  sizeBytes: number;
  storagePath: string;
  metadata: Record<string, any>;
  changeSummary?: string;
  createdAt: number;
}

/**
 * Granular Processing Stage execution record
 */
export interface ProcessingStage {
  name: ProcessingStageName;
  status: ProcessingStageStatus;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: ProcessingError;
  diagnostics?: Record<string, any>;
}

/**
 * Processing Job Entity
 * Stored in Firestore or managed in-memory/queue
 */
export interface ProcessingJob {
  id: string;
  sourceId: string;
  collectionId: string;
  userId: string;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  currentStage: ProcessingStageName;
  stages: Record<ProcessingStageName, ProcessingStage>;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: ProcessingError;
  traceId?: string;
}

/**
 * Historical Pipeline Run Entity
 * Captures complete telemetry and metrics for an ingestion run
 */
export interface PipelineRun {
  id: string;
  jobId: string;
  sourceId: string;
  collectionId: string;
  userId: string;
  finalState: ProcessingState;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  stageTimings: Partial<Record<ProcessingStageName, number>>;
  tokensUsed?: { prompt: number; completion: number; total: number };
  chunksIndexed?: number;
  conceptsCreated?: number;
  assetsGenerated?: number;
  errors: ProcessingError[];
}

/**
 * Inputs for Creating and Updating Content Sources
 */
export interface CreateSourceInput {
  collectionId: string;
  title: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  storagePath: string;
  hash?: string;
  metadata?: Record<string, any>;
  customId?: string;
}

export interface UpdateSourceInput {
  title?: string;
  originalName?: string;
  contentType?: string;
  sizeBytes?: number;
  storagePath?: string;
  hash?: string;
  metadata?: Record<string, any>;
  status?: ProcessingState;
  currentStage?: ProcessingStageName;
  chunksExtracted?: number;
  conceptsExtracted?: number;
  processingDurationMs?: number;
  activeJobId?: string;
}

/**
 * Phase 2B: Document Extraction Types & Contracts
 */
export type ExtractedBlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'table'
  | 'image'
  | 'caption'
  | 'equation'
  | 'question'
  | 'answer'
  | 'example';

export interface SourceLocation {
  pageNumber?: number;
  slideNumber?: number;
  sheetName?: string | number;
  lineStart?: number;
  lineEnd?: number;
  charStart?: number;
  charEnd?: number;
  cellRef?: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface ExtractedBlock {
  documentId: string;
  documentVersionId: string;
  blockId: string;
  type: ExtractedBlockType;
  content: string;
  pageNumber?: number;
  section?: string;
  heading?: string;
  sequence: number;
  sourceLocation: SourceLocation;
  ocrConfidence?: number;
  metadata?: Record<string, any>;
}

export type ExtractedDocumentFormat =
  | 'PDF'
  | 'DOCX'
  | 'PPTX'
  | 'XLSX'
  | 'TXT'
  | 'MD'
  | 'HTML';

export interface ExtractedDocumentResult {
  documentId: string;
  documentVersionId: string;
  format: ExtractedDocumentFormat;
  language: 'en' | 'hi' | 'mixed';
  pageCount: number;
  totalBlocks: number;
  totalCharacters: number;
  blocks: ExtractedBlock[];
  rawText: string;
  hierarchy: {
    sections: { title: string; blockCount: number; pageStart?: number; pageEnd?: number }[];
  };
  warnings?: string[];
  ocrMetadata?: {
    applied: boolean;
    pagesProcessed: number[];
    averageConfidence?: number;
    durationMs?: number;
  };
}

/**
 * Phase 2C: Intelligent OCR & Quality Assessment Contracts
 */
export interface OcrPageAssessment {
  pageNumber: number;
  characterCount: number;
  textDensity: number; // 0.0 - 1.0
  isImageOnly: boolean;
  confidence: number; // 0.0 - 1.0
  requiresOcr: boolean;
  reason?: string;
}

export interface OcrQualityMetrics {
  overallQuality: number; // 0.0 - 1.0
  averageCharacterCountPerPage: number;
  pageCoverage: number; // 0.0 - 1.0 (pages with text / total pages)
  requiresOcr: boolean;
  pagesNeedingOcr: number[];
  pageAssessments: OcrPageAssessment[];
  reason?: string;
}

export interface OcrBlock {
  blockId: string;
  pageNumber: number;
  type: ExtractedBlockType;
  content: string;
  confidence: number; // 0.0 - 1.0
  sourceLocation: SourceLocation;
}

export interface OcrResult {
  documentId: string;
  documentVersionId: string;
  language: 'en' | 'hi' | 'mixed';
  blocks: OcrBlock[];
  rawText: string;
  averageConfidence: number;
  durationMs: number;
  pageNumbers: number[];
}

/**
 * Phase 2D: Document Understanding Contracts
 */

/** Semantic structure roles that can appear in educational documents */
export type DocumentStructureType =
  | 'title'
  | 'chapter'
  | 'section'
  | 'subsection'
  | 'heading'
  | 'paragraph'
  | 'definition'
  | 'example'
  | 'theorem'
  | 'question'
  | 'answer'
  | 'exercise'
  | 'important_note'
  | 'reference'
  | 'summary'
  | 'unknown';

/**
 * A block annotated with its structural role in the document.
 * Wraps an ExtractedBlock with document-level understanding.
 */
export interface DocumentStructureBlock {
  blockId: string;
  structureType: DocumentStructureType;
  content: string;
  pageNumber?: number;
  sequence: number;
  confidence: number; // 0.0–1.0
  heading?: string;
  section?: string;
  chapterTitle?: string;
}

/**
 * A metadata value with an associated AI-generated confidence score.
 * When `source === 'user'`, the value was manually provided and must never
 * be overwritten during automated reprocessing.
 */
export interface ConfidentValue<T = string> {
  value: T;
  confidence: number; // 0.0–1.0
  source: 'ai' | 'user' | 'inferred';
}

/**
 * Configurable metadata category descriptor.
 * Categories are registered via MetadataCategoryRegistry — not hardcoded.
 */
export interface MetadataCategory {
  key: string;           // e.g. "subject", "board", "exam"
  label: string;         // e.g. "Subject", "Board", "Exam"
  valueType: 'string' | 'string[]' | 'number';
  allowedValues?: string[];  // Optional enumeration for validation
}

/**
 * Educational metadata as extracted by the AI + user override layer.
 * Values are always ConfidentValue so callers can filter by confidence threshold.
 * The map is keyed by MetadataCategory.key, making it fully configurable.
 */
export type EducationalMetadata = Record<string, ConfidentValue<string | string[] | number>>;

/**
 * User-provided metadata overrides. These take priority over AI-extracted values
 * and are persisted separately so reprocessing never loses them.
 */
export type UserMetadataOverrides = Record<string, string | string[] | number>;

/**
 * The complete result of Document Understanding for one document.
 */
export interface DocumentUnderstandingResult {
  documentId: string;
  documentVersionId: string;

  /** Hierarchical structural blocks classified by type */
  structuredBlocks: DocumentStructureBlock[];

  /** Flat chapter/section hierarchy extracted from the document */
  documentOutline: {
    title?: string;
    chapters: { title: string; sections: string[]; pageStart?: number; pageEnd?: number }[];
  };

  /** AI-extracted educational metadata with confidence scores */
  educationalMetadata: EducationalMetadata;

  /** Merged metadata: user overrides take precedence over AI values */
  resolvedMetadata: EducationalMetadata;

  /** Summary statistics */
  stats: {
    totalStructuredBlocks: number;
    structureTypeDistribution: Record<DocumentStructureType, number>;
    metadataFieldsExtracted: number;
    averageMetadataConfidence: number;
    userOverriddenFields: string[];
  };

  durationMs: number;
  warnings?: string[];
}

/**
 * Phase 3A: Structure-Aware Semantic Chunking Contracts
 */

/**
 * The content types a chunk can represent.
 * Maps to DocumentStructureType for traceability.
 */
export type ChunkContentType =
  | 'text'
  | 'heading'
  | 'definition'
  | 'theorem'
  | 'example'
  | 'question_answer'
  | 'question'
  | 'answer'
  | 'exercise'
  | 'table'
  | 'important_note'
  | 'summary'
  | 'reference'
  | 'mixed';

/**
 * The boundary strategy used to generate this chunk.
 */
export type ChunkBoundaryStrategy =
  | 'chapter_boundary'
  | 'section_boundary'
  | 'heading_boundary'
  | 'paragraph_boundary'
  | 'qa_pair_group'
  | 'definition_explanation_group'
  | 'table_group'
  | 'overflow_split'
  | 'single_block';

/**
 * Full semantic chunk data model.
 * Every field required by the downstream AI stack is present.
 */
export interface SemanticChunk {
  // Identity & lineage
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  collectionId: string;

  // Content
  text: string;
  sequence: number;
  contentType: ChunkContentType;

  // Document location
  pageNumber?: number;
  pageEnd?: number;
  chapter?: string;
  section?: string;
  subsection?: string;

  // Educational metadata (from Phase 2D)
  subject?: string;
  classLevel?: string;
  language?: string;
  board?: string;
  exam?: string;
  topic?: string;
  difficulty?: string;

  // Source traceability
  sourceLocation: {
    blockIds: string[];
    pageStart?: number;
    pageEnd?: number;
    charStart?: number;
    charEnd?: number;
  };

  // Chunking metadata
  boundaryStrategy: ChunkBoundaryStrategy;
  tokenCount: number; // Estimated (chars / 4)
  charCount: number;

  // Navigation linkage
  previousChunkId?: string;
  nextChunkId?: string;

  // Downstream feature hooks (populated post-embedding)
  conceptIds?: string[];
  entityIds?: string[];

  // Embedding readiness
  embeddingText?: string; // Optionally enriched version for embedding
}

/**
 * Options to configure the chunking process.
 */
export interface ChunkingOptions {
  maxTokensPerChunk?: number;       // Hard cap for overflow splitting (default: 512)
  minTokensPerChunk?: number;       // Avoid micro-chunks below this size (default: 20)
  overlapTokens?: number;           // Token overlap between overflow-split sibling chunks (default: 50)
  groupQaPairs?: boolean;           // Keep Q+A blocks together (default: true)
  groupDefinitions?: boolean;       // Keep definition+explanation together (default: true)
  groupTables?: boolean;            // Keep table+surrounding context together (default: true)
  respectSectionBoundaries?: boolean; // Never split mid-section when possible (default: true)
  includeMetadataInEmbeddingText?: boolean; // Prepend subject/chapter to embedding text (default: true)
}

/**
 * Result of a full chunking run.
 */
export interface ChunkingResult {
  documentId: string;
  documentVersionId: string;
  collectionId: string;
  chunks: SemanticChunk[];
  totalChunks: number;
  totalTokens: number;
  averageChunkTokens: number;
  boundaryStrategyDistribution: Record<ChunkBoundaryStrategy, number>;
  durationMs: number;
  warnings?: string[];
}

/**
 * Phase 3B: Embedding and Vector Indexing Contracts
 */

/**
 * Pinecone vector metadata payload strictly normalized for retrieval filtering.
 * Never contains undefined fields.
 */
export interface VectorMetadata {
  // Scoping & Multi-tenancy
  userId: string;
  tenantId: string;
  collectionId: string;
  notebookId: string;
  documentId: string;
  documentVersionId: string;
  sourceId: string;
  chunkId: string;
  vectorId: string;

  // Content
  text: string;
  sequence: number;
  chunkIndex: number;
  contentType: ChunkContentType;
  tokenCount: number;
  charCount: number;

  // Document Hierarchy
  chapter: string;
  section: string;
  subsection: string;
  heading: string;
  pageNumber: number;
  pageEnd: number;

  // Educational Metadata
  subject: string;
  classLevel: string;
  board: string;
  exam: string;
  language: string;
  topic: string;
  difficulty: string;

  // Source Traceability
  sourceBlockIds: string[];
  sourceLocationJson: string;

  // System & Version Tracking
  documentVersionId: string;
  processingVersion: number;
  embeddingModel: string;
  embeddingVersion: number | string;
  chunkVersion: number;
  metadataVersion: number;
  indexedAt: string;

  // Indexing extra tags/categories
  tags?: string[];
  conceptIds?: string[];
  entityIds?: string[];
}

/**
 * Single vector record ready for Pinecone upsert.
 */
export interface VectorRecord {
  id: string; // Deterministic vector ID
  values: number[]; // Vector embeddings array (e.g. 768 dims)
  metadata: VectorMetadata;
}

/**
 * Options for vector indexing operations.
 */
export interface VectorIndexingOptions {
  namespace?: string;
  batchSize?: number; // Upsert batch size (default: 100)
  concurrency?: number; // Concurrency for embedding generation (default: 1)
  pacingMs?: number; // Delay between embedding calls (default: 0 in test / 50 in prod)
  maxRetries?: number; // Max retries on transient errors (default: 3)
  tenantId?: string; // Optional tenant ID
}

/**
 * Result of vector indexing validation check.
 */
export interface VectorValidationResult {
  isValid: boolean;
  chunksCreated: number;
  vectorsIndexed: number;
  missingChunkIds: string[];
  error?: string;
}

/**
 * Result of the full Vector Indexing stage.
 */
export interface VectorIndexingResult {
  documentId: string;
  documentVersionId: string;
  collectionId: string;
  userId: string;
  namespace?: string;
  totalChunks: number;
  vectorsIndexed: number;
  vectorIds: string[];
  validation: VectorValidationResult;
  durationMs: number;
  warnings?: string[];
}

/**
 * Phase 4: Knowledge Graph Integration Contracts
 */

export type KGNodeType = 'CONCEPT' | 'PERSON' | 'PLACE' | 'FORMULA' | 'EVENT' | 'THEOREM' | 'DEFINITION';

export type KGRelationshipType =
  | 'PREREQUISITE_OF'
  | 'RELATED_TO'
  | 'PART_OF'
  | 'OPPOSITE_OF'
  | 'CAUSES'
  | 'USES'
  | 'DERIVED_FROM'
  | 'SIMILAR_TO'
  | 'EXPLAINS';

export interface KGSourceLineage {
  documentId: string;
  documentVersionId: string;
  chunkIds: string[];
  collectionId: string;
  pageStart?: number;
  pageEnd?: number;
  blockIds: string[];
}

export interface PipelineKGNode {
  id: string; // e.g. "kg_col101_concept_wave_particle_duality"
  notebookId: string;
  collectionId: string;
  tenantId?: string;
  label: string;
  type: KGNodeType;
  definition: string;
  importance: number; // 0.0 to 1.0
  difficulty: 'Easy' | 'Medium' | 'Hard';
  estimatedStudyTime: number; // minutes
  masteryPercentage: number;
  confidenceScore: number; // 0.0 to 1.0
  prerequisites: string[]; // Node IDs
  relatedConcepts: string[]; // Node IDs
  sourceDocIds: string[]; // Document IDs
  lineage: KGSourceLineage[];
  subject?: string;
  chapter?: string;
  graphVersion?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PipelineKGEdge {
  id: string; // e.g. "edge_nodeA_nodeB_RELATED_TO"
  notebookId: string;
  collectionId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: KGRelationshipType;
  confidence: number; // 0.0 to 1.0
  documentId: string;
  documentVersionId: string;
  chunkId?: string;
  sourceLocationJson?: string;
  layer?: 'similarity' | 'llm' | 'structural';
  graphVersion?: number;
  createdAt?: string;
}

export interface KGExtractionOptions {
  minConceptConfidence?: number; // default: 0.7
  minEdgeConfidence?: number; // default: 0.6
  maxRelationshipsPerNode?: number; // default: 5
  enableIntraDocumentLinking?: boolean; // default: true
  enableCrossDocumentLinking?: boolean; // default: true
  tenantId?: string;
}

export interface KGValidationResult {
  isValid: boolean;
  nodesExtracted: number;
  edgesExtracted: number;
  validSourceReferences: boolean;
  tenantIsolationVerified: boolean;
  orphanedEdgeCount: number;
  warnings?: string[];
  error?: string;
}

export interface KGExtractionResult {
  documentId: string;
  documentVersionId: string;
  collectionId: string;
  userId: string;
  nodes: PipelineKGNode[];
  edges: PipelineKGEdge[];
  nodesCount: number;
  edgesCount: number;
  validation: KGValidationResult;
  durationMs: number;
  warnings?: string[];
}

/**
 * Phase 5: Content Pipeline Orchestrator Contracts
 */

export interface StageCheckpoint {
  lastCompletedStage: ProcessingStageName;
  extractedResult?: ExtractedDocumentResult;
  extractedText?: string;
  extractedBlocks?: ExtractedBlock[];
  ocrResult?: {
    blocks: ExtractedBlock[];
    requiresOcr: boolean;
    pageCount: number;
  };
  understandingResult?: DocumentUnderstandingResult;
  chunks?: SemanticChunk[];
  vectorResult?: VectorIndexingResult;
  kgResult?: KGExtractionResult;
  qualityReport?: ContentQualityReport;
  updatedAt: number;
}

export interface PipelineJobState {
  jobId: string;
  documentId: string;
  documentVersionId: string;
  collectionId: string;
  userId: string;
  tenantId?: string;
  currentStage: ProcessingStageName;
  status: 'PENDING' | 'QUEUED' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number; // 0.0 to 1.0 (0% to 100%)
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  retryCount: number;
  maxRetries: number;
  error?: ProcessingError;
  checkpoint?: StageCheckpoint;
  sourceFile?: {
    originalName: string;
    contentType: string;
    sizeBytes: number;
    buffer?: Buffer;
    storagePath?: string;
  };
  options?: OrchestratorOptions;
}

export interface OrchestratorOptions {
  forceOcr?: boolean;
  skipKnowledgeGraph?: boolean;
  skipVectorIndexing?: boolean;
  tenantId?: string;
  maxRetries?: number; // default: 3
  timeoutMs?: number; // default: 120_000 (2 mins)
  checkpointStorage?: 'memory' | 'firestore'; // default: 'firestore'
}

export interface OrchestratorResult {
  jobId: string;
  documentId: string;
  documentVersionId: string;
  collectionId: string;
  userId: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  finalStage: ProcessingStageName;
  durationMs: number;
  chunksIndexed: number;
  vectorsIndexed: number;
  kgNodesCreated: number;
  kgEdgesCreated: number;
  error?: ProcessingError;
  warnings?: string[];
}

/**
 * Phase 6: Real-Time Processing Experience Contracts
 */

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
  internalStage: ProcessingStageName;
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
  internalStage: ProcessingStageName;
  progress: number; // 0.0 to 1.0
  durationMs: number;
  itemsProcessed: StageItemMetrics;
  stages: PipelineRealtimeStage[];
  error?: ProcessingError;
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
  critical: boolean; // if true and failed, document cannot be READY
  score: number; // 0.0 to 1.0
  message: string;
  details?: Record<string, any>;
  explanation?: string;
}

export interface QualityIndicatorResult {
  name: QualityIndicatorName;
  score: number; // 0 to 100
  status: QualityIndicatorStatus;
  weight: number; // e.g. 0.15
  summary: string;
  metrics: Record<string, any>;
  explanation?: string;
}

export interface ContentQualityReport {
  documentId: string;
  collectionId: string;
  documentVersionId?: string;
  overallScore: number; // 0 to 100 (never artificially inflated to 100%)
  healthStatus: QualityHealthStatus;
  isReadyValid: boolean; // true only if all 10 mandatory invariants pass
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

/**
 * Phase 9: Document Versioning & Content Lineage Contracts
 */

export interface DocumentVersion {
  id: string; // e.g. "v1_doc123" or "v1"
  sourceId: string;
  collectionId: string;
  userId: string;
  version: number; // 1, 2, 3...
  documentVersionId: string; // "v1", "v2", "v3"
  processingVersion: number; // pipeline execution run index
  embeddingModel: string; // e.g. "text-embedding-004", "text-embedding-3-small"
  embeddingVersion: string | number; // e.g. "1.0.0" or 1
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
  // Level 1: Downstream Artifact
  artifact: {
    artifactId: string;
    artifactType: DownstreamArtifactType;
    title?: string;
    description?: string;
    consumerContext?: string; // e.g. "Magic Chat Turn 4", "Podcast Segment 2"
    generatedAt: number;
  };

  // Level 2: Semantic Chunk
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

  // Level 3: Document Version
  documentVersion: {
    documentVersionId: string;
    versionNumber: number;
    processingVersion: number;
    embeddingModel: string;
    embeddingVersion: string | number;
    extractedAt: number;
    checksum: string;
  };

  // Level 4: Original Source
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
  id: string; // lineage record UUID
  artifactId: string;
  artifactType: DownstreamArtifactType;
  collectionId: string;
  documentId: string;
  documentVersionId: string;
  citedChunkIds: string[];
  lineageNodes: Complete4LevelLineage[];
  createdAt: number;
}



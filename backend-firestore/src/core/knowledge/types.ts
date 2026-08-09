/**
 * KnowledgeService Types
 * Phase 10: Shared Knowledge Service Abstraction
 *
 * Defines conceptual input/output contracts for document fetching, collection
 * inspection, hybrid/semantic search, chunk retrieval, GraphRAG context fusion,
 * 4-level citations, knowledge graphs, and structural AST blocks.
 */

import {
  DocumentSource,
  Notebook,
  LearningAsset,
} from '../../types';
import {
  SemanticChunk,
  DocumentStructureBlock,
  PipelineKGNode,
  PipelineKGEdge,
  Complete4LevelLineage,
  DownstreamArtifactType,
  DocumentVersion,
} from '../pipeline/types';

export interface KnowledgeSearchFilter {
  collectionId?: string;
  notebookId?: string;
  documentId?: string;
  sourceId?: string;
  sourceIds?: string[];
  documentVersionId?: string;
  subject?: string;
  classGrade?: string;
  exam?: string;
  language?: string;
  chapter?: string;
  contentType?: string;
  tags?: string[];
  minConfidence?: number;
}

export interface KnowledgeSearchOptions {
  mode?: 'hybrid' | 'semantic' | 'keyword';
  topK?: number;
  minScore?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  highlightSnippetLength?: number;
  tenantId?: string;
  userId?: string;
  namespace?: string;
  expansionTerms?: string[];
}

export interface KnowledgeSearchResultItem {
  chunkId: string;
  documentId: string;
  documentVersionId?: string;
  collectionId: string;
  text: string;
  score: number;
  semanticScore?: number;
  keywordScore?: number;
  contentType: string;
  sequence: number;
  pageNumber?: number;
  pageEnd?: number;
  chapter?: string;
  section?: string;
  subject?: string;
  classGrade?: string;
  highlightSnippet?: string;
  lineage?: Complete4LevelLineage;
}

export interface KnowledgeSearchResult {
  query: string;
  totalMatches: number;
  items: KnowledgeSearchResultItem[];
  tookMs: number;
  filterApplied?: KnowledgeSearchFilter;
}

export interface SemanticChunkMatch {
  chunkId: string;
  documentId: string;
  documentVersionId?: string;
  collectionId: string;
  text: string;
  score: number;
  weightedScore?: number;
  tokenCount: number;
  pageNumber?: number;
  pageEnd?: number;
  chapter?: string;
  section?: string;
  sourceTitle?: string;
  sourceId?: string;
  metadata?: Record<string, any>;
}

export interface KnowledgeContextOptions {
  userId?: string;
  topK?: number;
  sourceIds?: string[];
  includeKnowledgeGraph?: boolean;
  includeWebSearch?: boolean;
  expansionTerms?: string[];
  examContext?: {
    exam: string;
    subject: string;
    syllabusTopic?: string;
  };
  artifactType?: DownstreamArtifactType;
  consumerContext?: string;
}

export interface KnowledgeContextCitation {
  chunkId?: string;
  source: string;
  sourceId?: string;
  score: number;
  pageNumber?: number;
  snippet?: string;
  lineage?: Complete4LevelLineage;
}

export interface KnowledgeContextBundle {
  query: string;
  contextString: string;
  passages: SemanticChunkMatch[];
  citations: KnowledgeContextCitation[];
  graphContext?: {
    nodesMatched: number;
    traversedNodes: number;
    expansionTerms: string[];
    contextString: string;
  };
  webContext?: {
    source: string;
    text: string;
  }[];
  retrievalLatencyMs: number;
}

export interface KnowledgeCitationOptions {
  artifactType?: DownstreamArtifactType;
  artifactId?: string;
  title?: string;
  consumerContext?: string;
  userId?: string;
}

export interface KnowledgeGraphOptions {
  minConfidence?: number;
  includePrerequisitesOnly?: boolean;
  maxDepth?: number;
  query?: string;
}

export interface KnowledgeGraphResult {
  collectionId: string;
  documentId?: string;
  nodes: PipelineKGNode[];
  edges: PipelineKGEdge[];
  contextString?: string;
  conceptCount: number;
  relationshipCount: number;
}

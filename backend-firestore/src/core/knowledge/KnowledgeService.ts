/**
 * KnowledgeService
 * Phase 10: Shared Knowledge Service Abstraction
 *
 * Provides a unified, high-level facade for all AI consumers (Magic Chat,
 * Podcast Studio, AI Tutor, Quiz Generator, Deep Articles).
 *
 * Wraps and coordinates:
 *   - Existing RAG (RetrievalService, GraphRetrievalService, ContextAssembler)
 *   - ContentExplorationService (Hybrid & Semantic search)
 *   - DocumentVersioningService & ContentLineageService (4-Level Lineage)
 *   - KnowledgeGraphService & DocumentUnderstandingService (AST Structure)
 *
 * Ensures AI consumers never directly bind to raw Pinecone or Firestore retrieval logic.
 */

import { db } from '../../config/firebase';
import { notebookRepository } from '../../repositories/notebook.repository';
import { retrievalService, RetrievalService, RetrievalResult } from '../../services/rag/retrieval.service';
import { graphRetrievalService, GraphRetrievalService } from '../../services/rag/graphRetrieval.service';
import { contentExplorationService, ContentExplorationService } from '../pipeline/exploration/ContentExplorationService';
import { contentLineageService, ContentLineageService } from '../pipeline/lineage/ContentLineageService';
import { documentVersioningService, DocumentVersioningService } from '../pipeline/versioning/DocumentVersioningService';
import { DocumentSource, Notebook } from '../../types';
import {
  SemanticChunk,
  DocumentStructureBlock,
  PipelineKGNode,
  PipelineKGEdge,
  Complete4LevelLineage,
  DownstreamArtifactType,
} from '../pipeline/types';
import {
  KnowledgeSearchFilter,
  KnowledgeSearchOptions,
  KnowledgeSearchResult,
  KnowledgeSearchResultItem,
  SemanticChunkMatch,
  KnowledgeContextOptions,
  KnowledgeContextCitation,
  KnowledgeContextBundle,
  KnowledgeCitationOptions,
  KnowledgeGraphOptions,
  KnowledgeGraphResult,
} from './types';
import { logger } from '../../utils/logger';

export class KnowledgeService {
  constructor(
    private readonly retrieval: RetrievalService = retrievalService,
    private readonly graphRetrieval: GraphRetrievalService = graphRetrievalService,
    private readonly exploration: ContentExplorationService = contentExplorationService,
    private readonly lineage: ContentLineageService = contentLineageService,
    private readonly versioning: DocumentVersioningService = documentVersioningService
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. getDocument
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Retrieves document metadata, source location, and active version.
   */
  async getDocument(
    collectionId: string,
    documentId: string,
    userId?: string
  ): Promise<DocumentSource | null> {
    try {
      const sourceDoc = await db
        .collection('notebooks')
        .doc(collectionId)
        .collection('sources')
        .doc(documentId)
        .get();

      if (sourceDoc.exists) {
        return sourceDoc.data() as DocumentSource;
      }

      // Memory cache fallback in exploration service
      const cached = this.exploration.getCachedDocument(collectionId, documentId);
      if (cached) return cached;
    } catch (err) {
      logger.warn(`[KnowledgeService.getDocument] Firestore error:`, err);
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. getCollection
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Retrieves collection / notebook container metadata, stats, and source list.
   */
  async getCollection(
    collectionId: string,
    userId?: string
  ): Promise<Notebook | null> {
    try {
      if (userId) {
        const nb = await notebookRepository.getNotebook(userId, collectionId);
        if (nb) return nb;
      }
      const doc = await db.collection('notebooks').doc(collectionId).get();
      if (doc.exists) {
        return doc.data() as Notebook;
      }
    } catch (err) {
      logger.warn(`[KnowledgeService.getCollection] Firestore error:`, err);
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. searchContent
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Unified hybrid search combining dense vector embeddings + sparse keyword matching
   * with metadata filtering and 4-level lineage.
   */
  async searchContent(
    query: string,
    filter?: KnowledgeSearchFilter,
    options?: KnowledgeSearchOptions
  ): Promise<KnowledgeSearchResult> {
    const tStart = Date.now();
    const effectiveUserId = options?.userId || filter?.collectionId || 'global';

    try {
      const explorationResult = await this.exploration.search(
        effectiveUserId,
        query,
        {
          collectionId: filter?.collectionId || filter?.notebookId,
          documentId: filter?.documentId || filter?.sourceId,
          subject: filter?.subject,
          classGrade: filter?.classGrade,
          exam: filter?.exam,
          language: filter?.language,
          chapter: filter?.chapter,
          contentType: filter?.contentType,
          tags: filter?.tags,
        },
        {
          mode: options?.mode || 'hybrid',
          topK: options?.topK || 5,
          minScore: options?.minScore || 0.4,
          semanticWeight: options?.semanticWeight || 0.7,
          keywordWeight: options?.keywordWeight || 0.3,
          highlightSnippetLength: options?.highlightSnippetLength || 250,
          tenantId: options?.tenantId,
        }
      );

      const items: KnowledgeSearchResultItem[] = explorationResult.results.map((r) => ({
        chunkId: r.chunkId,
        documentId: r.documentId,
        documentVersionId: r.documentVersionId,
        collectionId: r.collectionId,
        text: r.text,
        score: r.score,
        semanticScore: r.semanticScore,
        keywordScore: r.keywordScore,
        contentType: r.contentType,
        sequence: r.sequence,
        pageNumber: r.pageNumber,
        pageEnd: r.pageEnd,
        chapter: r.chapter,
        section: r.section,
        subject: r.subject,
        classGrade: r.classGrade,
        highlightSnippet: r.highlightSnippet,
      }));

      return {
        query,
        totalMatches: items.length,
        items,
        tookMs: Date.now() - tStart,
        filterApplied: filter,
      };
    } catch (err) {
      logger.warn(`[KnowledgeService.searchContent] Falling back to retrieval service:`, err);
      return this.fallbackSearch(query, filter, options, tStart);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. semanticSearch
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Direct dense vector semantic similarity search with metadata constraints.
   */
  async semanticSearch(
    query: string,
    filter?: KnowledgeSearchFilter,
    options?: KnowledgeSearchOptions
  ): Promise<KnowledgeSearchResult> {
    return this.searchContent(query, filter, {
      ...options,
      mode: 'semantic',
      semanticWeight: 1.0,
      keywordWeight: 0.0,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. getRelevantChunks
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Retrieves the highest-ranked semantic chunks with similarity scores, token
   * counts, and metadata for direct injection or reasoning.
   */
  async getRelevantChunks(
    query: string,
    collectionId?: string,
    documentId?: string,
    topK: number = 5,
    options?: KnowledgeContextOptions
  ): Promise<SemanticChunkMatch[]> {
    const effectiveCollectionId = collectionId || '';
    const scopedSourceIds = options?.sourceIds || (documentId ? [documentId] : undefined);

    try {
      let results: RetrievalResult[] = [];
      if (effectiveCollectionId) {
        results = await this.retrieval.retrieveContext(
          query,
          effectiveCollectionId,
          options?.examContext,
          topK,
          options?.expansionTerms,
          scopedSourceIds
        );
      } else {
        results = await this.retrieval.retrieveCurriculumContext(
          query,
          topK,
          options?.expansionTerms
        );
      }

      return results.map((r, idx) => {
        const meta = r.metadata || {};
        return {
          chunkId: meta.chunkId || meta.id || `chk_${idx}`,
          documentId: meta.documentId || meta.sourceId || documentId || '',
          documentVersionId: meta.documentVersionId || 'v1',
          collectionId: meta.collectionId || meta.notebookId || effectiveCollectionId,
          text: r.text,
          score: r.score,
          weightedScore: r.weightedScore ?? r.score,
          tokenCount: meta.tokenCount || Math.ceil(r.text.length / 4),
          pageNumber: meta.pageNumber ?? meta.page,
          pageEnd: meta.pageEnd ?? meta.pageNumber,
          chapter: meta.chapter,
          section: meta.section,
          sourceTitle: r.source || meta.sourceTitle || meta.title,
          sourceId: meta.sourceId || meta.documentId,
          metadata: meta,
        };
      });
    } catch (err) {
      logger.error(`[KnowledgeService.getRelevantChunks] Retrieval error:`, err);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. getSourceContext
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Synthesizes a complete multimodal grounding bundle:
   *   - Fused chunk passages
   *   - GraphRAG prerequisite concept graph traversal
   *   - Optional real-time web context
   *   - 4-level traceable citations
   */
  async getSourceContext(
    query: string,
    collectionId?: string,
    options?: KnowledgeContextOptions
  ): Promise<KnowledgeContextBundle> {
    const tStart = Date.now();
    const effectiveCollection = collectionId || '';
    const topK = options?.topK || 5;

    // 1. Fetch Passages
    const passages = await this.getRelevantChunks(
      query,
      effectiveCollection,
      undefined,
      topK,
      options
    );

    // 2. Fetch GraphRAG context if requested (default true when collectionId exists)
    let graphContextData: {
      nodesMatched: number;
      traversedNodes: number;
      expansionTerms: string[];
      contextString: string;
    } | undefined;

    if (options?.includeKnowledgeGraph !== false && effectiveCollection) {
      try {
        const graphResult = await this.graphRetrieval.getGraphContext(
          effectiveCollection,
          query
        );
        if (graphResult && graphResult.contextString) {
          graphContextData = {
            nodesMatched: graphResult.meta?.matched || 0,
            traversedNodes: graphResult.meta?.nodeCount || 0,
            expansionTerms: graphResult.meta?.expansionTerms || [],
            contextString: graphResult.contextString,
          };
        }
      } catch (err) {
        logger.warn(`[KnowledgeService.getSourceContext] Graph retrieval failed:`, err);
      }
    }

    // 3. Fetch Web Search context if requested
    let webContextData: { source: string; text: string }[] | undefined;
    if (options?.includeWebSearch) {
      try {
        webContextData = await this.retrieval.retrieveWebContext(query);
      } catch (err) {
        logger.warn(`[KnowledgeService.getSourceContext] Web search failed:`, err);
      }
    }

    // 4. Construct Citations with 4-level Lineage
    const citations: KnowledgeContextCitation[] = [];
    for (let i = 0; i < passages.length; i++) {
      const p = passages[i];
      let lineageRecord: Complete4LevelLineage | undefined;

      if (options?.artifactType && p.chunkId && p.documentId) {
        try {
          lineageRecord = await this.lineage.resolveChunkLineage(
            p.collectionId || effectiveCollection,
            p.documentId,
            p.chunkId,
            p.documentVersionId,
            {
              artifactId: `art_${options.artifactType.toLowerCase()}_${Date.now()}`,
              artifactType: options.artifactType,
              consumerContext: options.consumerContext || 'Shared Knowledge Service',
            }
          );
        } catch {
          // Lineage resolution is best-effort
        }
      }

      citations.push({
        chunkId: p.chunkId,
        source: p.sourceTitle || p.documentId || `Source ${i + 1}`,
        sourceId: p.sourceId || p.documentId,
        score: p.score,
        pageNumber: p.pageNumber,
        snippet: p.text.length > 200 ? `${p.text.slice(0, 197)}...` : p.text,
        lineage: lineageRecord,
      });
    }

    // 5. Build Unified Grounding String
    const contextSections: string[] = [];

    if (passages.length > 0) {
      contextSections.push(
        `=== RELEVANT SOURCE PASSAGES ===\n` +
          passages
            .map((p, idx) => `[Source ${idx + 1}: ${p.sourceTitle || p.documentId}${p.pageNumber ? ` p.${p.pageNumber}` : ''}]\n${p.text}`)
            .join('\n\n')
      );
    }

    if (graphContextData?.contextString) {
      contextSections.push(
        `=== KNOWLEDGE GRAPH PREREQUISITES & RELATIONSHIPS ===\n${graphContextData.contextString}`
      );
    }

    if (webContextData && webContextData.length > 0) {
      contextSections.push(
        `=== LATEST WEB SEARCH RESULTS ===\n` +
          webContextData.map((w) => `[Source: ${w.source}]\n${w.text}`).join('\n\n')
      );
    }

    const contextString = contextSections.join('\n\n');

    return {
      query,
      contextString,
      passages,
      citations,
      graphContext: graphContextData,
      webContext: webContextData,
      retrievalLatencyMs: Date.now() - tStart,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. getSourceCitation
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Resolves complete 4-level citation and lineage:
   * (Artifact -> Chunk -> Document Version -> Original Source).
   */
  async getSourceCitation(
    chunkId: string,
    collectionId: string,
    documentId: string,
    options?: KnowledgeCitationOptions
  ): Promise<Complete4LevelLineage | null> {
    try {
      return await this.lineage.resolveChunkLineage(
        collectionId,
        documentId,
        chunkId,
        undefined,
        {
          artifactId: options?.artifactId || `art_${Date.now()}`,
          artifactType: options?.artifactType || 'RAG_CITATION',
          title: options?.title || 'Knowledge Citation',
          consumerContext: options?.consumerContext || 'Knowledge Service Lookup',
        }
      );
    } catch (err) {
      logger.error(`[KnowledgeService.getSourceCitation] Citation resolution error:`, err);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. getKnowledgeGraph
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Retrieves knowledge graph nodes, edges, and formatted relationship context.
   */
  async getKnowledgeGraph(
    collectionId: string,
    documentId?: string,
    options?: KnowledgeGraphOptions
  ): Promise<KnowledgeGraphResult> {
    try {
      const graphContext = await this.graphRetrieval.getGraphContext(
        collectionId,
        options?.query || ''
      );

      // Also retrieve raw nodes and edges from exploration / repository
      const nodesSnap = await db
        .collection('notebooks')
        .doc(collectionId)
        .collection('kg_nodes')
        .limit(100)
        .get();

      const edgesSnap = await db
        .collection('notebooks')
        .doc(collectionId)
        .collection('kg_edges')
        .limit(150)
        .get();

      let nodes = nodesSnap.docs.map((d) => d.data() as PipelineKGNode);
      let edges = edgesSnap.docs.map((d) => d.data() as PipelineKGEdge);

      if (documentId) {
        nodes = nodes.filter((n) => n.lineage?.documentId === documentId);
        edges = edges.filter(
          (e) =>
            nodes.some((n) => n.nodeId === e.sourceNodeId) ||
            nodes.some((n) => n.nodeId === e.targetNodeId)
        );
      }

      if (options?.minConfidence) {
        const minConf = options.minConfidence;
        nodes = nodes.filter((n) => (n.confidence || 1.0) >= minConf);
        edges = edges.filter((e) => (e.confidence || 1.0) >= minConf);
      }

      return {
        collectionId,
        documentId,
        nodes,
        edges,
        contextString: graphContext.contextString,
        conceptCount: nodes.length,
        relationshipCount: edges.length,
      };
    } catch (err) {
      logger.warn(`[KnowledgeService.getKnowledgeGraph] Graph query error:`, err);
      return {
        collectionId,
        documentId,
        nodes: [],
        edges: [],
        conceptCount: 0,
        relationshipCount: 0,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. getDocumentStructure
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Retrieves document structural AST blocks (headings, definitions, theorems,
   * tables, exercises, summaries) for outlining and hierarchical navigation.
   */
  async getDocumentStructure(
    collectionId: string,
    documentId: string,
    userId?: string
  ): Promise<DocumentStructureBlock[] | null> {
    try {
      const structure = await this.exploration.getDocumentStructure(
        userId || 'default',
        collectionId,
        documentId
      );

      if (structure && structure.structuredBlocks) {
        return structure.structuredBlocks;
      }
    } catch (err) {
      logger.warn(`[KnowledgeService.getDocumentStructure] Structure query error:`, err);
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Internal Fallback Search
  // ─────────────────────────────────────────────────────────────────────────────
  private async fallbackSearch(
    query: string,
    filter?: KnowledgeSearchFilter,
    options?: KnowledgeSearchOptions,
    startTime: number = Date.now()
  ): Promise<KnowledgeSearchResult> {
    const colId = filter?.collectionId || filter?.notebookId || '';
    const topK = options?.topK || 5;

    let passages: RetrievalResult[] = [];
    if (colId) {
      passages = await this.retrieval.retrieveContext(
        query,
        colId,
        undefined,
        topK,
        options?.expansionTerms,
        filter?.sourceIds || (filter?.documentId ? [filter.documentId] : undefined)
      );
    } else {
      passages = await this.retrieval.retrieveCurriculumContext(
        query,
        topK,
        options?.expansionTerms
      );
    }

    const items: KnowledgeSearchResultItem[] = passages.map((p, idx) => ({
      chunkId: p.metadata?.chunkId || `chk_${idx}`,
      documentId: p.metadata?.documentId || p.source || '',
      documentVersionId: p.metadata?.documentVersionId || 'v1',
      collectionId: colId,
      text: p.text,
      score: p.score,
      semanticScore: p.score,
      contentType: p.metadata?.contentType || 'text',
      sequence: idx + 1,
      pageNumber: p.metadata?.pageNumber,
      chapter: p.metadata?.chapter,
      section: p.metadata?.section,
      subject: p.metadata?.subject,
    }));

    return {
      query,
      totalMatches: items.length,
      items,
      tookMs: Date.now() - startTime,
      filterApplied: filter,
    };
  }
}

export const knowledgeService = new KnowledgeService();

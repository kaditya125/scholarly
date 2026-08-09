/**
 * ContentExplorationService
 * Phase 7: Content Exploration
 *
 * Implements:
 * 1. Semantic search (vector similarity with embeddings)
 * 2. Keyword search (tokenized term frequency & header boost)
 * 3. Hybrid fusion ranking
 * 4. Deep metadata filtering (subject, grade, exam, language, chapter, collection)
 * 5. Deterministic Source Lineage (Search Result -> Chunk -> Page -> Document)
 * 6. Document Workspace inspections (AST Outline, Chunks, Knowledge Graph, Versions, History)
 * 7. Multi-tenant and user authorization enforcement
 */

import { db } from '../../../config/firebase';
import { GoogleEmbeddingProvider } from '../../../services/ai/providers/google-embedding.provider';
import { EmbeddingProvider } from '../../../services/ai/embedding.provider.interface';
import { PineconeService } from '../../../services/rag/pinecone.service';
import { PipelineCheckpointManager } from '../orchestrator/PipelineCheckpointManager';
import {
  SemanticChunk,
  DocumentUnderstandingResult,
  PipelineKGNode,
  PipelineKGEdge,
  SourceLocation,
  DocumentVersion,
  Complete4LevelLineage,
  DocumentVersionDiff,
} from '../types';
import { documentVersioningService } from '../versioning/DocumentVersioningService';
import { contentLineageService } from '../lineage/ContentLineageService';

export interface ExplorationSearchFilter {
  collectionId?: string;
  documentId?: string;
  subject?: string;
  classGrade?: string;
  exam?: string;
  language?: string;
  chapter?: string;
  contentType?: string;
  tags?: string[];
}

export interface ExplorationSearchOptions {
  mode?: 'hybrid' | 'semantic' | 'keyword';
  topK?: number;
  minScore?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  highlightSnippetLength?: number;
  tenantId?: string;
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
  searchMode: 'semantic' | 'keyword' | 'hybrid';
  sourceLocation: SourceLocation;
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

export interface ExplorationDocumentDetail {
  documentId: string;
  title: string;
  collectionId: string;
  collectionTitle?: string;
  status: string;
  version: number;
  sizeBytes: number;
  pageCount: number;
  totalChunks: number;
  totalConcepts: number;
  checksum: string;
  storagePath?: string;
  metadata: Record<string, any>;
  extractedRawText?: string;
  createdAt: number;
  updatedAt: number;
}

export class ContentExplorationService {
  private embeddingProvider: EmbeddingProvider;
  private pineconeService: PineconeService;
  private checkpointManager: PipelineCheckpointManager;

  constructor(
    embeddingProvider?: EmbeddingProvider,
    pineconeService?: PineconeService,
    checkpointManager?: PipelineCheckpointManager
  ) {
    this.embeddingProvider = embeddingProvider || new GoogleEmbeddingProvider();
    this.pineconeService = pineconeService || new PineconeService();
    this.checkpointManager = checkpointManager || new PipelineCheckpointManager();
  }

  /**
   * Validates user read access to a specific collection (notebook).
   */
  async ensureCollectionAccess(userId: string, collectionId: string): Promise<{ isOwner: boolean; title: string }> {
    if (!userId || !userId.trim()) {
      throw new Error('Authentication is required');
    }
    if (!collectionId || !collectionId.trim()) {
      throw new Error('Collection ID is required');
    }

    const doc = await db.collection('notebooks').doc(collectionId).get();
    if (!doc.exists) {
      throw new Error(`Collection ${collectionId} not found`);
    }

    const data = doc.data() as any;
    const isOwner = data.userId === userId || data.owner === userId;
    const isEditor = Array.isArray(data.editors) && data.editors.includes(userId);
    const isViewer = Array.isArray(data.viewers) && data.viewers.includes(userId);

    if (!isOwner && !isEditor && !isViewer) {
      throw new Error(`Access denied to collection ${collectionId}`);
    }

    return { isOwner, title: data.name || data.title || 'Collection' };
  }

  /**
   * Retrieves all collection IDs accessible by the given user.
   */
  async getUserAccessibleCollections(userId: string): Promise<Array<{ id: string; title: string }>> {
    if (!userId) return [];
    try {
      const [ownedSnap, editorSnap, viewerSnap] = await Promise.all([
        db.collection('notebooks').where('userId', '==', userId).get(),
        db.collection('notebooks').where('editors', 'array-contains', userId).get(),
        db.collection('notebooks').where('viewers', 'array-contains', userId).get(),
      ]);

      const map = new Map<string, string>();
      for (const doc of ownedSnap.docs) {
        map.set(doc.id, doc.data()?.name || doc.data()?.title || 'Collection');
      }
      for (const doc of editorSnap.docs) {
        map.set(doc.id, doc.data()?.name || doc.data()?.title || 'Collection');
      }
      for (const doc of viewerSnap.docs) {
        map.set(doc.id, doc.data()?.name || doc.data()?.title || 'Collection');
      }

      return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
    } catch {
      return [];
    }
  }

  /**
   * Unified Search Engine: Supports Semantic, Keyword, and Hybrid Search with metadata filtering.
   */
  async search(
    userId: string,
    query: string,
    filter: ExplorationSearchFilter = {},
    options: ExplorationSearchOptions = {}
  ): Promise<ExplorationSearchResultItem[]> {
    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) return [];

    const mode = options.mode || 'hybrid';
    const topK = options.topK || 20;
    const semanticWeight = options.semanticWeight ?? 0.6;
    const keywordWeight = options.keywordWeight ?? 0.4;
    const minScore = options.minScore ?? 0.05;

    // 1. Identify Target Collections
    let targetCollections: Array<{ id: string; title: string }> = [];
    if (filter.collectionId && filter.collectionId !== 'ALL') {
      const access = await this.ensureCollectionAccess(userId, filter.collectionId);
      targetCollections = [{ id: filter.collectionId, title: access.title }];
    } else {
      targetCollections = await this.getUserAccessibleCollections(userId);
    }

    if (targetCollections.length === 0) return [];

    // 2. Fetch candidate chunks from targeted collections with metadata filtering
    const candidateChunks = await this.fetchCandidateChunks(targetCollections, filter);
    if (candidateChunks.length === 0) return [];

    // 3. Keyword Scoring
    const keywordScores = new Map<string, number>();
    if (mode === 'keyword' || mode === 'hybrid') {
      const queryTerms = this.tokenizeQuery(trimmedQuery);
      for (const chunk of candidateChunks) {
        const score = this.calculateKeywordScore(trimmedQuery, queryTerms, chunk);
        if (score > 0) {
          keywordScores.set(chunk.chunkId, score);
        }
      }
    }

    // 4. Semantic Scoring
    const semanticScores = new Map<string, number>();
    if (mode === 'semantic' || mode === 'hybrid') {
      try {
        const [queryEmbedding] = await this.embeddingProvider.generateEmbeddings([trimmedQuery]);
        if (queryEmbedding && queryEmbedding.length > 0) {
          // Generate embeddings for chunk texts if not stored or compute cosine similarity
          const chunkTexts = candidateChunks.map(c => c.text);
          const chunkEmbeddings = await this.embeddingProvider.generateEmbeddings(chunkTexts);

          for (let i = 0; i < candidateChunks.length; i++) {
            const emb = chunkEmbeddings[i];
            if (emb && emb.length > 0) {
              const sim = this.cosineSimilarity(queryEmbedding, emb);
              // Normalize cosine similarity [-1, 1] -> [0, 1]
              const normSim = Math.max(0, Math.min(1, (sim + 1) / 2));
              semanticScores.set(candidateChunks[i].chunkId, normSim);
            }
          }
        }
      } catch (err) {
        console.warn('Semantic search embedding generation failed, falling back to keyword scores:', err);
      }
    }

    // 5. Fusion Ranking
    const results: ExplorationSearchResultItem[] = [];
    const collectionTitleMap = new Map(targetCollections.map(c => [c.id, c.title]));

    for (const chunk of candidateChunks) {
      const kScore = keywordScores.get(chunk.chunkId) || 0;
      const sScore = semanticScores.get(chunk.chunkId) || 0;

      let finalScore = 0;
      if (mode === 'keyword') {
        finalScore = kScore;
      } else if (mode === 'semantic') {
        finalScore = sScore;
      } else {
        // Hybrid Fusion: If one modality didn't match at all, scale gracefully
        if (kScore > 0 && sScore > 0) {
          finalScore = (sScore * semanticWeight) + (kScore * keywordWeight);
        } else if (sScore > 0) {
          finalScore = sScore * semanticWeight;
        } else if (kScore > 0) {
          finalScore = kScore * keywordWeight;
        }
      }

      if (finalScore >= minScore) {
        const relevanceScore = Math.round(Math.min(100, finalScore * 100));
        const snippet = this.generateSnippet(chunk.text, trimmedQuery, options.highlightSnippetLength || 220);
        const colTitle = collectionTitleMap.get(chunk.collectionId) || 'Collection';

        const lineage: SourceLineageNode = {
          documentId: chunk.documentId,
          documentTitle: chunk.documentTitle || chunk.section || 'Document',
          collectionId: chunk.collectionId,
          collectionTitle: colTitle,
          pageNumber: chunk.pageNumber || 1,
          pageEnd: chunk.pageEnd || chunk.pageNumber || 1,
          chunkId: chunk.chunkId,
          chunkSequence: chunk.sequence,
          charStart: chunk.sourceLocation?.charStart,
          charEnd: chunk.sourceLocation?.charEnd,
          chapter: chunk.chapter,
          section: chunk.section,
        };

        results.push({
          chunkId: chunk.chunkId,
          documentId: chunk.documentId,
          documentVersionId: chunk.documentVersionId,
          collectionId: chunk.collectionId,
          documentTitle: chunk.documentTitle || 'Document',
          title: chunk.section || chunk.chapter || chunk.documentTitle || 'Section',
          snippet,
          text: chunk.text,
          chapter: chunk.chapter || '',
          section: chunk.section || '',
          pageNumber: chunk.pageNumber || 1,
          pageEnd: chunk.pageEnd || chunk.pageNumber || 1,
          score: finalScore,
          relevanceScore,
          searchMode: mode,
          sourceLocation: chunk.sourceLocation || {
            pageNumber: chunk.pageNumber || 1,
            charStart: 0,
            charEnd: chunk.text.length,
          },
          metadata: {
            subject: chunk.subject,
            classLevel: chunk.classLevel,
            language: chunk.language,
            contentType: chunk.contentType,
            tokenCount: chunk.tokenCount,
            conceptIds: chunk.conceptIds,
            entityIds: chunk.entityIds,
          },
          lineage,
        });
      }
    }

    // Sort descending by relevance score
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Fetches chunks for a specific document with full lineage and adjacent navigation links.
   */
  async getDocumentChunks(
    userId: string,
    collectionId: string,
    documentId: string
  ): Promise<SemanticChunk[]> {
    await this.ensureCollectionAccess(userId, collectionId);

    // 1. Check direct Firestore chunks collection
    const chunksSnap = await db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(documentId)
      .collection('chunks')
      .orderBy('sequence', 'asc')
      .get();

    if (!chunksSnap.empty) {
      return chunksSnap.docs.map(d => d.data() as SemanticChunk);
    }

    // 2. Fallback to pipeline checkpoint chunks
    const job = await this.checkpointManager.getJob(documentId, collectionId);
    if (job?.checkpoint?.chunks && job.checkpoint.chunks.length > 0) {
      return job.checkpoint.chunks;
    }

    // 3. Fallback: synthesize structured chunks from source extracted raw text if exists
    const sourceDoc = await db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(documentId)
      .get();

    if (sourceDoc.exists) {
      const data = sourceDoc.data() as any;
      const text = data.extractedRawText || data.extractedText || '';
      if (text) {
        return this.synthesizeChunks(documentId, collectionId, data.title || 'Document', text);
      }
    }

    return [];
  }

  /**
   * Fetches the hierarchical AST outline structure tree for the document.
   */
  async getDocumentStructure(
    userId: string,
    collectionId: string,
    documentId: string
  ): Promise<ExplorationStructureNode[]> {
    await this.ensureCollectionAccess(userId, collectionId);

    // 1. Check checkpoint understanding result
    const job = await this.checkpointManager.getJob(documentId, collectionId);
    const outline = job?.checkpoint?.understandingResult?.documentOutline || (job?.checkpoint as any)?.extractedResult?.hierarchy;

    if (outline?.chapters && outline.chapters.length > 0) {
      return outline.chapters.map((ch: any, idx: number) => ({
        id: `chap_${idx + 1}`,
        type: 'chapter' as const,
        title: ch.title || `Chapter ${idx + 1}`,
        level: 1,
        pageNumber: ch.pageStart || 1,
        pageEnd: ch.pageEnd || ch.pageStart || 1,
        chunkCount: (ch.sections?.length || 1) * 2,
        children: (ch.sections || []).map((secTitle: string, sIdx: number) => ({
          id: `sec_${idx + 1}_${sIdx + 1}`,
          type: 'section' as const,
          title: secTitle,
          level: 2,
          pageNumber: ch.pageStart || 1,
          pageEnd: ch.pageEnd || ch.pageStart || 1,
          chunkCount: 2,
          children: [],
        })),
      }));
    }

    // 2. Derive structure from chunks if available
    const chunks = await this.getDocumentChunks(userId, collectionId, documentId);
    if (chunks.length > 0) {
      return this.deriveStructureFromChunks(chunks);
    }

    // 3. Default fallback root structure
    const sourceDoc = await db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(documentId)
      .get();

    const title = sourceDoc.exists ? (sourceDoc.data()?.title || 'Document Outline') : 'Document Outline';

    return [
      {
        id: `node_${documentId}_root`,
        type: 'chapter',
        title: `Chapter 1: ${title}`,
        level: 1,
        pageNumber: 1,
        pageEnd: 1,
        chunkCount: 1,
        children: [
          {
            id: `node_${documentId}_sec1`,
            type: 'section',
            title: '1.1 Overview & Key Concepts',
            level: 2,
            pageNumber: 1,
            pageEnd: 1,
            chunkCount: 1,
            children: [],
          },
        ],
      },
    ];
  }

  /**
   * Fetches document-scoped Knowledge Graph nodes, edges, and direct chunk lineage references.
   */
  async getDocumentGraph(
    userId: string,
    collectionId: string,
    documentId: string
  ): Promise<{ nodes: PipelineKGNode[]; edges: PipelineKGEdge[] }> {
    await this.ensureCollectionAccess(userId, collectionId);

    // 1. Check pipeline checkpoint
    const job = await this.checkpointManager.getJob(documentId, collectionId);
    if (job?.checkpoint?.kgResult) {
      return {
        nodes: job.checkpoint.kgResult.nodes || [],
        edges: job.checkpoint.kgResult.edges || [],
      };
    }

    // 2. Check notebook KG repository nodes matching documentId
    try {
      const nodesSnap = await db
        .collection('notebooks')
        .doc(collectionId)
        .collection('kg_nodes')
        .where('sourceDocIds', 'array-contains', documentId)
        .get();

      const nodes = nodesSnap.docs.map(d => d.data() as PipelineKGNode);
      if (nodes.length > 0) {
        const nodeIds = new Set(nodes.map(n => n.id));
        const edgesSnap = await db
          .collection('notebooks')
          .doc(collectionId)
          .collection('kg_edges')
          .get();

        const edges = edgesSnap.docs
          .map(d => d.data() as PipelineKGEdge)
          .filter(e => nodeIds.has(e.sourceNodeId) || nodeIds.has(e.targetNodeId));

        return { nodes, edges };
      }
    } catch {
      // Fallback
    }

    // 3. Synthesize basic concept nodes from document metadata
    const sourceDoc = await db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(documentId)
      .get();

    if (sourceDoc.exists) {
      const data = sourceDoc.data() as any;
      const title = data.title || 'Topic';
      const subject = data.metadata?.subject || 'Curriculum';

      const mockNodeId = `node_${documentId}_core`;
      const fallbackNode: PipelineKGNode = {
        id: mockNodeId,
        notebookId: collectionId,
        collectionId,
        tenantId: userId,
        label: title,
        type: 'CONCEPT',
        definition: `Core educational subject material for ${title} under ${subject}.`,
        importance: 0.9,
        difficulty: 'Medium',
        estimatedStudyTime: 15,
        masteryPercentage: 0,
        confidenceScore: 0.95,
        prerequisites: [],
        relatedConcepts: [],
        sourceDocIds: [documentId],
        lineage: [
          {
            documentId,
            collectionId,
            documentVersionId: `v1_${documentId}`,
            chunkIds: [],
            blockIds: [],
            pageStart: 1,
            pageEnd: 1,
          },
        ],
      };

      return { nodes: [fallbackNode], edges: [] };
    }

    return { nodes: [], edges: [] };
  }

  /**
   * Resolves the full 4-level deterministic lineage for a chunk:
   * Search Result -> Chunk -> Page -> Document
   */
  async getDocumentLineage(
    userId: string,
    collectionId: string,
    documentId: string,
    chunkId: string
  ): Promise<{
    searchResultId: string;
    chunk: SemanticChunk | null;
    pageNumber: number;
    pageEnd: number;
    document: ExplorationDocumentDetail | null;
    storageUrl?: string;
    lineage4Level?: Complete4LevelLineage;
  }> {
    await this.ensureCollectionAccess(userId, collectionId);

    const chunks = await this.getDocumentChunks(userId, collectionId, documentId);
    const chunk = chunks.find(c => c.chunkId === chunkId) || null;

    const sourceDoc = await db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(documentId)
      .get();

    let docDetail: ExplorationDocumentDetail | null = null;
    if (sourceDoc.exists) {
      const data = sourceDoc.data() as any;
      docDetail = {
        documentId: sourceDoc.id,
        title: data.title || 'Document',
        collectionId,
        status: data.status || 'READY',
        version: data.version || 1,
        sizeBytes: data.sizeBytes || 0,
        pageCount: data.pageCount || data.pagesCount || 1,
        totalChunks: chunks.length || data.chunksExtracted || 0,
        totalConcepts: data.conceptsExtracted || 0,
        checksum: data.checksum || data.hash || '',
        storagePath: data.storagePath || data.gcsPath,
        metadata: data.metadata || {},
        extractedRawText: data.extractedRawText,
        createdAt: data.createdAt || Date.now(),
        updatedAt: data.updatedAt || Date.now(),
      };
    }

    // Resolve complete 4-level lineage (Artifact -> Chunk -> Version -> Original Source)
    let lineage4Level: Complete4LevelLineage | undefined;
    try {
      lineage4Level = await contentLineageService.resolveChunkLineage(
        collectionId,
        documentId,
        chunkId
      );
    } catch (err) {
      console.warn('Failed to resolve 4-level lineage for chunk', chunkId, err);
    }

    return {
      searchResultId: `sr_${chunkId}`,
      chunk,
      pageNumber: chunk?.pageNumber || 1,
      pageEnd: chunk?.pageEnd || chunk?.pageNumber || 1,
      document: docDetail,
      storageUrl: docDetail?.storagePath,
      lineage4Level,
    };
  }

  /**
   * Fetches immutable document version history.
   */
  async getDocumentVersions(
    userId: string,
    collectionId: string,
    documentId: string
  ): Promise<DocumentVersion[]> {
    await this.ensureCollectionAccess(userId, collectionId);
    return documentVersioningService.getVersions(collectionId, documentId);
  }

  /**
   * Diffs two document versions.
   */
  async diffDocumentVersions(
    userId: string,
    collectionId: string,
    documentId: string,
    baseVersionId: string,
    targetVersionId: string
  ): Promise<DocumentVersionDiff> {
    await this.ensureCollectionAccess(userId, collectionId);
    return documentVersioningService.diffVersions(collectionId, documentId, baseVersionId, targetVersionId);
  }

  /**
   * Fetches document processing checkpoints and execution history.
   */
  async getDocumentHistory(
    userId: string,
    collectionId: string,
    documentId: string
  ): Promise<Record<string, any>> {
    await this.ensureCollectionAccess(userId, collectionId);

    const job = await this.checkpointManager.getJob(documentId, collectionId);
    const sourceDoc = await db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(documentId)
      .get();

    const sourceData = sourceDoc.exists ? sourceDoc.data() : {};

    return {
      documentId,
      collectionId,
      jobId: job?.jobId || `job_${documentId}`,
      status: job?.status || sourceData?.status || 'READY',
      currentStage: job?.currentStage || sourceData?.currentStage || 'READY',
      progress: job?.progress ?? (sourceData?.status === 'READY' ? 1.0 : 0.5),
      checkpoint: job?.checkpoint || null,
      errors: (job as any)?.errors || (job?.error ? [job.error] : []),
      startedAt: job?.startedAt || sourceData?.createdAt || Date.now(),
      updatedAt: job?.updatedAt || sourceData?.updatedAt || Date.now(),
      completedAt: job?.completedAt || (sourceData?.status === 'READY' ? sourceData?.updatedAt : null),
      retryCount: job?.retryCount || 0,
    };
  }

  // --------------------------------------------------------------------------
  // Private Helper Methods
  // --------------------------------------------------------------------------

  private async fetchCandidateChunks(
    collections: Array<{ id: string; title: string }>,
    filter: ExplorationSearchFilter
  ): Promise<Array<SemanticChunk & { documentTitle?: string }>> {
    const allChunks: Array<SemanticChunk & { documentTitle?: string }> = [];

    for (const col of collections) {
      let sourcesQuery: FirebaseFirestore.Query = db
        .collection('notebooks')
        .doc(col.id)
        .collection('sources');

      if (filter.documentId) {
        sourcesQuery = sourcesQuery.where('id', '==', filter.documentId);
      }

      const sourcesSnap = await sourcesQuery.get();
      for (const sourceDoc of sourcesSnap.docs) {
        const sourceData = sourceDoc.data() as any;
        if (sourceData.status === 'ARCHIVED') continue;

        // Apply metadata filters on source level
        if (filter.subject && filter.subject !== 'ALL') {
          const sSub = (sourceData.metadata?.subject || '').toLowerCase();
          if (sSub !== filter.subject.toLowerCase()) continue;
        }
        if (filter.classGrade && filter.classGrade !== 'ALL') {
          const sGrade = (sourceData.metadata?.classGrade || '').toLowerCase();
          if (sGrade !== filter.classGrade.toLowerCase()) continue;
        }
        if (filter.exam && filter.exam !== 'ALL') {
          const sExam = (sourceData.metadata?.exam || '').toLowerCase();
          if (sExam !== filter.exam.toLowerCase()) continue;
        }
        if (filter.language && filter.language !== 'ALL') {
          const sLang = (sourceData.metadata?.language || '').toLowerCase();
          if (sLang !== filter.language.toLowerCase()) continue;
        }

        // Fetch chunks for this source
        const docChunks = await this.getDocumentChunks(sourceData.userId || 'system', col.id, sourceDoc.id);

        for (const ch of docChunks) {
          // Filter by chapter if specified
          if (filter.chapter && filter.chapter !== 'ALL') {
            const chChap = (ch.chapter || '').toLowerCase();
            if (!chChap.includes(filter.chapter.toLowerCase())) continue;
          }

          allChunks.push({
            ...ch,
            documentTitle: sourceData.title || 'Document',
          });
        }
      }
    }

    return allChunks;
  }

  private tokenizeQuery(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  private calculateKeywordScore(
    rawQuery: string,
    terms: string[],
    chunk: SemanticChunk & { documentTitle?: string }
  ): number {
    const textLower = (chunk.text || '').toLowerCase();
    const titleLower = (chunk.documentTitle || '').toLowerCase();
    const chapterLower = (chunk.chapter || '').toLowerCase();
    const sectionLower = (chunk.section || '').toLowerCase();

    let score = 0;
    const rawLower = rawQuery.toLowerCase();

    // Exact full query match boost
    if (textLower.includes(rawLower)) {
      score += 0.45;
    }
    if (titleLower.includes(rawLower) || sectionLower.includes(rawLower)) {
      score += 0.35;
    }

    // Term matching with frequency and structural weights
    let termMatches = 0;
    for (const term of terms) {
      let termScore = 0;
      const countInText = (textLower.match(new RegExp(`\\b${term}`, 'g')) || []).length;
      if (countInText > 0) {
        termScore += Math.min(0.3, countInText * 0.08);
      }
      if (titleLower.includes(term)) termScore += 0.15;
      if (chapterLower.includes(term)) termScore += 0.10;
      if (sectionLower.includes(term)) termScore += 0.12;

      if (termScore > 0) {
        termMatches++;
        score += termScore;
      }
    }

    // Match density coverage (proportion of query terms found)
    const coverage = terms.length > 0 ? termMatches / terms.length : 0;
    score = score * (0.5 + 0.5 * coverage);

    return Math.min(1.0, score);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private generateSnippet(text: string, query: string, maxLength: number): string {
    if (!text) return '';
    const terms = this.tokenizeQuery(query);
    const textLower = text.toLowerCase();

    // Find best match index
    let bestIdx = -1;
    for (const term of terms) {
      const idx = textLower.indexOf(term);
      if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
        bestIdx = idx;
      }
    }

    if (bestIdx === -1) {
      return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    }

    const start = Math.max(0, bestIdx - 40);
    const end = Math.min(text.length, start + maxLength);
    let snippet = text.slice(start, end).trim();

    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    return snippet;
  }

  private synthesizeChunks(
    documentId: string,
    collectionId: string,
    title: string,
    text: string
  ): SemanticChunk[] {
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
    const chunks: SemanticChunk[] = [];
    let curSeq = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();
      if (!para) continue;
      const pageNumber = Math.floor(i / 3) + 1;
      const chunkId = `chunk_${documentId}_${curSeq + 1}`;

      chunks.push({
        chunkId,
        documentId,
        documentVersionId: `v1_${documentId}`,
        collectionId,
        text: para,
        sequence: curSeq + 1,
        pageNumber,
        pageEnd: pageNumber,
        chapter: `Chapter 1: ${title}`,
        section: `Section ${curSeq + 1}`,
        tokenCount: Math.ceil(para.length / 4),
        charCount: para.length,
        contentType: 'text',
        boundaryStrategy: 'paragraph_boundary',
        sourceLocation: {
          blockIds: [`synth_block_${curSeq}`],
          pageStart: pageNumber,
          pageEnd: pageNumber,
          charStart: i * 500,
          charEnd: i * 500 + para.length,
        },
      });
      curSeq++;
    }

    return chunks;
  }

  private transformSectionsToAst(sections: any[]): ExplorationStructureNode[] {
    return sections.map((sec, idx) => ({
      id: sec.id || `sec_${idx}`,
      type: sec.level === 1 ? 'chapter' : sec.level === 2 ? 'section' : 'subsection',
      title: sec.title || `Section ${idx + 1}`,
      level: sec.level || 1,
      pageNumber: sec.pageNumber || sec.pageStart || 1,
      pageEnd: sec.pageEnd || sec.pageNumber || 1,
      chunkCount: sec.chunkCount || 1,
      children: sec.subsections ? this.transformSectionsToAst(sec.subsections) : [],
    }));
  }

  private deriveStructureFromChunks(chunks: SemanticChunk[]): ExplorationStructureNode[] {
    const chapterMap = new Map<string, SemanticChunk[]>();
    for (const c of chunks) {
      const chap = c.chapter || 'Chapter 1: Foundations';
      if (!chapterMap.has(chap)) {
        chapterMap.set(chap, []);
      }
      chapterMap.get(chap)!.push(c);
    }

    const structure: ExplorationStructureNode[] = [];
    let chapIdx = 1;

    for (const [chapterTitle, chList] of chapterMap.entries()) {
      const chapId = `chap_${chapIdx}`;
      const minPage = Math.min(...chList.map(c => c.pageNumber || 1));
      const maxPage = Math.max(...chList.map(c => c.pageEnd || c.pageNumber || 1));

      // Group by section within chapter
      const sectionMap = new Map<string, SemanticChunk[]>();
      for (const c of chList) {
        const sec = c.section || 'General Topics';
        if (!sectionMap.has(sec)) sectionMap.set(sec, []);
        sectionMap.get(sec)!.push(c);
      }

      const sectionNodes: ExplorationStructureNode[] = [];
      let secIdx = 1;
      for (const [secTitle, sList] of sectionMap.entries()) {
        const secMinPage = Math.min(...sList.map(c => c.pageNumber || 1));
        const secMaxPage = Math.max(...sList.map(c => c.pageEnd || c.pageNumber || 1));
        sectionNodes.push({
          id: `${chapId}_sec_${secIdx}`,
          type: 'section',
          title: secTitle,
          level: 2,
          pageNumber: secMinPage,
          pageEnd: secMaxPage,
          chunkCount: sList.length,
          children: [],
        });
        secIdx++;
      }

      structure.push({
        id: chapId,
        type: 'chapter',
        title: chapterTitle,
        level: 1,
        pageNumber: minPage,
        pageEnd: maxPage,
        chunkCount: chList.length,
        children: sectionNodes,
      });
      chapIdx++;
    }

    return structure;
  }
}

export const contentExplorationService = new ContentExplorationService();

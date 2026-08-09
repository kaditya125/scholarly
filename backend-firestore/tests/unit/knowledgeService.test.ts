/**
 * Phase 10: Shared Knowledge Service Unit Tests
 *
 * Verifies:
 * 1. getDocument() retrieval & caching
 * 2. getCollection() container metadata
 * 3. searchContent() hybrid search with weights and filters
 * 4. semanticSearch() dense vector search
 * 5. getRelevantChunks() chunk ranking & metadata preservation
 * 6. getSourceContext() multi-modal GraphRAG context fusion & citations
 * 7. getSourceCitation() 4-level lineage resolution
 * 8. getKnowledgeGraph() graph traversal & prerequisites
 * 9. getDocumentStructure() AST block inspection
 * 10. Consumer decoupling invariant (consumers use KnowledgeService abstraction)
 */

import { KnowledgeService, knowledgeService } from '../../src/core/knowledge';
import {
  KnowledgeSearchFilter,
  KnowledgeContextOptions,
  KnowledgeGraphOptions,
} from '../../src/core/knowledge/types';
import { Complete4LevelLineage, DocumentStructureBlock } from '../../src/core/pipeline/types';

// Mock dependencies
jest.mock('../../src/config/firebase', () => {
  const mockDocGet = jest.fn();
  const mockDoc = jest.fn(() => ({
    get: mockDocGet,
    set: jest.fn().mockResolvedValue({}),
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: mockDocGet,
        set: jest.fn().mockResolvedValue({}),
      })),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    })),
  }));

  const mockCollection = jest.fn(() => ({
    doc: mockDoc,
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: [] }),
  }));

  return {
    db: {
      collection: mockCollection,
    },
  };
});

describe('Phase 10: Shared Knowledge Service', () => {
  let mockRetrievalService: any;
  let mockGraphRetrievalService: any;
  let mockExplorationService: any;
  let mockLineageService: any;
  let mockVersioningService: any;
  let service: KnowledgeService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRetrievalService = {
      retrieveContext: jest.fn().mockResolvedValue([
        {
          text: 'The Carnot cycle is an idealized thermodynamic cycle operating between two temperatures.',
          source: 'Thermodynamics Vol 1',
          score: 0.94,
          metadata: {
            chunkId: 'chk_thermo_101',
            documentId: 'doc_thermo_01',
            documentVersionId: 'v1',
            collectionId: 'coll_physics',
            pageNumber: 42,
            chapter: 'Heat & Work',
            section: 'Carnot Engine',
            sourceTitle: 'Thermodynamics Vol 1',
            tokenCount: 45,
          },
        },
        {
          text: 'Entropy is a state function that quantifies the degree of irreversibility.',
          source: 'Thermodynamics Vol 1',
          score: 0.88,
          metadata: {
            chunkId: 'chk_thermo_102',
            documentId: 'doc_thermo_01',
            documentVersionId: 'v1',
            collectionId: 'coll_physics',
            pageNumber: 45,
            chapter: 'Second Law',
            tokenCount: 38,
          },
        },
      ]),
      retrieveCurriculumContext: jest.fn().mockResolvedValue([
        {
          text: 'NCERT Class 11 Physics Chapter 12: Heat engines and refrigerants.',
          source: 'NCERT Physics Class 11',
          score: 0.85,
          metadata: {
            chunkId: 'chk_curriculum_12',
            documentId: 'doc_ncert_11_12',
            notebookId: 'ncert-physics-11',
            pageNumber: 310,
          },
        },
      ]),
      retrieveWebContext: jest.fn().mockResolvedValue([
        {
          source: 'https://physics.nist.gov/constants',
          text: 'Boltzmann constant k = 1.380649e-23 J/K.',
        },
      ]),
    };

    mockGraphRetrievalService = {
      getGraphContext: jest.fn().mockResolvedValue({
        contextString:
          'Concept: Carnot Engine (Type: CONCEPT)\n  - PREREQUISITE_OF -> Second Law of Thermodynamics\n  - RELIES_ON -> Ideal Gas Law',
        meta: {
          matched: 1,
          nodeCount: 3,
          edgeCount: 2,
          traversalMs: 14,
          expansionTerms: ['Ideal Gas Law', 'Second Law of Thermodynamics'],
        },
      }),
    };

    mockExplorationService = {
      search: jest.fn().mockResolvedValue({
        query: 'Carnot cycle efficiency',
        totalMatches: 1,
        results: [
          {
            chunkId: 'chk_thermo_101',
            documentId: 'doc_thermo_01',
            documentVersionId: 'v1',
            collectionId: 'coll_physics',
            text: 'The Carnot cycle is an idealized thermodynamic cycle...',
            score: 0.92,
            semanticScore: 0.95,
            keywordScore: 0.85,
            contentType: 'DEFINITION',
            sequence: 1,
            pageNumber: 42,
            chapter: 'Heat & Work',
            section: 'Carnot Engine',
            highlightSnippet: 'The <mark>Carnot cycle</mark> is an idealized thermodynamic cycle...',
          },
        ],
      }),
      getCachedDocument: jest.fn().mockReturnValue({
        id: 'doc_thermo_01',
        title: 'Thermodynamics Fundamentals',
        mimeType: 'application/pdf',
        status: 'READY',
      }),
      getDocumentStructure: jest.fn().mockResolvedValue({
        documentId: 'doc_thermo_01',
        structuredBlocks: [
          {
            blockId: 'block_01',
            structureType: 'heading',
            content: 'Chapter 12: Thermodynamics',
            pageNumber: 1,
            sequence: 1,
            confidence: 1.0,
          },
          {
            blockId: 'block_02',
            structureType: 'definition',
            content: 'Carnot engine is a theoretical thermodynamic cycle.',
            pageNumber: 42,
            sequence: 2,
            confidence: 0.95,
          },
          {
            blockId: 'block_03',
            structureType: 'theorem',
            content: 'Carnot Theorem: No engine operating between two heat reservoirs is more efficient than a Carnot engine.',
            pageNumber: 43,
            sequence: 3,
            confidence: 0.98,
          },
        ] as DocumentStructureBlock[],
      }),
    };

    const mock4LevelLineage: Complete4LevelLineage = {
      artifact: {
        artifactId: 'art_rag_123',
        artifactType: 'RAG_CITATION',
        title: 'Knowledge Citation',
        consumerContext: 'Shared Knowledge Service',
        generatedAt: Date.now(),
      },
      chunk: {
        chunkId: 'chk_thermo_101',
        sequence: 1,
        snippet: 'The Carnot cycle is an idealized...',
        tokenCount: 45,
        charCount: 150,
        pageNumber: 42,
        pageEnd: 42,
        chapter: 'Heat & Work',
      },
      documentVersion: {
        documentVersionId: 'v1',
        versionNumber: 1,
        embeddingModel: 'text-embedding-004',
        embeddingVersion: 1,
        processingVersion: 1,
        extractedAt: Date.now(),
        checksum: 'abc123hash',
      },
      originalSource: {
        sourceId: 'doc_thermo_01',
        title: 'Thermodynamics Vol 1',
        originalName: 'thermo.pdf',
        collectionId: 'coll_physics',
        contentType: 'application/pdf',
        storagePath: 'gs://scholarly-sources/coll_physics/doc_thermo_01.pdf',
        sizeBytes: 1024000,
        uploadedAt: Date.now(),
        checksum: 'srchash123',
      },
    };

    mockLineageService = {
      resolveChunkLineage: jest.fn().mockResolvedValue(mock4LevelLineage),
    };

    mockVersioningService = {
      getVersions: jest.fn().mockResolvedValue([
        {
          documentVersionId: 'v1',
          versionNumber: 1,
          isActiveVersion: true,
        },
      ]),
    };

    service = new KnowledgeService(
      mockRetrievalService,
      mockGraphRetrievalService,
      mockExplorationService,
      mockLineageService,
      mockVersioningService
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. getDocument
  // ─────────────────────────────────────────────────────────────────────────
  describe('1. getDocument()', () => {
    it('returns document metadata from cached exploration if Firestore doc is unavailable', async () => {
      const doc = await service.getDocument('coll_physics', 'doc_thermo_01');
      expect(doc).toBeDefined();
      expect(doc?.id).toBe('doc_thermo_01');
      expect(doc?.title).toBe('Thermodynamics Fundamentals');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. getCollection
  // ─────────────────────────────────────────────────────────────────────────
  describe('2. getCollection()', () => {
    it('returns null safely when collection document does not exist', async () => {
      const col = await service.getCollection('non_existent_collection');
      expect(col).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. searchContent (Hybrid Search)
  // ─────────────────────────────────────────────────────────────────────────
  describe('3. searchContent()', () => {
    it('executes hybrid search combining dense vectors and keyword matching', async () => {
      const filter: KnowledgeSearchFilter = {
        collectionId: 'coll_physics',
        subject: 'Physics',
        chapter: 'Heat & Work',
      };

      const result = await service.searchContent('Carnot cycle efficiency', filter, {
        mode: 'hybrid',
        topK: 5,
        semanticWeight: 0.7,
        keywordWeight: 0.3,
      });

      expect(mockExplorationService.search).toHaveBeenCalledWith(
        'coll_physics',
        'Carnot cycle efficiency',
        expect.objectContaining({
          collectionId: 'coll_physics',
          subject: 'Physics',
          chapter: 'Heat & Work',
        }),
        expect.objectContaining({
          mode: 'hybrid',
          topK: 5,
          semanticWeight: 0.7,
          keywordWeight: 0.3,
        })
      );

      expect(result.totalMatches).toBe(1);
      expect(result.items[0].chunkId).toBe('chk_thermo_101');
      expect(result.items[0].highlightSnippet).toContain('<mark>Carnot cycle</mark>');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. semanticSearch
  // ─────────────────────────────────────────────────────────────────────────
  describe('4. semanticSearch()', () => {
    it('forces semantic mode with 100% semantic weighting', async () => {
      await service.semanticSearch('thermodynamic entropy', { collectionId: 'coll_physics' });

      expect(mockExplorationService.search).toHaveBeenCalledWith(
        'coll_physics',
        'thermodynamic entropy',
        expect.any(Object),
        expect.objectContaining({
          mode: 'semantic',
          semanticWeight: 1.0,
          keywordWeight: 0.0,
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. getRelevantChunks
  // ─────────────────────────────────────────────────────────────────────────
  describe('5. getRelevantChunks()', () => {
    it('retrieves and normalizes ranked semantic chunks with metadata', async () => {
      const chunks = await service.getRelevantChunks(
        'Carnot efficiency formula',
        'coll_physics',
        'doc_thermo_01',
        5
      );

      expect(mockRetrievalService.retrieveContext).toHaveBeenCalledWith(
        'Carnot efficiency formula',
        'coll_physics',
        undefined,
        5,
        undefined,
        ['doc_thermo_01']
      );

      expect(chunks.length).toBe(2);
      expect(chunks[0].chunkId).toBe('chk_thermo_101');
      expect(chunks[0].pageNumber).toBe(42);
      expect(chunks[0].chapter).toBe('Heat & Work');
      expect(chunks[0].tokenCount).toBe(45);
      expect(chunks[1].chunkId).toBe('chk_thermo_102');
    });

    it('falls back to curriculum context when collectionId is omitted', async () => {
      const chunks = await service.getRelevantChunks('Heat engine principles', undefined, undefined, 3);
      expect(mockRetrievalService.retrieveCurriculumContext).toHaveBeenCalledWith(
        'Heat engine principles',
        3,
        undefined
      );
      expect(chunks.length).toBe(1);
      expect(chunks[0].chunkId).toBe('chk_curriculum_12');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. getSourceContext (Multimodal GraphRAG Grounding)
  // ─────────────────────────────────────────────────────────────────────────
  describe('6. getSourceContext()', () => {
    it('synthesizes unified grounding context with passages, graph context, and 4-level citations', async () => {
      const bundle = await service.getSourceContext('Explain Carnot engine', 'coll_physics', {
        topK: 2,
        includeKnowledgeGraph: true,
        includeWebSearch: true,
        artifactType: 'MAGIC_CHAT',
        consumerContext: 'Magic Chat Grounding',
      });

      expect(bundle.passages.length).toBe(2);
      expect(bundle.contextString).toContain('=== RELEVANT SOURCE PASSAGES ===');
      expect(bundle.contextString).toContain('=== KNOWLEDGE GRAPH PREREQUISITES & RELATIONSHIPS ===');
      expect(bundle.contextString).toContain('=== LATEST WEB SEARCH RESULTS ===');

      expect(bundle.graphContext?.traversedNodes).toBe(3);
      expect(bundle.graphContext?.expansionTerms).toEqual([
        'Ideal Gas Law',
        'Second Law of Thermodynamics',
      ]);

      expect(bundle.webContext?.[0].source).toContain('physics.nist.gov');

      // Check 4-level citations resolution
      expect(bundle.citations.length).toBe(2);
      expect(bundle.citations[0].chunkId).toBe('chk_thermo_101');
      expect(bundle.citations[0].lineage).toBeDefined();
      expect(bundle.citations[0].lineage?.originalSource.title).toBe('Thermodynamics Vol 1');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. getSourceCitation (4-Level Lineage Resolution)
  // ─────────────────────────────────────────────────────────────────────────
  describe('7. getSourceCitation()', () => {
    it('resolves complete 4-level lineage for arbitrary chunk references', async () => {
      const lineage = await service.getSourceCitation(
        'chk_thermo_101',
        'coll_physics',
        'doc_thermo_01',
        {
          artifactId: 'art_podcast_001',
          artifactType: 'PODCAST',
          title: 'Thermodynamics Podcast Segment',
        }
      );

      expect(mockLineageService.resolveChunkLineage).toHaveBeenCalledWith(
        'coll_physics',
        'doc_thermo_01',
        'chk_thermo_101',
        undefined,
        expect.objectContaining({
          artifactId: 'art_podcast_001',
          artifactType: 'PODCAST',
        })
      );

      expect(lineage).toBeDefined();
      expect(lineage?.artifact.artifactType).toBe('RAG_CITATION');
      expect(lineage?.chunk.chunkId).toBe('chk_thermo_101');
      expect(lineage?.documentVersion.versionNumber).toBe(1);
      expect(lineage?.originalSource.sourceId).toBe('doc_thermo_01');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8. getKnowledgeGraph
  // ─────────────────────────────────────────────────────────────────────────
  describe('8. getKnowledgeGraph()', () => {
    it('retrieves relationship context for a collection', async () => {
      const graph = await service.getKnowledgeGraph('coll_physics', undefined, {
        query: 'Carnot cycle',
      });

      expect(mockGraphRetrievalService.getGraphContext).toHaveBeenCalledWith(
        'coll_physics',
        'Carnot cycle'
      );
      expect(graph.contextString).toContain('Concept: Carnot Engine');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 9. getDocumentStructure (AST Outlining)
  // ─────────────────────────────────────────────────────────────────────────
  describe('9. getDocumentStructure()', () => {
    it('retrieves structured AST blocks for document understanding and outlining', async () => {
      const blocks = await service.getDocumentStructure('coll_physics', 'doc_thermo_01');

      expect(mockExplorationService.getDocumentStructure).toHaveBeenCalledWith(
        'default',
        'coll_physics',
        'doc_thermo_01'
      );

      expect(blocks).toBeDefined();
      expect(blocks?.length).toBe(3);
      expect(blocks?.[0].structureType).toBe('heading');
      expect(blocks?.[1].structureType).toBe('definition');
      expect(blocks?.[2].structureType).toBe('theorem');
      expect(blocks?.[2].content).toContain('Carnot Theorem');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 10. Singleton Export Invariant
  // ─────────────────────────────────────────────────────────────────────────
  describe('10. Singleton Instance', () => {
    it('exports a global singleton knowledgeService instance', () => {
      expect(knowledgeService).toBeInstanceOf(KnowledgeService);
    });
  });
});

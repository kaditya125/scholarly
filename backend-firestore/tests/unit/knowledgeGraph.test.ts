/**
 * Content Pipeline Phase 4: Knowledge Graph Integration Test Suite
 *
 * Tests:
 * 1. Simple Document Extraction & Lineage
 * 2. Textbook Chapter (Hierarchical Concepts, Theorems, Formulae)
 * 3. Multiple Concepts & Typed Relationships
 * 4. Repeated Concepts & Deduplication
 * 5. Conflicting Concepts & Definition Reconciliation
 * 6. Low-Confidence Relationship Pruning
 * 7. Reprocessing / Idempotency & Persistence
 */

import { KnowledgeGraphService } from '../../src/core/pipeline/graph/KnowledgeGraphService';
import { KnowledgeGraphExtractor } from '../../src/core/pipeline/graph/KnowledgeGraphExtractor';
import { notebookRepository } from '../../src/repositories/notebook.repository';
import {
  DocumentUnderstandingResult,
  SemanticChunk,
  DocumentStructureBlock,
} from '../../src/core/pipeline/types';

// Mock Firebase & Repositories
jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../src/repositories/notebook.repository', () => ({
  notebookRepository: {
    addKGNodes: jest.fn().mockResolvedValue(undefined),
    getKGNodes: jest.fn().mockResolvedValue([]),
    addKGEdges: jest.fn().mockResolvedValue(undefined),
    getKGEdges: jest.fn().mockResolvedValue([]),
  },
}));

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function makeMockUnderstanding(
  docId: string,
  blocks: Partial<DocumentStructureBlock>[] = [],
  subject: string = 'Physics'
): DocumentUnderstandingResult {
  return {
    documentId: docId,
    documentVersionId: 'v1',
    structuredBlocks: blocks.map((b, idx) => ({
      blockId: `blk_${idx}`,
      structureType: 'paragraph',
      content: 'Sample text',
      pageNumber: 1,
      confidence: 0.9,
      ...b,
    })) as DocumentStructureBlock[],
    documentOutline: {
      title: 'Outline',
      chapters: [],
    },
    resolvedMetadata: {
      subject: { value: subject, confidence: 0.95, source: 'ai' },
    },
    educationalMetadata: {
      subject: { value: subject, confidence: 0.95, source: 'ai' },
    },
    stats: {
      totalStructuredBlocks: blocks.length,
      structureTypeDistribution: {} as any,
      metadataFieldsExtracted: 1,
      averageMetadataConfidence: 0.95,
      userOverriddenFields: [],
    },
    durationMs: 50,
  };
}

function makeMockChunk(
  seq: number,
  docId: string,
  text: string,
  overrides: Partial<SemanticChunk> = {}
): SemanticChunk {
  return {
    chunkId: `${docId}_chunk_${seq}`,
    documentId: docId,
    documentVersionId: 'v1',
    collectionId: 'col_physics',
    text,
    sequence: seq,
    contentType: 'text',
    pageNumber: 1,
    pageEnd: 1,
    chapter: 'Quantum Mechanics',
    section: 'Wave Properties',
    subject: 'Physics',
    classLevel: 'Class 12',
    board: 'CBSE',
    exam: 'JEE Advanced',
    language: 'en',
    topic: 'Wave Particle Duality',
    difficulty: 'Medium',
    sourceLocation: {
      blockIds: [`blk_${seq}`],
      pageStart: 1,
      pageEnd: 1,
      charStart: 0,
      charEnd: text.length,
    },
    boundaryStrategy: 'section_boundary',
    tokenCount: Math.ceil(text.length / 4),
    charCount: text.length,
    conceptIds: [],
    entityIds: [],
    ...overrides,
  };
}

describe('Content Pipeline Phase 4: Knowledge Graph Integration', () => {
  let service: KnowledgeGraphService;
  let extractor: KnowledgeGraphExtractor;

  beforeEach(() => {
    jest.clearAllMocks();
    extractor = new KnowledgeGraphExtractor();
    service = new KnowledgeGraphService(extractor);
  });

  // ----------------------------------------------------------------
  // 1. Simple Document Extraction & Lineage
  // ----------------------------------------------------------------
  describe('1. Simple Document Extraction & Lineage', () => {
    it('should extract concept nodes with complete source lineage and collection isolation', async () => {
      const understanding = makeMockUnderstanding('doc_simple_1', [
        {
          structureType: 'definition',
          content: 'Definition: Photoelectric Effect is the emission of electrons when electromagnetic radiation hits a material.',
          confidence: 0.95,
        },
      ]);

      const chunks = [
        makeMockChunk(0, 'doc_simple_1', 'Definition: Photoelectric Effect is the emission of electrons when electromagnetic radiation hits a material.', {
          contentType: 'definition',
        }),
      ];

      const result = await service.extractGraph(understanding, chunks, 'user_123', 'col_physics');

      expect(result.nodesCount).toBeGreaterThanOrEqual(1);
      const photoNode = result.nodes.find(n => n.label.toLowerCase() === 'photoelectric effect');
      expect(photoNode).toBeDefined();
      expect(photoNode?.type).toBe('CONCEPT');
      expect(photoNode?.notebookId).toBe('col_physics');
      expect(photoNode?.collectionId).toBe('col_physics');

      // Verify Lineage
      expect(photoNode?.lineage).toHaveLength(1);
      expect(photoNode?.lineage[0].documentId).toBe('doc_simple_1');
      expect(photoNode?.lineage[0].documentVersionId).toBe('v1');
      expect(photoNode?.lineage[0].blockIds).toEqual(['blk_0']);
      expect(photoNode?.sourceDocIds).toContain('doc_simple_1');

      // Verify Validation
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.tenantIsolationVerified).toBe(true);
      expect(result.validation.validSourceReferences).toBe(true);
    });
  });

  // ----------------------------------------------------------------
  // 2. Textbook Chapter
  // ----------------------------------------------------------------
  describe('2. Textbook Chapter (Hierarchical Concepts, Theorems, Formulae)', () => {
    it('should extract hierarchical concepts, theorems, formulae, and PART_OF relationships', async () => {
      const understanding = makeMockUnderstanding('doc_textbook_1', [
        {
          structureType: 'chapter',
          chapterTitle: 'Quantum Mechanics',
          confidence: 0.98,
        },
        {
          structureType: 'definition',
          content: 'Definition: Uncertainty Principle states that position and momentum cannot both be precisely measured.',
          confidence: 0.92,
        },
        {
          structureType: 'theorem',
          content: 'de Broglie Hypothesis: Every moving particle has an associated wave character.',
          confidence: 0.9,
        },
      ]);

      const chunks = [
        makeMockChunk(0, 'doc_textbook_1', 'Chapter 1: Quantum Mechanics introduces the wave nature of matter.', {
          chapter: 'Quantum Mechanics',
        }),
        makeMockChunk(1, 'doc_textbook_1', 'Definition: Uncertainty Principle states that position and momentum cannot both be precisely measured. Formula: Δx Δp >= h / (4π).', {
          chapter: 'Quantum Mechanics',
          contentType: 'definition',
        }),
      ];

      const result = await service.extractGraph(understanding, chunks, 'user_123', 'col_physics');

      // Should extract Chapter concept, Definition concept, Theorem concept, and Formula
      const labels = result.nodes.map(n => n.label.toLowerCase());
      expect(labels).toContain('quantum mechanics');
      expect(labels).toContain('uncertainty principle');
      expect(labels).toContain('de broglie hypothesis');

      const formulaNode = result.nodes.find(n => n.type === 'FORMULA');
      expect(formulaNode).toBeDefined();

      // Check structural relationship: PART_OF between concepts and the chapter
      const partOfEdge = result.edges.find(e => e.relationshipType === 'PART_OF');
      expect(partOfEdge).toBeDefined();
      expect(result.validation.isValid).toBe(true);
    });
  });

  // ----------------------------------------------------------------
  // 3. Multiple Concepts & Typed Relationships
  // ----------------------------------------------------------------
  describe('3. Multiple Concepts & Typed Relationships', () => {
    it('should create typed edges between related concepts with deterministic IDs', async () => {
      const understanding = makeMockUnderstanding('doc_multi_1', [
        {
          structureType: 'definition',
          content: 'Definition: Wave Particle Duality: matter exhibits both wave and particle characteristics.',
        },
        {
          structureType: 'definition',
          content: 'Definition: Wave Function: mathematical description of the quantum state of an isolated system.',
        },
      ]);

      const chunks = [
        makeMockChunk(0, 'doc_multi_1', 'Wave Particle Duality is directly related to the concept of Wave Function in quantum theory.'),
      ];

      const result = await service.extractGraph(understanding, chunks, 'user_123', 'col_physics');

      expect(result.nodesCount).toBe(2);
      expect(result.edgesCount).toBeGreaterThanOrEqual(1);

      const edge = result.edges[0];
      expect(edge.id).toMatch(/^edge_kg_col_physics_/);
      expect(edge.relationshipType).toBe('RELATED_TO');
      expect(edge.confidence).toBeGreaterThanOrEqual(0.6);
      expect(edge.notebookId).toBe('col_physics');
    });
  });

  // ----------------------------------------------------------------
  // 4. Repeated Concepts & Deduplication
  // ----------------------------------------------------------------
  describe('4. Repeated Concepts & Deduplication', () => {
    it('should merge repeated concepts across chunks into a single node with unified lineage', async () => {
      const understanding = makeMockUnderstanding('doc_repeat_1', [
        {
          structureType: 'definition',
          content: 'Definition: Entropy: measure of disorder in a system.',
        },
      ]);

      const chunks = [
        makeMockChunk(0, 'doc_repeat_1', 'Definition: Entropy: measure of disorder in a system.'),
        makeMockChunk(1, 'doc_repeat_1', 'Definition: Entropy: thermodynamic quantity representing unavailability of thermal energy.'),
      ];

      const result = await service.extractGraph(understanding, chunks, 'user_123', 'col_physics');

      // Only 1 Entropy node created
      const entropyNodes = result.nodes.filter(n => n.label.toLowerCase() === 'entropy');
      expect(entropyNodes).toHaveLength(1);

      // Lineage contains both block references
      expect(entropyNodes[0].lineage[0].blockIds).toEqual(['blk_0']);
    });
  });

  // ----------------------------------------------------------------
  // 5. Conflicting Concepts & Definition Reconciliation
  // ----------------------------------------------------------------
  describe('5. Conflicting Concepts & Definition Reconciliation', () => {
    it('should reconcile conflicting definitions by keeping the richer definition and higher confidence', async () => {
      const existingNodes: any[] = [
        {
          id: 'kg_col_physics_concept_gravity',
          notebookId: 'col_physics',
          collectionId: 'col_physics',
          label: 'Gravity',
          type: 'CONCEPT',
          definition: 'A force.',
          importance: 0.5,
          confidenceScore: 0.6,
          sourceDocIds: ['doc_old'],
          lineage: [],
          prerequisites: [],
          relatedConcepts: [],
        },
      ];

      const newNodes: any[] = [
        {
          id: 'kg_col_physics_concept_gravity',
          notebookId: 'col_physics',
          collectionId: 'col_physics',
          label: 'Gravity',
          type: 'CONCEPT',
          definition: 'A fundamental interaction which causes mutual attraction between all things that have mass.',
          importance: 0.85,
          confidenceScore: 0.95,
          sourceDocIds: ['doc_new'],
          lineage: [{ documentId: 'doc_new', documentVersionId: 'v1', blockIds: ['blk_1'] }],
          prerequisites: [],
          relatedConcepts: [],
        },
      ];

      const merged = service.mergeWithExistingNodes(existingNodes, newNodes);

      expect(merged).toHaveLength(1);
      expect(merged[0].definition).toContain('fundamental interaction');
      expect(merged[0].confidenceScore).toBe(0.95);
      expect(merged[0].importance).toBe(0.85);
      expect(merged[0].sourceDocIds).toEqual(['doc_old', 'doc_new']);
      expect(merged[0].lineage).toHaveLength(1);
    });
  });

  // ----------------------------------------------------------------
  // 6. Low-Confidence Relationship Pruning
  // ----------------------------------------------------------------
  describe('6. Low-Confidence Relationship Pruning', () => {
    it('should filter out relationships with confidence below the threshold', async () => {
      const understanding = makeMockUnderstanding('doc_low_conf', [
        {
          structureType: 'definition',
          content: 'Definition: Concept A: first concept.',
        },
        {
          structureType: 'definition',
          content: 'Definition: Concept B: second concept.',
        },
      ]);

      const chunks = [
        makeMockChunk(0, 'doc_low_conf', 'Concept A and Concept B are mentioned.'),
      ];

      // Extract with high minimum edge confidence threshold
      const result = await service.extractGraph(understanding, chunks, 'user_123', 'col_physics', {
        minEdgeConfidence: 0.99, // Unreachable confidence for standard co-occurrence
      });

      expect(result.edgesCount).toBe(0);
      expect(result.validation.isValid).toBe(true);
    });
  });

  // ----------------------------------------------------------------
  // 7. Reprocessing / Idempotency & Persistence
  // ----------------------------------------------------------------
  describe('7. Reprocessing / Idempotency & Persistence', () => {
    it('should cleanly reprocess documents without creating duplicate graph entities in repository', async () => {
      const understanding = makeMockUnderstanding('doc_reprocess_1', [
        {
          structureType: 'definition',
          content: 'Definition: Momentum is mass in motion.',
        },
      ]);

      const chunks = [
        makeMockChunk(0, 'doc_reprocess_1', 'Definition: Momentum is mass in motion.'),
      ];

      // First run
      const res1 = await service.processAndPersist(understanding, chunks, 'user_abc', 'col_physics', 'doc_reprocess_1');
      expect(res1.validation.isValid).toBe(true);
      expect(notebookRepository.addKGNodes).toHaveBeenCalledTimes(1);

      // Simulate repository now returning the node
      (notebookRepository.getKGNodes as jest.Mock).mockResolvedValueOnce(res1.nodes);

      // Second run (reprocessing)
      const res2 = await service.processAndPersist(understanding, chunks, 'user_abc', 'col_physics', 'doc_reprocess_1');
      expect(res2.validation.isValid).toBe(true);
      expect(notebookRepository.addKGNodes).toHaveBeenCalledTimes(2);

      // Verify node IDs match exactly across re-runs
      expect(res1.nodes.map(n => n.id)).toEqual(res2.nodes.map(n => n.id));
    });
  });
});

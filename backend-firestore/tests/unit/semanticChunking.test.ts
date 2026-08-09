/**
 * Content Pipeline Phase 3A: Structure-Aware Semantic Chunking Test Suite
 *
 * Tests all 7 required scenarios:
 * 1. Textbook (chapter/section hierarchy)
 * 2. Article (heading/paragraph structure)
 * 3. Question bank (Q+A pairs kept together)
 * 4. Table-heavy document (table+context preserved)
 * 5. Hindi document (Devanagari block groups)
 * 6. Mixed language (bilingual block grouping)
 * 7. Very long section (overflow splitting with lineage)
 */

import { SemanticChunker } from '../../src/core/pipeline/chunking/SemanticChunker';
import { BlockGroupBuilder } from '../../src/core/pipeline/chunking/BlockGroupBuilder';
import { BoundaryStrategyEngine } from '../../src/core/pipeline/chunking/BoundaryStrategyEngine';
import { ChunkingService } from '../../src/core/pipeline/chunking/ChunkingService';
import {
  DocumentStructureBlock,
  DocumentUnderstandingResult,
  EducationalMetadata,
} from '../../src/core/pipeline/types';

// Mock Firebase
jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    batch: jest.fn().mockReturnValue({
      set: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function makeStructureBlock(
  overrides: Partial<DocumentStructureBlock> & { content: string; structureType: DocumentStructureBlock['structureType'] }
): DocumentStructureBlock {
  return {
    blockId: `blk_${Math.random().toString(36).slice(2, 9)}`,
    structureType: overrides.structureType,
    content: overrides.content,
    sequence: overrides.sequence ?? 0,
    pageNumber: overrides.pageNumber ?? 1,
    confidence: overrides.confidence ?? 0.95,
    heading: overrides.heading,
    section: overrides.section,
    chapterTitle: overrides.chapterTitle,
  };
}

function makeUnderstandingResult(
  blocks: DocumentStructureBlock[],
  metadataOverrides: EducationalMetadata = {},
  outlineOverrides: Partial<DocumentUnderstandingResult['documentOutline']> = {}
): DocumentUnderstandingResult {
  const outline: DocumentUnderstandingResult['documentOutline'] = {
    title: outlineOverrides.title || 'Test Document',
    chapters: outlineOverrides.chapters || [],
  };

  return {
    documentId: 'doc_math_101',
    documentVersionId: 'v1',
    structuredBlocks: blocks,
    documentOutline: outline,
    educationalMetadata: metadataOverrides,
    resolvedMetadata: metadataOverrides,
    stats: {
      totalStructuredBlocks: blocks.length,
      structureTypeDistribution: {} as any,
      metadataFieldsExtracted: Object.keys(metadataOverrides).length,
      averageMetadataConfidence: 0.95,
      userOverriddenFields: [],
    },
    durationMs: 15,
  };
}

// ------------------------------------------------------------------
// Test Suite
// ------------------------------------------------------------------

describe('Content Pipeline Phase 3A: Structure-Aware Semantic Chunking', () => {
  let chunker: SemanticChunker;
  let groupBuilder: BlockGroupBuilder;
  let boundaryEngine: BoundaryStrategyEngine;
  let chunkingService: ChunkingService;

  beforeEach(() => {
    jest.clearAllMocks();
    groupBuilder = new BlockGroupBuilder();
    boundaryEngine = new BoundaryStrategyEngine();
    chunker = new SemanticChunker(groupBuilder, boundaryEngine);
    chunkingService = new ChunkingService(chunker);
  });

  // ----------------------------------------------------------------
  // Scenario 1: Textbook
  // ----------------------------------------------------------------
  describe('Scenario 1: Textbook (Chapter/Section Hierarchy)', () => {
    it('should respect chapter and section boundaries and inherit hierarchical context', () => {
      const blocks: DocumentStructureBlock[] = [
        makeStructureBlock({
          structureType: 'chapter',
          content: 'Chapter 1: Kinematics',
          chapterTitle: 'Chapter 1: Kinematics',
          pageNumber: 1,
        }),
        makeStructureBlock({
          structureType: 'section',
          content: '1.1 Uniform Motion in a Straight Line',
          chapterTitle: 'Chapter 1: Kinematics',
          section: '1.1 Uniform Motion',
          pageNumber: 1,
        }),
        makeStructureBlock({
          structureType: 'paragraph',
          content: 'When an object covers equal distances in equal intervals of time, it is said to be in uniform motion.',
          chapterTitle: 'Chapter 1: Kinematics',
          section: '1.1 Uniform Motion',
          pageNumber: 1,
        }),
        makeStructureBlock({
          structureType: 'definition',
          content: 'Definition: Velocity is defined as the rate of change of displacement with time.',
          chapterTitle: 'Chapter 1: Kinematics',
          section: '1.1 Uniform Motion',
          pageNumber: 2,
        }),
        makeStructureBlock({
          structureType: 'paragraph',
          content: 'Velocity is a vector quantity having both magnitude and direction. Its SI unit is m/s.',
          chapterTitle: 'Chapter 1: Kinematics',
          section: '1.1 Uniform Motion',
          pageNumber: 2,
        }),
        makeStructureBlock({
          structureType: 'chapter',
          content: 'Chapter 2: Dynamics',
          chapterTitle: 'Chapter 2: Dynamics',
          pageNumber: 10,
        }),
        makeStructureBlock({
          structureType: 'paragraph',
          content: 'Dynamics deals with the causes of motion, primarily forces.',
          chapterTitle: 'Chapter 2: Dynamics',
          pageNumber: 10,
        }),
      ];

      const understanding = makeUnderstandingResult(blocks, {
        subject: { value: 'Physics', confidence: 0.98, source: 'ai' },
        class: { value: 'Class 11', confidence: 0.95, source: 'ai' },
        board: { value: 'CBSE', confidence: 0.92, source: 'ai' },
      });

      const result = chunker.chunk(understanding, 'col_science');

      expect(result.chunks.length).toBeGreaterThanOrEqual(2);

      // Verify chapter 1 and chapter 2 are in separate chunks
      const ch1Chunks = result.chunks.filter(c => c.chapter === 'Chapter 1: Kinematics');
      const ch2Chunks = result.chunks.filter(c => c.chapter === 'Chapter 2: Dynamics');

      expect(ch1Chunks.length).toBeGreaterThan(0);
      expect(ch2Chunks.length).toBeGreaterThan(0);

      // Verify metadata inheritance
      expect(result.chunks[0].subject).toBe('Physics');
      expect(result.chunks[0].classLevel).toBe('Class 11');
      expect(result.chunks[0].board).toBe('CBSE');

      // Verify definition + explanation grouping: velocity definition and explanation should be together
      const defChunk = result.chunks.find(c => c.text.includes('Velocity is defined as'));
      expect(defChunk).toBeDefined();
      expect(defChunk?.text).toContain('Velocity is a vector quantity');

      // Verify navigation links
      expect(result.chunks[0].previousChunkId).toBeUndefined();
      expect(result.chunks[0].nextChunkId).toBe(result.chunks[1].chunkId);
      expect(result.chunks[1].previousChunkId).toBe(result.chunks[0].chunkId);
    });
  });

  // ----------------------------------------------------------------
  // Scenario 2: Article
  // ----------------------------------------------------------------
  describe('Scenario 2: Article (Heading/Paragraph Structure)', () => {
    it('should cleanly chunk article sections and avoid micro-chunk fragmentation', () => {
      const blocks: DocumentStructureBlock[] = [
        makeStructureBlock({
          structureType: 'title',
          content: 'A Survey of Deep Learning in Computer Vision',
          sequence: 0,
        }),
        makeStructureBlock({
          structureType: 'section',
          content: '1. Introduction',
          sequence: 1,
          section: '1. Introduction',
        }),
        makeStructureBlock({
          structureType: 'paragraph',
          content: 'Deep convolutional neural networks have fundamentally transformed visual recognition tasks since AlexNet won the ImageNet challenge in 2012.',
          sequence: 2,
          section: '1. Introduction',
        }),
        makeStructureBlock({
          structureType: 'paragraph',
          content: 'Key breakthroughs include residual connections, spatial attention mechanisms, and vision transformers.',
          sequence: 3,
          section: '1. Introduction',
        }),
        makeStructureBlock({
          structureType: 'section',
          content: '2. Vision Transformers',
          sequence: 4,
          section: '2. Vision Transformers',
        }),
        makeStructureBlock({
          structureType: 'paragraph',
          content: 'Vision Transformers (ViT) apply standard transformer encoders directly to sequences of non-overlapping image patches.',
          sequence: 5,
          section: '2. Vision Transformers',
        }),
      ];

      const understanding = makeUnderstandingResult(blocks, {
        subject: { value: 'Computer Science', confidence: 0.9, source: 'ai' },
      });

      const result = chunker.chunk(understanding, 'col_articles');

      expect(result.totalChunks).toBeGreaterThanOrEqual(1);
      // All chunks should have valid sequence and token count
      result.chunks.forEach((chunk, idx) => {
        expect(chunk.sequence).toBe(idx);
        expect(chunk.tokenCount).toBeGreaterThan(0);
        expect(chunk.sourceLocation.blockIds.length).toBeGreaterThan(0);
      });
    });
  });

  // ----------------------------------------------------------------
  // Scenario 3: Question Bank
  // ----------------------------------------------------------------
  describe('Scenario 3: Question Bank (Q+A Pairs Kept Together)', () => {
    it('should keep questions and their corresponding answers in the same chunk', () => {
      const blocks: DocumentStructureBlock[] = [
        makeStructureBlock({
          structureType: 'question',
          content: 'Q1. What is the fundamental theorem of arithmetic?',
          sequence: 0,
        }),
        makeStructureBlock({
          structureType: 'answer',
          content: 'Answer: Every composite number can be expressed as a product of primes, uniquely apart from the order of factors.',
          sequence: 1,
        }),
        makeStructureBlock({
          structureType: 'question',
          content: 'Q2. Prove that √2 is irrational.',
          sequence: 2,
        }),
        makeStructureBlock({
          structureType: 'answer',
          content: 'Answer: Assume √2 = a/b where a and b are co-prime. Then 2b² = a², meaning 2 divides a. This leads to a contradiction.',
          sequence: 3,
        }),
        makeStructureBlock({
          structureType: 'question',
          content: 'Q3. Find the HCF of 96 and 404 by prime factorization.',
          sequence: 4,
        }),
        makeStructureBlock({
          structureType: 'answer',
          content: 'Answer: 96 = 2⁵ × 3, 404 = 2² × 101. HCF = 2² = 4.',
          sequence: 5,
        }),
      ];

      const understanding = makeUnderstandingResult(blocks, {
        content_type: { value: 'question_bank', confidence: 0.99, source: 'ai' },
        subject: { value: 'Mathematics', confidence: 0.95, source: 'ai' },
      });

      const result = chunker.chunk(understanding, 'col_exams');

      // Check Q1 + Answer 1
      const q1Chunk = result.chunks.find(c => c.text.includes('Q1. What is the fundamental theorem'));
      expect(q1Chunk).toBeDefined();
      expect(q1Chunk?.text).toContain('Every composite number can be expressed');

      // Check Q2 + Answer 2
      const q2Chunk = result.chunks.find(c => c.text.includes('Q2. Prove that √2 is irrational'));
      expect(q2Chunk).toBeDefined();
      expect(q2Chunk?.text).toContain('Assume √2 = a/b');

      // Check content types
      const qaChunks = result.chunks.filter(c => c.contentType === 'question_answer');
      expect(qaChunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ----------------------------------------------------------------
  // Scenario 4: Table-Heavy Document
  // ----------------------------------------------------------------
  describe('Scenario 4: Table-Heavy Document', () => {
    it('should preserve tables with surrounding context as coherent units', () => {
      const tableContent = '| Quantity | Symbol | SI Unit | Dimension |\n|---|---|---|---|\n| Force | F | Newton (N) | [MLT⁻²] |\n| Energy | E | Joule (J) | [ML²T⁻²] |\n| Power | P | Watt (W) | [ML²T⁻³] |';

      const blocks: DocumentStructureBlock[] = [
        makeStructureBlock({
          structureType: 'section',
          content: 'Table of Physical Quantities and Units',
          sequence: 0,
        }),
        makeStructureBlock({
          structureType: 'unknown',
          content: tableContent,
          sequence: 1,
        }),
        makeStructureBlock({
          structureType: 'paragraph',
          content: 'Note: All dimensions follow the standard MLT base system of fundamental SI units.',
          sequence: 2,
        }),
      ];

      const understanding = makeUnderstandingResult(blocks);
      const result = chunker.chunk(understanding, 'col_physics');

      // Table chunk should contain the table and its description
      const tableChunk = result.chunks.find(c => c.text.includes('| Force | F |'));
      expect(tableChunk).toBeDefined();
      expect(tableChunk?.contentType).toBe('table');
      expect(tableChunk?.boundaryStrategy).toBe('table_group');
    });
  });

  // ----------------------------------------------------------------
  // Scenario 5: Hindi Document
  // ----------------------------------------------------------------
  describe('Scenario 5: Hindi Document (Devanagari Block Groups)', () => {
    it('should correctly group Hindi educational structures without splitting definitions or Q&A', () => {
      const blocks: DocumentStructureBlock[] = [
        makeStructureBlock({
          structureType: 'chapter',
          content: 'अध्याय 1: रासायनिक अभिक्रियाएं एवं समीकरण',
          chapterTitle: 'अध्याय 1: रासायनिक अभिक्रियाएं',
          pageNumber: 1,
        }),
        makeStructureBlock({
          structureType: 'definition',
          content: 'परिभाषा: रासायनिक अभिक्रिया वह प्रक्रिया है जिसमें एक या अधिक पदार्थ नए पदार्थों में परिवर्तित होते हैं।',
          chapterTitle: 'अध्याय 1: रासायनिक अभिक्रियाएं',
          pageNumber: 1,
        }),
        makeStructureBlock({
          structureType: 'paragraph',
          content: 'उदाहरण के लिए, मैग्नीशियम रिबन का वायु में दहन होकर मैग्नीशियम ऑक्साइड बनना।',
          chapterTitle: 'अध्याय 1: रासायनिक अभिक्रियाएं',
          pageNumber: 1,
        }),
        makeStructureBlock({
          structureType: 'question',
          content: 'प्रश्न: संतुलित रासायनिक समीकरण क्या है?',
          chapterTitle: 'अध्याय 1: रासायनिक अभिक्रियाएं',
          pageNumber: 2,
        }),
        makeStructureBlock({
          structureType: 'answer',
          content: 'उत्तर: जिस समीकरण में अभिकारकों और उत्पादों के परमाणुओं की संख्या समान हो, उसे संतुलित समीकरण कहते हैं।',
          chapterTitle: 'अध्याय 1: रासायनिक अभिक्रियाएं',
          pageNumber: 2,
        }),
      ];

      const understanding = makeUnderstandingResult(blocks, {
        language: { value: 'Hindi', confidence: 0.98, source: 'ai' },
        subject: { value: 'Science', confidence: 0.94, source: 'ai' },
        class: { value: 'Class 10', confidence: 0.92, source: 'ai' },
      });

      const result = chunker.chunk(understanding, 'col_hindi');

      expect(result.chunks.length).toBeGreaterThan(0);

      // Hindi definition and explanation preserved together
      const defChunk = result.chunks.find(c => c.text.includes('रासायनिक अभिक्रिया वह प्रक्रिया है'));
      expect(defChunk).toBeDefined();
      expect(defChunk?.text).toContain('मैग्नीशियम रिबन का वायु में दहन');

      // Hindi Q+A preserved together
      const qaChunk = result.chunks.find(c => c.text.includes('संतुलित रासायनिक समीकरण क्या है?'));
      expect(qaChunk).toBeDefined();
      expect(qaChunk?.text).toContain('जिस समीकरण में अभिकारकों और उत्पादों');

      // Language metadata inherited
      expect(result.chunks[0].language).toBe('Hindi');
    });
  });

  // ----------------------------------------------------------------
  // Scenario 6: Mixed Language Document
  // ----------------------------------------------------------------
  describe('Scenario 6: Mixed Language Document', () => {
    it('should chunk bilingual content while preserving semantic groups and language metadata', () => {
      const blocks: DocumentStructureBlock[] = [
        makeStructureBlock({
          structureType: 'chapter',
          content: 'Chapter 3: Thermodynamics / ऊष्मागतिकी',
          chapterTitle: 'Chapter 3: Thermodynamics',
        }),
        makeStructureBlock({
          structureType: 'definition',
          content: 'First Law of Thermodynamics / ऊष्मागतिकी का प्रथम नियम: Energy can neither be created nor destroyed. ऊर्जा न तो उत्पन्न की जा सकती है और न ही नष्ट।',
        }),
        makeStructureBlock({
          structureType: 'paragraph',
          content: 'Mathematically: ΔU = q + w, where ΔU is internal energy change. गणितीय रूप से: ΔU = q + w।',
        }),
      ];

      const understanding = makeUnderstandingResult(blocks, {
        language: { value: 'Mixed (Hindi-English)', confidence: 0.95, source: 'ai' },
        subject: { value: 'Chemistry', confidence: 0.92, source: 'ai' },
      });

      const result = chunker.chunk(understanding, 'col_bilingual');

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks[0].language).toBe('Mixed (Hindi-English)');
      expect(result.chunks[0].text).toContain('First Law of Thermodynamics');
      expect(result.chunks[0].text).toContain('ऊष्मागतिकी का प्रथम नियम');
      expect(result.chunks[0].text).toContain('ΔU = q + w');
    });
  });

  // ----------------------------------------------------------------
  // Scenario 7: Very Long Section (Overflow Splitting)
  // ----------------------------------------------------------------
  describe('Scenario 7: Very Long Section (Overflow Splitting with Lineage)', () => {
    it('should perform overflow splitting on oversized sections while preserving source lineage', () => {
      // Create a very long paragraph (e.g. 800 words / ~3200 characters)
      const longText = Array(30)
        .fill('Photosynthesis is the fundamental biological process that powers life on Earth by converting light energy into chemical energy stored in glucose.')
        .join('\n\n');

      const longBlock = makeStructureBlock({
        structureType: 'paragraph',
        content: longText,
        pageNumber: 5,
        chapterTitle: 'Chapter 6: Plant Physiology',
        section: '6.2 Light Reactions',
      });

      const understanding = makeUnderstandingResult([longBlock], {
        subject: { value: 'Biology', confidence: 0.95, source: 'ai' },
      });

      // Max tokens = 100 to force overflow splitting
      const result = chunker.chunk(understanding, 'col_bio', {
        maxTokensPerChunk: 100,
        overlapTokens: 20,
      });

      expect(result.chunks.length).toBeGreaterThan(1);

      // Verify all split chunks have the 'overflow_split' boundary strategy
      result.chunks.forEach((chunk, idx) => {
        expect(chunk.boundaryStrategy).toBe('overflow_split');
        expect(chunk.sourceLocation.blockIds).toContain(longBlock.blockId);
        expect(chunk.pageNumber).toBe(5);
        expect(chunk.chapter).toBe('Chapter 6: Plant Physiology');
        expect(chunk.section).toBe('6.2 Light Reactions');
        expect(chunk.sequence).toBe(idx);
      });

      // Verify doubly linked list chain
      expect(result.chunks[0].previousChunkId).toBeUndefined();
      expect(result.chunks[0].nextChunkId).toBe(result.chunks[1].chunkId);
      expect(result.chunks[1].previousChunkId).toBe(result.chunks[0].chunkId);
    });
  });

  // ----------------------------------------------------------------
  // Lineage & Traceability Invariants
  // ----------------------------------------------------------------
  describe('Lineage & Traceability Verification', () => {
    it('should guarantee chunkId determinism and complete source block mapping', () => {
      const blocks: DocumentStructureBlock[] = [
        makeStructureBlock({ structureType: 'paragraph', content: 'Block 1 text', sequence: 0, pageNumber: 1 }),
        makeStructureBlock({ structureType: 'paragraph', content: 'Block 2 text', sequence: 1, pageNumber: 2 }),
      ];

      const understanding = makeUnderstandingResult(blocks);
      const result1 = chunker.chunk(understanding, 'col_test');
      const result2 = chunker.chunk(understanding, 'col_test');

      // Deterministic IDs
      expect(result1.chunks[0].chunkId).toBe(result2.chunks[0].chunkId);
      expect(result1.chunks[0].chunkId).toBe('doc_math_101_chunk_0');

      // Source location block IDs
      expect(result1.chunks[0].sourceLocation.blockIds).toEqual(blocks.map(b => b.blockId));
      expect(result1.chunks[0].sourceLocation.pageStart).toBe(1);
      expect(result1.chunks[0].sourceLocation.pageEnd).toBe(2);
    });
  });
});

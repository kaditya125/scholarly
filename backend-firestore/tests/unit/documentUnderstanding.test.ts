/**
 * Content Pipeline Phase 2D: Document Understanding Automated Test Suite
 *
 * Tests all 7 required scenarios:
 * 1. NCERT-style textbook
 * 2. General PDF
 * 3. Hindi document
 * 4. English document
 * 5. Mixed document
 * 6. Low-confidence metadata
 * 7. Manual metadata override
 */

import { DocumentStructureAnalyzer } from '../../src/core/pipeline/understanding/DocumentStructureAnalyzer';
import { EducationalMetadataExtractor } from '../../src/core/pipeline/understanding/EducationalMetadataExtractor';
import { UserMetadataOverrideGuard } from '../../src/core/pipeline/understanding/UserMetadataOverrideGuard';
import { DocumentUnderstandingService } from '../../src/core/pipeline/understanding/DocumentUnderstandingService';
import { MetadataCategoryRegistry } from '../../src/core/pipeline/understanding/MetadataCategoryRegistry';
import {
  ExtractedDocumentResult,
  ExtractedBlock,
  EducationalMetadata,
} from '../../src/core/pipeline/types';

// ------------------------------------------------------------------
// Mocks
// ------------------------------------------------------------------

// Mock Firebase
jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock GeminiProvider — controlled per test
const mockGenerateResponse = jest.fn();
jest.mock('../../src/services/ai/gemini.provider', () => ({
  GeminiProvider: jest.fn().mockImplementation(() => ({
    generateResponse: mockGenerateResponse,
  })),
}));

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function makeBlock(
  overrides: Partial<ExtractedBlock> & { content: string; type: ExtractedBlock['type'] }
): ExtractedBlock {
  return {
    blockId: `blk_${Math.random().toString(36).slice(2)}`,
    documentId: 'doc_test',
    documentVersionId: 'v1',
    type: overrides.type,
    content: overrides.content,
    sequence: overrides.sequence ?? 0,
    pageNumber: overrides.pageNumber ?? 1,
    section: overrides.section,
    heading: overrides.heading,
    sourceLocation: { pageNumber: overrides.pageNumber ?? 1 },
    metadata: overrides.metadata,
    ocrConfidence: overrides.ocrConfidence,
  };
}

function makeExtractionResult(
  blocks: ExtractedBlock[],
  overrides: Partial<ExtractedDocumentResult> = {}
): ExtractedDocumentResult {
  const rawText = blocks.map(b => b.content).join('\n\n');
  return {
    documentId: 'doc_test',
    documentVersionId: 'v1',
    format: 'PDF',
    language: 'en',
    pageCount: 1,
    totalBlocks: blocks.length,
    totalCharacters: rawText.length,
    blocks,
    rawText,
    hierarchy: { sections: [] },
    ...overrides,
  };
}

function geminiMetadataResponse(fields: Record<string, { value: any; confidence: number }>): string {
  return JSON.stringify(fields);
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('Content Pipeline Phase 2D: Document Understanding Test Suite', () => {
  let structureAnalyzer: DocumentStructureAnalyzer;
  let registry: MetadataCategoryRegistry;
  let metadataExtractor: EducationalMetadataExtractor;
  let overrideGuard: UserMetadataOverrideGuard;
  let service: DocumentUnderstandingService;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new MetadataCategoryRegistry();
    structureAnalyzer = new DocumentStructureAnalyzer();
    overrideGuard = new UserMetadataOverrideGuard();
    metadataExtractor = new EducationalMetadataExtractor(undefined as any, registry);
    service = new DocumentUnderstandingService(structureAnalyzer, metadataExtractor, overrideGuard, registry);
  });

  // ----------------------------------------------------------------
  // Scenario 1: NCERT-style textbook
  // ----------------------------------------------------------------
  describe('Scenario 1: NCERT-Style Textbook', () => {
    it('should classify NCERT structure and extract board/subject/class metadata', async () => {
      mockGenerateResponse.mockResolvedValueOnce({
        reply: geminiMetadataResponse({
          subject: { value: 'Physics', confidence: 0.97 },
          board: { value: 'NCERT', confidence: 0.95 },
          class: { value: 'Class 12', confidence: 0.94 },
          chapter: { value: 'Chapter 1: Electric Charges and Fields', confidence: 0.98 },
          topic: { value: 'Coulomb\'s Law', confidence: 0.92 },
          language: { value: 'English', confidence: 0.99 },
          difficulty: { value: 'advanced', confidence: 0.85 },
          content_type: { value: 'textbook', confidence: 0.97 },
          keywords: { value: ['Coulomb\'s Law', 'electric charge', 'field lines'], confidence: 0.90 },
        }),
        usage: {},
      });

      const blocks = [
        makeBlock({ type: 'heading', content: 'NCERT Physics Part I', sequence: 0, pageNumber: 1 }),
        makeBlock({ type: 'heading', content: 'Chapter 1: Electric Charges and Fields', sequence: 1, pageNumber: 1 }),
        makeBlock({ type: 'paragraph', content: 'All matter is made of atoms. Atoms have protons, neutrons, and electrons. Electric charge is a fundamental property of matter.', sequence: 2, pageNumber: 1 }),
        makeBlock({ type: 'paragraph', content: 'Definition: Electric charge is the physical property of matter that causes it to experience a force when placed in an electromagnetic field.', sequence: 3, pageNumber: 2 }),
        makeBlock({ type: 'question', content: 'Question 1.1: What is Coulomb\'s Law? State its mathematical form.', sequence: 4, pageNumber: 2 }),
        makeBlock({ type: 'answer', content: 'Answer: Coulomb\'s Law states that F = kq₁q₂/r². The force is proportional to the product of charges.', sequence: 5, pageNumber: 2 }),
        makeBlock({ type: 'paragraph', content: 'Note: Coulomb\'s law is valid for point charges only.', sequence: 6, pageNumber: 3 }),
        makeBlock({ type: 'paragraph', content: 'Exercise 1.1: Calculate the force between two charges of 2μC and 4μC separated by 0.5m.', sequence: 7, pageNumber: 3 }),
      ];

      const extractionResult = makeExtractionResult(blocks);
      const result = await service.understand(extractionResult);

      // Structural classification
      const types = result.structuredBlocks.map(b => b.structureType);
      expect(types).toContain('chapter');
      expect(types).toContain('definition');
      expect(types).toContain('question');
      expect(types).toContain('answer');
      expect(types).toContain('important_note');
      expect(types).toContain('exercise');

      // Document outline
      expect(result.documentOutline.chapters.length).toBeGreaterThan(0);
      expect(result.documentOutline.chapters[0].title).toContain('Electric Charges');

      // Metadata
      expect(result.educationalMetadata['subject']?.value).toBe('Physics');
      expect(result.educationalMetadata['board']?.value).toBe('NCERT');
      expect(result.educationalMetadata['class']?.confidence).toBeGreaterThan(0.9);
      expect(result.educationalMetadata['content_type']?.value).toBe('textbook');

      // Stats
      expect(result.stats.totalStructuredBlocks).toBe(8);
      expect(result.stats.metadataFieldsExtracted).toBeGreaterThan(5);
    });
  });

  // ----------------------------------------------------------------
  // Scenario 2: General PDF
  // ----------------------------------------------------------------
  describe('Scenario 2: General PDF', () => {
    it('should classify general document structure and infer content type', async () => {
      mockGenerateResponse.mockResolvedValueOnce({
        reply: geminiMetadataResponse({
          subject: { value: 'Computer Science', confidence: 0.88 },
          language: { value: 'English', confidence: 0.99 },
          content_type: { value: 'reference', confidence: 0.72 },
          difficulty: { value: 'intermediate', confidence: 0.75 },
          keywords: { value: ['binary search', 'sorting', 'algorithms'], confidence: 0.85 },
        }),
        usage: {},
      });

      const blocks = [
        makeBlock({ type: 'heading', content: 'Introduction to Algorithms', sequence: 0 }),
        makeBlock({ type: 'heading', content: 'Section 1: Searching Algorithms', sequence: 1 }),
        makeBlock({ type: 'paragraph', content: 'Binary search is an efficient algorithm for finding an element in a sorted array in O(log n) time.', sequence: 2 }),
        makeBlock({ type: 'paragraph', content: 'Reference: Cormen, T.H., Leiserson, C.E. Introduction to Algorithms. MIT Press, 2009.', sequence: 3 }),
      ];

      const result = await service.understand(makeExtractionResult(blocks));

      const types = result.structuredBlocks.map(b => b.structureType);
      expect(types).toContain('section');
      expect(types).toContain('paragraph');
      expect(types).toContain('reference');
      expect(result.educationalMetadata['subject']?.value).toBe('Computer Science');
    });
  });

  // ----------------------------------------------------------------
  // Scenario 3: Hindi document
  // ----------------------------------------------------------------
  describe('Scenario 3: Hindi Document', () => {
    it('should classify Hindi educational structure and detect language metadata', async () => {
      mockGenerateResponse.mockResolvedValueOnce({
        reply: geminiMetadataResponse({
          subject: { value: 'Biology', confidence: 0.91 },
          language: { value: 'Hindi', confidence: 0.98 },
          board: { value: 'CBSE', confidence: 0.87 },
          class: { value: 'Class 10', confidence: 0.90 },
          chapter: { value: 'अध्याय 6: जैव प्रक्रम', confidence: 0.94 },
          content_type: { value: 'textbook', confidence: 0.88 },
        }),
        usage: {},
      });

      const blocks = [
        makeBlock({ type: 'heading', content: 'अध्याय 6: जैव प्रक्रम', sequence: 0, pageNumber: 1 }),
        makeBlock({ type: 'paragraph', content: 'परिभाषा: जीव विज्ञान में जैव प्रक्रम उन सभी प्रक्रियाओं को कहते हैं जो जीव के जीवन के लिए आवश्यक हैं।', sequence: 1, pageNumber: 1 }),
        makeBlock({ type: 'question', content: 'प्रश्न 1: प्रकाश संश्लेषण की परिभाषा लिखिए।', sequence: 2, pageNumber: 2 }),
        makeBlock({ type: 'answer', content: 'उत्तर: प्रकाश संश्लेषण वह प्रक्रिया है जिसमें पौधे सूर्य के प्रकाश की सहायता से भोजन बनाते हैं।', sequence: 3, pageNumber: 2 }),
        makeBlock({ type: 'paragraph', content: 'महत्वपूर्ण: क्लोरोफिल प्रकाश ऊर्जा को अवशोषित करता है।', sequence: 4, pageNumber: 3 }),
      ];

      const result = await service.understand(makeExtractionResult(blocks, { language: 'hi' }));

      const types = result.structuredBlocks.map(b => b.structureType);
      expect(types).toContain('chapter');
      expect(types).toContain('definition');
      expect(types).toContain('question');
      expect(types).toContain('answer');
      expect(types).toContain('important_note');

      expect(result.educationalMetadata['language']?.value).toBe('Hindi');
      expect(result.educationalMetadata['board']?.value).toBe('CBSE');
    });
  });

  // ----------------------------------------------------------------
  // Scenario 4: English document
  // ----------------------------------------------------------------
  describe('Scenario 4: English Document', () => {
    it('should correctly classify English academic structure with theorem detection', async () => {
      mockGenerateResponse.mockResolvedValueOnce({
        reply: geminiMetadataResponse({
          subject: { value: 'Mathematics', confidence: 0.97 },
          language: { value: 'English', confidence: 0.99 },
          exam: { value: 'JEE', confidence: 0.82 },
          difficulty: { value: 'advanced', confidence: 0.88 },
          content_type: { value: 'reference', confidence: 0.70 },
        }),
        usage: {},
      });

      const blocks = [
        makeBlock({ type: 'heading', content: 'Chapter 7: Integration', sequence: 0 }),
        makeBlock({ type: 'heading', content: 'Section 7.1: Definite Integrals', sequence: 1 }),
        makeBlock({ type: 'paragraph', content: 'Theorem: If f is continuous on [a, b], then ∫ₐᵇ f(x) dx = F(b) - F(a) where F is any antiderivative of f.', sequence: 2 }),
        makeBlock({ type: 'paragraph', content: 'Example 7.1: Evaluate ∫₀¹ x² dx. Solution: [x³/3]₀¹ = 1/3.', sequence: 3 }),
        makeBlock({ type: 'paragraph', content: 'Summary: Integration is the reverse process of differentiation. The Fundamental Theorem of Calculus connects them.', sequence: 4 }),
      ];

      const result = await service.understand(makeExtractionResult(blocks));

      const types = result.structuredBlocks.map(b => b.structureType);
      expect(types).toContain('chapter');
      expect(types).toContain('section');
      expect(types).toContain('theorem');
      expect(types).toContain('example');
      expect(types).toContain('summary');
    });
  });

  // ----------------------------------------------------------------
  // Scenario 5: Mixed document
  // ----------------------------------------------------------------
  describe('Scenario 5: Mixed Hindi-English Document', () => {
    it('should handle bilingual content and classify structures in both scripts', async () => {
      mockGenerateResponse.mockResolvedValueOnce({
        reply: geminiMetadataResponse({
          subject: { value: 'Chemistry', confidence: 0.90 },
          language: { value: 'Mixed (Hindi-English)', confidence: 0.95 },
          board: { value: 'CBSE', confidence: 0.85 },
          class: { value: 'Class 11', confidence: 0.87 },
        }),
        usage: {},
      });

      const blocks = [
        makeBlock({ type: 'heading', content: 'Chapter 2: Structure of Atom / परमाणु की संरचना', sequence: 0 }),
        makeBlock({ type: 'paragraph', content: 'परिभाषा: An atom is the smallest unit of matter. परमाणु पदार्थ की सबसे छोटी इकाई है।', sequence: 1 }),
        makeBlock({ type: 'paragraph', content: 'Note: Bohr\'s model explains atomic spectra. बोर के मॉडल से परमाणु स्पेक्ट्रम समझाया जा सकता है।', sequence: 2 }),
        makeBlock({ type: 'question', content: 'Question/प्रश्न: What is the charge of an electron?', sequence: 3 }),
      ];

      const result = await service.understand(makeExtractionResult(blocks, { language: 'mixed' }));

      expect(result.educationalMetadata['language']?.value).toBe('Mixed (Hindi-English)');
      const types = result.structuredBlocks.map(b => b.structureType);
      expect(types).toContain('chapter');
      expect(types).toContain('definition');
      expect(types).toContain('important_note');
      expect(types).toContain('question');
    });
  });

  // ----------------------------------------------------------------
  // Scenario 6: Low-confidence metadata
  // ----------------------------------------------------------------
  describe('Scenario 6: Low-Confidence Metadata', () => {
    it('should return low-confidence values when document provides insufficient signals', async () => {
      mockGenerateResponse.mockResolvedValueOnce({
        reply: geminiMetadataResponse({
          subject: { value: 'Unknown', confidence: 0.18 },
          language: { value: 'English', confidence: 0.60 },
          content_type: { value: 'mixed', confidence: 0.25 },
        }),
        usage: {},
      });

      const blocks = [
        makeBlock({ type: 'paragraph', content: 'Some text without clear educational context.', sequence: 0 }),
        makeBlock({ type: 'paragraph', content: 'Additional generic content with no subject indicators.', sequence: 1 }),
      ];

      const result = await service.understand(makeExtractionResult(blocks));

      expect(result.educationalMetadata['subject']?.confidence).toBeLessThan(0.3);
      expect(result.stats.averageMetadataConfidence).toBeLessThan(0.5);

      // Low confidence metadata should still be present — not filtered out
      expect(result.educationalMetadata['subject']).toBeDefined();
    });
  });

  // ----------------------------------------------------------------
  // Scenario 7: Manual metadata override
  // ----------------------------------------------------------------
  describe('Scenario 7: Manual Metadata Override', () => {
    it('should preserve user overrides and never overwrite them on reprocessing', async () => {
      mockGenerateResponse.mockResolvedValue({
        reply: geminiMetadataResponse({
          subject: { value: 'Physics', confidence: 0.97 },
          board: { value: 'ICSE', confidence: 0.75 }, // AI thinks ICSE
          class: { value: 'Class 11', confidence: 0.88 },
          language: { value: 'English', confidence: 0.99 },
        }),
        usage: {},
      });

      const blocks = [
        makeBlock({ type: 'heading', content: 'Chapter 3: Laws of Motion', sequence: 0 }),
        makeBlock({ type: 'paragraph', content: 'Newton\'s First Law states that a body at rest remains at rest unless acted upon by a force.', sequence: 1 }),
      ];

      // First run: user says board is 'CBSE', overriding the AI's 'ICSE'
      const firstResult = await service.understand(makeExtractionResult(blocks), {
        userOverrides: {
          board: 'CBSE',  // User knows better
          exam: 'JEE',    // User adds an exam tag AI didn't find
        },
      });

      expect(firstResult.resolvedMetadata['board']?.value).toBe('CBSE');
      expect(firstResult.resolvedMetadata['board']?.source).toBe('user');
      expect(firstResult.resolvedMetadata['board']?.confidence).toBe(1.0);
      expect(firstResult.resolvedMetadata['exam']?.value).toBe('JEE');
      expect(firstResult.resolvedMetadata['exam']?.source).toBe('user');
      expect(firstResult.stats.userOverriddenFields).toContain('board');
      expect(firstResult.stats.userOverriddenFields).toContain('exam');

      // Reprocessing run: AI returns the same ICSE again — user board must survive
      const secondResult = await service.understand(makeExtractionResult(blocks), {
        previousMetadata: firstResult.resolvedMetadata,
      });

      // User override for 'board' must NOT be overwritten by the AI's 'ICSE'
      expect(secondResult.resolvedMetadata['board']?.value).toBe('CBSE');
      expect(secondResult.resolvedMetadata['board']?.source).toBe('user');
      expect(secondResult.resolvedMetadata['exam']?.value).toBe('JEE');
      expect(secondResult.resolvedMetadata['exam']?.source).toBe('user');

      // AI-managed field still gets updated
      expect(secondResult.resolvedMetadata['subject']?.value).toBe('Physics');
      expect(secondResult.resolvedMetadata['subject']?.source).toBe('ai');
    });
  });
});

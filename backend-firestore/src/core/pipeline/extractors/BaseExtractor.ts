/**
 * BaseExtractor
 * Foundational extractor utilities for Phase 2B: Document Extraction
 * 
 * Provides unified language detection (Hindi / English / Mixed),
 * semantic block type classification, block ID generation, and hierarchy builders.
 */

import {
  ExtractedBlock,
  ExtractedBlockType,
  ExtractedDocumentFormat,
  ExtractedDocumentResult,
  SourceLocation,
} from '../types';

export interface ExtractionContext {
  documentId: string;
  documentVersionId: string;
  filename: string;
  contentType: string;
}

export class ExtractionError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'ExtractionError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export abstract class BaseExtractor {
  abstract readonly format: ExtractedDocumentFormat;

  /**
   * Main extraction entry point for a file buffer
   */
  abstract extract(
    buffer: Buffer,
    context: ExtractionContext
  ): Promise<ExtractedDocumentResult>;

  /**
   * Detects document language: 'hi' (Hindi), 'en' (English), or 'mixed' (Hinglish/Bilingual)
   */
  detectLanguage(text: string): 'en' | 'hi' | 'mixed' {
    if (!text || !text.trim()) return 'en';

    // Count Devanagari Unicode characters (\u0900-\u097F)
    const devanagariMatches = text.match(/[\u0900-\u097F]/g);
    const devanagariCount = devanagariMatches ? devanagariMatches.length : 0;

    // Count Latin alphabet characters
    const latinMatches = text.match(/[A-Za-z]/g);
    const latinCount = latinMatches ? latinMatches.length : 0;

    const totalLetters = devanagariCount + latinCount;
    if (totalLetters === 0) return 'en';

    const devanagariRatio = devanagariCount / totalLetters;
    const latinRatio = latinCount / totalLetters;

    if (devanagariRatio > 0.65) {
      return 'hi';
    }
    if (devanagariRatio > 0.08 && latinRatio > 0.08) {
      return 'mixed';
    }
    return 'en';
  }

  /**
   * Detects block type from text pattern and heuristics
   */
  classifyBlockType(text: string, defaultType: ExtractedBlockType = 'paragraph'): ExtractedBlockType {
    const trimmed = text.trim();
    if (!trimmed) return defaultType;

    // 1. Heading detection
    if (/^(#{1,6}\s+|chapter\s+\d+|section\s+\d+|unit\s+\d+|part\s+[ivxlcdm\d]+|अध्याय\s+\d+|खंड\s+\d+)/i.test(trimmed)) {
      return 'heading';
    }
    // Short all-caps line (< 80 chars) without trailing period
    if (trimmed.length < 80 && trimmed === trimmed.toUpperCase() && /^[A-Z0-9\s\-:–—]+$/.test(trimmed) && !trimmed.endsWith('.')) {
      return 'heading';
    }

    // 2. Question detection
    if (/^(question\s*\d*[:.]|q\s*\d*[:.]|q\.\s*\d+|q\s*[-–—]|problem\s*\d*[:.]|exercise\s*\d*[:.]|प्रश्न\s*\d*[:.]|प्र\.\s*\d+)/i.test(trimmed)) {
      return 'question';
    }
    if (trimmed.endsWith('?') && trimmed.length < 200 && /^(what|why|how|when|where|who|which|explain|calculate|find|prove|is|are|can|क्या|क्यों|कैसे|कब|कहाँ|किस)/i.test(trimmed)) {
      return 'question';
    }

    // 3. Answer detection
    if (/^(answer\s*\d*[:.]|ans\s*\d*[:.]|ans\.\s*\d+|solution\s*\d*[:.]|sol\s*\d*[:.]|soln\s*[:.]|उत्तर\s*\d*[:.]|हल\s*\d*[:.])/i.test(trimmed)) {
      return 'answer';
    }

    // 4. Example detection
    if (/^(example\s*\d*[:.]|eg\s*[:.]|e\.g\.|illustration\s*\d*[:.]|case\s+study\s*\d*[:.]|उदाहरण\s*\d*[:.])/i.test(trimmed)) {
      return 'example';
    }

    // 5. Table detection
    if (/^\|(.+\|)+$/.test(trimmed) || (trimmed.split('\n').filter(l => l.includes('\t')).length > 1)) {
      return 'table';
    }

    // 6. Equation detection
    if (
      trimmed.startsWith('$$') ||
      trimmed.startsWith('\\[') ||
      /\\(frac|sum|int|sqrt|prod|alpha|beta|gamma|theta|omega|partial|nabla|infty)/i.test(trimmed) ||
      /^([A-Za-z]\s*=\s*[^,.\n]+|E\s*=\s*mc\^?2|a\^2\s*\+\s*b\^2\s*=\s*c\^2)/i.test(trimmed)
    ) {
      return 'equation';
    }

    // 7. List detection
    if (/^([\-*•–—]\s+|\d+[.)]\s+|[a-zA-Z][.)]\s+|\([ivxlcdm\d]+\)\s+)/.test(trimmed)) {
      return 'list';
    }

    return defaultType;
  }

  /**
   * Generates a deterministic or structured block ID
   */
  generateBlockId(documentId: string, sequence: number): string {
    const cleanDoc = documentId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
    return `blk_${cleanDoc}_s${sequence}`;
  }

  /**
   * Assembles the standard ExtractedDocumentResult with hierarchy summary
   */
  buildResult(
    context: ExtractionContext,
    format: ExtractedDocumentFormat,
    blocks: ExtractedBlock[],
    pageCount: number,
    rawText: string,
    warnings: string[] = []
  ): ExtractedDocumentResult {
    const language = this.detectLanguage(rawText);
    const totalCharacters = rawText.length;

    // Build section hierarchy from headings
    const sections: { title: string; blockCount: number; pageStart?: number; pageEnd?: number }[] = [];
    let currentSection: { title: string; blockCount: number; pageStart?: number; pageEnd?: number } | null = null;

    for (const block of blocks) {
      if (block.type === 'heading') {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          title: block.content.replace(/^#+\s*/, '').trim(),
          blockCount: 1,
          pageStart: block.pageNumber,
          pageEnd: block.pageNumber,
        };
      } else if (currentSection) {
        currentSection.blockCount++;
        if (block.pageNumber && (!currentSection.pageEnd || block.pageNumber > currentSection.pageEnd)) {
          currentSection.pageEnd = block.pageNumber;
        }
      }
    }
    if (currentSection) {
      sections.push(currentSection);
    }

    // Default overview section if no headings detected
    if (sections.length === 0 && blocks.length > 0) {
      sections.push({
        title: 'Document Overview',
        blockCount: blocks.length,
        pageStart: blocks[0]?.pageNumber || 1,
        pageEnd: blocks[blocks.length - 1]?.pageNumber || 1,
      });
    }

    return {
      documentId: context.documentId,
      documentVersionId: context.documentVersionId,
      format,
      language,
      pageCount: Math.max(pageCount, 1),
      totalBlocks: blocks.length,
      totalCharacters,
      blocks,
      rawText,
      hierarchy: { sections },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

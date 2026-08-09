/**
 * MarkdownExtractor
 * Phase 2B: Document Extraction for Markdown (.md) Files
 * 
 * Supports:
 * - Markdown heading hierarchy (#, ##, ###)
 * - Bullet lists, ordered lists, task lists
 * - Markdown tables (| header | header |)
 * - LaTeX math equations ($$ ... $$, \\[ ... \\])
 * - Blockquotes, examples, Q&A blocks
 * - Multilingual Markdown (Hindi, English, Mixed)
 */

import { BaseExtractor, ExtractionContext, ExtractionError } from './BaseExtractor';
import { ExtractedBlock, ExtractedBlockType, ExtractedDocumentResult } from '../types';

export class MarkdownExtractor extends BaseExtractor {
  readonly format = 'MD';

  async extract(buffer: Buffer, context: ExtractionContext): Promise<ExtractedDocumentResult> {
    if (!buffer || buffer.length === 0) {
      throw new ExtractionError('EMPTY_DOCUMENT', `The document ${context.filename} is empty (0 bytes).`, 400);
    }

    const text = buffer.toString('utf-8');
    if (!text.trim()) {
      throw new ExtractionError('EMPTY_DOCUMENT', `The document ${context.filename} contains only whitespace.`, 400);
    }

    const lines = text.split(/\r?\n/);
    const blocks: ExtractedBlock[] = [];
    let sequence = 0;
    let currentHeading = 'Document';
    let currentSection = 'Overview';

    let bufferLines: string[] = [];
    let bufferType: ExtractedBlockType = 'paragraph';
    let startLine = 1;
    let inCodeBlock = false;
    let inTable = false;
    let inEquationBlock = false;

    const flushBuffer = () => {
      if (bufferLines.length === 0) return;
      const content = bufferLines.join('\n').trim();
      if (content.length > 0) {
        if (bufferType === 'heading') {
          currentHeading = content.replace(/^#+\s*/, '').trim();
          currentSection = currentHeading;
        }

        blocks.push({
          documentId: context.documentId,
          documentVersionId: context.documentVersionId,
          blockId: this.generateBlockId(context.documentId, sequence),
          type: bufferType,
          content,
          pageNumber: 1,
          section: currentSection,
          heading: currentHeading,
          sequence,
          sourceLocation: {
            pageNumber: 1,
            lineStart: startLine,
            lineEnd: startLine + bufferLines.length - 1,
            charStart: 0,
            charEnd: content.length,
          },
        });
        sequence++;
      }
      bufferLines = [];
      bufferType = 'paragraph';
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const currentLineNum = i + 1;

      // Handle Code block boundaries ```
      if (trimmed.startsWith('```')) {
        if (!inCodeBlock) {
          flushBuffer();
          inCodeBlock = true;
          startLine = currentLineNum;
          bufferType = 'paragraph';
          bufferLines.push(line);
        } else {
          bufferLines.push(line);
          inCodeBlock = false;
          flushBuffer();
        }
        continue;
      }
      if (inCodeBlock) {
        bufferLines.push(line);
        continue;
      }

      // Handle Display Math block boundaries $$
      if (trimmed.startsWith('$$') || trimmed === '\\[') {
        if (!inEquationBlock) {
          flushBuffer();
          inEquationBlock = true;
          startLine = currentLineNum;
          bufferType = 'equation';
          bufferLines.push(line);
          if (trimmed.endsWith('$$') && trimmed.length > 2) {
            inEquationBlock = false;
            flushBuffer();
          }
        } else {
          bufferLines.push(line);
          inEquationBlock = false;
          flushBuffer();
        }
        continue;
      }
      if (inEquationBlock) {
        bufferLines.push(line);
        continue;
      }

      // Handle Markdown Table lines | ... |
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        if (!inTable) {
          flushBuffer();
          inTable = true;
          startLine = currentLineNum;
          bufferType = 'table';
        }
        bufferLines.push(line);
        continue;
      } else if (inTable) {
        inTable = false;
        flushBuffer();
      }

      // Empty line breaks paragraphs
      if (!trimmed) {
        flushBuffer();
        startLine = currentLineNum + 1;
        continue;
      }

      // Heading line (# Heading)
      if (/^#{1,6}\s+/.test(trimmed)) {
        flushBuffer();
        startLine = currentLineNum;
        bufferType = 'heading';
        bufferLines.push(trimmed);
        flushBuffer();
        continue;
      }

      // List line (- item, * item, 1. item)
      if (/^([\-*•]\s+|\d+\.\s+)/.test(trimmed)) {
        if (bufferType !== 'list') {
          flushBuffer();
          startLine = currentLineNum;
          bufferType = 'list';
        }
        bufferLines.push(trimmed);
        continue;
      } else if (bufferType === 'list') {
        flushBuffer();
      }

      // Question / Answer / Example
      const classified = this.classifyBlockType(trimmed);
      if (['question', 'answer', 'example', 'equation'].includes(classified)) {
        flushBuffer();
        startLine = currentLineNum;
        bufferType = classified;
        bufferLines.push(trimmed);
        flushBuffer();
        continue;
      }

      // Standard Paragraph
      if (bufferLines.length === 0) {
        startLine = currentLineNum;
        bufferType = 'paragraph';
      }
      bufferLines.push(trimmed);
    }

    flushBuffer();

    return this.buildResult(context, 'MD', blocks, 1, text);
  }
}

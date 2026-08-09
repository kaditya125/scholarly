/**
 * DocxExtractor
 * Phase 2B: Document Extraction for DOCX Files
 * 
 * Uses mammoth for structured Word OpenXML processing.
 * Preserves structural hierarchy, headings, lists, tables, and paragraphs.
 */

import mammoth from 'mammoth';
import { BaseExtractor, ExtractionContext, ExtractionError } from './BaseExtractor';
import { ExtractedBlock, ExtractedBlockType, ExtractedDocumentResult } from '../types';

export class DocxExtractor extends BaseExtractor {
  readonly format = 'DOCX';

  async extract(buffer: Buffer, context: ExtractionContext): Promise<ExtractedDocumentResult> {
    if (!buffer || buffer.length === 0) {
      throw new ExtractionError('EMPTY_DOCUMENT', `The document ${context.filename} is empty (0 bytes).`, 400);
    }

    // Verify Zip magic header "PK\x03\x04"
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
      throw new ExtractionError('CORRUPTED_DOCUMENT', `File ${context.filename} is not a valid DOCX document or is corrupted.`, 400);
    }

    let rawText = '';
    let blocks: ExtractedBlock[] = [];
    const warnings: string[] = [];

    try {
      // 1. Extract raw text for language detection and overall raw representation
      const rawResult = await mammoth.extractRawText({ buffer });
      rawText = (rawResult.value || '').trim();

      if (rawResult.messages && rawResult.messages.length > 0) {
        for (const msg of rawResult.messages) {
          if (msg.type === 'warning') {
            warnings.push(msg.message);
          }
        }
      }

      // 2. Extract HTML to preserve semantic elements like <h1>..<h6>, <li>, <table>, <p>
      const htmlResult = await mammoth.convertToHtml({ buffer });
      const html = htmlResult.value || '';

      blocks = this.parseHtmlToBlocks(html, rawText, context);
    } catch (err: any) {
      if (err instanceof ExtractionError) throw err;
      throw new ExtractionError('EXTRACTION_FAILED', `Failed to parse DOCX document ${context.filename}: ${err.message}`, 422);
    }

    if (blocks.length === 0 && rawText.length > 0) {
      blocks = [
        {
          documentId: context.documentId,
          documentVersionId: context.documentVersionId,
          blockId: this.generateBlockId(context.documentId, 0),
          type: 'paragraph',
          content: rawText,
          pageNumber: 1,
          section: 'Document Body',
          heading: 'Document Body',
          sequence: 0,
          sourceLocation: {
            pageNumber: 1,
            lineStart: 1,
            lineEnd: rawText.split('\n').length,
            charStart: 0,
            charEnd: rawText.length,
          },
        },
      ];
    }

    return this.buildResult(context, 'DOCX', blocks, 1, rawText, warnings);
  }

  private parseHtmlToBlocks(html: string, fallbackRaw: string, context: ExtractionContext): ExtractedBlock[] {
    const blocks: ExtractedBlock[] = [];
    let sequence = 0;
    let currentHeading = 'Document Body';
    let currentSection = 'Overview';

    // Split by block tags (<h1-6>, <p>, <li>, <table>, <blockquote>)
    const blockRegex = /<(h[1-6]|p|li|table|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;
    let lineCounter = 1;

    while ((match = blockRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      let innerContent = match[2]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '') // strip inner formatting tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

      if (!innerContent) continue;

      let type: ExtractedBlockType = 'paragraph';
      if (tag.startsWith('h')) {
        type = 'heading';
        currentHeading = innerContent;
        currentSection = currentHeading;
      } else if (tag === 'li') {
        type = 'list';
      } else if (tag === 'table') {
        type = 'table';
      } else {
        type = this.classifyBlockType(innerContent);
        if (type === 'heading') {
          currentHeading = innerContent;
          currentSection = currentHeading;
        }
      }

      const lines = innerContent.split('\n').length;
      blocks.push({
        documentId: context.documentId,
        documentVersionId: context.documentVersionId,
        blockId: this.generateBlockId(context.documentId, sequence),
        type,
        content: innerContent,
        pageNumber: 1,
        section: currentSection,
        heading: currentHeading,
        sequence,
        sourceLocation: {
          pageNumber: 1,
          lineStart: lineCounter,
          lineEnd: lineCounter + lines - 1,
          charStart: 0,
          charEnd: innerContent.length,
        },
      });

      lineCounter += lines;
      sequence++;
    }

    return blocks;
  }
}

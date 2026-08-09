/**
 * HtmlExtractor
 * Phase 2B: Document Extraction for HTML Documents (.html, .htm)
 * 
 * Supports:
 * - Structural tag parsing (h1..h6, p, ul/ol/li, table, blockquote, pre)
 * - Heading hierarchy preservation
 * - Entity decoding and tag stripping
 * - Multilingual HTML (Hindi, English, Mixed)
 */

import { BaseExtractor, ExtractionContext, ExtractionError } from './BaseExtractor';
import { ExtractedBlock, ExtractedBlockType, ExtractedDocumentResult } from '../types';

export class HtmlExtractor extends BaseExtractor {
  readonly format = 'HTML';

  async extract(buffer: Buffer, context: ExtractionContext): Promise<ExtractedDocumentResult> {
    if (!buffer || buffer.length === 0) {
      throw new ExtractionError('EMPTY_DOCUMENT', `The document ${context.filename} is empty (0 bytes).`, 400);
    }

    const html = buffer.toString('utf-8');
    if (!html.trim()) {
      throw new ExtractionError('EMPTY_DOCUMENT', `The document ${context.filename} contains only whitespace.`, 400);
    }

    // Strip scripts and styles
    const cleanHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    const blocks: ExtractedBlock[] = [];
    let sequence = 0;
    let currentHeading = 'HTML Document';
    let currentSection = 'Overview';

    // Match structural block elements
    const blockRegex = /<(h[1-6]|p|li|table|blockquote|pre)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;
    let lineCounter = 1;
    let fullRawText = '';

    while ((match = blockRegex.exec(cleanHtml)) !== null) {
      const tag = match[1].toLowerCase();
      let inner = match[2]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

      if (!inner) continue;

      let type: ExtractedBlockType = 'paragraph';
      if (tag.startsWith('h')) {
        type = 'heading';
        currentHeading = inner;
        currentSection = currentHeading;
      } else if (tag === 'li') {
        type = 'list';
      } else if (tag === 'table') {
        type = 'table';
      } else {
        type = this.classifyBlockType(inner);
        if (type === 'heading') {
          currentHeading = inner;
          currentSection = currentHeading;
        }
      }

      const lines = inner.split('\n').length;
      blocks.push({
        documentId: context.documentId,
        documentVersionId: context.documentVersionId,
        blockId: this.generateBlockId(context.documentId, sequence),
        type,
        content: inner,
        pageNumber: 1,
        section: currentSection,
        heading: currentHeading,
        sequence,
        sourceLocation: {
          pageNumber: 1,
          lineStart: lineCounter,
          lineEnd: lineCounter + lines - 1,
          charStart: 0,
          charEnd: inner.length,
        },
      });

      fullRawText += (fullRawText ? '\n\n' : '') + inner;
      lineCounter += lines;
      sequence++;
    }

    if (blocks.length === 0) {
      // Fallback if HTML has no standard block tags
      const plain = cleanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (plain.length > 0) {
        blocks.push({
          documentId: context.documentId,
          documentVersionId: context.documentVersionId,
          blockId: this.generateBlockId(context.documentId, 0),
          type: 'paragraph',
          content: plain,
          pageNumber: 1,
          section: 'Document Body',
          heading: 'Document Body',
          sequence: 0,
          sourceLocation: {
            pageNumber: 1,
            lineStart: 1,
            lineEnd: 1,
            charStart: 0,
            charEnd: plain.length,
          },
        });
        fullRawText = plain;
      }
    }

    return this.buildResult(context, 'HTML', blocks, 1, fullRawText);
  }
}

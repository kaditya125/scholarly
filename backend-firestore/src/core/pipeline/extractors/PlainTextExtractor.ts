/**
 * PlainTextExtractor
 * Phase 2B: Document Extraction for Plain Text (.txt) Files
 * 
 * Supports:
 * - Paragraph segmentation
 * - Natural heading and section recognition
 * - Numbered/bullet lists, questions, answers, equations, examples
 * - Hindi, English, and Mixed language text
 */

import { BaseExtractor, ExtractionContext, ExtractionError } from './BaseExtractor';
import { ExtractedBlock, ExtractedBlockType, ExtractedDocumentResult } from '../types';

export class PlainTextExtractor extends BaseExtractor {
  readonly format = 'TXT';

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
    let currentHeading = 'Text Document';
    let currentSection = 'Overview';

    let paragraphLines: string[] = [];
    let startLine = 1;
    let lineCounter = 1;

    const flushParagraph = (typeOverride?: ExtractedBlockType) => {
      if (paragraphLines.length === 0) return;
      const content = paragraphLines.join('\n').trim();
      if (content.length > 0) {
        const type = typeOverride || this.classifyBlockType(content);
        if (type === 'heading') {
          currentHeading = content.replace(/^#+\s*/, '').trim();
          currentSection = currentHeading;
        }

        blocks.push({
          documentId: context.documentId,
          documentVersionId: context.documentVersionId,
          blockId: this.generateBlockId(context.documentId, sequence),
          type,
          content,
          pageNumber: 1,
          section: currentSection,
          heading: currentHeading,
          sequence,
          sourceLocation: {
            pageNumber: 1,
            lineStart: startLine,
            lineEnd: lineCounter - 1,
            charStart: 0,
            charEnd: content.length,
          },
        });
        sequence++;
      }
      paragraphLines = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      lineCounter++;

      if (!trimmed) {
        flushParagraph();
        startLine = lineCounter;
        continue;
      }

      const standaloneType = this.classifyBlockType(trimmed);
      if (['heading', 'question', 'answer', 'example'].includes(standaloneType)) {
        flushParagraph();
        startLine = lineCounter - 1;
        paragraphLines.push(trimmed);
        flushParagraph(standaloneType);
        startLine = lineCounter;
      } else if (standaloneType === 'list') {
        flushParagraph();
        startLine = lineCounter - 1;
        paragraphLines.push(trimmed);
        flushParagraph('list');
        startLine = lineCounter;
      } else {
        if (paragraphLines.length === 0) {
          startLine = lineCounter - 1;
        }
        paragraphLines.push(trimmed);
      }
    }

    flushParagraph();

    return this.buildResult(context, 'TXT', blocks, 1, text);
  }
}

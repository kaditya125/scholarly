/**
 * PdfExtractor
 * Phase 2B: Document Extraction for PDF Documents
 * 
 * Supports:
 * - Single-page & multi-page PDFs
 * - Text-heavy academic & scientific PDFs
 * - Page-by-page lineage preservation (pageNumber, lineStart, lineEnd)
 * - Multilingual support (Hindi, English, Mixed)
 * - Equation, question, answer, list, and heading semantic categorization
 */

import { BaseExtractor, ExtractionContext, ExtractionError } from './BaseExtractor';
import { ExtractedBlock, ExtractedBlockType, ExtractedDocumentResult } from '../types';

export class PdfExtractor extends BaseExtractor {
  readonly format = 'PDF';

  async extract(buffer: Buffer, context: ExtractionContext): Promise<ExtractedDocumentResult> {
    if (!buffer || buffer.length === 0) {
      throw new ExtractionError('EMPTY_DOCUMENT', `The document ${context.filename} is empty (0 bytes).`, 400);
    }

    // Verify PDF header magic bytes "%PDF-"
    const header = buffer.slice(0, 8).toString('utf-8');
    if (!header.startsWith('%PDF')) {
      throw new ExtractionError('CORRUPTED_DOCUMENT', `File ${context.filename} is not a valid PDF or is corrupted.`, 400);
    }

    let pagesData: { pageNumber: number; text: string }[] = [];
    let fullRawText = '';
    const warnings: string[] = [];

    try {
      // Dynamic import to handle pdf-parse CJS export safely
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParseModule = require('pdf-parse');
      
      if (typeof pdfParseModule.PDFParse === 'function') {
        const parser = new pdfParseModule.PDFParse({ data: new Uint8Array(buffer) });
        try {
          const result = await parser.getText();
          fullRawText = result.text || '';
          if (Array.isArray(result.pages) && result.pages.length > 0) {
            pagesData = result.pages.map((p: any) => ({
              pageNumber: p.num ?? 1,
              text: (p.text || '').trim(),
            }));
          }
        } finally {
          if (typeof parser.destroy === 'function') {
            try { await parser.destroy(); } catch { /* ignore */ }
          }
        }
      } else if (typeof pdfParseModule === 'function') {
        const data = await pdfParseModule(buffer);
        fullRawText = data.text || '';
        pagesData = [{ pageNumber: 1, text: fullRawText.trim() }];
      } else {
        throw new Error('Unsupported pdf-parse module structure');
      }
    } catch (err: any) {
      // Check if corrupted or password protected
      if (err.name === 'PasswordException' || err.message?.includes('password')) {
        throw new ExtractionError('PASSWORD_PROTECTED', `The PDF ${context.filename} is password-protected.`, 422);
      }
      if (err instanceof ExtractionError) {
        throw err;
      }
      throw new ExtractionError('EXTRACTION_FAILED', `Failed to parse PDF document ${context.filename}: ${err.message}`, 422);
    }

    if (pagesData.length === 0) {
      if (fullRawText.trim().length > 0) {
        pagesData = [{ pageNumber: 1, text: fullRawText.trim() }];
      } else {
        warnings.push('No selectable text layer found in PDF. Document might be scanned or image-based.');
      }
    }

    const blocks: ExtractedBlock[] = [];
    let sequence = 0;
    let currentHeading = 'Introduction';
    let currentSection = 'Overview';

    for (const page of pagesData) {
      const lines = page.text.split(/\r?\n/);
      let paragraphBuffer: string[] = [];
      let startLine = 1;
      let lineCounter = 1;

      const flushParagraph = (typeOverride?: ExtractedBlockType) => {
        if (paragraphBuffer.length === 0) return;
        const content = paragraphBuffer.join('\n').trim();
        if (content.length > 0) {
          const type = typeOverride || this.classifyBlockType(content);
          if (type === 'heading') {
            currentHeading = content.replace(/^#+\s*/, '').trim();
            currentSection = currentHeading;
          }

          const block: ExtractedBlock = {
            documentId: context.documentId,
            documentVersionId: context.documentVersionId,
            blockId: this.generateBlockId(context.documentId, sequence),
            type,
            content,
            pageNumber: page.pageNumber,
            section: currentSection,
            heading: currentHeading,
            sequence,
            sourceLocation: {
              pageNumber: page.pageNumber,
              lineStart: startLine,
              lineEnd: lineCounter - 1,
              charStart: 0,
              charEnd: content.length,
            },
          };

          blocks.push(block);
          sequence++;
        }
        paragraphBuffer = [];
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        lineCounter++;

        if (!trimmed) {
          // Empty line indicates paragraph boundary
          flushParagraph();
          startLine = lineCounter;
          continue;
        }

        // Check if this line is an independent structural block
        const standaloneType = this.classifyBlockType(trimmed);
        if (standaloneType === 'heading' || standaloneType === 'question' || standaloneType === 'answer' || standaloneType === 'example') {
          flushParagraph();
          startLine = lineCounter - 1;
          paragraphBuffer.push(trimmed);
          flushParagraph(standaloneType);
          startLine = lineCounter;
        } else if (standaloneType === 'list') {
          flushParagraph();
          startLine = lineCounter - 1;
          paragraphBuffer.push(trimmed);
          flushParagraph('list');
          startLine = lineCounter;
        } else {
          if (paragraphBuffer.length === 0) {
            startLine = lineCounter - 1;
          }
          paragraphBuffer.push(trimmed);
        }
      }

      flushParagraph();
    }

    const pageCount = pagesData.length > 0 ? Math.max(...pagesData.map(p => p.pageNumber)) : 1;
    return this.buildResult(context, 'PDF', blocks, pageCount, fullRawText, warnings);
  }
}

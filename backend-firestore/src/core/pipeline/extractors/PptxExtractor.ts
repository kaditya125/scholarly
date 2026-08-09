/**
 * PptxExtractor
 * Phase 2B: Document Extraction for PowerPoint (PPTX) Presentations
 * 
 * Extracts slides slide-by-slide, preserving:
 * - Slide numbers (slideNumber, pageNumber)
 * - Slide titles and heading hierarchy
 * - Bullet lists, content shapes, and tables
 * - Multi-language content (Hindi, English, Mixed)
 */

import * as zlib from 'zlib';
import { BaseExtractor, ExtractionContext, ExtractionError } from './BaseExtractor';
import { ExtractedBlock, ExtractedBlockType, ExtractedDocumentResult } from '../types';

interface ZipFileEntry {
  filename: string;
  data: Buffer;
}

export class PptxExtractor extends BaseExtractor {
  readonly format = 'PPTX';

  async extract(buffer: Buffer, context: ExtractionContext): Promise<ExtractedDocumentResult> {
    if (!buffer || buffer.length === 0) {
      throw new ExtractionError('EMPTY_DOCUMENT', `The document ${context.filename} is empty (0 bytes).`, 400);
    }

    // Verify Zip magic header "PK\x03\x04"
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
      throw new ExtractionError('CORRUPTED_DOCUMENT', `File ${context.filename} is not a valid PPTX presentation or is corrupted.`, 400);
    }

    let entries: ZipFileEntry[] = [];
    try {
      entries = this.unzipBuffer(buffer);
    } catch (err: any) {
      throw new ExtractionError('CORRUPTED_DOCUMENT', `Failed to decompress PPTX presentation ${context.filename}: ${err.message}`, 400);
    }

    // Find all slide XML files: ppt/slides/slide1.xml, slide2.xml, etc.
    const slideEntries = entries
      .filter(e => /^ppt\/slides\/slide\d+\.xml$/i.test(e.filename))
      .sort((a, b) => {
        const numA = parseInt(a.filename.match(/\d+/)![0], 10);
        const numB = parseInt(b.filename.match(/\d+/)![0], 10);
        return numA - numB;
      });

    if (slideEntries.length === 0) {
      // If no standard slide XML files found, check for presentation.xml or notes
      const presEntry = entries.find(e => /presentation\.xml$/i.test(e.filename));
      if (!presEntry) {
        throw new ExtractionError('INVALID_PPTX_STRUCTURE', `No slides found in PPTX presentation ${context.filename}.`, 422);
      }
    }

    const blocks: ExtractedBlock[] = [];
    let fullRawText = '';
    let sequence = 0;
    let slideCounter = 1;

    for (const slide of slideEntries) {
      const slideNum = parseInt(slide.filename.match(/\d+/)![0], 10) || slideCounter;
      const xml = slide.data.toString('utf-8');
      const slideBlocks = this.parseSlideXml(xml, slideNum, sequence, context);

      for (const block of slideBlocks) {
        blocks.push(block);
        fullRawText += (fullRawText ? '\n\n' : '') + `[Slide ${slideNum}] ` + block.content;
        sequence++;
      }

      slideCounter++;
    }

    const slideCount = Math.max(slideEntries.length, 1);
    return this.buildResult(context, 'PPTX', blocks, slideCount, fullRawText);
  }

  private parseSlideXml(xml: string, slideNumber: number, startSequence: number, context: ExtractionContext): ExtractedBlock[] {
    const blocks: ExtractedBlock[] = [];
    let seq = startSequence;
    let slideTitle = `Slide ${slideNumber}`;

    // Extract paragraphs inside <a:p>...</a:p>
    const paragraphRegex = /<a:p(?:\s+[^>]*)?>([\s\S]*?)<\/a:p>/gi;
    let match: RegExpExecArray | null;
    let lineInSlide = 1;

    while ((match = paragraphRegex.exec(xml)) !== null) {
      const pXml = match[1];

      // Extract all text inside <a:t>...</a:t>
      const textMatches = pXml.match(/<a:t(?:\s+[^>]*)?>([\s\S]*?)<\/a:t>/gi) || [];
      const text = textMatches
        .map(t => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))
        .join('')
        .trim();

      if (!text) continue;

      let type: ExtractedBlockType = 'paragraph';
      if (lineInSlide === 1 && text.length < 120) {
        type = 'heading';
        slideTitle = text;
      } else {
        type = this.classifyBlockType(text);
        if (type === 'heading') {
          slideTitle = text;
        }
      }

      blocks.push({
        documentId: context.documentId,
        documentVersionId: context.documentVersionId,
        blockId: this.generateBlockId(context.documentId, seq),
        type,
        content: text,
        pageNumber: slideNumber,
        section: `Slide ${slideNumber}`,
        heading: slideTitle,
        sequence: seq,
        sourceLocation: {
          pageNumber: slideNumber,
          slideNumber,
          lineStart: lineInSlide,
          lineEnd: lineInSlide,
          charStart: 0,
          charEnd: text.length,
        },
      });

      seq++;
      lineInSlide++;
    }

    return blocks;
  }

  /**
   * Lightweight pure-Node PKZIP buffer extractor
   */
  private unzipBuffer(buffer: Buffer): ZipFileEntry[] {
    const entries: ZipFileEntry[] = [];
    let offset = 0;

    while (offset < buffer.length - 30) {
      // Look for Local File Header signature 0x04034b50 (PK\x03\x04)
      const sig = buffer.readUInt32LE(offset);
      if (sig !== 0x04034b50) {
        break; // Reached end of local file headers or central directory
      }

      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraFieldLength = buffer.readUInt16LE(offset + 28);

      const filename = buffer.toString('utf-8', offset + 30, offset + 30 + fileNameLength);
      const dataOffset = offset + 30 + fileNameLength + extraFieldLength;
      const compressedData = buffer.slice(dataOffset, dataOffset + compressedSize);

      let uncompressedData: Buffer;
      if (compressionMethod === 0) {
        // Stored (no compression)
        uncompressedData = compressedData;
      } else if (compressionMethod === 8) {
        // Deflated
        try {
          uncompressedData = zlib.inflateRawSync(compressedData);
        } catch {
          // If raw inflate fails, continue to next file
          uncompressedData = Buffer.alloc(0);
        }
      } else {
        uncompressedData = compressedData;
      }

      if (filename && !filename.endsWith('/')) {
        entries.push({ filename, data: uncompressedData });
      }

      offset = dataOffset + compressedSize;
    }

    return entries;
  }
}

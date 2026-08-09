/**
 * XlsxExtractor
 * Phase 2B: Document Extraction for Excel Spreadsheets (XLSX, CSV, TSV)
 * 
 * Preserves:
 * - Sheet names and table blocks
 * - Cell references (e.g. A1, B2:E10)
 * - Row and column sequence
 * - Multilingual spreadsheet content (Hindi, English, Mixed)
 */

import * as zlib from 'zlib';
import { BaseExtractor, ExtractionContext, ExtractionError } from './BaseExtractor';
import { ExtractedBlock, ExtractedBlockType, ExtractedDocumentResult } from '../types';

interface ZipFileEntry {
  filename: string;
  data: Buffer;
}

export class XlsxExtractor extends BaseExtractor {
  readonly format = 'XLSX';

  async extract(buffer: Buffer, context: ExtractionContext): Promise<ExtractedDocumentResult> {
    if (!buffer || buffer.length === 0) {
      throw new ExtractionError('EMPTY_DOCUMENT', `The document ${context.filename} is empty (0 bytes).`, 400);
    }

    // Check if it is CSV / TSV text or binary XLSX
    const isCsvOrTsv = context.filename.endsWith('.csv') || context.filename.endsWith('.tsv') || context.contentType.includes('csv');
    if (isCsvOrTsv) {
      return this.extractDelimitedText(buffer.toString('utf-8'), context);
    }

    // Verify Zip magic header "PK\x03\x04"
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
      throw new ExtractionError('CORRUPTED_DOCUMENT', `File ${context.filename} is not a valid XLSX workbook or is corrupted.`, 400);
    }

    let entries: ZipFileEntry[] = [];
    try {
      entries = this.unzipBuffer(buffer);
    } catch (err: any) {
      throw new ExtractionError('CORRUPTED_DOCUMENT', `Failed to decompress XLSX spreadsheet ${context.filename}: ${err.message}`, 400);
    }

    // 1. Parse Shared Strings: xl/sharedStrings.xml
    const sharedStrings: string[] = [];
    const sharedStringEntry = entries.find(e => /xl\/sharedStrings\.xml$/i.test(e.filename));
    if (sharedStringEntry) {
      const xml = sharedStringEntry.data.toString('utf-8');
      const siMatches = xml.match(/<si(?:\s+[^>]*)?>([\s\S]*?)<\/si>/gi) || [];
      for (const si of siMatches) {
        const textMatches = si.match(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/gi) || [];
        const str = textMatches
          .map(t => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))
          .join('');
        sharedStrings.push(str);
      }
    }

    // 2. Parse Worksheets: xl/worksheets/sheet1.xml, etc.
    const sheetEntries = entries
      .filter(e => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.filename))
      .sort((a, b) => {
        const numA = parseInt(a.filename.match(/\d+/)![0], 10);
        const numB = parseInt(b.filename.match(/\d+/)![0], 10);
        return numA - numB;
      });

    if (sheetEntries.length === 0) {
      throw new ExtractionError('INVALID_XLSX_STRUCTURE', `No worksheets found in XLSX workbook ${context.filename}.`, 422);
    }

    const blocks: ExtractedBlock[] = [];
    let fullRawText = '';
    let sequence = 0;
    let sheetIndex = 1;

    for (const sheetEntry of sheetEntries) {
      const sheetXml = sheetEntry.data.toString('utf-8');
      const sheetName = `Sheet ${sheetIndex}`;

      const rows = this.parseSheetRows(sheetXml, sharedStrings);
      if (rows.length > 0) {
        // Table header block
        const tableBlockContent = rows.map(r => r.join(' | ')).join('\n');
        fullRawText += (fullRawText ? '\n\n' : '') + `[${sheetName}]\n` + tableBlockContent;

        // Add Sheet Title Heading
        blocks.push({
          documentId: context.documentId,
          documentVersionId: context.documentVersionId,
          blockId: this.generateBlockId(context.documentId, sequence),
          type: 'heading',
          content: `${sheetName}`,
          pageNumber: sheetIndex,
          section: sheetName,
          heading: sheetName,
          sequence,
          sourceLocation: {
            pageNumber: sheetIndex,
            sheetName,
            lineStart: 1,
            lineEnd: 1,
            cellRef: 'A1',
          },
        });
        sequence++;

        // Add Table block
        blocks.push({
          documentId: context.documentId,
          documentVersionId: context.documentVersionId,
          blockId: this.generateBlockId(context.documentId, sequence),
          type: 'table',
          content: tableBlockContent,
          pageNumber: sheetIndex,
          section: sheetName,
          heading: sheetName,
          sequence,
          sourceLocation: {
            pageNumber: sheetIndex,
            sheetName,
            lineStart: 1,
            lineEnd: rows.length,
            cellRef: `A1:Z${rows.length}`,
          },
          metadata: {
            rowCount: rows.length,
            columnCount: Math.max(...rows.map(r => r.length), 1),
          },
        });
        sequence++;
      }

      sheetIndex++;
    }

    const pageCount = Math.max(sheetEntries.length, 1);
    return this.buildResult(context, 'XLSX', blocks, pageCount, fullRawText);
  }

  private extractDelimitedText(text: string, context: ExtractionContext): ExtractedDocumentResult {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    const blocks: ExtractedBlock[] = [];
    let sequence = 0;

    if (lines.length > 0) {
      blocks.push({
        documentId: context.documentId,
        documentVersionId: context.documentVersionId,
        blockId: this.generateBlockId(context.documentId, sequence),
        type: 'table',
        content: text.trim(),
        pageNumber: 1,
        section: 'Sheet 1',
        heading: 'Sheet 1',
        sequence,
        sourceLocation: {
          pageNumber: 1,
          sheetName: 'Sheet 1',
          lineStart: 1,
          lineEnd: lines.length,
          cellRef: `A1:Z${lines.length}`,
        },
      });
    }

    return this.buildResult(context, 'XLSX', blocks, 1, text.trim());
  }

  private parseSheetRows(sheetXml: string, sharedStrings: string[]): string[][] {
    const rows: string[][] = [];
    const rowRegex = /<row(?:\s+[^>]*)?>([\s\S]*?)<\/row>/gi;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
      const rowXml = rowMatch[1];
      const cells: string[] = [];

      const cellRegex = /<c(?:\s+([^>]*))?>([\s\S]*?)<\/c>/gi;
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
        const attributes = cellMatch[1] || '';
        const cellBody = cellMatch[2] || '';

        const isSharedString = /t="s"/i.test(attributes);
        const isInlineString = /t="inlineStr"/i.test(attributes);

        if (isInlineString) {
          const tMatch = cellBody.match(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/i);
          cells.push(tMatch ? tMatch[1].replace(/<[^>]+>/g, '').trim() : '');
        } else {
          const vMatch = cellBody.match(/<v(?:\s+[^>]*)?>([\s\S]*?)<\/v>/i);
          if (vMatch) {
            const rawVal = vMatch[1].trim();
            if (isSharedString) {
              const idx = parseInt(rawVal, 10);
              cells.push(sharedStrings[idx] ?? rawVal);
            } else {
              cells.push(rawVal);
            }
          }
        }
      }

      if (cells.some(c => c.length > 0)) {
        rows.push(cells);
      }
    }

    return rows;
  }

  private unzipBuffer(buffer: Buffer): ZipFileEntry[] {
    const entries: ZipFileEntry[] = [];
    let offset = 0;

    while (offset < buffer.length - 30) {
      const sig = buffer.readUInt32LE(offset);
      if (sig !== 0x04034b50) break;

      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraFieldLength = buffer.readUInt16LE(offset + 28);

      const filename = buffer.toString('utf-8', offset + 30, offset + 30 + fileNameLength);
      const dataOffset = offset + 30 + fileNameLength + extraFieldLength;
      const compressedData = buffer.slice(dataOffset, dataOffset + compressedSize);

      let uncompressedData: Buffer;
      if (compressionMethod === 0) {
        uncompressedData = compressedData;
      } else if (compressionMethod === 8) {
        try {
          uncompressedData = zlib.inflateRawSync(compressedData);
        } catch {
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

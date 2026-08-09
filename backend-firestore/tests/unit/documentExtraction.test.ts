/**
 * Content Pipeline Phase 2B: Document Extraction Automated Test Suite
 * 
 * Tests all 11 required scenarios:
 * 1. Normal PDF
 * 2. Multi-page PDF
 * 3. Text-heavy PDF
 * 4. DOCX
 * 5. PPTX
 * 6. XLSX
 * 7. Hindi
 * 8. English
 * 9. Mixed Hindi-English (Bilingual / Hinglish)
 * 10. Empty document
 * 11. Corrupted document
 */

import { DocumentExtractionService } from '../../src/core/pipeline/DocumentExtractionService';
import { ExtractionError } from '../../src/core/pipeline/extractors/BaseExtractor';
import { PdfExtractor } from '../../src/core/pipeline/extractors/PdfExtractor';
import { DocxExtractor } from '../../src/core/pipeline/extractors/DocxExtractor';
import { PptxExtractor } from '../../src/core/pipeline/extractors/PptxExtractor';
import { XlsxExtractor } from '../../src/core/pipeline/extractors/XlsxExtractor';
import { PlainTextExtractor } from '../../src/core/pipeline/extractors/PlainTextExtractor';
import { MarkdownExtractor } from '../../src/core/pipeline/extractors/MarkdownExtractor';
import { HtmlExtractor } from '../../src/core/pipeline/extractors/HtmlExtractor';
import * as zlib from 'zlib';

// Mock pdf-parse
jest.mock('pdf-parse', () => {
  return {
    PDFParse: jest.fn().mockImplementation(({ data }: { data: Uint8Array }) => {
      const buffer = Buffer.from(data);
      const str = buffer.toString('utf-8');

      // Multi-page simulation
      if (str.includes('PAGE_BREAK')) {
        const parts = str.split('PAGE_BREAK');
        return {
          getText: jest.fn().mockResolvedValue({
            text: str.replace(/PAGE_BREAK/g, '\n'),
            pages: parts.map((part, idx) => ({
              num: idx + 1,
              text: part.trim(),
            })),
          }),
          destroy: jest.fn().mockResolvedValue(true),
        };
      }

      // Default single page
      return {
        getText: jest.fn().mockResolvedValue({
          text: str.replace(/^%PDF-1\.[0-7]/, '').trim(),
          pages: [
            {
              num: 1,
              text: str.replace(/^%PDF-1\.[0-7]/, '').trim(),
            },
          ],
        }),
        destroy: jest.fn().mockResolvedValue(true),
      };
    }),
  };
});

// Mock mammoth
jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockImplementation(async ({ buffer }: { buffer: Buffer }) => {
    const text = buffer.toString('utf-8');
    return { value: text.replace(/^PK\x03\x04/, '').trim(), messages: [] };
  }),
  convertToHtml: jest.fn().mockImplementation(async ({ buffer }: { buffer: Buffer }) => {
    const text = buffer.toString('utf-8').replace(/^PK\x03\x04/, '').trim();
    const html = `<h1>Title</h1><p>${text}</p><ul><li>Point 1</li><li>Point 2</li></ul>`;
    return { value: html, messages: [] };
  }),
}));

// Mock Tesseract.js — Phase 2B tests exercise text extraction only (not OCR).
// The DocumentExtractionService defaults to enableIntelligentOcr:true, but
// we mock Tesseract here so it returns an empty result if the quality gate ever
// fires for sparse mock content in DOCX/PPTX/XLSX scenarios.
jest.mock('tesseract.js', () => ({
  recognize: jest.fn().mockResolvedValue({ data: { text: '', confidence: 0 } }),
}));

describe('Content Pipeline Phase 2B: Document Extraction Test Suite', () => {
  let extractionService: DocumentExtractionService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Disable Intelligent OCR so Phase 2B tests exercise extraction only
    extractionService = new DocumentExtractionService();
  });

  // Helper to create valid zip buffer containing files
  const createMockZip = (files: { [filename: string]: string }): Buffer => {
    const buffers: Buffer[] = [];
    for (const [filename, content] of Object.entries(files)) {
      const dataBuf = Buffer.from(content, 'utf-8');
      const filenameBuf = Buffer.from(filename, 'utf-8');

      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0, 6);
      header.writeUInt16LE(0, 8); // No compression (stored)
      header.writeUInt16LE(0, 10);
      header.writeUInt16LE(0, 12);
      header.writeUInt32LE(0, 14); // CRC32
      header.writeUInt32LE(dataBuf.length, 18); // Compressed size
      header.writeUInt32LE(dataBuf.length, 22); // Uncompressed size
      header.writeUInt16LE(filenameBuf.length, 26);
      header.writeUInt16LE(0, 28);

      buffers.push(header, filenameBuf, dataBuf);
    }
    return Buffer.concat(buffers);
  };

  describe('Scenario 1: Normal PDF Extraction', () => {
    it('should extract structured blocks and preserve page lineage for a standard PDF', async () => {
      const pdfContent = '%PDF-1.4\n# Chapter 1: Introduction to Mechanics\nClassical mechanics is the study of motion of bodies.\n\nF = m * a';
      const buffer = Buffer.from(pdfContent, 'utf-8');

      const result = await extractionService.extractFromBuffer(buffer, 'mechanics.pdf', 'doc_pdf_1', 'v1', '', { enableIntelligentOcr: false });

      expect(result.format).toBe('PDF');
      expect(result.totalBlocks).toBeGreaterThan(0);
      expect(result.blocks[0].pageNumber).toBe(1);
      expect(result.blocks[0].sourceLocation.pageNumber).toBe(1);
      expect(result.language).toBe('en');
    });
  });

  describe('Scenario 2: Multi-Page PDF Extraction', () => {
    it('should extract across multiple pages and preserve individual page numbers', async () => {
      const pdfContent = '%PDF-1.4\nPage 1 Content: Introduction to ThermodynamicsPAGE_BREAKPage 2 Content: First Law of ThermodynamicsPAGE_BREAKPage 3 Content: Heat Engines and Carnot Cycle';
      const buffer = Buffer.from(pdfContent, 'utf-8');

      const result = await extractionService.extractFromBuffer(buffer, 'thermodynamics.pdf', 'doc_pdf_multi', 'v1', '', { enableIntelligentOcr: false });

      expect(result.pageCount).toBe(3);
      expect(result.blocks.some(b => b.pageNumber === 1)).toBe(true);
      expect(result.blocks.some(b => b.pageNumber === 2)).toBe(true);
      expect(result.blocks.some(b => b.pageNumber === 3)).toBe(true);
    });
  });

  describe('Scenario 3: Text-Heavy Academic PDF Extraction', () => {
    it('should classify headings, equations, questions, answers, and examples', async () => {
      const pdfContent = '%PDF-1.4\n# CHAPTER 4: QUANTUM MECHANICS\n\nQuestion 1: What is the energy of a photon?\n\nAnswer: E = h * nu\n\nExample 1: Calculate frequency for wavelength 500nm.';
      const buffer = Buffer.from(pdfContent, 'utf-8');

      const result = await extractionService.extractFromBuffer(buffer, 'quantum.pdf', 'doc_pdf_heavy', 'v1', '', { enableIntelligentOcr: false });

      const blockTypes = result.blocks.map(b => b.type);
      expect(blockTypes).toContain('heading');
      expect(blockTypes).toContain('question');
      expect(blockTypes).toContain('answer');
      expect(blockTypes).toContain('example');
    });
  });

  describe('Scenario 4: DOCX Extraction', () => {
    it('should extract headings, paragraphs, and list items from Word documents', async () => {
      const docxHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
      const body = Buffer.from('Cellular Biology and Cell Division', 'utf-8');
      const buffer = Buffer.concat([docxHeader, body]);

      const result = await extractionService.extractFromBuffer(buffer, 'biology.docx', 'doc_docx_1', 'v1', '', { enableIntelligentOcr: false });

      expect(result.format).toBe('DOCX');
      expect(result.blocks.length).toBeGreaterThan(0);
      expect(result.blocks.some(b => b.type === 'heading')).toBe(true);
      expect(result.blocks.some(b => b.type === 'list')).toBe(true);
    });
  });

  describe('Scenario 5: PPTX Extraction', () => {
    it('should extract slide-by-slide OpenXML presentation content with slide numbers', async () => {
      const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:spTree xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <a:p><a:r><a:t>Introduction to Machine Learning</a:t></a:r></a:p>
        <a:p><a:r><a:t>- Supervised Learning</a:t></a:r></a:p>
        <a:p><a:r><a:t>- Unsupervised Learning</a:t></a:r></a:p>
      </p:spTree>`;

      const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:spTree xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <a:p><a:r><a:t>Neural Networks Architecture</a:t></a:r></a:p>
        <a:p><a:r><a:t>Deep learning models use multilayer perceptrons.</a:t></a:r></a:p>
      </p:spTree>`;

      const zipBuf = createMockZip({
        'ppt/slides/slide1.xml': slide1Xml,
        'ppt/slides/slide2.xml': slide2Xml,
      });

      const result = await extractionService.extractFromBuffer(zipBuf, 'lecture.pptx', 'doc_pptx_1', 'v1', '', { enableIntelligentOcr: false });

      expect(result.format).toBe('PPTX');
      expect(result.pageCount).toBe(2);
      expect(result.blocks.length).toBeGreaterThan(0);
      expect(result.blocks[0].sourceLocation.slideNumber).toBe(1);
    });
  });

  describe('Scenario 6: XLSX Extraction', () => {
    it('should extract spreadsheet rows, table blocks, and cell reference coordinates', async () => {
      const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <si><t>Student Name</t></si>
        <si><t>Score</t></si>
        <si><t>Alice</t></si>
        <si><t>Bob</t></si>
      </sst>`;

      const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1">
            <c r="A1" t="s"><v>0</v></c>
            <c r="B1" t="s"><v>1</v></c>
          </row>
          <row r="2">
            <c r="A2" t="s"><v>2</v></c>
            <c r="B2"><v>95</v></c>
          </row>
          <row r="3">
            <c r="A3" t="s"><v>3</v></c>
            <c r="B3"><v>88</v></c>
          </row>
        </sheetData>
      </worksheet>`;

      const zipBuf = createMockZip({
        'xl/sharedStrings.xml': sharedStringsXml,
        'xl/worksheets/sheet1.xml': sheet1Xml,
      });

      const result = await extractionService.extractFromBuffer(zipBuf, 'grades.xlsx', 'doc_xlsx_1', 'v1', '', { enableIntelligentOcr: false });

      expect(result.format).toBe('XLSX');
      expect(result.blocks.some(b => b.type === 'table')).toBe(true);
      expect(result.rawText).toContain('Student Name');
      expect(result.rawText).toContain('Alice');
    });
  });

  describe('Scenario 7: Hindi Language Detection and Extraction', () => {
    it('should detect Hindi language for Devanagari text and extract semantic blocks', async () => {
      const hindiText = `# अध्याय 1: प्रकाश संश्लेषण\n\nप्रकाश संश्लेषण एक जैव रासायनिक प्रक्रिया है जिसमें पौधे सूर्य के प्रकाश का उपयोग करते हैं।\n\nप्रश्न 1: क्लोरोफिल का मुख्य कार्य क्या है?\n\nउत्तर: क्लोरोफिल प्रकाश ऊर्जा को रासायनिक ऊर्जा में परिवर्तित करता है।`;
      const buffer = Buffer.from(hindiText, 'utf-8');

      const result = await extractionService.extractFromBuffer(buffer, 'biology_hindi.txt', 'doc_hi_1', 'v1', '', { enableIntelligentOcr: false });

      expect(result.language).toBe('hi');
      expect(result.blocks.some(b => b.type === 'heading')).toBe(true);
      expect(result.blocks.some(b => b.type === 'question')).toBe(true);
      expect(result.blocks.some(b => b.type === 'answer')).toBe(true);
    });
  });

  describe('Scenario 8: English Language Detection and Extraction', () => {
    it('should detect English language and extract structured Markdown elements', async () => {
      const englishMd = `# Computer Networks\n\n| Layer | Protocol |\n| --- | --- |\n| Application | HTTP |\n| Transport | TCP |\n\n- Packet switching\n- Routing algorithms`;
      const buffer = Buffer.from(englishMd, 'utf-8');

      const result = await extractionService.extractFromBuffer(buffer, 'networks.md', 'doc_en_1', 'v1', '', { enableIntelligentOcr: false });

      expect(result.language).toBe('en');
      expect(result.format).toBe('MD');
      expect(result.blocks.some(b => b.type === 'table')).toBe(true);
      expect(result.blocks.some(b => b.type === 'list')).toBe(true);
    });
  });

  describe('Scenario 9: Mixed Hindi-English (Hinglish/Bilingual) Extraction', () => {
    it('should classify language as mixed when both Devanagari and Latin scripts exist in significant volume', async () => {
      const mixedText = `## Photosynthesis Process in Plants\n\nPhotosynthesis में chlorophyll सूर्य के प्रकाश (solar energy) को absorb करता है और chemical energy में convert करता है।\n\nQuestion: What is ATP synthesis?\nउत्तर: ATP synthesis mitochondrial membrane में होता है।`;
      const buffer = Buffer.from(mixedText, 'utf-8');

      const result = await extractionService.extractFromBuffer(buffer, 'hinglish_notes.md', 'doc_mixed_1', 'v1', '', { enableIntelligentOcr: false });

      expect(result.language).toBe('mixed');
      expect(result.blocks.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario 10: Empty Document Handling', () => {
    it('should throw EMPTY_DOCUMENT ExtractionError for empty buffers or whitespace', async () => {
      const emptyBuffer = Buffer.alloc(0);
      await expect(extractionService.extractFromBuffer(emptyBuffer, 'empty.pdf', 'doc_empty', 'v1', '', { enableIntelligentOcr: false })).rejects.toThrow(
        ExtractionError
      );

      const whitespaceBuffer = Buffer.from('   \n\t\n  ', 'utf-8');
      try {
        await extractionService.extractFromBuffer(whitespaceBuffer, 'empty.txt', 'doc_empty_txt', 'v1', '', { enableIntelligentOcr: false });
        fail('Should have thrown ExtractionError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ExtractionError);
        expect(err.code).toBe('EMPTY_DOCUMENT');
      }
    });
  });

  describe('Scenario 11: Corrupted Document Handling', () => {
    it('should throw CORRUPTED_DOCUMENT ExtractionError for non-PDF bytes claiming to be PDF', async () => {
      const corruptedPdf = Buffer.from('THIS_IS_NOT_A_PDF_HEADER_123456789', 'utf-8');
      try {
        await extractionService.extractFromBuffer(corruptedPdf, 'corrupt.pdf', 'doc_corrupt', 'v1', '', { enableIntelligentOcr: false });
        fail('Should have thrown ExtractionError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ExtractionError);
        expect(err.code).toBe('CORRUPTED_DOCUMENT');
      }
    });

    it('should throw CORRUPTED_DOCUMENT ExtractionError for invalid DOCX/PPTX/XLSX header', async () => {
      const invalidZip = Buffer.from('NOT_A_VALID_ZIP_ARCHIVE', 'utf-8');
      try {
        await extractionService.extractFromBuffer(invalidZip, 'corrupt.docx', 'doc_corrupt_docx', 'v1', '', { enableIntelligentOcr: false });
        fail('Should have thrown ExtractionError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ExtractionError);
        expect(err.code).toBe('CORRUPTED_DOCUMENT');
      }

      try {
        await extractionService.extractFromBuffer(invalidZip, 'corrupt.pptx', 'doc_corrupt_pptx', 'v1', '', { enableIntelligentOcr: false });
        fail('Should have thrown ExtractionError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ExtractionError);
        expect(err.code).toBe('CORRUPTED_DOCUMENT');
      }
    });
  });
});

/**
 * Content Pipeline Phase 2C: Intelligent OCR Automated Test Suite
 * 
 * Tests all 8 required scenarios:
 * 1. Normal text PDF -> OCR should NOT run unnecessarily
 * 2. Scanned PDF -> OCR should run
 * 3. Mixed PDF -> OCR only where required (selective per-page)
 * 4. Hindi scanned PDF -> Devanagari OCR & language classification
 * 5. English scanned PDF -> English OCR & language classification
 * 6. OCR failure -> error handling and fallback
 * 7. OCR timeout -> timeout guard and error code
 * 8. Retry -> exponential backoff retry on transient failure
 */

import { DocumentExtractionService } from '../../src/core/pipeline/DocumentExtractionService';
import { IntelligentOcrService, OcrError } from '../../src/core/pipeline/ocr/IntelligentOcrService';
import { OcrQualityAssessor } from '../../src/core/pipeline/ocr/OcrQualityAssessor';
import { OcrMerger } from '../../src/core/pipeline/ocr/OcrMerger';
import Tesseract from 'tesseract.js';

// Mock Tesseract
jest.mock('tesseract.js', () => ({
  recognize: jest.fn(),
}));

// Mock pdf-parse
jest.mock('pdf-parse', () => {
  return {
    PDFParse: jest.fn().mockImplementation(({ data }: { data: Uint8Array }) => {
      const buffer = Buffer.from(data);
      const str = buffer.toString('utf-8');

      if (str.includes('MIXED_SCANNED_PAGE_2')) {
        const p1Text = '# Chapter 2: Newton Laws of Motion\n\nClassical mechanics deals with the motion of bodies under the influence of forces. Isaac Newton formulated the three laws of motion in the Philosophiae Naturalis Principia Mathematica in 1687.';
        return {
          getText: jest.fn().mockResolvedValue({
            text: p1Text + '\n\n',
            pages: [
              { num: 1, text: p1Text },
              { num: 2, text: '' }, // Scanned / image-only page
            ],
          }),
          destroy: jest.fn().mockResolvedValue(true),
        };
      }

      if (str.includes('SCANNED_PDF_ZERO_TEXT')) {
        return {
          getText: jest.fn().mockResolvedValue({
            text: '',
            pages: [{ num: 1, text: '' }],
          }),
          destroy: jest.fn().mockResolvedValue(true),
        };
      }

      // Default normal searchable text
      return {
        getText: jest.fn().mockResolvedValue({
          text: str.replace(/^%PDF-1\.[0-7]/, '').trim(),
          pages: [{ num: 1, text: str.replace(/^%PDF-1\.[0-7]/, '').trim() }],
        }),
        destroy: jest.fn().mockResolvedValue(true),
      };
    }),
  };
});

describe('Content Pipeline Phase 2C: Intelligent OCR Test Suite', () => {
  let extractionService: DocumentExtractionService;
  let ocrService: IntelligentOcrService;
  let qualityAssessor: OcrQualityAssessor;
  let ocrMerger: OcrMerger;

  beforeEach(() => {
    jest.clearAllMocks();
    qualityAssessor = new OcrQualityAssessor();
    ocrService = new IntelligentOcrService();
    ocrMerger = new OcrMerger();
    extractionService = new DocumentExtractionService(
      undefined as any,
      ocrService,
      qualityAssessor,
      ocrMerger
    );
  });

  describe('Scenario 1: Normal text PDF → OCR should NOT run unnecessarily', () => {
    it('should bypass OCR completely when document extraction produces high-quality text', async () => {
      const richText = '%PDF-1.4\n# Chapter 1: Introduction to Mechanics\nClassical mechanics describes the motion of macroscopic objects from projectiles to parts of machinery.\n\nIsaac Newton developed the three fundamental laws of classical mechanics in 1687.\n\nQuestion 1: What is Newton Second Law?\nAnswer: Force equals mass times acceleration (F = ma).';
      const buffer = Buffer.from(richText, 'utf-8');

      const result = await extractionService.extractFromBuffer(buffer, 'mechanics.pdf', 'doc_text_pdf');

      // Tesseract recognize should NOT have been called
      expect(Tesseract.recognize).not.toHaveBeenCalled();
      expect(result.ocrMetadata).toBeUndefined();
      expect(result.totalBlocks).toBeGreaterThan(0);
      expect(result.totalCharacters).toBeGreaterThan(150);
    });
  });

  describe('Scenario 2: Scanned PDF → OCR should run', () => {
    it('should detect zero/low text density, trigger OCR, and merge extracted content', async () => {
      (Tesseract.recognize as jest.Mock).mockResolvedValueOnce({
        data: {
          text: '# Scanned Chapter: Organic Chemistry\n\nHydrocarbons are organic compounds containing carbon and hydrogen.',
          confidence: 92,
        },
      });

      const scannedPdfContent = '%PDF-1.4\nSCANNED_PDF_ZERO_TEXT';
      const buffer = Buffer.from(scannedPdfContent, 'utf-8');

      const result = await extractionService.extractFromBuffer(buffer, 'scanned_chemistry.pdf', 'doc_scanned_pdf');

      expect(Tesseract.recognize).toHaveBeenCalledTimes(1);
      expect(result.ocrMetadata?.applied).toBe(true);
      expect(result.ocrMetadata?.pagesProcessed).toEqual([1]);
      expect(result.blocks.some(b => b.type === 'heading')).toBe(true);
      expect(result.rawText).toContain('Organic Chemistry');
    });
  });

  describe('Scenario 3: Mixed PDF → OCR only where required', () => {
    it('should selectively run OCR only on image-only pages and preserve clean text pages', async () => {
      (Tesseract.recognize as jest.Mock).mockResolvedValueOnce({
        data: {
          text: 'Page 2 OCR Content: Diagrams and annotations on Thermodynamics.',
          confidence: 88,
        },
      });

      const mixedPdfContent = '%PDF-1.4\nMIXED_SCANNED_PAGE_2';
      const buffer = Buffer.from(mixedPdfContent, 'utf-8');

      const result = await extractionService.extractFromBuffer(buffer, 'mixed_lecture.pdf', 'doc_mixed_pdf');

      // Should only run OCR for page 2
      expect(Tesseract.recognize).toHaveBeenCalledTimes(1);
      expect(result.ocrMetadata?.applied).toBe(true);
      expect(result.ocrMetadata?.pagesProcessed).toEqual([2]);

      // Verify Page 1 retained original text and Page 2 received OCR text
      expect(result.blocks.some(b => b.pageNumber === 1 && b.content.includes('Newton Laws'))).toBe(true);
      expect(result.blocks.some(b => b.pageNumber === 2 && b.content.includes('Thermodynamics'))).toBe(true);
    });
  });

  describe('Scenario 4: Hindi scanned PDF', () => {
    it('should recognize Devanagari script and set language to Hindi with OCR confidence', async () => {
      (Tesseract.recognize as jest.Mock).mockResolvedValueOnce({
        data: {
          text: '# अध्याय 2: गुरुत्वाकर्षण\n\nगुरुत्वाकर्षण एक प्राकृतिक घटना है जिसके द्वारा सभी वस्तुएं एक दूसरे को आकर्षित करती हैं।\n\nप्रश्न 1: गुरुत्वाकर्षण नियतांक G का मान क्या है?\nउत्तर: 6.674 * 10^-11 N m^2/kg^2',
          confidence: 94,
        },
      });

      const hindiImageBuffer = Buffer.from('HINDI_SCANNED_PAGE_BYTES', 'utf-8');

      const ocrResult = await ocrService.processImageBuffer(hindiImageBuffer, 'doc_hindi_scan', 'v1', {
        languageHint: 'hi',
        pageNumber: 1,
      });

      expect(Tesseract.recognize).toHaveBeenCalledWith(hindiImageBuffer, 'hin');
      expect(ocrResult.language).toBe('hi');
      expect(ocrResult.averageConfidence).toBe(0.94);
      expect(ocrResult.blocks.some(b => b.type === 'heading')).toBe(true);
      expect(ocrResult.blocks.some(b => b.type === 'question')).toBe(true);
      expect(ocrResult.blocks.some(b => b.type === 'answer')).toBe(true);
    });
  });

  describe('Scenario 5: English scanned PDF', () => {
    it('should extract English academic text and maintain line-level coordinates and confidence', async () => {
      (Tesseract.recognize as jest.Mock).mockResolvedValueOnce({
        data: {
          text: '# Computer Science: Data Structures\n\nA binary search tree is a rooted binary tree data structure.',
          confidence: 96,
        },
      });

      const englishImageBuffer = Buffer.from('ENGLISH_SCANNED_BYTES', 'utf-8');

      const ocrResult = await ocrService.processImageBuffer(englishImageBuffer, 'doc_en_scan', 'v1', {
        languageHint: 'en',
        pageNumber: 1,
      });

      expect(Tesseract.recognize).toHaveBeenCalledWith(englishImageBuffer, 'eng');
      expect(ocrResult.language).toBe('en');
      expect(ocrResult.averageConfidence).toBe(0.96);
      expect(ocrResult.blocks[0].sourceLocation.pageNumber).toBe(1);
    });
  });

  describe('Scenario 6: OCR Failure Handling', () => {
    it('should handle OCR library failure gracefully and throw structured OcrError', async () => {
      (Tesseract.recognize as jest.Mock).mockRejectedValue(new Error('Corrupted image stream / unreadable format'));

      const corruptedBuffer = Buffer.from('INVALID_IMAGE_BYTES', 'utf-8');

      try {
        await ocrService.processImageBuffer(corruptedBuffer, 'doc_fail', 'v1', {
          maxRetries: 0,
        });
        fail('Should have thrown OcrError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(OcrError);
        expect(err.code).toBe('OCR_FAILED');
      }
    });
  });

  describe('Scenario 7: OCR Timeout Handling', () => {
    it('should abort and throw OCR_TIMEOUT when processing exceeds timeoutMs threshold', async () => {
      (Tesseract.recognize as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 500)) // 500ms delay
      );

      const buffer = Buffer.from('TIMEOUT_IMAGE_BYTES', 'utf-8');

      try {
        await ocrService.processImageBuffer(buffer, 'doc_timeout', 'v1', {
          timeoutMs: 50, // 50ms timeout threshold
          maxRetries: 0,
        });
        fail('Should have thrown OCR_TIMEOUT error');
      } catch (err: any) {
        expect(err).toBeInstanceOf(OcrError);
        expect(err.code).toBe('OCR_TIMEOUT');
      }
    });
  });

  describe('Scenario 8: Retry on Transient Failure', () => {
    it('should retry on initial failure and succeed when subsequent attempt passes', async () => {
      (Tesseract.recognize as jest.Mock)
        .mockRejectedValueOnce(new Error('Transient worker spawn error'))
        .mockResolvedValueOnce({
          data: {
            text: '# Recovered Chapter\n\nContent parsed after transient worker retry.',
            confidence: 91,
          },
        });

      const buffer = Buffer.from('RETRY_IMAGE_BYTES', 'utf-8');

      const result = await ocrService.processImageBuffer(buffer, 'doc_retry', 'v1', {
        maxRetries: 2,
      });

      expect(Tesseract.recognize).toHaveBeenCalledTimes(2);
      expect(result.averageConfidence).toBe(0.91);
      expect(result.rawText).toContain('Recovered Chapter');
    });
  });
});

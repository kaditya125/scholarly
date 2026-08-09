/**
 * DocumentExtractionService
 * Phase 2B & 2C: Central Document Extraction & Intelligent OCR Orchestrator
 * 
 * Routes uploaded documents to specialized format extractors:
 * - PDF: PdfExtractor
 * - DOCX: DocxExtractor
 * - PPTX: PptxExtractor
 * - XLSX/CSV/TSV: XlsxExtractor
 * - TXT: PlainTextExtractor
 * - Markdown: MarkdownExtractor
 * - HTML: HtmlExtractor
 * 
 * Quality Gate & Intelligent OCR:
 * - Automatically assesses extraction quality (character count, text density, image-only pages, confidence)
 * - Bypasses OCR on high-quality text documents (fast path)
 * - Triggers selective OCR only on scanned/image-only pages where required
 * - Merges OCR blocks preserving page lineage and document hierarchy
 */

import { BaseExtractor, ExtractionContext, ExtractionError } from './extractors/BaseExtractor';
import { PdfExtractor } from './extractors/PdfExtractor';
import { DocxExtractor } from './extractors/DocxExtractor';
import { PptxExtractor } from './extractors/PptxExtractor';
import { XlsxExtractor } from './extractors/XlsxExtractor';
import { PlainTextExtractor } from './extractors/PlainTextExtractor';
import { MarkdownExtractor } from './extractors/MarkdownExtractor';
import { HtmlExtractor } from './extractors/HtmlExtractor';
import { OcrQualityAssessor } from './ocr/OcrQualityAssessor';
import { IntelligentOcrService, OcrExecutionOptions } from './ocr/IntelligentOcrService';
import { OcrMerger } from './ocr/OcrMerger';
import {
  ExtractedDocumentFormat,
  ExtractedDocumentResult,
  OcrQualityMetrics,
  OcrResult,
} from './types';
import { ContentStorageService } from './ContentStorageService';
import { db } from '../../config/firebase';

export interface ExtractionOptions {
  enableIntelligentOcr?: boolean;
  ocrOptions?: OcrExecutionOptions;
  forceOcr?: boolean;
}

export class DocumentExtractionService {
  private readonly extractors: Map<ExtractedDocumentFormat, BaseExtractor>;
  private readonly storageService: ContentStorageService;
  private readonly qualityAssessor: OcrQualityAssessor;
  private readonly ocrService: IntelligentOcrService;
  private readonly ocrMerger: OcrMerger;

  constructor(
    storageService = new ContentStorageService(),
    ocrService = new IntelligentOcrService(),
    qualityAssessor = new OcrQualityAssessor(),
    ocrMerger = new OcrMerger()
  ) {
    this.storageService = storageService;
    this.ocrService = ocrService;
    this.qualityAssessor = qualityAssessor;
    this.ocrMerger = ocrMerger;

    this.extractors = new Map<ExtractedDocumentFormat, BaseExtractor>([
      ['PDF', new PdfExtractor()],
      ['DOCX', new DocxExtractor()],
      ['PPTX', new PptxExtractor()],
      ['XLSX', new XlsxExtractor()],
      ['TXT', new PlainTextExtractor()],
      ['MD', new MarkdownExtractor()],
      ['HTML', new HtmlExtractor()],
    ]);
  }

  /**
   * Identifies the document format from filename and mimeType
   */
  resolveFormat(filename: string, mimeType = ''): ExtractedDocumentFormat {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const mime = (mimeType || '').toLowerCase();

    if (ext === 'pdf' || mime.includes('pdf')) return 'PDF';
    if (ext === 'docx' || mime.includes('wordprocessingml') || ext === 'doc') return 'DOCX';
    if (ext === 'pptx' || mime.includes('presentationml') || ext === 'ppt') return 'PPTX';
    if (ext === 'xlsx' || mime.includes('spreadsheetml') || ext === 'csv' || ext === 'tsv' || ext === 'xls') return 'XLSX';
    if (ext === 'md' || ext === 'markdown') return 'MD';
    if (ext === 'html' || ext === 'htm' || mime.includes('html')) return 'HTML';
    if (ext === 'txt' || mime.includes('text/plain')) return 'TXT';

    return 'TXT';
  }

  /**
   * Evaluates text quality of an extraction result
   */
  assessQuality(result: ExtractedDocumentResult): OcrQualityMetrics {
    return this.qualityAssessor.assess(result);
  }

  /**
   * Extracts structured blocks and applies intelligent OCR if text quality is insufficient
   */
  async extractFromBuffer(
    buffer: Buffer,
    filename: string,
    documentId: string,
    documentVersionId = 'v1',
    mimeType = '',
    options: ExtractionOptions = { enableIntelligentOcr: true }
  ): Promise<ExtractedDocumentResult> {
    const format = this.resolveFormat(filename, mimeType);
    const extractor = this.extractors.get(format);

    if (!extractor) {
      throw new ExtractionError('UNSUPPORTED_FORMAT', `No extractor registered for format ${format}`, 400);
    }

    const context: ExtractionContext = {
      documentId,
      documentVersionId,
      filename,
      contentType: mimeType,
    };

    // 1. Run primary extraction
    const initialResult = await extractor.extract(buffer, context);

    // 2. If Intelligent OCR is disabled or not applicable, return primary extraction
    if (options.enableIntelligentOcr === false) {
      return initialResult;
    }

    // 3. Evaluate extraction quality gate
    const quality = this.qualityAssessor.assess(initialResult);

    // FAST PATH: If quality is sufficient and OCR is not forced, skip OCR completely
    if (!quality.requiresOcr && !options.forceOcr) {
      return initialResult;
    }

    // 4. Intelligent OCR Path: Process scanned or low-quality pages
    const ocrResults: OcrResult[] = [];
    const pagesToOcr = options.forceOcr
      ? Array.from({ length: initialResult.pageCount }, (_, i) => i + 1)
      : quality.pagesNeedingOcr;

    for (const pageNum of pagesToOcr) {
      try {
        const ocrResult = await this.ocrService.processImageBuffer(
          buffer,
          documentId,
          documentVersionId,
          {
            languageHint: initialResult.language,
            pageNumber: pageNum,
            ...options.ocrOptions,
          }
        );
        ocrResults.push(ocrResult);
      } catch (err: any) {
        // If OCR fails on a specific page, keep original extraction with warning
        if (!initialResult.warnings) initialResult.warnings = [];
        initialResult.warnings.push(`OCR failed on page ${pageNum}: ${err.message}`);
      }
    }

    // 5. Merge OCR results into structured document result
    if (ocrResults.length > 0) {
      return this.ocrMerger.merge(initialResult, ocrResults);
    }

    return initialResult;
  }

  /**
   * Downloads source from storage and executes extraction + intelligent OCR, storing in Firestore
   */
  async processSourceExtraction(
    userId: string,
    collectionId: string,
    sourceId: string,
    options: ExtractionOptions = { enableIntelligentOcr: true }
  ): Promise<ExtractedDocumentResult> {
    const sourceRef = db.collection('notebooks').doc(collectionId).collection('sources').doc(sourceId);
    const sourceDoc = await sourceRef.get();

    if (!sourceDoc.exists) {
      throw new ExtractionError('SOURCE_NOT_FOUND', `Source ${sourceId} not found in collection ${collectionId}`, 404);
    }

    const sourceData = sourceDoc.data()!;
    const filename = sourceData.originalName || sourceData.title || 'document';
    const storagePath = sourceData.storagePath;

    if (!storagePath) {
      throw new ExtractionError('STORAGE_PATH_MISSING', `Source ${sourceId} has no storage path`, 400);
    }

    // 1. Download buffer from storage
    const buffer = await this.storageService.downloadFileBuffer(storagePath);

    // 2. Perform Extraction & Intelligent OCR
    const startTime = Date.now();
    const result = await this.extractFromBuffer(
      buffer,
      filename,
      sourceId,
      `v${sourceData.version || 1}`,
      sourceData.contentType || '',
      options
    );
    const durationMs = Date.now() - startTime;

    // 3. Save extracted document in Firestore subcollection
    const extractedRef = sourceRef.collection('extracted').doc('latest');
    await extractedRef.set({
      ...result,
      extractedAt: new Date().toISOString(),
      durationMs,
    });

    // 4. Update ContentSource status and metrics
    await sourceRef.update({
      chunksExtracted: result.totalBlocks,
      status: 'READY',
      currentStage: 'COMPLETED',
      updatedAt: new Date().toISOString(),
    });

    return result;
  }
}

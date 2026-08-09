/**
 * OcrQualityAssessor
 * Phase 2C: Intelligent OCR Quality Assessment Gate
 * 
 * Determines whether normal extraction produced sufficient text quality
 * or if OCR is required (either for the entire document or specific pages).
 * 
 * Assesses:
 * - Extracted character count per page
 * - Text density & layout coverage
 * - Image-only and scanned pages
 * - Gibberish / corrupted character stream detection
 * - Extraction confidence score (0.0 to 1.0)
 */

import { ExtractedDocumentResult, OcrPageAssessment, OcrQualityMetrics } from '../types';

export class OcrQualityAssessor {
  private static readonly MIN_CHARS_PER_PAGE = 80;
  private static readonly IMAGE_ONLY_CHAR_LIMIT = 40;
  private static readonly HIGH_QUALITY_THRESHOLD = 0.75;

  /**
   * Evaluates the extracted document result and determines if OCR is required
   */
  assess(extractionResult: ExtractedDocumentResult): OcrQualityMetrics {
    const pageCount = Math.max(extractionResult.pageCount, 1);
    const pagesMap = new Map<number, string[]>();

    // Initialize all pages from 1 to pageCount
    for (let p = 1; p <= pageCount; p++) {
      pagesMap.set(p, []);
    }

    // Group blocks by pageNumber
    for (const block of extractionResult.blocks) {
      const pageNum = block.pageNumber || 1;
      if (!pagesMap.has(pageNum)) {
        pagesMap.set(pageNum, []);
      }
      pagesMap.get(pageNum)!.push(block.content);
    }

    const pageAssessments: OcrPageAssessment[] = [];
    const pagesNeedingOcr: number[] = [];
    let totalScore = 0;
    let pagesWithAdequateText = 0;

    for (let p = 1; p <= pageCount; p++) {
      const texts = pagesMap.get(p) || [];
      const pageText = texts.join(' ').trim();
      const charCount = pageText.length;

      const isImageOnly = charCount <= OcrQualityAssessor.IMAGE_ONLY_CHAR_LIMIT;
      const isGibberish = this.detectGibberish(pageText);

      let confidence = 0.0;
      let requiresOcr = false;
      let reason = 'Text extraction sufficient';

      if (charCount === 0) {
        confidence = 0.0;
        requiresOcr = true;
        reason = 'Page has zero extracted text (image-only or scanned)';
      } else if (isGibberish) {
        confidence = 0.15;
        requiresOcr = true;
        reason = 'Corrupted or gibberish text stream detected';
      } else if (isImageOnly) {
        confidence = 0.25;
        requiresOcr = true;
        reason = `Extremely low character count (${charCount} chars)`;
      } else if (charCount < OcrQualityAssessor.MIN_CHARS_PER_PAGE) {
        confidence = 0.55;
        requiresOcr = true;
        reason = `Sparse text coverage (${charCount} chars)`;
      } else {
        // High quality text page
        confidence = Math.min(0.85 + (charCount / 2000) * 0.15, 1.0);
        requiresOcr = false;
        pagesWithAdequateText++;
      }

      if (requiresOcr) {
        pagesNeedingOcr.push(p);
      }

      totalScore += confidence;

      pageAssessments.push({
        pageNumber: p,
        characterCount: charCount,
        textDensity: Math.min(charCount / 1200, 1.0),
        isImageOnly,
        confidence: Number(confidence.toFixed(2)),
        requiresOcr,
        reason,
      });
    }

    const overallQuality = Number((totalScore / pageCount).toFixed(2));
    const pageCoverage = Number((pagesWithAdequateText / pageCount).toFixed(2));
    const averageCharacterCountPerPage = Math.round(extractionResult.totalCharacters / pageCount);

    const requiresDocumentOcr = pagesNeedingOcr.length > 0 || overallQuality < OcrQualityAssessor.HIGH_QUALITY_THRESHOLD;

    let overallReason = 'Normal extraction produced high text quality. Fast-path bypassed OCR.';
    if (requiresDocumentOcr) {
      if (pagesNeedingOcr.length === pageCount) {
        overallReason = `Document is fully scanned or image-based (${pageCount} page(s) lack selectable text). Full OCR required.`;
      } else {
        overallReason = `Selective OCR required for ${pagesNeedingOcr.length} of ${pageCount} pages (pages: ${pagesNeedingOcr.join(', ')}).`;
      }
    }

    return {
      overallQuality,
      averageCharacterCountPerPage,
      pageCoverage,
      requiresOcr: requiresDocumentOcr,
      pagesNeedingOcr,
      pageAssessments,
      reason: overallReason,
    };
  }

  /**
   * Detects abnormal or non-printable character sequences indicative of failed font encodings
   */
  private detectGibberish(text: string): boolean {
    if (!text || text.length < 20) return false;

    // Replacement character \uFFFD or high concentration of unprintable characters
    const replacementMatches = text.match(/\uFFFD/g);
    if (replacementMatches && replacementMatches.length > 3) {
      return true;
    }

    // Ratio of non-alphanumeric/non-Devanagari/non-space symbols
    const totalChars = text.length;
    const abnormalChars = text.replace(/[\w\s\u0900-\u097F.,!?'"()\-:;/\\%=+*\[\]{}]/g, '').length;
    if (abnormalChars / totalChars > 0.25) {
      return true;
    }

    return false;
  }
}

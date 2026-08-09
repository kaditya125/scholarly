/**
 * OcrMerger
 * Phase 2C: Selective Block Merging & Lineage Preservation
 * 
 * Merges OCR-extracted blocks into the document result:
 * - Selectively replaces low-quality / image-only pages with OCR blocks
 * - Preserves existing high-quality extracted pages untouched
 * - Reindexes sequence monotonically
 * - Reconstructs document hierarchy, sections, and metadata
 */

import { ExtractedBlock, ExtractedDocumentResult, OcrResult } from '../types';

export class OcrMerger {
  /**
   * Merges OCR results into an existing ExtractedDocumentResult
   */
  merge(originalResult: ExtractedDocumentResult, ocrResults: OcrResult[]): ExtractedDocumentResult {
    if (!ocrResults || ocrResults.length === 0) {
      return originalResult;
    }

    const ocrPagesSet = new Set<number>();
    const ocrBlocksByPage = new Map<number, ExtractedBlock[]>();
    let totalConfidenceSum = 0;
    let totalOcrBlocks = 0;
    let totalOcrDurationMs = 0;

    for (const ocr of ocrResults) {
      totalOcrDurationMs += ocr.durationMs || 0;
      for (const p of ocr.pageNumbers) {
        ocrPagesSet.add(p);
      }

      for (const ob of ocr.blocks) {
        totalConfidenceSum += ob.confidence;
        totalOcrBlocks++;

        const block: ExtractedBlock = {
          documentId: originalResult.documentId,
          documentVersionId: originalResult.documentVersionId,
          blockId: ob.blockId,
          type: ob.type,
          content: ob.content,
          pageNumber: ob.pageNumber,
          section: `Page ${ob.pageNumber}`,
          heading: `Page ${ob.pageNumber}`,
          sequence: 0, // Will be reindexed
          sourceLocation: ob.sourceLocation,
          ocrConfidence: ob.confidence,
        };

        if (!ocrBlocksByPage.has(ob.pageNumber)) {
          ocrBlocksByPage.set(ob.pageNumber, []);
        }
        ocrBlocksByPage.get(ob.pageNumber)!.push(block);
      }
    }

    // Combine blocks: keep original blocks for non-OCR pages, use OCR blocks for OCR pages
    const combinedBlocks: ExtractedBlock[] = [];

    // 1. Keep original blocks for pages that didn't need OCR
    for (const block of originalResult.blocks) {
      const pageNum = block.pageNumber || 1;
      if (!ocrPagesSet.has(pageNum)) {
        combinedBlocks.push(block);
      }
    }

    // 2. Add OCR blocks for OCR-processed pages
    for (const pageNum of Array.from(ocrPagesSet).sort((a, b) => a - b)) {
      const pageBlocks = ocrBlocksByPage.get(pageNum) || [];
      combinedBlocks.push(...pageBlocks);
    }

    // 3. Sort by pageNumber and reindex sequence
    combinedBlocks.sort((a, b) => {
      const pA = a.pageNumber || 1;
      const pB = b.pageNumber || 1;
      if (pA !== pB) return pA - pB;
      const lA = a.sourceLocation?.lineStart || 0;
      const lB = b.sourceLocation?.lineStart || 0;
      return lA - lB;
    });

    let currentSection = 'Document Body';
    let currentHeading = 'Document Body';
    const sections: { title: string; blockCount: number; pageStart?: number; pageEnd?: number }[] = [];
    let currentSectionObj: { title: string; blockCount: number; pageStart?: number; pageEnd?: number } | null = null;

    for (let i = 0; i < combinedBlocks.length; i++) {
      const block = combinedBlocks[i];
      block.sequence = i;

      if (block.type === 'heading') {
        currentHeading = block.content.replace(/^#+\s*/, '').trim();
        currentSection = currentHeading;
        if (currentSectionObj) sections.push(currentSectionObj);
        currentSectionObj = {
          title: currentHeading,
          blockCount: 1,
          pageStart: block.pageNumber,
          pageEnd: block.pageNumber,
        };
      } else if (currentSectionObj) {
        currentSectionObj.blockCount++;
        if (block.pageNumber && (!currentSectionObj.pageEnd || block.pageNumber > currentSectionObj.pageEnd)) {
          currentSectionObj.pageEnd = block.pageNumber;
        }
      }

      block.heading = currentHeading;
      block.section = currentSection;
    }
    if (currentSectionObj) sections.push(currentSectionObj);

    if (sections.length === 0 && combinedBlocks.length > 0) {
      sections.push({
        title: 'Document Overview',
        blockCount: combinedBlocks.length,
        pageStart: combinedBlocks[0]?.pageNumber || 1,
        pageEnd: combinedBlocks[combinedBlocks.length - 1]?.pageNumber || 1,
      });
    }

    // Reconstruct raw text and language
    const rawText = combinedBlocks.map(b => b.content).join('\n\n');
    const averageConfidence = totalOcrBlocks > 0 ? Number((totalConfidenceSum / totalOcrBlocks).toFixed(2)) : 0.95;

    // Detect language across merged rawText
    const devanagariCount = (rawText.match(/[\u0900-\u097F]/g) || []).length;
    const latinCount = (rawText.match(/[A-Za-z]/g) || []).length;
    const total = devanagariCount + latinCount;
    let language: 'en' | 'hi' | 'mixed' = originalResult.language;

    if (total > 0) {
      const devRatio = devanagariCount / total;
      const latRatio = latinCount / total;
      if (devRatio > 0.65) language = 'hi';
      else if (devRatio > 0.08 && latRatio > 0.08) language = 'mixed';
      else language = 'en';
    }

    const pagesProcessed = Array.from(ocrPagesSet).sort((a, b) => a - b);

    return {
      documentId: originalResult.documentId,
      documentVersionId: originalResult.documentVersionId,
      format: originalResult.format,
      language,
      pageCount: originalResult.pageCount,
      totalBlocks: combinedBlocks.length,
      totalCharacters: rawText.length,
      blocks: combinedBlocks,
      rawText,
      hierarchy: { sections },
      warnings: originalResult.warnings,
      ocrMetadata: {
        applied: true,
        pagesProcessed,
        averageConfidence,
        durationMs: totalOcrDurationMs,
      },
    };
  }
}

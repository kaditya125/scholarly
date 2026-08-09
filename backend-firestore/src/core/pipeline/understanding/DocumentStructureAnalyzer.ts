/**
 * DocumentStructureAnalyzer
 * Phase 2D: Block-Level Document Structure Classification
 *
 * Transforms extracted flat blocks into a semantically typed document
 * structure using pattern matching and contextual signals.
 *
 * Identifies:
 * - title, chapter, section, subsection, heading
 * - paragraph, definition, example, theorem
 * - question, answer, exercise
 * - important_note, reference, summary
 *
 * Operates entirely offline (no AI call) using deterministic rules
 * for speed and reliability. AI-based enhancement is applied
 * only for ambiguous blocks in EducationalMetadataExtractor.
 */

import {
  ExtractedBlock,
  DocumentStructureBlock,
  DocumentStructureType,
} from '../types';

interface DocumentContext {
  currentChapter?: string;
  currentSection?: string;
  currentSubsection?: string;
  blockIndex: number;
  totalBlocks: number;
}

export class DocumentStructureAnalyzer {
  /**
   * Analyzes all extracted blocks and returns structurally annotated blocks
   * along with the document outline (title, chapters, sections).
   */
  analyze(blocks: ExtractedBlock[]): {
    structuredBlocks: DocumentStructureBlock[];
    documentOutline: {
      title?: string;
      chapters: { title: string; sections: string[]; pageStart?: number; pageEnd?: number }[];
    };
  } {
    const structuredBlocks: DocumentStructureBlock[] = [];
    const ctx: DocumentContext = {
      blockIndex: 0,
      totalBlocks: blocks.length,
    };

    let documentTitle: string | undefined;
    const chapters: { title: string; sections: string[]; pageStart?: number; pageEnd?: number }[] = [];
    let currentChapterObj: { title: string; sections: string[]; pageStart?: number; pageEnd?: number } | null = null;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      ctx.blockIndex = i;

      const structureType = this.classifyBlock(block, ctx, blocks);
      const confidence = this.scoreConfidence(block, structureType, ctx);

      // Track document hierarchy
      if (structureType === 'title' && i < 5) {
        documentTitle = block.content.replace(/^#+\s*/, '').trim();
        ctx.currentChapter = undefined;
        ctx.currentSection = undefined;
      } else if (structureType === 'chapter') {
        const chapterTitle = block.content.replace(/^(chapter\s*\d+[:.:-]?\s*|अध्याय\s*\d+[:.:-]?\s*)/i, '').replace(/^#+\s*/, '').trim();
        ctx.currentChapter = chapterTitle;
        ctx.currentSection = undefined;
        if (currentChapterObj) chapters.push(currentChapterObj);
        currentChapterObj = {
          title: chapterTitle,
          sections: [],
          pageStart: block.pageNumber,
          pageEnd: block.pageNumber,
        };
      } else if (structureType === 'section') {
        const sectionTitle = block.content.replace(/^#+\s*/, '').trim();
        ctx.currentSection = sectionTitle;
        if (currentChapterObj) {
          currentChapterObj.sections.push(sectionTitle);
          if (block.pageNumber && (!currentChapterObj.pageEnd || block.pageNumber > currentChapterObj.pageEnd)) {
            currentChapterObj.pageEnd = block.pageNumber;
          }
        }
      } else if (structureType === 'subsection') {
        ctx.currentSubsection = block.content.replace(/^#+\s*/, '').trim();
      }

      structuredBlocks.push({
        blockId: block.blockId,
        structureType,
        content: block.content,
        pageNumber: block.pageNumber,
        sequence: i,
        confidence,
        heading: block.heading,
        section: ctx.currentSection,
        chapterTitle: ctx.currentChapter,
      });
    }

    if (currentChapterObj) chapters.push(currentChapterObj);

    return {
      structuredBlocks,
      documentOutline: {
        title: documentTitle,
        chapters,
      },
    };
  }

  /**
   * Classifies a single block into a DocumentStructureType
   */
  private classifyBlock(
    block: ExtractedBlock,
    ctx: DocumentContext,
    allBlocks: ExtractedBlock[]
  ): DocumentStructureType {
    const text = block.content.trim();
    const lower = text.toLowerCase();

    // Structural markers from extraction phase (highest priority)
    if (block.type === 'question') return 'question';
    if (block.type === 'answer') return 'answer';
    if (block.type === 'example') return 'example';
    if (block.type === 'equation') return 'theorem';

    // Chapter markers — must be checked BEFORE the generic title check
    if (/^(chapter\s+\d+|अध्याय\s+\d+|unit\s+\d+|इकाई\s+\d+)/i.test(lower)) return 'chapter';
    if (block.type === 'heading' && /^(ch\.\s*\d+|chap\.\s*\d+)/i.test(lower)) return 'chapter';

    // Section markers — check BEFORE title
    if (block.type === 'heading' && /^(section\s+[\d.]+|§\s*\d+)/i.test(lower)) return 'section';

    // Title: first heading-type block in first 3 positions with no chapter/section prefix
    if (block.type === 'heading' && ctx.blockIndex < 3) {
      const wordCount = text.split(/\s+/).length;
      if (wordCount <= 10) return 'title';
    }

    // Remaining heading blocks → section or subsection by length
    if (block.type === 'heading') {
      const wordCount = text.replace(/^#+\s*/, '').trim().split(/\s+/).length;
      if (wordCount <= 6) return 'section';
      return 'subsection';
    }

    // Definition patterns
    if (
      /^(definition|def\.|परिभाषा)[:\s]/i.test(lower) ||
      /\bdefine[sd]?\s+as\b/i.test(lower) ||
      /\bis defined as\b/i.test(lower) ||
      /\bपरिभाषा:/i.test(text)
    ) return 'definition';

    // Theorem / Law / Principle patterns
    if (
      /^(theorem|lemma|corollary|law|principle|postulate|axiom)[:\s\d]/i.test(lower) ||
      /\bप्रमेय[:\s]/i.test(text) ||
      /\bसिद्धांत[:\s]/i.test(text)
    ) return 'theorem';

    // Example patterns (paragraph-type blocks starting with 'Example')
    if (/^(example\s*[\d.]+[:.)]?|eg\s*[:.]|उदाहरण\s*[\d.]*[:.)]?)/i.test(lower)) return 'example';

    // Exercise patterns
    if (
      /^(exercise|exercises|practice|activity|assignment|try\s+this)[:\s\d]/i.test(lower) ||
      /\bअभ्यास[:\s\d]/i.test(text) ||
      /\bप्रश्नावली/i.test(text)
    ) return 'exercise';

    // Important note patterns
    if (
      /^(note|important|note:|caution|warning|remember|tip|recall)[:\s]/i.test(lower) ||
      /^ध्यान\s+दें/i.test(text) ||
      /^महत्वपूर्ण[:\s]/i.test(text) ||
      /^\[?(note|important)\]?:/i.test(lower)
    ) return 'important_note';

    // Summary patterns
    if (
      /^(summary|recap|key\s+points|in\s+brief|conclusion)[:\s]/i.test(lower) ||
      /^सारांश[:\s]/i.test(text) ||
      /^निष्कर्ष[:\s]/i.test(text)
    ) return 'summary';


    // Reference patterns
    if (
      /^(references?|bibliography|further\s+reading|sources?)[:\s]/i.test(lower) ||
      /^\[\d+\]\s/.test(text) ||
      /^(et al\.|ibid\.)/i.test(lower)
    ) return 'reference';

    // Question by punctuation
    if (text.endsWith('?') && text.length < 300) return 'question';

    // Default to paragraph for prose content
    if (block.type === 'paragraph' || block.type === 'list' || block.type === 'table') {
      return 'paragraph';
    }

    return 'unknown';
  }


  /**
   * Scores classification confidence (0.0–1.0)
   */
  private scoreConfidence(
    block: ExtractedBlock,
    structureType: DocumentStructureType,
    ctx: DocumentContext
  ): number {
    const text = block.content.trim();

    // High confidence for explicit extraction-phase markers
    if (block.type === 'question' && structureType === 'question') return 0.97;
    if (block.type === 'answer' && structureType === 'answer') return 0.97;
    if (block.type === 'example' && structureType === 'example') return 0.95;
    if (block.type === 'equation' && structureType === 'theorem') return 0.90;

    // High confidence for explicit keyword markers
    if (/^(chapter|definition|theorem|exercise|summary|note|important)/i.test(text)) return 0.93;
    if (/^(अध्याय|परिभाषा|प्रमेय|अभ्यास|सारांश)/i.test(text)) return 0.92;

    // Title at document start
    if (structureType === 'title' && ctx.blockIndex < 3) return 0.88;

    // Section headings
    if (structureType === 'section' && block.type === 'heading') return 0.85;
    if (structureType === 'subsection' && block.type === 'heading') return 0.82;

    // Paragraph / unknown = lower confidence since it's a catch-all
    if (structureType === 'paragraph') return 0.78;
    if (structureType === 'unknown') return 0.40;

    return 0.75;
  }
}

/**
 * SmallToBigChunker
 * =================
 *
 * Implements Small-to-Big (Parent-Child) chunking:
 * - Divides structured or raw document text into comprehensive Parent Sections (1,000–2,500 words).
 * - Decomposes each Parent Section into fine-grained Child Chunks (200–350 words) optimized for
 *   dense vector similarity and sparse keyword search.
 * - Links every child chunk to its parent section via `parentDocId`.
 */

import { ParentDocument } from '../services/rag/parentDocument.service';

export interface ChildChunk {
  id: string;
  parentDocId: string;
  childIndex: number;
  text: string;
  pageNumber?: number;
  wordCount: number;
  metadata?: Record<string, any>;
}

export interface SmallToBigResult {
  parents: ParentDocument[];
  children: ChildChunk[];
}

export interface ChunkerOptions {
  parentMaxWords?: number; // target max words per parent section (default: 1500)
  parentMinWords?: number; // minimum words before starting a new section (default: 600)
  childMaxWords?: number;  // target max words per child chunk (default: 250)
  childOverlapWords?: number; // overlap between child chunks (default: 35)
}

export class SmallToBigChunker {
  /**
   * Chunks an array of pages or text blocks into Parent Sections and Child Chunks.
   */
  static chunkDocument(
    docId: string,
    sourceMeta: {
      book?: string;
      bookTitle?: string;
      chapter?: string;
      subject?: string;
      domain?: string;
    },
    sections: Array<{
      title?: string;
      chapter?: string;
      pageStart?: number;
      pageEnd?: number;
      text: string;
    }>,
    options: ChunkerOptions = {}
  ): SmallToBigResult {
    const parentMaxWords = options.parentMaxWords || 1500;
    const parentMinWords = options.parentMinWords || 600;
    const childMaxWords = options.childMaxWords || 250;
    const childOverlapWords = options.childOverlapWords || 35;

    const parents: ParentDocument[] = [];
    const children: ChildChunk[] = [];

    let parentIndex = 0;

    for (const sec of sections) {
      const sectionWords = sec.text.trim().split(/\s+/).filter(Boolean);
      if (sectionWords.length === 0) continue;

      // If a section is larger than parentMaxWords, split it into smaller parent sections on paragraph boundaries
      const paragraphs = sec.text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
      let currentParentText = '';
      let currentParentWords: string[] = [];
      let currentParentStartPage = sec.pageStart;
      let currentParentEndPage = sec.pageEnd;

      const flushParent = () => {
        if (currentParentWords.length === 0) return;

        const parentId = `parent_${docId}_sec${String(parentIndex).padStart(4, '0')}`;
        const parentFullText = currentParentText.trim();
        const childChunkIds: string[] = [];

        // Now decompose this parent section into small child chunks
        const pWords = currentParentWords;
        let cIdx = 0;
        let w = 0;

        while (w < pWords.length) {
          const sliceEnd = Math.min(w + childMaxWords, pWords.length);
          const childWords = pWords.slice(w, sliceEnd);
          const childText = childWords.join(' ');
          const childId = `${parentId}_child_${cIdx}`;

          childChunkIds.push(childId);
          children.push({
            id: childId,
            parentDocId: parentId,
            childIndex: cIdx,
            text: childText,
            pageNumber: currentParentStartPage,
            wordCount: childWords.length,
            metadata: {
              ...sourceMeta,
              chapter: sec.chapter || sourceMeta.chapter,
              sectionTitle: sec.title,
              pageStart: currentParentStartPage,
              pageEnd: currentParentEndPage,
            },
          });

          cIdx++;
          if (sliceEnd >= pWords.length) break;
          w += (childMaxWords - childOverlapWords);
        }

        parents.push({
          id: parentId,
          sourceId: docId,
          book: sourceMeta.book,
          bookTitle: sourceMeta.bookTitle,
          chapter: sec.chapter || sourceMeta.chapter,
          sectionTitle: sec.title || `Section ${parentIndex + 1}`,
          pageStart: currentParentStartPage,
          pageEnd: currentParentEndPage,
          fullText: parentFullText,
          childChunkIds,
          totalChildren: childChunkIds.length,
          metadata: {
            ...sourceMeta,
            sectionIndex: parentIndex,
          },
          createdAt: Date.now(),
        });

        parentIndex++;
        currentParentText = '';
        currentParentWords = [];
      };

      for (const para of paragraphs) {
        const paraWords = para.trim().split(/\s+/).filter(Boolean);
        if (currentParentWords.length + paraWords.length > parentMaxWords && currentParentWords.length >= parentMinWords) {
          flushParent();
        }

        currentParentText += (currentParentText ? '\n\n' : '') + para;
        currentParentWords.push(...paraWords);
      }

      flushParent();
    }

    return { parents, children };
  }
}

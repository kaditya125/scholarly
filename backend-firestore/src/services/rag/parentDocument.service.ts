/**
 * ParentDocumentService — Small-to-Big Retrieval Hydration Layer
 * =============================================================
 *
 * Implements Parent-Document Retrieval (Small-to-Big Chunker):
 * - Small chunks (200–350 words) are indexed in Qdrant for maximum vector match specificity.
 * - Parent documents (1,000–2,500 words, full chapter sections) are stored in Firestore
 *   collection `parent_documents` with in-memory caching.
 * - When vector retrieval hits a child chunk carrying `parentDocId`, this service fetches the
 *   complete surrounding section, deduplicates multiple hits from the same section, and provides
 *   the LLM with the full context (theorems, formulas, diagrams, worked examples) while preserving
 *   exact page and section citations.
 */

import { db } from '../../config/firebase';
import { logger } from '../../utils/logger';
import { RetrievalResult } from './retrieval.service';
import { Telemetry } from '../../lib/telemetry';

export const PARENT_DOCS_COLLECTION = 'parent_documents';

export interface ParentDocument {
  id: string; // e.g. parent_hcv1_ch10_sec08
  sourceId?: string; // book key or document sourceId
  book?: string;
  bookTitle?: string;
  chapter?: string;
  sectionTitle?: string;
  pageStart?: number;
  pageEnd?: number;
  fullText: string; // 1,000 - 2,500 words complete section
  childChunkIds: string[];
  totalChildren: number;
  metadata?: Record<string, any>;
  createdAt?: number;
}

export class ParentDocumentService {
  // In-memory L1 cache to serve hot parent sections in < 1ms without repeated Firestore queries
  private l1Cache = new Map<string, { doc: ParentDocument; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Saves a single parent document to Firestore.
   */
  async saveParentDocument(doc: ParentDocument): Promise<void> {
    const docRef = db.collection(PARENT_DOCS_COLLECTION).doc(doc.id);
    await docRef.set({
      ...doc,
      createdAt: doc.createdAt || Date.now(),
      updatedAt: Date.now(),
    }, { merge: true });

    // Populate L1 cache
    this.l1Cache.set(doc.id, {
      doc,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }

  /**
   * Batched write of parent documents into Firestore.
   */
  async batchSaveParentDocuments(docs: ParentDocument[]): Promise<void> {
    if (!docs.length) return;
    const BATCH_LIMIT = 450;

    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const slice = docs.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();

      for (const doc of slice) {
        const docRef = db.collection(PARENT_DOCS_COLLECTION).doc(doc.id);
        batch.set(docRef, {
          ...doc,
          createdAt: doc.createdAt || Date.now(),
          updatedAt: Date.now(),
        }, { merge: true });

        // Populate L1 cache
        this.l1Cache.set(doc.id, {
          doc,
          expiresAt: Date.now() + this.CACHE_TTL_MS,
        });
      }

      await batch.commit();
    }
    logger.info(`[ParentDocumentService] Saved ${docs.length} parent documents to Firestore.`);
  }

  /**
   * Retrieves a parent document by ID from L1 cache or Firestore.
   */
  async getParentDocument(id: string): Promise<ParentDocument | null> {
    const cached = this.l1Cache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.doc;
    }

    try {
      const snap = await db.collection(PARENT_DOCS_COLLECTION).doc(id).get();
      if (!snap.exists) return null;

      const doc = snap.data() as ParentDocument;
      this.l1Cache.set(id, {
        doc,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
      return doc;
    } catch (err: any) {
      logger.warn(`[ParentDocumentService] Error fetching parent doc ${id}:`, err?.message || err);
      return null;
    }
  }

  /**
   * Multi-get for parent documents with caching.
   */
  async getParentDocuments(ids: string[]): Promise<Map<string, ParentDocument>> {
    const result = new Map<string, ParentDocument>();
    const missingIds: string[] = [];

    for (const id of ids) {
      const cached = this.l1Cache.get(id);
      if (cached && cached.expiresAt > Date.now()) {
        result.set(id, cached.doc);
      } else {
        missingIds.push(id);
      }
    }

    if (missingIds.length > 0) {
      try {
        // Firestore getAll in batches of 100
        const BATCH = 100;
        for (let i = 0; i < missingIds.length; i += BATCH) {
          const slice = missingIds.slice(i, i + BATCH);
          const refs = slice.map(id => db.collection(PARENT_DOCS_COLLECTION).doc(id));
          const snaps = await db.getAll(...refs);

          for (const snap of snaps) {
            if (snap.exists) {
              const doc = snap.data() as ParentDocument;
              result.set(snap.id, doc);
              this.l1Cache.set(snap.id, {
                doc,
                expiresAt: Date.now() + this.CACHE_TTL_MS,
              });
            }
          }
        }
      } catch (err: any) {
        logger.warn(`[ParentDocumentService] Failed to multi-get parent documents:`, err?.message || err);
      }
    }

    return result;
  }

  /**
   * Small-to-big hydration: child chunks carrying `parentDocId` are expanded to their parent
   * context, read from Firestore `parent_documents` in batches with an L1 cache.
   *
   * Canonical key: `parentDocId` (Qdrant payload and RetrievalResult.metadata). NOT to be confused
   * with `parent_document_id`, which the main reference pipeline (scripts/reference/books/03, 05)
   * uses for the BOOK source document a chunk came from — a different thing that never points
   * into `parent_documents`.
   *
   * Output per hydrated result:
   *   text      — the parent context, headed with book, pages and (only when the source has them)
   *               real chapter/section titles. Page-window parents are labelled "Parent context",
   *               never "Section": a fixed 1,200-word window is not a textbook section.
   *   metadata  — original metadata plus childText, parentDocId, parentText, parentTitle,
   *               pageStart, pageEnd, parentWordCount, isParentExpanded.
   * Several children of one parent collapse into one result at the best child's rank. A child
   * whose parent is missing stays as-is and the miss is logged (PARENT_DOCUMENT_NOT_FOUND).
   */
  async hydrateParentContext(results: RetrievalResult[]): Promise<RetrievalResult[]> {
    if (!results?.length) return results ?? [];

    const t0 = performance.now();
    const parentIdOf = (r: RetrievalResult): string | null => {
      const id = r.metadata?.parentDocId;
      return typeof id === 'string' && id.trim() ? id.trim() : null;
    };
    const parentIds = [...new Set(results.map(parentIdOf).filter((x): x is string => !!x))];
    if (!parentIds.length) return results;

    const parentMap = await this.getParentDocuments(parentIds);
    const missing = parentIds.filter((id) => !parentMap.has(id));
    if (missing.length) {
      logger.warn('[ParentDocumentService] PARENT_DOCUMENT_NOT_FOUND — serving child chunks for these', {
        code: 'PARENT_DOCUMENT_NOT_FOUND', missing: missing.slice(0, 10), missingCount: missing.length,
      });
    }

    const out: RetrievalResult[] = [];
    const seen = new Set<string>();
    for (const r of results) {
      const parentId = parentIdOf(r);
      const parent = parentId ? parentMap.get(parentId) : undefined;
      if (!parentId || !parent) { out.push(r); continue; }
      if (seen.has(parentId)) continue;
      seen.add(parentId);
      out.push(expandWithParent(r, parent));
    }

    const elapsed = performance.now() - t0;
    Telemetry.logLatency('parent_document_hydration', elapsed, {
      totalInputs: results.length, hydratedOutputs: out.length, parentCount: parentIds.length, missing: missing.length,
    });
    logger.info('[ParentDocumentService] hydrated', {
      inputs: results.length, outputs: out.length, parents: parentIds.length - missing.length, ms: Math.round(elapsed),
    });
    return out;
  }
}

/** True when the parent carries a real chapter/section title from the source, not a synthesized page range. */
export function hasRealSectionTitle(p: ParentDocument): boolean {
  const t = `${p.chapter ?? ''} ${p.sectionTitle ?? ''}`;
  return !!t.trim() && !/^\s*Section \(Pages \d+[–-]\d+\)/.test(p.chapter ?? '') && !/—\s*pp\.\s*\d+[–-]\d+\s*$/.test(p.sectionTitle ?? '');
}

export function expandWithParent(r: RetrievalResult, parent: ParentDocument): RetrievalResult {
  const pages = parent.pageStart && parent.pageEnd
    ? `pp. ${parent.pageStart}–${parent.pageEnd}`
    : r.metadata?.pageNumber ? `p. ${r.metadata.pageNumber}` : '';
  const title = parent.bookTitle || r.source;
  const real = hasRealSectionTitle(parent);
  const heading = real
    ? [title, parent.chapter, parent.sectionTitle, pages].filter(Boolean).join(' › ')
    : [title, pages].filter(Boolean).join(', ');
  const label = real ? 'SECTION' : 'PARENT CONTEXT';
  const parentTitle = real ? (parent.sectionTitle || parent.chapter || title) : `${title}${pages ? ` (${pages})` : ''}`;
  return {
    ...r,
    text: `--- ${label}: ${heading} ---\n${parent.fullText}`,
    metadata: {
      ...r.metadata,
      childText: r.text,
      parentDocId: parent.id,
      parentText: parent.fullText,
      parentTitle,
      pageStart: parent.pageStart,
      pageEnd: parent.pageEnd,
      parentWordCount: parent.fullText.split(/\s+/).filter(Boolean).length,
      isParentExpanded: true,
    },
  };
}

export const parentDocumentService = new ParentDocumentService();

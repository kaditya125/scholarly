/**
 * Small-to-big chunking for reference books — pure, so ingestion and tests share one definition.
 *
 *   parent context  ~1,200 words of consecutive pages  → Firestore `parent_documents`
 *   child chunk     ~250 words (35-word overlap)       → Qdrant, carrying `parentDocId`
 *
 * Honest labelling: a parent is a page WINDOW unless the source supplies real headings. Only when
 * pages carry `chapter` / `section` does a parent get those titles (and a heading change starts a
 * new parent, so one parent never spans two chapters). Otherwise `chapter` and `sectionTitle` are
 * left unset — nothing downstream may present "pp. 41–47" as if it were a textbook section.
 */
import type { ParentDocument } from './parentDocument.service';

export interface SourcePage {
  pageNumber: number;
  text: string;
  /** Real chapter title for this page, when the extractor knows it. */
  chapter?: string;
  /** Real section title for this page, when the extractor knows it. */
  section?: string;
}

export interface ChildChunk {
  id: string;
  parentDocId: string;
  pageNumber: number;
  text: string;
  chapter?: string;
  section?: string;
}

export interface ParentChunkingOptions {
  bookKey: string;
  bookTitle: string;
  parentWords?: number;
  /** A parent is not closed below this many words, unless a real heading boundary forces it. */
  minParentWords?: number;
  childWords?: number;
  childOverlap?: number;
  metadata?: Record<string, any>;
}

export const PARENT_CHUNKING_DEFAULTS = { parentWords: 1200, minParentWords: 600, childWords: 250, childOverlap: 35 } as const;

export function buildParentContexts(pages: SourcePage[], opts: ParentChunkingOptions): { parents: ParentDocument[]; children: ChildChunk[] } {
  const parentWords = opts.parentWords ?? PARENT_CHUNKING_DEFAULTS.parentWords;
  const minParentWords = opts.minParentWords ?? PARENT_CHUNKING_DEFAULTS.minParentWords;
  const childWords = opts.childWords ?? PARENT_CHUNKING_DEFAULTS.childWords;
  const overlap = opts.childOverlap ?? PARENT_CHUNKING_DEFAULTS.childOverlap;
  if (childWords <= overlap) throw new Error('childWords must exceed childOverlap');

  const parents: ParentDocument[] = [];
  const children: ChildChunk[] = [];

  let words: string[] = [];
  let startPage = 0;
  let endPage = 0;
  let chapter: string | undefined;
  let section: string | undefined;
  let index = 1;

  const flush = () => {
    if (!words.length) return;
    // Id format is frozen: it matches what ingest-hcv2-irodov-parent.ts wrote, so re-running a book
    // that was ingested that way reproduces the same ids (idempotent) instead of duplicating it.
    const parentId = `parent_${opts.bookKey}_p${String(startPage).padStart(3, '0')}_sec${String(index).padStart(4, '0')}`;
    const childIds: string[] = [];
    for (let w = 0, c = 0; w < words.length; c++) {
      const end = Math.min(w + childWords, words.length);
      const id = `ref_${opts.bookKey}_p${String(startPage).padStart(4, '0')}_sec${index}_c${c}`;
      childIds.push(id);
      children.push({ id, parentDocId: parentId, pageNumber: startPage, text: words.slice(w, end).join(' '), chapter, section });
      if (end >= words.length) break;
      w += childWords - overlap;
    }
    parents.push({
      id: parentId,
      sourceId: opts.bookKey,
      book: opts.bookKey,
      bookTitle: opts.bookTitle,
      ...(chapter ? { chapter } : {}),
      ...(section ? { sectionTitle: section } : {}),
      pageStart: startPage,
      pageEnd: endPage,
      fullText: words.join(' '),
      childChunkIds: childIds,
      totalChildren: childIds.length,
      metadata: { ...(opts.metadata ?? {}), boundary: chapter || section ? 'heading' : 'page_window' },
    });
    index++;
    words = [];
  };

  for (const page of pages) {
    const pageWords = String(page.text || '').split(/\s+/).filter(Boolean);
    if (!pageWords.length) continue;

    const headingChanged = words.length > 0 && (
      (page.chapter !== undefined && page.chapter !== chapter) ||
      (page.section !== undefined && page.section !== section));
    const tooBig = words.length + pageWords.length > parentWords && words.length >= minParentWords;
    if (headingChanged || tooBig) flush();

    if (!words.length) {
      startPage = page.pageNumber;
      chapter = page.chapter;
      section = page.section;
    }
    endPage = page.pageNumber;
    words.push(...pageWords);
  }
  flush();
  return { parents, children };
}

// ─── Backfill: parent contexts for books that already have child vectors ─────────────────────

/** One already-indexed chunk, as read back from the vector store. */
export interface ExistingChild {
  /** Original store id (pinecone_id payload). */
  id: string;
  pageNumber: number;
  text: string;
  chapter?: string;
  section?: string;
}

export interface BackfillGrouping {
  parents: ParentDocument[];
  /** child id → parent id, for every child. */
  assignment: Map<string, string>;
}

/**
 * Group existing children into parent contexts WITHOUT re-chunking or re-embedding them.
 *
 * Children are ordered by page, then id (natural order), and accumulated until ~parentWords.
 * `trustHeadings` (only for books whose chapter/section fields came from a structural parser —
 * the Lucent / S. Chand pipeline) also closes a parent whenever chapter or section changes and
 * records those titles. For every other book the chapter field is OCR noise ("Part iv discusses
 * relations…") and is ignored: parents are page windows, labelled as such downstream.
 *
 * Ids (`parent_<book>_bf<NNNN>`) are a pure function of the input, so a re-run produces the same
 * parents and the same assignments — the backfill is idempotent.
 */
export function groupExistingChildren(
  children: ExistingChild[],
  opts: ParentChunkingOptions & { trustHeadings: boolean },
): BackfillGrouping {
  const parentWords = opts.parentWords ?? PARENT_CHUNKING_DEFAULTS.parentWords;
  const minParentWords = opts.minParentWords ?? PARENT_CHUNKING_DEFAULTS.minParentWords;
  const ordered = [...children].sort((a, b) =>
    a.pageNumber - b.pageNumber || a.id.localeCompare(b.id, undefined, { numeric: true }));

  const parents: ParentDocument[] = [];
  const assignment = new Map<string, string>();
  let group: ExistingChild[] = [];
  let words = 0;

  const flush = () => {
    if (!group.length) return;
    const id = `parent_${opts.bookKey}_bf${String(parents.length + 1).padStart(4, '0')}`;
    const head = group[0];
    const chapter = opts.trustHeadings ? head.chapter : undefined;
    const section = opts.trustHeadings ? head.section : undefined;
    parents.push({
      id,
      sourceId: opts.bookKey,
      book: opts.bookKey,
      bookTitle: opts.bookTitle,
      ...(chapter ? { chapter } : {}),
      ...(section ? { sectionTitle: section } : {}),
      pageStart: Math.min(...group.map((c) => c.pageNumber)),
      pageEnd: Math.max(...group.map((c) => c.pageNumber)),
      fullText: group.map((c) => c.text.trim()).filter(Boolean).join('\n\n'),
      childChunkIds: group.map((c) => c.id),
      totalChildren: group.length,
      metadata: { ...(opts.metadata ?? {}), boundary: chapter || section ? 'heading' : 'page_window', origin: 'backfill' },
    });
    for (const c of group) assignment.set(c.id, id);
    group = [];
    words = 0;
  };

  for (const c of ordered) {
    const n = c.text.split(/\s+/).filter(Boolean).length;
    const headingChanged = opts.trustHeadings && group.length > 0 &&
      ((c.chapter ?? '') !== (group[0].chapter ?? '') || (c.section ?? '') !== (group[0].section ?? ''));
    const tooBig = group.length > 0 && words + n > parentWords && words >= minParentWords;
    if (headingChanged || tooBig) flush();
    group.push(c);
    words += n;
  }
  flush();
  return { parents, assignment };
}

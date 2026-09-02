/**
 * Chapter Documentary Service
 * Rich, detailed NCERT chapter content structured as a flowing editorial article.
 * Content reads like a human-written textbook explainer — no AI-generated boilerplate.
 */

export interface ConceptBlock {
  id: string;
  heading: string;
  ncertPageRef: number;
  body: string[];                            // Multiple paragraphs of flowing prose
  highlights?: string[];                    // Key terms to highlight inline (amber)
  boldLines?: string[];                     // Sentences worth bolding
  numberedList?: string[];                  // Numbered sub-sections (like "1. Flat structure")
  bulletList?: string[];                    // Simple bullet points
}

export interface DocumentarySection {
  id: string;
  title: string;
  ncertPageRef: number;
  intro?: string;                           // Short lead paragraph before concepts
  concepts: ConceptBlock[];
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  category: string;
}

export interface DocumentaryChapter {
  id: string;
  title: string;
  bookTitle: string;
  subject: string;
  estimatedReadingTime: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  leadParagraph: string;                    // First paragraph under the title
  sections: DocumentarySection[];
  summary: {
    body: string;
    keyPoints: string[];
  };
  flashcards: FlashcardItem[];
  podcast: {
    episodeTitle: string;
    duration: string;
    tracks: { id: string; title: string; duration: string; speaker: string }[];
  };
}

// Per-session cache, keyed by notebookId + sourceId + subject + chapterTitle. Including
// `sourceId` (which the caller MUST also pass) is critical so two chapters with the same
// title in the same notebook (e.g. "Chapter 1" in Part 1 and Part 2) don't share a stale
// cached article.
const CACHE: Record<string, DocumentaryChapter> = {};

/**
 * Build the cache key for a given chapter. Exported so callers (specifically
 * ChapterReader) can invalidate the cache entry when the underlying article is
 * regenerated — for example, after a Force Retry fires and asyncGenerateAssets
 * produces a new DOCUMENTARY_ARTICLE doc. Keeping the format in one place
 * prevents key-drift bugs where the writer and the lookup use slightly different
 * string compositions.
 */
export function makeArticleCacheKey(
  notebookId?: string,
  sourceId?: string,
  subject?: string,
  chapterTitle?: string,
): string {
  return `${notebookId || ''}_${sourceId || ''}_${subject || ''}_${chapterTitle || ''}`;
}

/**
 * Invalidate a single chapter's cached article. Called by ChapterReader whenever
 * it observes a terminal-status transition (READY / READY_DEGRADED / COMPLETED)
 * so the next fetch pulls a fresh document rather than the stale pre-regeneration
 * copy. Safe to call with an unknown key (no-op).
 */
export function clearArticleCache(key: string): void {
  delete CACHE[key];
}

// How long to wait on Firestore before we give up and let the reader surface a real message
// instead of staying on the spinner forever. Keep generous enough for slow networks + cold
// client SDK startup; the reader UI still renders the PreparingChapter the whole time.
const FETCH_TIMEOUT_MS = 12_000;

/**
 * Fetch the documentary article asset for a chapter from Firestore. Falls back to a
 * SUMMARY-synthesized article if no rich article exists yet. Always resolves — never
 * throws — so the reader UI can rely on `null` to render its "Preparing" state and the
 * onRetry button (no uncaught promise rejection cycle).
 */
export async function getDocumentaryChapter(
  notebookId?: string,
  chapterTitle?: string,
  subject?: string,
  sourceId?: string,
): Promise<DocumentaryChapter | null> {
  const cacheKey = makeArticleCacheKey(notebookId, sourceId, subject, chapterTitle);
  if (CACHE[cacheKey]) return CACHE[cacheKey];

  if (!notebookId) return null;

  // Single withTimeout guard wraps both Firestore reads so a hung network / missing
  // Firestore index / permission error can't leave the reader on an infinite spinner.
  // Uses `finally { clearTimeout(t) }` so the pending timer is cleared on whichever side
  // wins the race — without it, a successful read leaves a dead 12s timer in the macrotask
  // queue for every call (a small leak per fetch; cumulative on a chatty reader).
  const withTimeout = <T,>(p: Promise<T>, label: string): Promise<T> => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
      t = setTimeout(
        () => reject(new Error(`getDocumentaryChapter: ${label} timed out after ${FETCH_TIMEOUT_MS}ms`)),
        FETCH_TIMEOUT_MS,
      );
    });
    return Promise.race<T>([p, timeoutPromise]).finally(() => {
      if (t) clearTimeout(t);
    });
  };

  try {
    /*
     * `db` lives in lib/firestore, NOT lib/firebase.
     *
     * This imported it from lib/firebase, which exports app/auth/providers and no Firestore
     * handle at all — so `db` was undefined and the first `collection(db, ...)` below threw on
     * every call. Because this function is contractually non-throwing (see the doc comment
     * above: it returns null so the reader can show its "Preparing" state), the failure was
     * swallowed and the documentary article silently never loaded — the reader just sat on
     * "Preparing" forever. Every other consumer in the app already imports from lib/firestore.
     */
    const { db } = await import('../lib/firestore');
    const { collection, query, where, getDocs, orderBy, limit } = await import('firebase/firestore');

    // Phase 3: Query for DOCUMENTARY_ARTICLE that matches this specific chapter.
    // The asset's `title` field is formatted as "${sourceTitle} - Documentary Article"
    // (see assetSpecs.ts line 154). We must include the chapter title in the query
    // so each chapter loads its own article instead of the most recent article
    // from ANY chapter in the notebook (which is what the old query did).
    //
    // NOTE: Using both where('title') AND orderBy('createdAt') requires a Firestore
    // composite index. If the index doesn't exist, Firestore will throw
    // FAILED_PRECONDITION with an auto-generated index creation link in the error.
    // For now, we'll try the filtered query first, and fall back to unfiltered if it fails.
    const expectedAssetTitle = `${chapterTitle} - Documentary Article`;
    console.log(`[chapterDocumentaryService] Fetching article for: "${expectedAssetTitle}" in notebook ${notebookId}`);
    
    let snapshot;
    try {
      // Try filtered query (requires composite index: type, title, createdAt)
      const q = query(
        collection(db, 'notebooks', notebookId, 'assets'),
        where('type', '==', 'DOCUMENTARY_ARTICLE'),
        where('title', '==', expectedAssetTitle),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      snapshot = await withTimeout(getDocs(q), 'DOCUMENTARY_ARTICLE query (filtered)');
    } catch (indexError: any) {
      // If composite index doesn't exist, fall back to client-side filtering
      if (indexError?.code === 'failed-precondition' || /index/i.test(indexError?.message || '')) {
        console.warn(`[chapterDocumentaryService] Composite index not found. Falling back to client-side filtering...`);
        const qUnfiltered = query(
          collection(db, 'notebooks', notebookId, 'assets'),
          where('type', '==', 'DOCUMENTARY_ARTICLE'),
          orderBy('createdAt', 'desc')
        );
        const allSnapshot = await withTimeout(getDocs(qUnfiltered), 'DOCUMENTARY_ARTICLE query (unfiltered)');
        
        // Filter client-side to find matching title
        const matchingDoc = allSnapshot.docs.find(doc => doc.data().title === expectedAssetTitle);
        if (matchingDoc) {
          snapshot = { empty: false, docs: [matchingDoc] } as any;
        } else {
          snapshot = { empty: true, docs: [] } as any;
        }
      } else {
        throw indexError; // Re-throw if it's not an index issue
      }
    }

    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      console.log(`[chapterDocumentaryService] Found article for "${expectedAssetTitle}"`);
      if (data.content && data.content.article) {
        const chapter = data.content.article as DocumentaryChapter;
        CACHE[cacheKey] = chapter;
        return chapter;
      }
    }

      console.log(`[chapterDocumentaryService] No DOCUMENTARY_ARTICLE found for "${expectedAssetTitle}". Trying SUMMARY fallback...`);
      
      // Fallback: If no DOCUMENTARY_ARTICLE exists yet, synthesize an article from SUMMARY
      // Note: SUMMARY assets also need chapter-specific filtering to avoid showing wrong chapter's summary
      const expectedSummaryTitle = `${chapterTitle} - Summary`;
      
      let sumSnap;
      try {
        // Try filtered query (requires composite index: type, title)
        const qSummary = query(
          collection(db, 'notebooks', notebookId, 'assets'),
          where('type', '==', 'SUMMARY'),
          where('title', '==', expectedSummaryTitle),
          limit(1)
        );
        sumSnap = await withTimeout(getDocs(qSummary), 'SUMMARY fallback query (filtered)');
      } catch (indexError: any) {
        // Fall back to client-side filtering if index doesn't exist
        if (indexError?.code === 'failed-precondition' || /index/i.test(indexError?.message || '')) {
          console.warn(`[chapterDocumentaryService] SUMMARY index not found. Falling back to client-side filtering...`);
          const qUnfiltered = query(
            collection(db, 'notebooks', notebookId, 'assets'),
            where('type', '==', 'SUMMARY')
          );
          const allSummaries = await withTimeout(getDocs(qUnfiltered), 'SUMMARY fallback query (unfiltered)');
          
          const matchingSummary = allSummaries.docs.find(doc => doc.data().title === expectedSummaryTitle);
          if (matchingSummary) {
            sumSnap = { empty: false, docs: [matchingSummary] } as any;
          } else {
            sumSnap = { empty: true, docs: [] } as any;
          }
        } else {
          throw indexError;
        }
      }
      
      if (!sumSnap.empty) {
        console.log(`[chapterDocumentaryService] Found SUMMARY for "${expectedSummaryTitle}", synthesizing article...`);
        const sumData = sumSnap.docs[0].data();
        const summaryText = typeof sumData.content === 'string' 
          ? sumData.content 
          : (sumData.content?.body || sumData.content?.summary || sumData.title || '');
          
        if (summaryText && summaryText.trim().length > 0) {
          const title = chapterTitle || sumData.title?.replace(' - Summary', '') || 'Chapter Article';
          const paragraphs = summaryText.split('\n\n').map((p: string) => p.trim()).filter((p: string) => p.length > 10);
          const lead = paragraphs[0] || summaryText.slice(0, 300);
          const bodyParas = paragraphs.length > 1 ? paragraphs.slice(1) : [summaryText];

          const fallbackChapter: DocumentaryChapter = {
            id: notebookId,
            title,
            bookTitle: 'NCERT Textbook',
            subject: subject || 'Science',
            estimatedReadingTime: '10 mins',
            difficulty: 'Intermediate',
            leadParagraph: lead,
            sections: [
              {
                id: 'sec-1',
                title: `${title} - Overview`,
                ncertPageRef: 1,
                intro: 'Explainer synthesized from chapter summary materials.',
                concepts: [
                  {
                    id: 'c-1',
                    heading: 'Core Concepts',
                    ncertPageRef: 1,
                    body: bodyParas,
                    highlights: [title],
                    boldLines: [],
                    numberedList: [],
                    bulletList: []
                  }
                ]
              }
            ],
            summary: {
              body: summaryText,
              keyPoints: [title]
            },
            flashcards: [],
            podcast: { episodeTitle: '', duration: '', tracks: [] }
          };
          CACHE[cacheKey] = fallbackChapter;
          return fallbackChapter;
        }
      } else {
        console.warn(`[chapterDocumentaryService] No SUMMARY found for "${expectedSummaryTitle}". No article can be shown.`);
      }
    } catch (e: any) {
      // Surface real reasons instead of a silent null — a missing composite Firestore index
      // (FAILED_PRECONDITION), a permission denial, or a network hang all surface here so the
      // reader UI / admin logs make the failure diagnosable.
      const reason = e?.message || String(e);
      const isIndexIssue = /index/i.test(reason) || /FAILED_PRECONDITION/i.test(reason) || e?.code === 'failed-precondition';
      console.warn(
        `[chapterDocumentaryService] documentary article fetch failed for notebook=${notebookId} source=${sourceId || '?'}` +
        (isIndexIssue ? ' — likely a missing Firestore composite index on assets (type ASC, createdAt DESC)' : '') +
        ` — ${reason}`,
      );
    }

  return null;
}

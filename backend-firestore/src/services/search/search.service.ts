import { db } from '../../config/firebase';
import { cacheService } from '../cache.service';
import { bookLibraryService, type BookSummary, type BookDetail } from '../bookLibrary.service';
import { notebookRepository } from '../../repositories/notebook.repository';
import { logger } from '../../utils/logger';
import { indexFields, scoreItem, tokenize, type IndexedField } from './textMatch';

/**
 * Global search behind the command palette.
 *
 * Firestore has no full-text search, so this searches in memory over two bounded corpora:
 *   - the curriculum chapter catalog (shared by everyone): built once from the book library and
 *     kept for an hour, since it only changes when an admin re-ingests;
 *   - the caller's own content (chat sessions, notebooks, podcasts, quizzes): a projected read of
 *     titles only, cached for a few seconds so a burst of keystrokes costs one read per collection.
 * Semantic search over textbook passages reuses the curriculum RAG retrieval.
 */

export type SearchHitType = 'chapter' | 'chat' | 'notebook' | 'podcast' | 'quiz';
export const SEARCH_HIT_TYPES: SearchHitType[] = ['chapter', 'chat', 'notebook', 'podcast', 'quiz'];

export interface SearchHit {
  type: SearchHitType;
  id: string;
  title: string;
  subtitle?: string;
  score: number;
  updatedAt?: number;
  status?: string;
  // Chapter hits only — enough for the client to label the chapter and open it in the reader.
  notebookId?: string;
  sourceId?: string;
  chapterName?: string;
  bookName?: string;
  subject?: string;
  className?: string;
}

export interface SemanticHit {
  notebookId: string;
  sourceId: string;
  title: string;
  chapterName?: string;
  bookName?: string;
  subject?: string;
  className?: string;
  pageNumber?: number;
  snippet: string;
  score: number;
}

interface ChapterEntry {
  notebookId: string;
  sourceId: string;
  title: string;
  chapterName?: string;
  bookName: string;
  subject: string;
  className?: string;
  fields: IndexedField[];
}

interface UserDoc {
  type: Exclude<SearchHitType, 'chapter'>;
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  updatedAt?: number;
}

const CHAPTER_INDEX_TTL_MS = 60 * 60 * 1000;
const USER_CONTENT_TTL_S = 20;
const DETAIL_CONCURRENCY = 6;
const MAX_QUERY_LENGTH = 200;
const USER_DOC_LIMIT = 300;

export class SearchService {
  private chapterIndex: { entries: ChapterEntry[]; bySource: Map<string, ChapterEntry>; builtAt: number } | null = null;
  private chapterIndexBuild: Promise<ChapterEntry[]> | null = null;

  /** Lexical search across the chapter catalog and the caller's own content. */
  async search(
    userId: string,
    rawQuery: string,
    opts: { types?: SearchHitType[]; limit?: number } = {}
  ): Promise<SearchHit[]> {
    const tokens = tokenize(rawQuery.slice(0, MAX_QUERY_LENGTH));
    if (!tokens.length) return [];
    const types = new Set(opts.types?.length ? opts.types : SEARCH_HIT_TYPES);
    const limit = Math.min(Math.max(opts.limit ?? 6, 1), 20);

    const [chapters, userDocs] = await Promise.all([
      types.has('chapter') ? this.getChapterIndex().catch((err) => {
        logger.warn('search: chapter index unavailable', { error: String(err) });
        return [] as ChapterEntry[];
      }) : Promise.resolve([] as ChapterEntry[]),
      [...types].some((t) => t !== 'chapter') ? this.getUserContent(userId) : Promise.resolve([] as UserDoc[]),
    ]);

    const hits: SearchHit[] = [];

    const chapterHits: SearchHit[] = [];
    for (const c of chapters) {
      const m = scoreItem(tokens, c.fields);
      // Only chapters whose own name/concepts matched: "physics" should list physics books
      // (the client has those), not every physics chapter.
      if (!m || !(m.hitFields.has(0) || m.hitFields.has(1))) continue;
      chapterHits.push({
        type: 'chapter',
        id: `${c.notebookId}:${c.sourceId}`,
        title: c.chapterName || c.title,
        subtitle: [c.bookName, c.className].filter(Boolean).join(' · '),
        score: m.score,
        notebookId: c.notebookId,
        sourceId: c.sourceId,
        chapterName: c.chapterName,
        bookName: c.bookName,
        subject: c.subject,
        className: c.className,
      });
    }
    hits.push(...top(chapterHits, limit));

    for (const type of SEARCH_HIT_TYPES) {
      if (type === 'chapter' || !types.has(type)) continue;
      const scored: SearchHit[] = [];
      for (const d of userDocs) {
        if (d.type !== type) continue;
        const m = scoreItem(tokens, indexFields([{ text: d.title, weight: 3 }, { text: d.subtitle || '', weight: 1.5 }]));
        if (m) scored.push({ type, id: d.id, title: d.title, subtitle: d.subtitle, status: d.status, updatedAt: d.updatedAt, score: m.score });
      }
      hits.push(...top(scored, limit));
    }
    return hits;
  }

  /**
   * Semantic search over curriculum passages ("where does the textbook explain X"). One hit per
   * chapter, carrying the best passage and its page. Costs an embedding + rerank per uncached
   * query, so the route is rate limited and the client only calls it for substantial queries.
   */
  async semantic(rawQuery: string, limit = 5): Promise<SemanticHit[]> {
    const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);
    if (query.length < 3) return [];
    // Lazy: the retrieval stack pulls in the vector store and model providers.
    const { retrievalService } = await import('../rag/retrieval.service');
    const results = await retrievalService.retrieveCurriculumContext(query, Math.min(limit * 2, 12));

    let bySource = new Map<string, ChapterEntry>();
    try {
      await this.getChapterIndex();
      bySource = this.chapterIndex?.bySource || bySource;
    } catch {
      /* labels fall back to the passage's source title */
    }

    const seen = new Set<string>();
    const hits: SemanticHit[] = [];
    for (const r of results) {
      const meta = r.metadata || {};
      const notebookId = typeof meta.notebookId === 'string' ? meta.notebookId : '';
      const sourceId = typeof meta.sourceId === 'string' ? meta.sourceId : '';
      if (!notebookId || !sourceId || seen.has(sourceId)) continue;
      seen.add(sourceId);
      const chapter = bySource.get(sourceId);
      hits.push({
        notebookId,
        sourceId,
        title: chapter?.chapterName || chapter?.title || String(meta.sourceTitle || r.source || 'Chapter').replace(/\.pdf$/i, ''),
        chapterName: chapter?.chapterName,
        bookName: chapter?.bookName,
        subject: chapter?.subject,
        className: chapter?.className,
        pageNumber: typeof meta.pageNumber === 'number' ? meta.pageNumber : undefined,
        snippet: excerpt(r.text),
        score: r.weightedScore ?? r.score,
      });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  // ── corpora ──

  private async getChapterIndex(): Promise<ChapterEntry[]> {
    if (this.chapterIndex && Date.now() - this.chapterIndex.builtAt < CHAPTER_INDEX_TTL_MS) {
      return this.chapterIndex.entries;
    }
    // One build at a time; concurrent requests share it.
    if (!this.chapterIndexBuild) {
      this.chapterIndexBuild = this.buildChapterIndex()
        .then((entries) => {
          this.chapterIndex = { entries, bySource: new Map(entries.map((e) => [e.sourceId, e])), builtAt: Date.now() };
          return entries;
        })
        .finally(() => { this.chapterIndexBuild = null; });
      // Observed here so a failed background rebuild (stale path below) is never unhandled.
      this.chapterIndexBuild.catch((err) => logger.warn('search: chapter index build failed', { error: String(err) }));
    }
    // A stale index is better than blocking on a rebuild.
    if (this.chapterIndex) return this.chapterIndex.entries;
    return this.chapterIndexBuild;
  }

  private async buildChapterIndex(): Promise<ChapterEntry[]> {
    const books = await bookLibraryService.listBooks();
    const details: (BookDetail | null)[] = [];
    for (let i = 0; i < books.length; i += DETAIL_CONCURRENCY) {
      const batch = books.slice(i, i + DETAIL_CONCURRENCY);
      details.push(...await Promise.all(batch.map((b: BookSummary) =>
        bookLibraryService.getBookDetail(b.notebookId).catch((err) => {
          logger.warn('search: book detail failed', { notebookId: b.notebookId, error: String(err) });
          return null;
        })
      )));
    }
    const entries: ChapterEntry[] = [];
    for (const detail of details) {
      if (!detail) continue;
      const bookName = detail.bookName || detail.title;
      for (const ch of detail.chapters) {
        const concepts = (ch.keyConcepts || []).map((k: any) => (typeof k === 'string' ? k : k?.term)).filter(Boolean);
        entries.push({
          notebookId: detail.notebookId,
          sourceId: ch.sourceId,
          title: ch.title,
          chapterName: ch.chapterName,
          bookName,
          subject: detail.subject,
          className: detail.className,
          fields: indexFields([
            { text: ch.chapterName || ch.title, weight: 3 },
            { text: [...concepts, ...(ch.keywords || []), ...(ch.headings || [])].join(' · '), weight: 1.2 },
            { text: bookName, weight: 1 },
            { text: detail.subject, weight: 1 },
            { text: detail.className || '', weight: 1 },
          ]),
        });
      }
    }
    logger.info('search: chapter index built', { books: books.length, chapters: entries.length });
    return entries;
  }

  private async getUserContent(userId: string): Promise<UserDoc[]> {
    const cacheKey = `search:user_content:${userId}`;
    const cached = await cacheService.get<UserDoc[]>(cacheKey);
    if (cached) return cached;

    const settle = async (label: string, fn: () => Promise<UserDoc[]>): Promise<UserDoc[]> => {
      try {
        return await fn();
      } catch (err) {
        // One collection failing (e.g. a missing index) must not take the others down.
        logger.warn(`search: ${label} lookup failed`, { error: String(err) });
        return [];
      }
    };

    const groups = await Promise.all([
      settle('chat', async () => {
        const snap = await db.collection('chat_sessions').where('userId', '==', userId)
          .select('title', 'createdAt', 'updatedAt').limit(USER_DOC_LIMIT).get();
        return snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((s) => typeof s.title === 'string' && s.title.trim())
          .map((s) => ({ type: 'chat' as const, id: s.id, title: s.title, updatedAt: s.updatedAt || s.createdAt }));
      }),
      settle('notebook', async () => {
        const notebooks = await notebookRepository.getNotebooksByUser(userId);
        return notebooks.slice(0, USER_DOC_LIMIT)
          .filter((n) => n.title && !n.isArchived)
          .map((n) => ({ type: 'notebook' as const, id: n.id, title: n.title, updatedAt: n.updatedAt }));
      }),
      settle('podcast', async () => {
        const snap = await db.collection('podcasts').where('userId', '==', userId)
          .select('title', 'status', 'createdAt').limit(USER_DOC_LIMIT).get();
        return snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((p) => typeof p.title === 'string' && p.title.trim())
          .map((p) => ({ type: 'podcast' as const, id: p.id, title: p.title, status: p.status, updatedAt: p.createdAt }));
      }),
      settle('quiz', async () => {
        const snap = await db.collection('quiz_attempts').where('userId', '==', userId)
          .select('title', 'topic', 'notebookTitle', 'status', 'createdAt').limit(USER_DOC_LIMIT).get();
        return snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((q) => typeof q.title === 'string' && q.title.trim())
          .map((q) => ({
            type: 'quiz' as const,
            id: q.id,
            title: q.title,
            subtitle: [q.topic, q.notebookTitle].filter(Boolean).join(' · ') || undefined,
            status: q.status,
            updatedAt: q.createdAt ? Date.parse(q.createdAt) || undefined : undefined,
          }));
      }),
    ]);

    const docs = groups.flat();
    await cacheService.set(cacheKey, docs, USER_CONTENT_TTL_S);
    return docs;
  }
}

function top(hits: SearchHit[], n: number): SearchHit[] {
  return hits.sort((a, b) => b.score - a.score || (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, n);
}

function excerpt(text: string, max = 280): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max)}…`;
}

export const searchService = new SearchService();

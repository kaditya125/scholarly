import { api } from './client';

/** Mirrors backend-firestore/src/services/search/search.service.ts. */
export type SearchHitType = 'chapter' | 'chat' | 'notebook' | 'podcast' | 'quiz';

export interface SearchHit {
  type: SearchHitType;
  id: string;
  title: string;
  subtitle?: string;
  score: number;
  updatedAt?: number;
  status?: string;
  /** Chapter hits: `title` is the cleaned label, `sourceTitle` the raw source title. */
  sourceTitle?: string;
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
  sourceTitle?: string;
  chapterName?: string;
  bookName?: string;
  subject?: string;
  className?: string;
  pageNumber?: number;
  snippet: string;
  score: number;
}

export const searchApi = {
  /** Lexical search: every catalog chapter plus the caller's chats, notebooks, podcasts, quizzes. */
  async search(q: string, opts: { types?: SearchHitType[]; limit?: number; signal?: AbortSignal } = {}): Promise<SearchHit[]> {
    const response = await api.get('/search', {
      params: { q, types: opts.types?.join(','), limit: opts.limit },
      signal: opts.signal,
    });
    return response.data?.results || [];
  },

  /** Semantic search over textbook passages; one hit per chapter with the best passage. */
  async semantic(q: string, opts: { limit?: number; signal?: AbortSignal } = {}): Promise<SemanticHit[]> {
    const response = await api.get('/search/semantic', { params: { q, limit: opts.limit }, signal: opts.signal });
    return response.data?.results || [];
  },
};

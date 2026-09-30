import { api } from './client';

export interface BookSummary {
  notebookId: string;
  title: string;
  subject: string;
  className?: string;
  bookName?: string;
  chapterCount: number;
  readyChapterCount: number;
  estimatedStudyHours: number;
  updatedAt: number;
}

export interface BookChapter {
  sourceId: string;
  title: string;
  chapterName?: string;
  status: string;
  totalPages?: number;
  headings: string[];
  learningObjectives: string[];
  keyConcepts: { term: string; definition: string }[];
  importantFacts: string[];
  keywords: string[];
  formulae: string[];
  estimatedStudyTimeMinutes?: number;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
}

export interface BookDetail extends BookSummary {
  description?: string;
  chapters: BookChapter[];
}

/**
 * Clean, human display label for a chapter. Ingested curriculum metadata is inconsistent: some
 * chapters carry a good `chapterName` ("Chemical Kinetics"), some bake in a unit number
 * ("Unit 7 Alcohols, Phenols and Ethers") or a mis-extracted list marker ("I. AMINES"), and some
 * have none at all — where the raw source title ("NCERT Class 12 Chemistry (Part 1) - Chapter 1")
 * would otherwise show and truncate to just the book prefix. This tidies the name when present and
 * falls back to a compact "Chapter N · Part M" derived from the title, so the UI never shows the
 * noisy book-prefixed title. Shared by every chapter list/heading so labels stay consistent.
 */
export function chapterLabel(chapter: Pick<BookChapter, 'chapterName' | 'title'>): string {
  const raw = (chapter.chapterName || '').trim();
  const cleaned = raw ? cleanChapterName(raw) : '';
  if (cleaned) return cleaned;
  return titleFallbackLabel(chapter.title || '');
}

// Keep in step with backend-firestore/src/services/search/chapterLabel.ts (search indexes the same label).
const NUMBER_WORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty';
// "Unit 7", "Chapter 3:", "CHAPTER TWELVE:", "Unit III -" …
const UNIT_PREFIX = new RegExp(`^\\s*(?:unit|chapter)\\s*[-.]?\\s*(?:\\d+|[ivxlc]+|${NUMBER_WORDS})\\b\\s*[:.\\-\\u2013\\u2014\\u2015]?\\s*`, 'i');
// "11 ― Grassroots…", "6 Control and Coordination", "3. Motion"
const NUMBER_PREFIX = /^\s*\d{1,2}\s*[.)\-\u2013\u2014\u2015:]?\s+/;
// "I. AMINES", "II) …"
const ROMAN_PREFIX = /^\s*[IVXLC]+\s*[.)\-]\s+/;

function cleanChapterName(name: string): string {
  let s = name.replace(UNIT_PREFIX, '').replace(NUMBER_PREFIX, '').replace(ROMAN_PREFIX, '').trim();
  // Nothing name-like left (e.g. the name was literally "Unit 10" or "9") — signal empty to fall back.
  if ((s.match(/\p{L}/gu) || []).length < 2) return '';
  // De-SHOUT all-caps names ("AMINES" -> "Amines"); leave mixed-case names and acronyms untouched.
  if (s === s.toUpperCase() && /[A-Z]{2,}/.test(s)) {
    s = s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return s;
}

function titleFallbackLabel(title: string): string {
  const t = title.replace(/\.pdf$/i, '').trim();
  const part = (t.match(/Part\s*(\d+)/i) || [])[1];
  const chap = (t.match(/Chapter\s*(\d+)/i) || [])[1];
  if (chap) return part ? `Chapter ${chap} \u00b7 Part ${part}` : `Chapter ${chap}`;
  // Last resort: strip the "NCERT Class N Subject" prefix so the noisy full title never shows.
  const stripped = t.replace(/^NCERT\s+Class\s+\d+\s+[A-Za-z]+\s*/i, '').replace(/^[-\u2013\u2014\s(]+/, '').trim();
  return stripped || t;
}

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export const documentsApi = {
  async listBooks(): Promise<BookSummary[]> {
    const response = await api.get('/documents/books');
    return response.data;
  },

  async getBookDetail(notebookId: string): Promise<BookDetail> {
    const response = await api.get(`/documents/books/${notebookId}`);
    return response.data;
  },

  /**
   * Raw fetch URL for a book's cover PDF (fetched + rasterized client-side, not via axios).
   * The `v` token busts stale browser/CDN caches from the earlier implementation, which cached
   * the inner chapter page under this same URL with a 24h max-age. Bump it whenever the cover
   * source changes; each version is still safely long-cached because covers are immutable.
   */
  coverUrl(notebookId: string): string {
    return `${baseURL}/documents/books/${notebookId}/cover?v=2`;
  },

  /**
   * Raw fetch URL for a chapter's cover — the first page of that chapter's stored PDF, extracted
   * server-side to a single page and rasterized client-side (like the book cover). Bump `v` if the
   * server-side extraction changes.
   */
  chapterCoverUrl(notebookId: string, sourceId: string): string {
    return `${baseURL}/documents/books/${notebookId}/chapters/${sourceId}/cover?v=1`;
  },
};

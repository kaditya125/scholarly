import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  Search, Sparkles, CornerDownLeft, ArrowUp, ArrowDown, Loader2, RotateCcw,
  Copy, Check, BookOpen, FileText, ChevronDown, Info, ShieldAlert, Square,
  GraduationCap, X, History, Home, BotMessageSquare, FolderOpen, Award, Calendar,
  HelpCircle, Compass, Headphones, Users, Settings, LifeBuoy, Gift, Layers, BrainCircuit,
  BarChart2, Workflow, Plus, SunMoon, CheckSquare, ArrowRight, ThumbsUp, ThumbsDown, MessageSquare,
  CornerDownRight, NotebookPen, TextSearch, SlidersHorizontal, type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../lib/ThemeContext';
import { useBookLibrary } from '../hooks/ai/useDocuments';
import { useWorkflowStream } from '../hooks/ai/useWorkflowStream';
import { api } from '../lib/api/client';
import { searchApi, type SearchHit, type SemanticHit } from '../lib/api/search';
import { documentsApi, chapterLabel, type BookSummary, type BookChapter, type BookDetail } from '../lib/api/documents';
import {
  tokenize, indexFields, scoreItem, chapterMatches, namesBook, highlight, classNumber,
  loadRecentItems, pushRecentItem, loadRecentQueries, pushRecentQuery, clearRecentQueries,
  type IndexedField, type RecentItem,
} from '../lib/search/paletteSearch';
import { getExamBySlug } from '../lib/examCatalog';
import MarkdownMessage from './chat/MarkdownMessage';
import type { Rating } from './chat/AssistantReply';

type Mode = 'search' | 'ask';
type TypeFilter = 'all' | 'books' | 'chapters' | 'mine' | 'pages';
const TYPE_LABEL: Record<TypeFilter, string> = {
  all: 'All', books: 'Books', chapters: 'Chapters', mine: 'Your content', pages: 'Pages & actions',
};

// Subject → accent colour, used on the result icon only (no tinted tiles or badges).
const SUBJECT_ACCENT: Record<string, string> = {
  Physics: 'text-blue-500 dark:text-blue-400',
  Chemistry: 'text-rose-500 dark:text-rose-400',
  Biology: 'text-emerald-500 dark:text-emerald-400',
  Mathematics: 'text-indigo-500 dark:text-indigo-400',
  English: 'text-amber-500 dark:text-amber-400',
  Hindi: 'text-orange-500 dark:text-orange-400',
  Science: 'text-teal-500 dark:text-teal-400',
  'Social Science': 'text-fuchsia-500 dark:text-fuchsia-400',
  History: 'text-yellow-600 dark:text-yellow-400',
  Geography: 'text-cyan-500 dark:text-cyan-400',
  Economics: 'text-lime-600 dark:text-lime-400',
};
const MUTED_ICON = 'text-slate-400 dark:text-gray-500';
const accentFor = (subject?: string) => (subject && SUBJECT_ACCENT[subject]) || MUTED_ICON;

// Static destinations. Keywords make "exam", "schedule", "profile" etc. find the right page.
const PAGES: { label: string; path: string; icon: LucideIcon; keywords: string }[] = [
  { label: 'Home', path: '/dashboard', icon: Home, keywords: 'dashboard start overview' },
  { label: 'AI Chat', path: '/chat', icon: BotMessageSquare, keywords: 'assistant ask tutor conversation' },
  { label: 'Documents', path: '/documents', icon: FolderOpen, keywords: 'library books ncert textbooks' },
  { label: 'Tests', path: '/tests', icon: CheckSquare, keywords: 'exam quiz practice mock' },
  { label: 'Leaderboard', path: '/leaderboard', icon: Award, keywords: 'rank ranking points' },
  { label: 'Notebooks', path: '/notebooks', icon: BookOpen, keywords: 'notes' },
  { label: 'Study Plan', path: '/planner', icon: Calendar, keywords: 'planner schedule timetable calendar' },
  { label: 'My Doubts', path: '/doubts', icon: HelpCircle, keywords: 'questions doubt' },
  { label: 'Explore', path: '/explore', icon: Compass, keywords: 'discover browse' },
  { label: 'Flashcards', path: '/flashcards', icon: Layers, keywords: 'cards revision memorize' },
  { label: 'Deep Research', path: '/research', icon: BrainCircuit, keywords: 'research report' },
  { label: 'Analytics', path: '/analytics', icon: BarChart2, keywords: 'progress stats performance' },
  { label: 'Podcasts', path: '/podcasts', icon: Headphones, keywords: 'audio listen' },
  { label: 'Content Pipeline', path: '/pipeline', icon: Workflow, keywords: 'create generate' },
  { label: 'Community', path: '/community', icon: Users, keywords: 'forum social' },
  { label: 'Study Groups', path: '/groups', icon: Users, keywords: 'group friends' },
  { label: 'My Classes', path: '/my-classes', icon: GraduationCap, keywords: 'teacher class course' },
  { label: 'Settings', path: '/settings', icon: Settings, keywords: 'preferences account profile' },
  { label: 'Help & Support', path: '/support', icon: LifeBuoy, keywords: 'help support contact faq' },
  { label: 'Invite Friends', path: '/refer', icon: Gift, keywords: 'refer referral invite' },
];
const PAGE_INDEX = PAGES.map((p) => indexFields([{ text: p.label, weight: 3 }, { text: p.keywords, weight: 1.5 }]));

type ActionId = 'new-chat' | 'new-test' | 'new-podcast' | 'toggle-theme';
const ACTIONS: { id: ActionId; label: string; icon: LucideIcon; keywords: string }[] = [
  { id: 'new-chat', label: 'New chat', icon: Plus, keywords: 'start ask ai conversation' },
  { id: 'new-test', label: 'Start a practice test', icon: CheckSquare, keywords: 'exam quiz mock generate' },
  { id: 'new-podcast', label: 'Create a podcast', icon: Headphones, keywords: 'audio generate' },
  { id: 'toggle-theme', label: 'Toggle dark / light mode', icon: SunMoon, keywords: 'theme dark light appearance' },
];
const ACTION_INDEX = ACTIONS.map((a) => indexFields([{ text: a.label, weight: 3 }, { text: a.keywords, weight: 1.5 }]));

type BookRef = Pick<BookSummary, 'notebookId' | 'title' | 'bookName' | 'subject' | 'className'>;
type ChapterRef = Pick<BookChapter, 'sourceId' | 'chapterName' | 'title'>;
type ContentType = Exclude<SearchHit['type'], 'chapter'>;

// The caller's own content, returned by GET /api/search. Group order is by best score.
const CONTENT_GROUPS: { type: ContentType; label: string; icon: LucideIcon }[] = [
  { type: 'chat', label: 'Chats', icon: MessageSquare },
  { type: 'notebook', label: 'Notebooks', icon: NotebookPen },
  { type: 'quiz', label: 'Quizzes', icon: CheckSquare },
  { type: 'podcast', label: 'Podcasts', icon: Headphones },
];
const CONTENT_ICON = Object.fromEntries(CONTENT_GROUPS.map((g) => [g.type, g.icon])) as Record<ContentType, LucideIcon>;

type PaletteItem =
  | { kind: 'book'; key: string; book: BookSummary }
  | { kind: 'chapter'; key: string; book: BookRef; chapter: ChapterRef }
  | { kind: 'content'; key: string; hit: SearchHit }
  | { kind: 'passage'; key: string; hit: SemanticHit; book: BookRef }
  | { kind: 'recent'; key: string; entry: RecentItem }
  | { kind: 'query'; key: string; query: string }
  | { kind: 'page'; key: string; label: string; path: string; icon: LucideIcon }
  | { kind: 'action'; key: string; id: ActionId; label: string; icon: LucideIcon }
  | { kind: 'ask'; key: string; query: string };

interface Group {
  label: string;
  items: PaletteItem[];
  offset: number;
  /** Optional header action (e.g. "Clear" on recent searches). */
  onClear?: () => void;
}

interface ScoredGroup { label: string; items: PaletteItem[]; top: number }

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';

const bookName = (b: Pick<BookSummary, 'bookName' | 'title'>) => b.bookName || b.title;
/** "NCERT Class 11 Physics" → "Class 11 Physics"; named books ("Footprints Without Feet") unchanged. */
const bookDisplayName = (b: Pick<BookSummary, 'bookName' | 'title'>) => b.bookName || b.title.replace(/^NCERT\s+/i, '');
/** Secondary line for a chapter: which book it's in, without repeating the class twice. */
const bookContext = (b: Pick<BookSummary, 'bookName' | 'title' | 'className'>) =>
  b.bookName ? [b.bookName, b.className].filter(Boolean).join(' · ') : bookDisplayName(b);

function dedupeSources(cits: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const c of cits || []) {
    const key = c?.notebookId && c?.sourceId ? `${c.notebookId}:${c.sourceId}` : (c?.title || c?.source || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.slice(0, 6);
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Semantic search costs an embedding + rerank, so only phrase-like or long queries use it. */
function wantsSemantic(q: string): boolean {
  return q.length >= 10 || (q.length >= 8 && tokenize(q).length >= 2);
}

/**
 * Where a cited source opens, or null when it has no page of its own.
 *
 * Official-syllabus citations carry a synthetic `exam-<examId>` notebook id and a syllabus-version
 * id as `sourceId` (RetrievalOrchestrator). They are not chapters: sending them to /read made the
 * reader report "This chapter has been removed". They open the exam's syllabus page instead.
 */
function citationTarget(c: any): { kind: 'chapter' } | { kind: 'exam'; slug: string } | null {
  const notebookId = typeof c?.notebookId === 'string' ? c.notebookId : '';
  if (notebookId.startsWith('exam-')) {
    const slug = notebookId.slice('exam-'.length).toLowerCase().replace(/_/g, '-');
    return getExamBySlug(slug) ? { kind: 'exam', slug } : null;
  }
  return notebookId && c?.sourceId ? { kind: 'chapter' } : null;
}

/** Top `n` of `items` by score, dropping non-matches. */
function topScored<T>(items: T[], score: (it: T) => number | null, n: number): { item: T; score: number }[] {
  const out: { item: T; score: number }[] = [];
  for (const item of items) {
    const s = score(item);
    if (s != null) out.push({ item, score: s });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}

/**
 * Global command palette / spotlight. Opened from the header search (or Cmd/Ctrl+K).
 * Two modes:
 *   - "search": ranked, typo-tolerant client-side search over the book catalog, chapters of books
 *     whose detail is already cached, app pages and quick actions. Subject / class / type filters
 *     narrow it; recent searches and recently opened content fill the empty state.
 *   - "ask": one-shot grounded RAG question (useWorkflowStream); renders the streamed answer
 *     with cited sources, each deep-linking into the reader.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toggleTheme } = useTheme();
  const { books, isLoading: booksLoading, isError: booksError, refetch: refetchBooks } = useBookLibrary();
  const stream = useWorkflowStream();
  const { cancelStream } = stream;

  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [hasAsked, setHasAsked] = useState(false);
  const [askedQuestion, setAskedQuestion] = useState('');
  const [copied, setCopied] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<'type' | 'subject' | 'class' | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [detailTick, setDetailTick] = useState(0);
  // Ask AI: each question runs in a real chat session, so it can be continued in /chat,
  // followed up in place, and rated like any chat reply.
  const [askSessionId, setAskSessionId] = useState<string | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [ratingError, setRatingError] = useState(false);
  const answerMessageIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset each time it opens; focus the input; load recents.
  useEffect(() => {
    if (!open) return;
    setMode('search');
    setQuery('');
    setSelected(0);
    setHasAsked(false);
    setAskedQuestion('');
    setCopied(false);
    setOpenError(null);
    setOpeningId(null);
    setOpenMenu(null);
    setShowFilters(false);
    setAskSessionId(null);
    setRating(null);
    setRatingError(false);
    setRecentItems(loadRecentItems());
    setRecentQueries(loadRecentQueries());
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [open]);

  // Closing the palette abandons any in-flight answer rather than streaming it into the void.
  useEffect(() => {
    if (!open) cancelStream();
  }, [open, cancelStream]);
  useEffect(() => () => cancelStream(), [cancelStream]);

  // Chapters are searchable for every book whose detail is in the React Query cache. Warm the
  // cache for recently opened books, and re-index whenever a detail query lands.
  useEffect(() => {
    if (!open) return;
    for (const id of new Set(loadRecentItems().map((r) => r.notebookId))) {
      queryClient.prefetchQuery({
        queryKey: ['book_detail', id],
        queryFn: () => documentsApi.getBookDetail(id),
        staleTime: 1000 * 60 * 10,
      });
    }
    return queryClient.getQueryCache().subscribe((ev) => {
      if (ev.type === 'updated' && ev.action.type === 'success' && ev.query.queryKey[0] === 'book_detail') {
        setDetailTick((t) => t + 1);
      }
    });
  }, [open, queryClient]);

  // ── Indexes (built once per data change, not per keystroke) ──
  const bookById = useMemo(() => new Map(books.map((b) => [b.notebookId, b])), [books]);

  const bookIndex = useMemo(
    () => books.map((b) => ({
      book: b,
      fields: indexFields([
        { text: bookName(b), weight: 3 },
        { text: b.title, weight: 2.5 },
        { text: b.subject, weight: 2 },
        { text: b.className || '', weight: 2 },
      ]),
    })),
    [books]
  );

  const chapterIndex = useMemo(() => {
    if (!open) return [];
    const out: { book: BookSummary; chapter: BookChapter; fields: IndexedField[] }[] = [];
    for (const [, detail] of queryClient.getQueriesData<BookDetail>({ queryKey: ['book_detail'] })) {
      if (!detail?.chapters) continue;
      const book = bookById.get(detail.notebookId) || detail;
      for (const chapter of detail.chapters) {
        out.push({
          book,
          chapter,
          // The first two fields are the chapter's own; a chapter only shows if one of them hit,
          // so "physics" lists physics books rather than every physics chapter.
          fields: indexFields([
            { text: chapterLabel(chapter), weight: 3 },
            {
              text: [
                ...(chapter.keyConcepts || []).map((k) => k.term),
                ...(chapter.keywords || []),
                ...(chapter.headings || []),
              ].join(' · '),
              weight: 1.2,
            },
            { text: bookName(book), weight: 1 },
            { text: book.subject, weight: 1 },
            { text: book.className || '', weight: 1 },
          ]),
        });
      }
    }
    return out;
    // detailTick: re-read the cache when a book_detail query resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, detailTick, bookById, queryClient]);

  const subjects = useMemo(() => Array.from(new Set(books.map((b) => b.subject).filter(Boolean))).sort(), [books]);
  const classes = useMemo(
    () => Array.from(new Set(books.map((b) => b.className).filter((c): c is string => !!c)))
      .sort((a, b) => classNumber(a) - classNumber(b) || a.localeCompare(b)),
    [books]
  );

  const contentFilterActive = !!subjectFilter || !!classFilter;
  const passesFilters = useCallback(
    (b: Pick<BookSummary, 'subject' | 'className'>) =>
      (!subjectFilter || b.subject === subjectFilter) && (!classFilter || b.className === classFilter),
    [subjectFilter, classFilter]
  );

  const tokens = useMemo(() => tokenize(query), [query]);
  const trimmedQuery = query.trim();

  // ── Server search (whole chapter catalog + the student's own content, and textbook passages) ──
  // Results only count while they belong to the current query, so a stale response never
  // shows rows that don't match what's typed.
  const debouncedQuery = useDebounced(trimmedQuery, 180);
  const semanticQuery = useDebounced(trimmedQuery, 450);
  const searchActive = open && mode === 'search';
  const serverEnabled = searchActive && debouncedQuery.length >= 2;
  const serverSearch = useQuery({
    queryKey: ['palette_search', debouncedQuery],
    queryFn: ({ signal }) => searchApi.search(debouncedQuery, { limit: 8, signal }),
    enabled: serverEnabled,
    staleTime: 30_000,
    retry: false,
  });
  const semanticEnabled = searchActive && (typeFilter === 'all' || typeFilter === 'chapters') && wantsSemantic(semanticQuery);
  const semanticSearch = useQuery({
    queryKey: ['palette_semantic', semanticQuery],
    queryFn: ({ signal }) => searchApi.semantic(semanticQuery, { limit: 4, signal }),
    enabled: semanticEnabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const serverHits = serverEnabled && debouncedQuery === trimmedQuery ? serverSearch.data : undefined;
  const semanticHits = semanticEnabled && semanticQuery === trimmedQuery ? semanticSearch.data : undefined;
  const serverPending = serverEnabled && (debouncedQuery !== trimmedQuery || serverSearch.isFetching);
  const semanticPending = searchActive && (typeFilter === 'all' || typeFilter === 'chapters') && wantsSemantic(trimmedQuery)
    && (semanticQuery !== trimmedQuery || semanticSearch.isFetching);

  // ── Result groups ──
  const groups: Group[] = useMemo(() => {
    const showBooks = typeFilter === 'all' || typeFilter === 'books';
    const showChapters = typeFilter === 'all' || typeFilter === 'chapters';
    // Pages and actions have no subject/class, so a content filter hides them.
    const showPages = (typeFilter === 'all' || typeFilter === 'pages') && !contentFilterActive;
    const focused = typeFilter !== 'all';
    const raw: Omit<Group, 'offset'>[] = [];

    if (!tokens.length) {
      const unfiltered = typeFilter === 'all' && !contentFilterActive;
      if (unfiltered && recentQueries.length) {
        raw.push({
          label: 'Recent searches',
          items: recentQueries.slice(0, 3).map((q) => ({ kind: 'query', key: `q:${q}`, query: q })),
          onClear: () => { clearRecentQueries(); setRecentQueries([]); },
        });
      }
      const recents = recentItems.filter((r) => passesFilters(r) && (
        typeFilter === 'all' || (typeFilter === 'books' && r.kind === 'book') || (typeFilter === 'chapters' && r.kind === 'chapter')
      ));
      if (recents.length) {
        raw.push({ label: 'Recently opened', items: recents.slice(0, 5).map((r) => ({ kind: 'recent', key: `r:${r.notebookId}:${r.sourceId || ''}`, entry: r })) });
      }
      if (unfiltered) {
        raw.push({ label: 'Quick actions', items: ACTIONS.map((a) => ({ kind: 'action', key: `a:${a.id}`, id: a.id, label: a.label, icon: a.icon })) });
      }
      if (showBooks) {
        // Unfiltered: newest catalog additions (updatedAt is ingest time, not the student's
        // activity — the real activity lives in "Recently opened"). Filtered: browse order.
        const list = books.filter(passesFilters).sort(unfiltered
          ? (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
          : (a, b) => classNumber(a.className) - classNumber(b.className) || a.subject.localeCompare(b.subject) || bookName(a).localeCompare(bookName(b)));
        const limit = unfiltered ? 8 : 60;
        const items: PaletteItem[] = list.slice(0, limit).map((b) => ({ kind: 'book', key: `b:${b.notebookId}`, book: b }));
        if (list.length > limit) {
          items.push({ kind: 'page', key: 'p:all-books', label: `Browse all ${list.length} books`, path: '/documents', icon: ArrowRight });
        }
        if (items.length) raw.push({ label: unfiltered ? 'Recently added' : 'Books', items });
      }
      if (typeFilter === 'pages') {
        raw.push({ label: 'Pages', items: PAGES.map((p) => ({ kind: 'page', key: `p:${p.path}`, label: p.label, path: p.path, icon: p.icon })) });
        raw.push({ label: 'Actions', items: ACTIONS.map((a) => ({ kind: 'action', key: `a:${a.id}`, id: a.id, label: a.label, icon: a.icon })) });
      }
    } else {
      const scored: ScoredGroup[] = [];
      const push = <T,>(label: string, hits: { item: T; score: number }[], toItem: (t: T) => PaletteItem) => {
        if (hits.length) scored.push({ label, items: hits.map((h) => toItem(h.item)), top: hits[0].score });
      };
      if (showBooks) {
        push('Books', topScored(bookIndex, (e) => (passesFilters(e.book) ? scoreItem(tokens, e.fields)?.score ?? null : null), focused ? 30 : 6),
          (e) => ({ kind: 'book', key: `b:${e.book.notebookId}`, book: e.book }));
      }
      if (showChapters) {
        // Local hits (cached book details) show instantly; server hits cover the whole catalog.
        // Both use the same scorer, so the higher score wins for a chapter found by both.
        const merged = new Map<string, { item: PaletteItem; score: number }>();
        const queryNamesABook = bookIndex.some((e) => namesBook(tokens, e.fields));
        for (const { item: e, score } of topScored(chapterIndex, (e) => {
          if (!passesFilters(e.book)) return null;
          const m = scoreItem(tokens, e.fields);
          return m && chapterMatches(tokens, e.fields, queryNamesABook) ? m.score : null;
        }, 30)) {
          const key = `c:${e.book.notebookId}:${e.chapter.sourceId}`;
          merged.set(key, { item: { kind: 'chapter', key, book: e.book, chapter: e.chapter }, score });
        }
        for (const h of serverHits || []) {
          if (h.type !== 'chapter' || !h.notebookId || !h.sourceId) continue;
          if (!passesFilters({ subject: h.subject || '', className: h.className })) continue;
          const key = `c:${h.notebookId}:${h.sourceId}`;
          if ((merged.get(key)?.score ?? -1) >= h.score) continue;
          const book: BookRef = bookById.get(h.notebookId)
            || { notebookId: h.notebookId, title: h.bookName || '', bookName: h.bookName, subject: h.subject || '', className: h.className };
          merged.set(key, { item: { kind: 'chapter', key, book, chapter: { sourceId: h.sourceId, chapterName: h.chapterName, title: h.sourceTitle || h.title } }, score: h.score });
        }
        const list = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, focused ? 30 : 6);
        if (list.length) scored.push({ label: 'Chapters', items: list.map((x) => x.item), top: list[0].score });
      }
      if ((typeFilter === 'all' || typeFilter === 'mine') && !contentFilterActive) {
        for (const g of CONTENT_GROUPS) {
          const hits = (serverHits || []).filter((h) => h.type === g.type).slice(0, focused ? 20 : 4);
          if (hits.length) {
            scored.push({ label: g.label, items: hits.map((hit) => ({ kind: 'content', key: `u:${hit.type}:${hit.id}`, hit })), top: hits[0].score });
          }
        }
      }
      if (showPages) {
        push('Pages', topScored(PAGES.map((p, i) => ({ p, i })), ({ i }) => scoreItem(tokens, PAGE_INDEX[i])?.score ?? null, focused ? 20 : 4),
          ({ p }) => ({ kind: 'page', key: `p:${p.path}`, label: p.label, path: p.path, icon: p.icon }));
        push('Actions', topScored(ACTIONS.map((a, i) => ({ a, i })), ({ i }) => scoreItem(tokens, ACTION_INDEX[i])?.score ?? null, 3),
          ({ a }) => ({ kind: 'action', key: `a:${a.id}`, id: a.id, label: a.label, icon: a.icon }));
      }
      // Best-matching group first, so "settings" leads with the page and "physics" with books.
      scored.sort((a, b) => b.top - a.top);
      raw.push(...scored);
      // Semantic scores aren't on the lexical scale, so passages keep a fixed slot after them.
      const passages = (semanticHits || []).filter((h) => passesFilters({ subject: h.subject || '', className: h.className }));
      if (showChapters && passages.length) {
        raw.push({
          label: 'Inside your textbooks',
          items: passages.map((hit) => ({
            kind: 'passage',
            key: `s:${hit.notebookId}:${hit.sourceId}`,
            hit,
            book: bookById.get(hit.notebookId)
              || { notebookId: hit.notebookId, title: hit.bookName || '', bookName: hit.bookName, subject: hit.subject || '', className: hit.className },
          })),
        });
      }
      raw.push({ label: 'Ask AI', items: [{ kind: 'ask', key: 'ask', query: trimmedQuery }] });
    }

    let offset = 0;
    return raw.map((g) => {
      const withOffset = { ...g, offset };
      offset += g.items.length;
      return withOffset;
    });
  }, [tokens, trimmedQuery, typeFilter, contentFilterActive, passesFilters, recentQueries, recentItems, books, bookById, bookIndex, chapterIndex, serverHits, semanticHits]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const active = flat.length ? Math.min(selected, flat.length - 1) : -1;
  const hasResults = flat.some((i) => i.kind !== 'ask');

  // Keep the keyboard selection visible.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  // ── Open helpers → reader ──
  const goToChapter = (book: Pick<BookSummary, 'notebookId' | 'title' | 'bookName' | 'subject' | 'className'>, chapter: Pick<BookChapter, 'sourceId' | 'chapterName' | 'title'>, kind: RecentItem['kind']) => {
    setRecentItems(pushRecentItem({
      kind,
      notebookId: book.notebookId,
      sourceId: kind === 'chapter' ? chapter.sourceId : undefined,
      title: kind === 'chapter' ? chapterLabel(chapter) : bookName(book),
      bookName: bookName(book),
      subject: book.subject,
      className: book.className,
    }));
    const params = new URLSearchParams({
      notebookId: book.notebookId,
      sourceId: chapter.sourceId,
      title: chapter.chapterName || chapter.title || book.title,
      book: bookName(book),
      subject: book.subject,
    });
    onClose();
    navigate(`/read?${params.toString()}`);
  };

  const openBook = async (book: BookSummary) => {
    if (openingId) return; // a second Enter while loading must not navigate twice
    setOpenError(null);
    setOpeningId(book.notebookId);
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: ['book_detail', book.notebookId],
        queryFn: () => documentsApi.getBookDetail(book.notebookId),
        staleTime: 1000 * 60 * 10,
      });
      const chapter = detail.chapters.find((c) => c.status === 'READY') || detail.chapters[0];
      if (chapter) {
        goToChapter(book, chapter, 'book');
      } else {
        onClose();
        navigate('/documents');
      }
    } catch {
      setOpenError(`Couldn't open “${bookName(book)}”. Check your connection and try again.`);
    } finally {
      setOpeningId(null);
    }
  };

  const openRecent = (r: RecentItem) => {
    if (r.kind === 'chapter' && r.sourceId) {
      goToChapter(
        { notebookId: r.notebookId, title: r.bookName, bookName: r.bookName, subject: r.subject, className: r.className },
        { sourceId: r.sourceId, chapterName: r.title, title: r.title },
        'chapter'
      );
      return;
    }
    const book = bookById.get(r.notebookId);
    if (book) openBook(book);
    else {
      onClose();
      navigate('/documents');
    }
  };

  const openSource = (c: any) => {
    const target = citationTarget(c);
    if (!target) return;
    if (target.kind === 'exam') {
      onClose();
      navigate(`/exams/${target.slug}?tab=syllabus`);
      return;
    }
    const params = new URLSearchParams({
      notebookId: c.notebookId,
      sourceId: c.sourceId,
      title: c.title || c.source || 'Chapter',
    });
    onClose();
    navigate(`/read?${params.toString()}`);
  };

  const openContent = (hit: SearchHit) => {
    onClose();
    if (hit.type === 'chat') navigate(`/chat?session=${encodeURIComponent(hit.id)}`);
    else if (hit.type === 'notebook') navigate(`/notebooks?open=${encodeURIComponent(hit.id)}`);
    else if (hit.type === 'quiz') navigate(`/quiz/attempts/${encodeURIComponent(hit.id)}`);
    else navigate('/podcasts'); // the podcasts page has no per-episode deep link
  };

  const runAction = (id: ActionId) => {
    onClose();
    if (id === 'new-chat') {
      navigate('/chat');
      window.dispatchEvent(new CustomEvent('new-chat'));
    } else if (id === 'new-test') navigate('/tests');
    else if (id === 'new-podcast') navigate('/podcasts');
    else if (id === 'toggle-theme') toggleTheme();
  };

  // ── Ask AI (one-shot RAG) ──
  /** `followUp` keeps the current session so the model sees the previous turn. */
  const runAsk = (q: string, { followUp = false }: { followUp?: boolean } = {}) => {
    const question = q.trim();
    if (!question || !user?.uid) return;
    setMode('ask');
    setHasAsked(true);
    setAskedQuestion(question);
    setQuery(question);
    setRecentQueries(pushRecentQuery(question));
    setRating(null);
    setRatingError(false);
    answerMessageIdRef.current = null;
    const sessionId = followUp && askSessionId
      ? askSessionId
      : typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    setAskSessionId(sessionId);
    const model = localStorage.getItem('selectedModel') || 'gemini';
    // Errors surface via stream.error; swallow the rejection so it isn't unhandled.
    stream.startStream({ userId: user.uid, sessionId, message: question, model, topicType: 'chat' }).catch(() => {});
  };

  /**
   * The stream never carries the persisted message id (the server saves the reply after the
   * stream closes), so read it back from the session history — the same approach Chat uses.
   * Looked up lazily on first rating, with one retry in case the save hasn't landed yet.
   */
  const resolveAnswerMessageId = async (sessionId: string): Promise<string | null> => {
    if (answerMessageIdRef.current) return answerMessageIdRef.current;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 800));
      const res = await api.get(`/chat/sessions/${sessionId}`);
      const rows = Array.isArray(res.data) ? res.data : [];
      const id = [...rows].reverse().find((m: any) => m.role === 'ai')?.id;
      if (id) return (answerMessageIdRef.current = id);
    }
    return null;
  };

  const rate = async (next: Rating) => {
    if (!askSessionId || rating === next) return;
    const previous = rating;
    setRating(next); // optimistic; rolled back if the POST fails
    setRatingError(false);
    try {
      const messageId = await resolveAnswerMessageId(askSessionId);
      if (!messageId) throw new Error('answer not saved yet');
      await api.post(`/chat/${messageId}/feedback`, {
        sessionId: askSessionId,
        rating: next,
        modelUsed: localStorage.getItem('selectedModel') || 'gemini',
        learningMode: 'chat',
      });
    } catch {
      setRating(previous);
      setRatingError(true);
    }
  };

  const continueInChat = () => {
    if (!askSessionId) return;
    onClose();
    navigate(`/chat?session=${encodeURIComponent(askSessionId)}`);
  };

  const activate = (item: PaletteItem | undefined) => {
    if (!item) return;
    // Opening a result from a real query remembers the query.
    if (trimmedQuery && item.kind !== 'ask' && item.kind !== 'query') setRecentQueries(pushRecentQuery(trimmedQuery));
    switch (item.kind) {
      case 'book': openBook(item.book); break;
      case 'chapter': goToChapter(item.book, item.chapter, 'chapter'); break;
      case 'passage':
        goToChapter(item.book, { sourceId: item.hit.sourceId, chapterName: item.hit.chapterName, title: item.hit.sourceTitle || item.hit.title }, 'chapter');
        break;
      case 'content': openContent(item.hit); break;
      case 'recent': openRecent(item.entry); break;
      case 'query': setQuery(item.query); setSelected(0); inputRef.current?.focus(); break;
      case 'page': onClose(); navigate(item.path); break;
      case 'action': runAction(item.id); break;
      case 'ask': runAsk(item.query); break;
    }
  };

  // ── Keyboard ──
  const onDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      // Stop here so the app-level Escape handler doesn't also close the palette under an open menu.
      e.stopPropagation();
      if (openMenu) setOpenMenu(null);
      else onClose();
      return;
    }
    if (e.key === 'Tab' && dialogRef.current) {
      // Focus trap: keep Tab inside the dialog.
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('input, button:not([disabled]):not([tabindex="-1"])')
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (mode === 'ask' || e.metaKey || e.ctrlKey) runAsk(query);
      else activate(flat[active]);
      return;
    }
    if (mode !== 'search' || !flat.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(active >= flat.length - 1 ? 0 : active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(active <= 0 ? flat.length - 1 : active - 1);
    }
  };

  const copyAnswer = () => {
    navigator.clipboard.writeText(stream.content || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sources = useMemo(
    () => dedupeSources(stream.data?.citations?.length ? stream.data.citations : stream.citations),
    [stream.data, stream.citations]
  );

  const followUps: string[] = useMemo(
    () => (Array.isArray(stream.suggestions) ? stream.suggestions : [])
      .filter((x): x is string => typeof x === 'string' && !!x.trim())
      .slice(0, 3),
    [stream.suggestions]
  );

  const clearFilters = () => { setTypeFilter('all'); setSubjectFilter(null); setClassFilter(null); setSelected(0); inputRef.current?.focus(); };
  const anyFilter = typeFilter !== 'all' || contentFilterActive;
  const askRecents = recentItems.slice(0, 3);
  const refocus = () => inputRef.current?.focus();

  // Active filters render as removable pills inside the search bar, so the filter row can stay collapsed.
  const filterPills: { key: string; label: string; clear: () => void }[] = [];
  if (typeFilter !== 'all') filterPills.push({ key: 'type', label: TYPE_LABEL[typeFilter], clear: () => setTypeFilter('all') });
  if (subjectFilter) filterPills.push({ key: 'subject', label: subjectFilter, clear: () => setSubjectFilter(null) });
  if (classFilter) filterPills.push({ key: 'class', label: classFilter, clear: () => setClassFilter(null) });

  const busy = (mode === 'ask' && stream.isStreaming) || (mode === 'search' && serverPending && tokens.length > 0);
  const streaming = mode === 'ask' && stream.isStreaming;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center px-3 sm:px-4 pt-[8vh] sm:pt-[14vh] bg-slate-950/20 dark:bg-black/50 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Search or ask AI"
            onKeyDown={onDialogKeyDown}
            className="w-full max-w-[640px] flex flex-col rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-white/[0.08] shadow-[0_24px_60px_-12px_rgba(15,23,42,0.28)] dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]"
            initial={{ opacity: 0, y: -6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.985 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
          >
            {/* ── Search bar ── */}
            <div className="flex items-center gap-2 h-[52px] pl-4 pr-2.5">
              <span className={cn('shrink-0 flex w-[18px] justify-center', mode === 'ask' ? 'text-indigo-500' : MUTED_ICON)}>
                {busy
                  ? <Loader2 className="w-[17px] h-[17px] animate-spin" />
                  : mode === 'ask'
                    ? <Sparkles className="w-[17px] h-[17px]" />
                    : <Search className="w-[17px] h-[17px]" />}
              </span>
              {mode === 'search' && filterPills.map((f) => (
                <button
                  key={f.key}
                  onClick={() => { f.clear(); setSelected(0); refocus(); }}
                  aria-label={`Remove filter: ${f.label}`}
                  className="shrink-0 inline-flex items-center gap-1 h-6 max-w-[140px] rounded-md bg-slate-100 dark:bg-white/[0.08] pl-2 pr-1 text-[12px] font-medium text-slate-600 dark:text-gray-300 hover:bg-slate-200/70 dark:hover:bg-white/[0.12] transition-colors"
                >
                  <span className="truncate">{f.label}</span>
                  <X className="w-3 h-3 shrink-0 opacity-60" />
                </button>
              ))}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(0); setOpenError(null); }}
                onKeyDown={onInputKeyDown}
                placeholder={mode === 'ask' ? 'Ask about your textbooks…' : 'Search or ask anything…'}
                role="combobox"
                aria-expanded={mode === 'search'}
                aria-controls="cmdk-listbox"
                aria-autocomplete="list"
                aria-activedescendant={mode === 'search' && active >= 0 ? `cmdk-opt-${active}` : undefined}
                className="flex-1 min-w-0 h-full bg-transparent outline-none text-[15px] text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500"
              />
              {query && (
                <IconButton label="Clear" onClick={() => { setQuery(''); setSelected(0); refocus(); }}>
                  <X className="w-3.5 h-3.5" />
                </IconButton>
              )}
              {mode === 'search' && (
                <IconButton
                  label="Filters"
                  pressed={showFilters}
                  dot={anyFilter && !showFilters}
                  onClick={() => { setShowFilters((v) => !v); setOpenMenu(null); refocus(); }}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </IconButton>
              )}
              <button
                onClick={() => {
                  if (mode === 'ask') { cancelStream(); setMode('search'); setHasAsked(false); }
                  else { setMode('ask'); if (query.trim()) runAsk(query); }
                  refocus();
                }}
                aria-pressed={mode === 'ask'}
                title={mode === 'ask' ? 'Back to search' : `Ask AI (${MOD_KEY}+Enter)`}
                className={cn(
                  'shrink-0 inline-flex items-center gap-1.5 h-7 rounded-md px-2 text-[12.5px] font-medium transition-colors',
                  mode === 'ask'
                    ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-white/[0.06]'
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Ask AI</span>
              </button>
            </div>

            {/* ── Filters (collapsed by default; active ones show as pills above) ── */}
            {mode === 'search' && showFilters && (
              <div className="flex items-center gap-1 px-3 pb-2 -mt-1 flex-wrap">
                <FilterMenu
                  label={typeFilter === 'all' ? 'Type' : TYPE_LABEL[typeFilter]}
                  active={typeFilter !== 'all'}
                  open={openMenu === 'type'}
                  onToggle={() => setOpenMenu(openMenu === 'type' ? null : 'type')}
                  onClose={() => setOpenMenu(null)}
                  options={(['all', 'books', 'chapters', 'mine', 'pages'] as TypeFilter[]).map((v) => ({ value: v, label: v === 'all' ? 'All types' : TYPE_LABEL[v] }))}
                  value={typeFilter}
                  onSelect={(v) => { setTypeFilter(v as TypeFilter); setSelected(0); refocus(); }}
                />
                <FilterMenu
                  label={subjectFilter || 'Subject'}
                  active={!!subjectFilter}
                  open={openMenu === 'subject'}
                  onToggle={() => setOpenMenu(openMenu === 'subject' ? null : 'subject')}
                  onClose={() => setOpenMenu(null)}
                  options={[{ value: '', label: 'All subjects' }, ...subjects.map((v) => ({ value: v, label: v }))]}
                  value={subjectFilter || ''}
                  onSelect={(v) => { setSubjectFilter(v || null); setSelected(0); refocus(); }}
                />
                <FilterMenu
                  label={classFilter || 'Class'}
                  active={!!classFilter}
                  open={openMenu === 'class'}
                  onToggle={() => setOpenMenu(openMenu === 'class' ? null : 'class')}
                  onClose={() => setOpenMenu(null)}
                  options={[{ value: '', label: 'All classes' }, ...classes.map((v) => ({ value: v, label: v }))]}
                  value={classFilter || ''}
                  onSelect={(v) => { setClassFilter(v || null); setSelected(0); refocus(); }}
                />
                {anyFilter && (
                  <button onClick={clearFilters} className="h-7 px-2 rounded-md text-[12.5px] text-slate-400 hover:text-slate-700 dark:text-gray-500 dark:hover:text-gray-200 transition-colors">
                    Reset
                  </button>
                )}
              </div>
            )}

            <div className="h-px bg-slate-100 dark:bg-white/[0.06]" />

            {/* ── Body ── */}
            {mode === 'search' ? (
              <div
                ref={listRef}
                id="cmdk-listbox"
                role="listbox"
                aria-label="Search results"
                className="max-h-[min(440px,56vh)] overflow-y-auto overscroll-contain custom-scrollbar py-1.5"
              >
                {openError && (
                  <div role="alert" className="mx-3 my-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-600 dark:text-rose-400">
                    {openError}
                  </div>
                )}

                {booksLoading && !tokens.length && (
                  <div className="py-1" aria-busy="true" aria-label="Loading">
                    {[72, 56, 64].map((w) => (
                      <div key={w} className="flex items-center gap-3 mx-1.5 px-2.5 h-9">
                        <span className="w-4 h-4 rounded bg-slate-100 dark:bg-white/[0.06] animate-pulse" />
                        <span className="h-2.5 rounded bg-slate-100 dark:bg-white/[0.06] animate-pulse" style={{ width: `${w}%` }} />
                      </div>
                    ))}
                  </div>
                )}
                {booksError && (
                  <div className="px-4 py-2 text-[12.5px] text-slate-500 dark:text-gray-400">
                    Couldn't load your library.{' '}
                    <button onClick={() => refetchBooks()} className="font-medium text-slate-700 dark:text-gray-200 underline underline-offset-2">Retry</button>
                  </div>
                )}

                {tokens.length > 0 && !hasResults && !booksLoading && !serverPending && !semanticPending && (
                  <div className="px-4 pt-5 pb-3 text-center">
                    <p className="text-[13px] text-slate-600 dark:text-gray-300">
                      No results for <span className="font-medium text-slate-900 dark:text-white">“{trimmedQuery}”</span>{anyFilter ? ' with these filters' : ''}
                    </p>
                    <p className="mt-1 text-[12px] text-slate-400 dark:text-gray-500">
                      {anyFilter ? 'Try removing a filter, or ask AI below.' : 'Try another word, or ask AI below.'}
                    </p>
                  </div>
                )}
                {!tokens.length && !booksLoading && !booksError && flat.length === 0 && (
                  <div className="px-4 py-10 text-center text-[13px] text-slate-400 dark:text-gray-500">
                    {typeFilter === 'mine'
                      ? 'Type to search your chats, notebooks, quizzes and podcasts.'
                      : anyFilter ? 'Nothing matches these filters.' : 'Your library is empty.'}
                  </div>
                )}

                {groups.map((g, gi) => (
                  <div key={g.label} role="group" aria-label={g.label}>
                    <div className={cn('flex items-center justify-between px-4 pb-1', gi === 0 ? 'pt-1.5' : 'pt-3')}>
                      <span className="text-[11px] font-medium text-slate-400 dark:text-gray-500">{g.label}</span>
                      {g.onClear && (
                        <button tabIndex={-1} onClick={g.onClear} className="text-[11px] text-slate-400 hover:text-slate-700 dark:text-gray-500 dark:hover:text-gray-200 transition-colors">
                          Clear
                        </button>
                      )}
                    </div>
                    {g.items.map((item, i) => {
                      const idx = g.offset + i;
                      return (
                        <ResultRow
                          key={item.key}
                          item={item}
                          idx={idx}
                          isActive={idx === active}
                          tokens={tokens}
                          loading={item.kind === 'book' && openingId === item.book.notebookId}
                          onHover={() => { if (idx !== active) setSelected(idx); }}
                          onSelect={() => activate(item)}
                        />
                      );
                    })}
                  </div>
                ))}

                {tokens.length > 0 && semanticPending && !semanticHits?.length && (
                  <div className="flex items-center gap-3 mx-1.5 px-2.5 h-9 text-[12.5px] text-slate-400 dark:text-gray-500" aria-live="polite">
                    <Loader2 className="w-4 h-4 animate-spin" /> Searching inside your textbooks…
                  </div>
                )}
              </div>
            ) : !hasAsked ? (
              <div className="px-5 pt-5 pb-4">
                <p className="text-[13.5px] text-slate-700 dark:text-gray-200">Ask anything about your textbooks.</p>
                <ul className="mt-2.5 space-y-1.5">
                  {[
                    { icon: Info, text: 'Answers are grounded in the content you have access to.' },
                    { icon: FileText, text: 'Every source links to the exact chapter.' },
                    { icon: ShieldAlert, text: 'Double-check anything that looks off against its source.' },
                  ].map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-center gap-2.5 text-[12.5px] text-slate-400 dark:text-gray-500">
                      <Icon className="w-3.5 h-3.5 shrink-0" /> {text}
                    </li>
                  ))}
                </ul>
                {askRecents.length > 0 && (
                  <div className="mt-5 -mx-3.5">
                    <div className="px-4 pb-1 text-[11px] font-medium text-slate-400 dark:text-gray-500">Continue reading</div>
                    {askRecents.map((r) => (
                      <PlainRow
                        key={`${r.notebookId}:${r.sourceId || ''}`}
                        icon={r.kind === 'chapter' ? FileText : BookOpen}
                        iconClass={accentFor(r.subject)}
                        title={r.title}
                        secondary={r.kind === 'chapter' ? r.bookName.replace(/^NCERT\s+/i, '') : r.className}
                        onClick={() => openRecent(r)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="max-h-[min(520px,62vh)] overflow-y-auto overscroll-contain custom-scrollbar px-5 py-4" aria-live="polite">
                {stream.isStreaming && !stream.content ? (
                  <div aria-busy="true">
                    <p className="text-[12.5px] text-slate-400 dark:text-gray-500">Looking through your textbooks…</p>
                    <div className="mt-3 space-y-2">
                      {[92, 84, 60].map((w) => (
                        <div key={w} className="h-2.5 rounded bg-slate-100 dark:bg-white/[0.06] animate-pulse" style={{ width: `${w}%` }} />
                      ))}
                    </div>
                  </div>
                ) : stream.error ? (
                  <p className="text-[13px] text-slate-600 dark:text-gray-300">
                    Something went wrong.{' '}
                    <button onClick={() => runAsk(askedQuestion)} className="font-medium text-slate-900 dark:text-white underline underline-offset-2">Try again</button>
                  </p>
                ) : (
                  <>
                    <div className="font-answer text-[14px] leading-[1.7] text-slate-800 dark:text-gray-100 prose prose-slate dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-0 prose-pre:bg-[#1e1e1e] prose-pre:p-0">
                      <MarkdownMessage content={stream.content} />
                      {stream.isStreaming && <span className="inline-block w-1.5 h-4 ml-0.5 bg-indigo-500/80 animate-pulse align-middle rounded-sm" />}
                    </div>

                    {!stream.isStreaming && (
                      <>
                        <div className="mt-3 -ml-1.5 flex items-center gap-0.5">
                          <IconButton label="Helpful" pressed={rating === 'thumbs_up'} onClick={() => rate('thumbs_up')}>
                            <ThumbsUp className={cn('w-3.5 h-3.5', rating === 'thumbs_up' && 'fill-current text-emerald-500')} />
                          </IconButton>
                          <IconButton label="Not helpful" pressed={rating === 'thumbs_down'} onClick={() => rate('thumbs_down')}>
                            <ThumbsDown className={cn('w-3.5 h-3.5', rating === 'thumbs_down' && 'fill-current text-rose-500')} />
                          </IconButton>
                          <IconButton label={copied ? 'Copied' : 'Copy answer'} onClick={copyAnswer}>
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </IconButton>
                          <IconButton label="Regenerate" onClick={() => runAsk(askedQuestion)}>
                            <RotateCcw className="w-3.5 h-3.5" />
                          </IconButton>
                          {ratingError && <span role="status" className="ml-1.5 text-[11.5px] text-rose-500">Couldn't send feedback</span>}
                          {askSessionId && (
                            <button
                              onClick={continueInChat}
                              className="ml-auto inline-flex items-center gap-1.5 h-7 rounded-md px-2 text-[12.5px] font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-white/[0.06] transition-colors"
                            >
                              Continue in chat <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {followUps.length > 0 && (
                          <div className="mt-4 -mx-3.5">
                            <div className="px-4 pb-1 text-[11px] font-medium text-slate-400 dark:text-gray-500">Follow up</div>
                            {followUps.map((f) => (
                              <PlainRow key={f} icon={CornerDownRight} title={f} onClick={() => runAsk(f, { followUp: true })} />
                            ))}
                          </div>
                        )}

                        {sources.length > 0 && (
                          <div className="mt-4 -mx-3.5">
                            <div className="px-4 pb-1 text-[11px] font-medium text-slate-400 dark:text-gray-500">Sources</div>
                            {sources.map((c, i) => {
                              const clickable = !!citationTarget(c);
                              const excerpt = typeof c.text === 'string' ? c.text.replace(/\s+/g, ' ').trim() : '';
                              return (
                                <PlainRow
                                  key={i}
                                  icon={FileText}
                                  title={c.title || c.source}
                                  meta={c.pageNumber != null ? `p. ${c.pageNumber}` : undefined}
                                  reveal={excerpt ? `“${excerpt}”` : undefined}
                                  disabled={!clickable}
                                  onClick={() => openSource(c)}
                                />
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Footer: key hints; Stop while an answer streams ── */}
            <div className={cn(
              'items-center justify-between h-9 px-4 border-t border-slate-100 dark:border-white/[0.06] text-[11px] text-slate-400 dark:text-gray-500',
              streaming ? 'flex' : 'hidden sm:flex'
            )}>
              <div className="hidden sm:flex items-center gap-3.5">
                {mode === 'search' ? (
                  <>
                    <KeyHint keys={[<ArrowUp key="u" className="w-2.5 h-2.5" />, <ArrowDown key="d" className="w-2.5 h-2.5" />]}>Navigate</KeyHint>
                    <KeyHint keys={[<CornerDownLeft key="e" className="w-2.5 h-2.5" />]}>Open</KeyHint>
                    <KeyHint keys={[MOD_KEY, <CornerDownLeft key="e" className="w-2.5 h-2.5" />]}>Ask AI</KeyHint>
                  </>
                ) : (
                  <KeyHint keys={[<CornerDownLeft key="e" className="w-2.5 h-2.5" />]}>{hasAsked ? 'Ask again' : 'Ask'}</KeyHint>
                )}
              </div>
              {streaming ? (
                <button
                  onClick={() => cancelStream()}
                  className="ml-auto inline-flex items-center gap-1.5 h-6 rounded-md px-2 text-[12px] font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                  <Square className="w-2.5 h-2.5 fill-current" /> Stop
                </button>
              ) : (
                <KeyHint keys={['esc']}>Close</KeyHint>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ResultRow({
  item, idx, isActive, tokens, loading, onHover, onSelect,
}: {
  item: PaletteItem;
  idx: number;
  isActive: boolean;
  tokens: string[];
  loading: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  let icon: LucideIcon = BookOpen;
  let iconClass = MUTED_ICON;
  let title: React.ReactNode = null;
  let titleText = '';
  let secondary: string | undefined;
  let snippet: string | undefined;
  let meta: string | undefined;
  let highlightTitle = true;

  switch (item.kind) {
    case 'book':
      iconClass = accentFor(item.book.subject);
      titleText = bookDisplayName(item.book);
      // Named books get class · subject; "Class 11 Physics" already says both.
      secondary = item.book.bookName ? [item.book.className, item.book.subject].filter(Boolean).join(' · ') : undefined;
      break;
    case 'chapter':
      icon = FileText;
      iconClass = accentFor(item.book.subject);
      titleText = chapterLabel(item.chapter);
      secondary = bookContext(item.book);
      break;
    case 'passage':
      icon = TextSearch;
      iconClass = accentFor(item.hit.subject);
      titleText = chapterLabel({ chapterName: item.hit.chapterName, title: item.hit.sourceTitle || item.hit.title });
      secondary = bookContext(item.book);
      snippet = item.hit.snippet;
      meta = item.hit.pageNumber != null ? `p. ${item.hit.pageNumber}` : undefined;
      break;
    case 'content':
      icon = CONTENT_ICON[item.hit.type as ContentType] || FileText;
      titleText = item.hit.title;
      secondary = item.hit.subtitle;
      break;
    case 'recent':
      icon = item.entry.kind === 'chapter' ? FileText : BookOpen;
      iconClass = accentFor(item.entry.subject);
      titleText = item.entry.kind === 'chapter' ? item.entry.title : item.entry.title.replace(/^NCERT\s+/i, '');
      secondary = item.entry.kind === 'chapter' ? item.entry.bookName.replace(/^NCERT\s+/i, '') : undefined;
      highlightTitle = false;
      break;
    case 'query':
      icon = History;
      titleText = item.query;
      highlightTitle = false;
      break;
    case 'page':
    case 'action':
      icon = item.icon;
      titleText = item.label;
      break;
    case 'ask':
      icon = Sparkles;
      iconClass = 'text-indigo-500';
      title = (
        <>
          <span className="text-slate-500 dark:text-gray-400">Ask AI</span>{' '}
          <span className="font-medium text-slate-900 dark:text-white">{item.query}</span>
        </>
      );
      break;
  }
  const Icon = icon;

  return (
    <button
      id={`cmdk-opt-${idx}`}
      data-idx={idx}
      role="option"
      aria-selected={isActive}
      tabIndex={-1}
      onMouseMove={onHover}
      onClick={onSelect}
      className={cn(
        'flex mx-1.5 gap-3 px-2.5 rounded-lg text-left transition-colors duration-75',
        snippet ? 'items-start py-2' : 'items-center h-9',
        isActive ? 'bg-slate-100 dark:bg-white/[0.07]' : ''
      )}
      style={{ width: 'calc(100% - 12px)' }}
    >
      <Icon className={cn('w-4 h-4 shrink-0', snippet && 'mt-0.5', iconClass)} strokeWidth={1.75} />
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="truncate text-[13.5px] text-slate-700 dark:text-gray-200">
            {title ?? (highlightTitle ? <Highlighted text={titleText} tokens={tokens} /> : titleText)}
          </span>
          {secondary && (
            <span className="truncate shrink-[3] text-[12px] text-slate-400 dark:text-gray-500">
              <Highlighted text={secondary} tokens={tokens} subtle />
            </span>
          )}
        </span>
        {snippet && (
          <span className="block mt-0.5">
            <span className="line-clamp-2 text-[12px] leading-snug text-slate-500 dark:text-gray-400">
              <Highlighted text={snippet} tokens={tokens} subtle />
            </span>
          </span>
        )}
      </span>
      {meta && <span className="shrink-0 text-[11.5px] tabular-nums text-slate-400 dark:text-gray-500">{meta}</span>}
      {loading
        ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-slate-400" />
        : <CornerDownLeft className={cn('w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-gray-500', isActive ? 'opacity-100' : 'opacity-0')} />}
    </button>
  );
}

/** A row outside the search listbox (Ask AI follow-ups, sources, recents) with the same look. */
function PlainRow({
  icon: Icon, iconClass = MUTED_ICON, title, secondary, meta, reveal, disabled, onClick,
}: {
  icon: LucideIcon;
  iconClass?: string;
  title: string;
  secondary?: string;
  meta?: string;
  /** Extra text shown on hover / keyboard focus (e.g. the cited passage). */
  reveal?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group flex w-full gap-3 px-4 py-2 text-left rounded-lg transition-colors',
        reveal ? 'items-start' : 'items-center',
        disabled ? 'cursor-default' : 'hover:bg-slate-100 dark:hover:bg-white/[0.07] focus-visible:bg-slate-100 dark:focus-visible:bg-white/[0.07] outline-none'
      )}
    >
      <Icon className={cn('w-4 h-4 shrink-0', reveal && 'mt-0.5', iconClass)} strokeWidth={1.75} />
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="truncate text-[13.5px] text-slate-700 dark:text-gray-200">{title}</span>
          {secondary && <span className="truncate shrink-[3] text-[12px] text-slate-400 dark:text-gray-500">{secondary}</span>}
        </span>
        {reveal && (
          <span className="hidden group-hover:block group-focus-visible:block mt-1">
            <span className="line-clamp-3 text-[12px] leading-snug text-slate-500 dark:text-gray-400">{reveal}</span>
          </span>
        )}
      </span>
      {meta && <span className="shrink-0 text-[11.5px] tabular-nums text-slate-400 dark:text-gray-500">{meta}</span>}
    </button>
  );
}

function Highlighted({ text, tokens, subtle }: { text: string; tokens: string[]; subtle?: boolean }) {
  const parts = useMemo(() => highlight(text, tokens), [text, tokens]);
  return (
    <>
      {parts.map((p, i) => p.match
        ? (
          <mark
            key={i}
            className={cn('bg-transparent', subtle ? 'text-slate-600 dark:text-gray-300' : 'font-semibold text-slate-950 dark:text-white')}
          >
            {p.text}
          </mark>
        )
        : <React.Fragment key={i}>{p.text}</React.Fragment>)}
    </>
  );
}

function IconButton({
  label, onClick, pressed, dot, children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  /** Small indicator, e.g. filters are active while the filter row is collapsed. */
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        'relative shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors',
        pressed
          ? 'bg-slate-100 text-slate-900 dark:bg-white/[0.08] dark:text-white'
          : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:text-gray-500 dark:hover:text-gray-100 dark:hover:bg-white/[0.06]'
      )}
    >
      {children}
      {dot && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-500" />}
    </button>
  );
}

function FilterMenu({
  label, active, open, onToggle, onClose, options, value, onSelect,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  options: { value: string; label: string }[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1 h-7 rounded-md px-2 text-[12.5px] transition-colors',
          active
            ? 'font-medium text-slate-900 bg-slate-100 dark:text-white dark:bg-white/[0.08]'
            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-white/[0.06]',
          open && !active && 'bg-slate-100 dark:bg-white/[0.06]'
        )}
      >
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown className={cn('w-3 h-3 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1 z-30 min-w-[180px] max-h-64 overflow-y-auto custom-scrollbar rounded-lg bg-white dark:bg-[#222225] border border-slate-200/80 dark:border-white/[0.08] shadow-lg p-1"
        >
          {options.map((o) => (
            <button
              key={o.value || '__all'}
              role="option"
              aria-selected={o.value === value}
              onClick={() => { onSelect(o.value); onClose(); }}
              className={cn(
                'w-full flex items-center justify-between gap-3 h-8 px-2 rounded-md text-left text-[12.5px] transition-colors',
                o.value === value
                  ? 'text-slate-900 dark:text-white font-medium'
                  : 'text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
              )}
            >
              {o.label}
              {o.value === value && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KeyHint({ keys, children }: { keys: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5">
        {keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}
      </span>
      {children}
    </span>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] font-sans text-[10px] font-medium text-slate-500 dark:text-gray-400">
      {children}
    </kbd>
  );
}

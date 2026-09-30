import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  Search, Sparkles, CornerDownLeft, ArrowUp, ArrowDown, Loader2, RotateCcw,
  Copy, Check, BookOpen, FileText, ChevronDown, ListFilter, Info, ShieldAlert, PenLine, Square,
  GraduationCap, Tag, X, History, Clock, Home, BotMessageSquare, FolderOpen, Award, Calendar,
  HelpCircle, Compass, Headphones, Users, Settings, LifeBuoy, Gift, Layers, BrainCircuit,
  BarChart2, Workflow, Plus, SunMoon, CheckSquare, ArrowRight, ThumbsUp, ThumbsDown, MessageSquare,
  CornerDownRight, type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../lib/ThemeContext';
import { useBookLibrary } from '../hooks/ai/useDocuments';
import { useWorkflowStream } from '../hooks/ai/useWorkflowStream';
import { api } from '../lib/api/client';
import { documentsApi, chapterLabel, type BookSummary, type BookChapter, type BookDetail } from '../lib/api/documents';
import {
  tokenize, indexFields, scoreItem, highlight, classNumber,
  loadRecentItems, pushRecentItem, loadRecentQueries, pushRecentQuery, clearRecentQueries,
  type IndexedField, type RecentItem,
} from '../lib/search/paletteSearch';
import MarkdownMessage from './chat/MarkdownMessage';
import type { Rating } from './chat/AssistantReply';

type Mode = 'search' | 'ask';
type TypeFilter = 'all' | 'books' | 'chapters' | 'pages';

// Subject → tinted pill (matches the app's tint conventions). Falls back to slate.
const SUBJECT_TINT: Record<string, string> = {
  Physics: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  Chemistry: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  Biology: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  Mathematics: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
  English: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  Hindi: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
  Science: 'bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400',
  'Social Science': 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-400',
  History: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400',
  Geography: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400',
  Economics: 'bg-lime-50 text-lime-700 dark:bg-lime-500/15 dark:text-lime-400',
};
const tintFor = (subject: string) => SUBJECT_TINT[subject] || 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-gray-300';
const NEUTRAL_TINT = 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-gray-300';

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

type PaletteItem =
  | { kind: 'book'; key: string; book: BookSummary }
  | { kind: 'chapter'; key: string; book: BookSummary; chapter: BookChapter }
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
        push('Chapters', topScored(chapterIndex, (e) => {
          if (!passesFilters(e.book)) return null;
          const m = scoreItem(tokens, e.fields);
          return m && (m.hitFields.has(0) || m.hitFields.has(1)) ? m.score : null;
        }, focused ? 30 : 6),
          (e) => ({ kind: 'chapter', key: `c:${e.book.notebookId}:${e.chapter.sourceId}`, book: e.book, chapter: e.chapter }));
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
      raw.push({ label: 'Ask AI', items: [{ kind: 'ask', key: 'ask', query: trimmedQuery }] });
    }

    let offset = 0;
    return raw.map((g) => {
      const withOffset = { ...g, offset };
      offset += g.items.length;
      return withOffset;
    });
  }, [tokens, trimmedQuery, typeFilter, contentFilterActive, passesFilters, recentQueries, recentItems, books, bookIndex, chapterIndex]);

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
    if (!c?.notebookId || !c?.sourceId) return;
    const params = new URLSearchParams({
      notebookId: c.notebookId,
      sourceId: c.sourceId,
      title: c.title || c.source || 'Chapter',
    });
    onClose();
    navigate(`/read?${params.toString()}`);
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
  const askRecents = recentItems.slice(0, 2);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh] bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Search or ask AI"
            onKeyDown={onDialogKeyDown}
            className="w-full max-w-2xl"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {/* ── Input card ── */}
            <div
              className={cn(
                'rounded-2xl bg-white dark:bg-[#1a1a1b] border shadow-2xl',
                mode === 'ask' ? 'border-indigo-300 dark:border-indigo-500/40' : 'border-slate-200 dark:border-white/10'
              )}
            >
              <div className="flex items-center gap-3 px-4 pt-3.5">
                {stream.isStreaming && mode === 'ask'
                  ? <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />
                  : mode === 'ask'
                    ? <Sparkles className="w-5 h-5 text-indigo-500 shrink-0" />
                    : <Search className="w-5 h-5 text-indigo-500 shrink-0" />}
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelected(0); setOpenError(null); }}
                  onKeyDown={onInputKeyDown}
                  placeholder={mode === 'ask' ? 'Ask a question about your study material…' : 'Search books, chapters, pages or ask AI…'}
                  role="combobox"
                  aria-expanded={mode === 'search'}
                  aria-controls="cmdk-listbox"
                  aria-autocomplete="list"
                  aria-activedescendant={mode === 'search' && active >= 0 ? `cmdk-opt-${active}` : undefined}
                  className="flex-1 bg-transparent outline-none text-[15px] text-slate-800 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500 min-w-0"
                />
                {query && (
                  <button
                    onClick={() => { setQuery(''); setSelected(0); inputRef.current?.focus(); }}
                    aria-label="Clear search"
                    className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (mode === 'ask') { cancelStream(); setMode('search'); setHasAsked(false); }
                    else { setMode('ask'); if (query.trim()) runAsk(query); }
                    inputRef.current?.focus();
                  }}
                  aria-pressed={mode === 'ask'}
                  title={mode === 'ask' ? 'Back to search' : `Ask AI (${MOD_KEY}+Enter)`}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold border transition-colors',
                    mode === 'ask'
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-200 dark:border-white/15 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Ask AI
                </button>
              </div>

              {/* keyboard hints — only the ones that apply to the current mode */}
              <div className="flex items-center gap-3 px-4 py-2 text-[11px] text-slate-400 dark:text-gray-500 flex-wrap">
                {mode === 'search' ? (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <Kbd><ArrowUp className="w-2.5 h-2.5" /></Kbd><Kbd><ArrowDown className="w-2.5 h-2.5" /></Kbd> to navigate
                    </span>
                    <span className="inline-flex items-center gap-1"><Kbd><CornerDownLeft className="w-2.5 h-2.5" /></Kbd> to open</span>
                    <span className="inline-flex items-center gap-1"><Kbd>{MOD_KEY}</Kbd><Kbd><CornerDownLeft className="w-2.5 h-2.5" /></Kbd> to ask AI</span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1"><Kbd><CornerDownLeft className="w-2.5 h-2.5" /></Kbd> to ask</span>
                )}
                <span className="inline-flex items-center gap-1"><Kbd>esc</Kbd> to close</span>
              </div>

              {/* filters (search mode only — the AI answers over all accessible content) */}
              {mode === 'search' && (
                <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
                  <FilterMenu
                    icon={ListFilter}
                    label={{ all: 'All contents', books: 'Books', chapters: 'Chapters', pages: 'Pages & actions' }[typeFilter]}
                    active={typeFilter !== 'all'}
                    open={openMenu === 'type'}
                    onToggle={() => setOpenMenu(openMenu === 'type' ? null : 'type')}
                    onClose={() => setOpenMenu(null)}
                    options={[
                      { value: 'all', label: 'All contents' },
                      { value: 'books', label: 'Books' },
                      { value: 'chapters', label: 'Chapters' },
                      { value: 'pages', label: 'Pages & actions' },
                    ]}
                    value={typeFilter}
                    onSelect={(v) => { setTypeFilter(v as TypeFilter); setSelected(0); inputRef.current?.focus(); }}
                  />
                  <FilterMenu
                    icon={Tag}
                    label={subjectFilter || 'Subject'}
                    active={!!subjectFilter}
                    open={openMenu === 'subject'}
                    onToggle={() => setOpenMenu(openMenu === 'subject' ? null : 'subject')}
                    onClose={() => setOpenMenu(null)}
                    options={[{ value: '', label: 'All subjects' }, ...subjects.map((s) => ({ value: s, label: s }))]}
                    value={subjectFilter || ''}
                    onSelect={(v) => { setSubjectFilter(v || null); setSelected(0); inputRef.current?.focus(); }}
                  />
                  <FilterMenu
                    icon={GraduationCap}
                    label={classFilter || 'Class'}
                    active={!!classFilter}
                    open={openMenu === 'class'}
                    onToggle={() => setOpenMenu(openMenu === 'class' ? null : 'class')}
                    onClose={() => setOpenMenu(null)}
                    options={[{ value: '', label: 'All classes' }, ...classes.map((c) => ({ value: c, label: c }))]}
                    value={classFilter || ''}
                    onSelect={(v) => { setClassFilter(v || null); setSelected(0); inputRef.current?.focus(); }}
                  />
                  {anyFilter && (
                    <button
                      onClick={clearFilters}
                      className="text-[12px] font-medium text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300 px-1"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── Panel below ── */}
            {mode === 'search' ? (
              <div
                ref={listRef}
                id="cmdk-listbox"
                role="listbox"
                aria-label="Search results"
                className="mt-3 rounded-2xl bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 shadow-xl max-h-[52vh] overflow-y-auto custom-scrollbar py-2"
              >
                {openError && (
                  <div role="alert" className="mx-3 mb-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-600 dark:text-rose-400">
                    {openError}
                  </div>
                )}

                {booksLoading && !tokens.length && (
                  <div className="px-4 py-2 space-y-2" aria-busy="true">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 animate-pulse" />
                        <span className="flex-1 h-3 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
                      </div>
                    ))}
                  </div>
                )}
                {booksError && (
                  <div className="px-4 py-2 text-[12.5px] text-slate-500 dark:text-gray-400">
                    Couldn't load your library.
                    <button onClick={() => refetchBooks()} className="ml-2 font-semibold text-indigo-600 dark:text-indigo-400 underline">Retry</button>
                  </div>
                )}

                {tokens.length > 0 && !hasResults && !booksLoading && (
                  <div className="px-4 pt-6 pb-4 text-center text-[13px] text-slate-400 dark:text-gray-500">
                    No matches for <span className="font-semibold text-slate-600 dark:text-gray-300">“{trimmedQuery}”</span>
                    {anyFilter ? ' with these filters.' : '.'} Ask AI instead:
                  </div>
                )}
                {!tokens.length && !booksLoading && !booksError && flat.length === 0 && (
                  <div className="px-4 py-10 text-center text-[13px] text-slate-400 dark:text-gray-500">
                    {anyFilter ? 'Nothing matches these filters.' : 'No content in your library yet.'}
                  </div>
                )}

                {groups.map((g) => (
                  <div key={g.label} role="group" aria-label={g.label}>
                    <div className="flex items-center justify-between px-4 pt-2 pb-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500">{g.label}</span>
                      {g.onClear && (
                        <button tabIndex={-1} onClick={g.onClear} className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-gray-300">Clear</button>
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
              </div>
            ) : !hasAsked ? (
              <div className="mt-4">
                {/* idle info hints */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-3">
                  <Hint icon={Info}>Answers are grounded in the learning content you have access to.</Hint>
                  <Hint icon={ShieldAlert}>If an answer looks off, double-check it against the cited source.</Hint>
                  <Hint icon={PenLine}>Cited sources open the exact chapter in the reader.</Hint>
                </div>
                {askRecents.length > 0 && (
                  <div className="mt-5 rounded-2xl bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 shadow-xl p-4">
                    <div className="flex items-center gap-2 text-[12.5px] text-slate-500 dark:text-gray-400 mb-3">
                      <span className="w-6 h-6 rounded-lg bg-slate-900 dark:bg-white/10 flex items-center justify-center shrink-0">
                        <Sparkles className="w-3.5 h-3.5 text-white" />
                      </span>
                      Pick up where you left off
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {askRecents.map((r) => (
                        <button
                          key={`${r.notebookId}:${r.sourceId || ''}`}
                          onClick={() => openRecent(r)}
                          className="text-left rounded-xl border border-slate-200 dark:border-white/10 p-3 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-colors"
                        >
                          <span className={cn('inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded mb-1.5', tintFor(r.subject))}>
                            {r.kind === 'chapter' ? <FileText className="w-3 h-3" /> : <BookOpen className="w-3 h-3" />} {r.subject}
                          </span>
                          <div className="text-[13px] font-semibold text-slate-800 dark:text-gray-100 leading-snug line-clamp-2">{r.title}</div>
                          {r.kind === 'chapter' && <div className="text-[11.5px] text-slate-400 dark:text-gray-500 truncate mt-0.5">{r.bookName}</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 shadow-xl p-4" aria-live="polite">
                {stream.isStreaming && !stream.content ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-slate-600 dark:text-gray-300 min-w-0">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />
                      <span className="truncate">AI is looking for the information you requested…</span>
                    </span>
                    <button
                      onClick={() => cancelStream()}
                      className="shrink-0 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1 transition-colors"
                    >
                      <Square className="w-3 h-3" /> Stop
                    </button>
                  </div>
                ) : stream.error ? (
                  <div className="text-[13px] text-rose-600 dark:text-rose-400">
                    Something went wrong.
                    <button onClick={() => runAsk(askedQuestion)} className="ml-2 font-semibold underline">Try again</button>
                  </div>
                ) : (
                  <>
                    <div className="font-answer text-[14px] leading-[1.7] text-slate-800 dark:text-gray-100 prose prose-slate dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-0 prose-pre:bg-[#1e1e1e] prose-pre:p-0">
                      <MarkdownMessage content={stream.content} />
                      {stream.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-indigo-500 animate-pulse align-middle" />}
                    </div>

                    {!stream.isStreaming && (
                      <>
                        <div className="flex items-center gap-4 mt-3 text-slate-400 dark:text-gray-500">
                          <button
                            title="Helpful"
                            aria-label="Helpful"
                            aria-pressed={rating === 'thumbs_up'}
                            onClick={() => rate('thumbs_up')}
                            className={cn('transition-colors', rating === 'thumbs_up' ? 'text-emerald-500' : 'hover:text-slate-600 dark:hover:text-gray-300')}
                          >
                            <ThumbsUp className={cn('w-4 h-4', rating === 'thumbs_up' && 'fill-current')} />
                          </button>
                          <button
                            title="Not helpful"
                            aria-label="Not helpful"
                            aria-pressed={rating === 'thumbs_down'}
                            onClick={() => rate('thumbs_down')}
                            className={cn('transition-colors', rating === 'thumbs_down' ? 'text-rose-500' : 'hover:text-slate-600 dark:hover:text-gray-300')}
                          >
                            <ThumbsDown className={cn('w-4 h-4', rating === 'thumbs_down' && 'fill-current')} />
                          </button>
                          <button title="Copy" aria-label="Copy answer" onClick={copyAnswer} className="hover:text-slate-600 dark:hover:text-gray-300 transition-colors">
                            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <button title="Regenerate" aria-label="Regenerate answer" onClick={() => runAsk(askedQuestion)} className="hover:text-slate-600 dark:hover:text-gray-300 transition-colors"><RotateCcw className="w-4 h-4" /></button>
                          {ratingError && <span role="status" className="text-[11.5px] text-rose-500">Couldn't send feedback</span>}
                          {askSessionId && (
                            <button
                              onClick={continueInChat}
                              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1 text-[12.5px] font-medium text-slate-600 dark:text-gray-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300 transition-colors"
                            >
                              <MessageSquare className="w-3.5 h-3.5" /> Continue in chat
                            </button>
                          )}
                        </div>

                        {followUps.length > 0 && (
                          <div className="mt-4">
                            <div className="text-[12px] text-slate-400 dark:text-gray-500 mb-2">Follow up</div>
                            <div className="flex flex-col gap-1">
                              {followUps.map((f) => (
                                <button
                                  key={f}
                                  onClick={() => runAsk(f, { followUp: true })}
                                  className="flex items-center gap-2 text-left rounded-lg px-2 py-1.5 text-[13px] text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
                                >
                                  <CornerDownRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                  <span className="line-clamp-2">{f}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {sources.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5">
                            <div className="text-[12px] text-slate-400 dark:text-gray-500 mb-2">Based on source</div>
                            <div className="flex flex-col gap-1">
                              {sources.map((c, i) => {
                                const clickable = !!(c.notebookId && c.sourceId);
                                const excerpt = typeof c.text === 'string' ? c.text.replace(/\s+/g, ' ').trim() : '';
                                return (
                                  <button
                                    key={i}
                                    disabled={!clickable}
                                    onClick={() => openSource(c)}
                                    title={clickable ? 'Open source in reader' : undefined}
                                    className={cn(
                                      'group flex items-start gap-2.5 text-left rounded-lg px-2 py-1.5 transition-colors',
                                      clickable ? 'hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:bg-slate-50 dark:focus-visible:bg-white/5 cursor-pointer' : 'cursor-default'
                                    )}
                                  >
                                    <span className="w-6 h-6 rounded-md bg-rose-50 text-rose-500 dark:bg-rose-500/15 dark:text-rose-400 flex items-center justify-center shrink-0">
                                      <FileText className="w-3.5 h-3.5" />
                                    </span>
                                    <span className="flex-1 min-w-0 pt-0.5">
                                      <span className="flex items-baseline gap-2">
                                        <span className="text-[13px] font-medium text-slate-700 dark:text-gray-200 truncate">{c.title || c.source}</span>
                                        {c.pageNumber != null && <span className="shrink-0 text-[11px] text-slate-400 dark:text-gray-500">p. {c.pageNumber}</span>}
                                      </span>
                                      {/* Cited passage — revealed on hover / keyboard focus. */}
                                      {excerpt && (
                                        <span className="hidden group-hover:block group-focus-visible:block mt-1">
                                          <span className="text-[12px] leading-snug text-slate-500 dark:text-gray-400 line-clamp-3">“{excerpt}”</span>
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
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
  let tint = NEUTRAL_TINT;
  let title = '';
  let subtitle: string | undefined;
  let badge: string | undefined;
  let highlightTitle = true;

  switch (item.kind) {
    case 'book':
      tint = tintFor(item.book.subject);
      title = bookName(item.book);
      subtitle = item.book.className;
      badge = item.book.subject;
      break;
    case 'chapter':
      icon = FileText;
      tint = tintFor(item.book.subject);
      title = chapterLabel(item.chapter);
      subtitle = [bookName(item.book), item.book.className].filter(Boolean).join(' · ');
      badge = item.book.subject;
      break;
    case 'recent':
      icon = item.entry.kind === 'chapter' ? FileText : BookOpen;
      tint = tintFor(item.entry.subject);
      title = item.entry.title;
      subtitle = item.entry.kind === 'chapter'
        ? [item.entry.bookName, item.entry.className].filter(Boolean).join(' · ')
        : item.entry.className;
      badge = item.entry.subject;
      highlightTitle = false;
      break;
    case 'query':
      icon = History;
      title = item.query;
      highlightTitle = false;
      break;
    case 'page':
      icon = item.icon;
      title = item.label;
      break;
    case 'action':
      icon = item.icon;
      title = item.label;
      break;
    case 'ask':
      icon = Sparkles;
      tint = 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400';
      title = item.query;
      highlightTitle = false;
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
        'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
        isActive ? 'bg-slate-100 dark:bg-white/5' : 'hover:bg-slate-50 dark:hover:bg-white/5'
      )}
    >
      <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', tint)}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-medium text-slate-800 dark:text-gray-100 truncate">
          {item.kind === 'ask' ? (
            <>Ask AI <span className="font-semibold">“{title}”</span></>
          ) : highlightTitle ? (
            <Highlighted text={title} tokens={tokens} />
          ) : title}
        </span>
        {subtitle && (
          <span className="block text-[11.5px] text-slate-400 dark:text-gray-500 truncate">
            <Highlighted text={subtitle} tokens={tokens} />
          </span>
        )}
      </span>
      {badge && <span className={cn('shrink-0 text-[10.5px] font-semibold px-1.5 py-0.5 rounded', tintFor(badge))}>{badge}</span>}
      {loading
        ? <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" />
        : item.kind === 'recent'
          ? <Clock className="w-3.5 h-3.5 text-slate-300 dark:text-gray-600 shrink-0" />
          : isActive && <CornerDownLeft className="w-3.5 h-3.5 text-slate-400 dark:text-gray-500 shrink-0" />}
    </button>
  );
}

function Highlighted({ text, tokens }: { text: string; tokens: string[] }) {
  const parts = useMemo(() => highlight(text, tokens), [text, tokens]);
  return (
    <>
      {parts.map((p, i) => p.match
        ? <mark key={i} className="bg-transparent text-indigo-600 dark:text-indigo-300 font-semibold">{p.text}</mark>
        : <React.Fragment key={i}>{p.text}</React.Fragment>)}
    </>
  );
}

function FilterMenu({
  icon: Icon, label, active, open, onToggle, onClose, options, value, onSelect,
}: {
  icon: LucideIcon;
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
          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors',
          active
            ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'
            : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-gray-400 hover:bg-slate-200/70 dark:hover:bg-white/10'
        )}
      >
        <Icon className="w-3.5 h-3.5" /> <span className="max-w-[140px] truncate">{label}</span> <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1.5 z-20 min-w-[180px] max-h-64 overflow-y-auto custom-scrollbar rounded-xl bg-white dark:bg-[#232325] border border-slate-200 dark:border-white/10 shadow-xl py-1"
        >
          {options.map((o) => (
            <button
              key={o.value || '__all'}
              role="option"
              aria-selected={o.value === value}
              onClick={() => { onSelect(o.value); onClose(); }}
              className={cn(
                'w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-[12.5px] transition-colors',
                o.value === value
                  ? 'text-indigo-600 dark:text-indigo-300 font-semibold'
                  : 'text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/5'
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded bg-slate-100 dark:bg-white/10 text-[10px] font-medium text-slate-500 dark:text-gray-400">
      {children}
    </kbd>
  );
}

function Hint({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center text-[11.5px] text-slate-500 dark:text-gray-400 leading-snug">
      <Icon className="w-4 h-4 text-slate-400 dark:text-gray-500" />
      {children}
    </div>
  );
}

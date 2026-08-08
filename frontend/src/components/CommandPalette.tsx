import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Search, Sparkles, CornerDownLeft, ArrowUp, ArrowDown, Loader2, RotateCcw,
  ThumbsUp, ThumbsDown, Copy, Check, BookOpen, FileText, ChevronDown, ArrowUpDown,
  ListFilter, Calendar, User as UserIcon, Info, ShieldAlert, PenLine, Square,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { useBookLibrary } from '../hooks/ai/useDocuments';
import { useWorkflowStream } from '../hooks/ai/useWorkflowStream';
import { documentsApi, type BookSummary } from '../lib/api/documents';
import MarkdownMessage from './chat/MarkdownMessage';

type Mode = 'search' | 'ask';

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

function timeAgo(ts?: number): string {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function groupByDate(items: BookSummary[]): [string, BookSummary[]][] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const weekAgo = Date.now() - 7 * 864e5;
  const today: BookSummary[] = [], week: BookSummary[] = [], earlier: BookSummary[] = [];
  for (const it of items) {
    const t = it.updatedAt || 0;
    if (t >= startOfToday.getTime()) today.push(it);
    else if (t >= weekAgo) week.push(it);
    else earlier.push(it);
  }
  return ([['Today', today], ['Past week', week], ['Earlier', earlier]] as [string, BookSummary[]][])
    .filter(([, arr]) => arr.length > 0);
}

const FILTER_CHIPS: { icon: any; label: string }[] = [
  { icon: ArrowUpDown, label: 'Sort by' },
  { icon: ListFilter, label: 'All contents' },
  { icon: UserIcon, label: 'Created by' },
  { icon: Calendar, label: 'Date' },
];

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

/**
 * Global command palette / spotlight. Opened from the header search (or Cmd/Ctrl+K).
 * Two modes:
 *   - "search": client-side filter over the user's book library, grouped by date; opening a
 *     result launches the reader on the book's first chapter.
 *   - "ask": one-shot grounded RAG question (useWorkflowStream); renders the streamed answer
 *     with cited sources, each deep-linking into the reader.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { books } = useBookLibrary();
  const stream = useWorkflowStream();

  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [hasAsked, setHasAsked] = useState(false);
  const [askedQuestion, setAskedQuestion] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset each time it opens; focus the input.
  useEffect(() => {
    if (!open) return;
    setMode('search');
    setQuery('');
    setSelected(0);
    setHasAsked(false);
    setAskedQuestion('');
    setCopied(false);
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [open]);

  // ── Content search (client-side filter; no backend search endpoint) ──
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...books].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!q) return list.slice(0, 12);
    return list.filter((b) =>
      b.title.toLowerCase().includes(q) ||
      b.subject.toLowerCase().includes(q) ||
      (b.bookName || '').toLowerCase().includes(q) ||
      (b.className || '').toLowerCase().includes(q)
    );
  }, [books, query]);
  const groups = useMemo(() => groupByDate(filtered), [filtered]);
  const flat = useMemo(() => groups.flatMap(([, arr]) => arr), [groups]);
  const recents = useMemo(
    () => [...books].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 2),
    [books]
  );

  // ── Open helpers → reader ──
  const openBook = async (book: BookSummary) => {
    setOpeningId(book.notebookId);
    try {
      const detail = await documentsApi.getBookDetail(book.notebookId);
      const chapter = detail.chapters.find((c) => c.status === 'READY') || detail.chapters[0];
      if (chapter) {
        const params = new URLSearchParams({
          notebookId: book.notebookId,
          sourceId: chapter.sourceId,
          title: chapter.chapterName || chapter.title || book.title,
          book: book.bookName || book.title,
          subject: book.subject,
        });
        onClose();
        navigate(`/read?${params.toString()}`);
        return;
      }
    } catch {
      /* fall through to the catalog */
    }
    setOpeningId(null);
    onClose();
    navigate('/documents');
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

  // ── Ask AI (one-shot RAG) ──
  const runAsk = (q: string) => {
    const question = q.trim();
    if (!question || !user?.uid) return;
    setMode('ask');
    setHasAsked(true);
    setAskedQuestion(question);
    setQuery(question);
    const sessionId =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const model = localStorage.getItem('selectedModel') || 'gemini';
    // Errors surface via stream.error; swallow the rejection so it isn't unhandled.
    stream.startStream({ userId: user.uid, sessionId, message: question, model, topicType: 'chat' }).catch(() => {});
  };

  // ── Keyboard: esc to close, arrows to navigate search results ──
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (mode === 'search' && flat.length) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelected((s) => Math.min(s + 1, flat.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelected((s) => Math.max(s - 1, 0));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, mode, flat.length, onClose]);

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (mode === 'ask') {
      runAsk(query);
    } else {
      const target = flat[selected] || flat[0];
      if (target) openBook(target);
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
                  : <Search className="w-5 h-5 text-indigo-500 shrink-0" />}
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
                  onKeyDown={onInputKeyDown}
                  placeholder={mode === 'ask' ? 'Ask AI to find out what are you looking for…' : 'Search or ask AI…'}
                  className="flex-1 bg-transparent outline-none text-[15px] text-slate-800 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500 min-w-0"
                />
                <button
                  onClick={() => {
                    if (mode === 'ask') setMode('search');
                    else { setMode('ask'); if (query.trim()) runAsk(query); }
                  }}
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

              {/* keyboard hints */}
              <div className="flex items-center gap-3 px-4 py-2 text-[11px] text-slate-400 dark:text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <Kbd><ArrowUp className="w-2.5 h-2.5" /></Kbd><Kbd><ArrowDown className="w-2.5 h-2.5" /></Kbd> to navigate
                </span>
                <span className="inline-flex items-center gap-1"><Kbd><CornerDownLeft className="w-2.5 h-2.5" /></Kbd> to confirm</span>
                <span className="inline-flex items-center gap-1"><Kbd>esc</Kbd> to close</span>
              </div>

              {/* filter chips (visual) */}
              <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
                {FILTER_CHIPS.map((c) => (
                  <span
                    key={c.label}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-white/5 px-2.5 py-1.5 text-[12px] font-medium text-slate-500 dark:text-gray-400"
                  >
                    <c.icon className="w-3.5 h-3.5" /> {c.label} <ChevronDown className="w-3 h-3 opacity-60" />
                  </span>
                ))}
              </div>
            </div>

            {/* ── Panel below ── */}
            {mode === 'search' ? (
              <div className="mt-3 rounded-2xl bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 shadow-xl max-h-[46vh] overflow-y-auto custom-scrollbar">
                {query.trim() && (
                  <button
                    onClick={() => runAsk(query)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0 text-[13.5px] text-slate-700 dark:text-gray-200 truncate">
                      Ask AI <span className="font-semibold">“{query.trim()}”</span>
                    </span>
                  </button>
                )}

                {flat.length === 0 ? (
                  <div className="px-4 py-10 text-center text-[13px] text-slate-400 dark:text-gray-500">
                    {query ? 'No matching content — try Ask AI instead.' : 'No content in your library yet.'}
                  </div>
                ) : (
                  <div className="py-2">
                    {groups.map(([label, arr]) => (
                      <div key={label}>
                        <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500">{label}</div>
                        {arr.map((b) => {
                          const idx = flat.indexOf(b);
                          return (
                            <button
                              key={b.notebookId}
                              onMouseEnter={() => setSelected(idx)}
                              onClick={() => openBook(b)}
                              className={cn(
                                'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                                idx === selected ? 'bg-slate-100 dark:bg-white/5' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                              )}
                            >
                              <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', tintFor(b.subject))}>
                                <BookOpen className="w-4 h-4" />
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-[13.5px] font-medium text-slate-800 dark:text-gray-100 truncate">{b.bookName || b.title}</span>
                                {b.className && <span className="block text-[11.5px] text-slate-400 dark:text-gray-500 truncate">{b.className}</span>}
                              </span>
                              <span className={cn('shrink-0 text-[10.5px] font-semibold px-1.5 py-0.5 rounded', tintFor(b.subject))}>{b.subject}</span>
                              {openingId === b.notebookId
                                ? <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" />
                                : <span className="shrink-0 text-[11px] text-slate-400 dark:text-gray-500 w-14 text-right">{timeAgo(b.updatedAt)}</span>}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : !hasAsked ? (
              <div className="mt-4">
                {/* idle info hints */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-3">
                  <Hint icon={Info}>Answers are grounded in the learning content you have access to.</Hint>
                  <Hint icon={ShieldAlert}>If an answer looks off, double-check it against the cited source.</Hint>
                  <Hint icon={PenLine}>Cited sources open the exact chapter in the reader.</Hint>
                </div>
                {recents.length > 0 && (
                  <div className="mt-5 rounded-2xl bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 shadow-xl p-4">
                    <div className="flex items-center gap-2 text-[12.5px] text-slate-500 dark:text-gray-400 mb-3">
                      <span className="w-6 h-6 rounded-lg bg-slate-900 dark:bg-white/10 flex items-center justify-center shrink-0">
                        <Sparkles className="w-3.5 h-3.5 text-white" />
                      </span>
                      Based on your recent activity, you're studying these
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {recents.map((b) => (
                        <button
                          key={b.notebookId}
                          onClick={() => openBook(b)}
                          className="text-left rounded-xl border border-slate-200 dark:border-white/10 p-3 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-colors"
                        >
                          <span className={cn('inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded mb-1.5', tintFor(b.subject))}>
                            <BookOpen className="w-3 h-3" /> {b.subject}
                          </span>
                          <div className="text-[13px] font-semibold text-slate-800 dark:text-gray-100 leading-snug line-clamp-2">{b.bookName || b.title}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 shadow-xl p-4">
                {stream.isStreaming && !stream.content ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-slate-600 dark:text-gray-300 min-w-0">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />
                      <span className="truncate">AI is looking for the information you requested…</span>
                    </span>
                    <button
                      onClick={() => stream.cancelStream()}
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
                          <button title="Helpful" className="hover:text-slate-600 dark:hover:text-gray-300 transition-colors"><ThumbsUp className="w-4 h-4" /></button>
                          <button title="Not helpful" className="hover:text-slate-600 dark:hover:text-gray-300 transition-colors"><ThumbsDown className="w-4 h-4" /></button>
                          <button title="Copy" onClick={copyAnswer} className="hover:text-slate-600 dark:hover:text-gray-300 transition-colors">
                            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <button title="Regenerate" onClick={() => runAsk(askedQuestion)} className="hover:text-slate-600 dark:hover:text-gray-300 transition-colors"><RotateCcw className="w-4 h-4" /></button>
                        </div>

                        {sources.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5">
                            <div className="text-[12px] text-slate-400 dark:text-gray-500 mb-2">Based on source</div>
                            <div className="flex flex-col gap-1">
                              {sources.map((c, i) => {
                                const clickable = !!(c.notebookId && c.sourceId);
                                return (
                                  <button
                                    key={i}
                                    disabled={!clickable}
                                    onClick={() => openSource(c)}
                                    title={clickable ? 'Open source in reader' : undefined}
                                    className={cn(
                                      'flex items-center gap-2.5 text-left rounded-lg px-2 py-1.5 transition-colors',
                                      clickable ? 'hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer' : 'cursor-default'
                                    )}
                                  >
                                    <span className="w-6 h-6 rounded-md bg-rose-50 text-rose-500 dark:bg-rose-500/15 dark:text-rose-400 flex items-center justify-center shrink-0">
                                      <FileText className="w-3.5 h-3.5" />
                                    </span>
                                    <span className="text-[13px] font-medium text-slate-700 dark:text-gray-200 truncate">{c.title || c.source}</span>
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded bg-slate-100 dark:bg-white/10 text-[10px] font-medium text-slate-500 dark:text-gray-400">
      {children}
    </kbd>
  );
}

function Hint({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center text-[11.5px] text-slate-500 dark:text-gray-400 leading-snug">
      <Icon className="w-4 h-4 text-slate-400 dark:text-gray-500" />
      {children}
    </div>
  );
}

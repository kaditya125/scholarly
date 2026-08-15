import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  NotebookPen, Loader2, Trash2, X, Check, ClipboardCheck, Search, BookOpen,
  ScanLine, HelpCircle, Sparkles, Tag, Calendar, ChevronRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDoubts } from '../hooks/api/useDoubts';
import { doubtsApi, Doubt, DoubtStatus } from '../lib/api/doubts';
import MarkdownMessage from '../components/chat/MarkdownMessage';
import { cn } from '../lib/utils';

const FILTERS: { id: 'all' | DoubtStatus; label: string }[] = [
  { id: 'all', label: 'All Doubts' },
  { id: 'open', label: 'Needs Review' },
  { id: 'reviewed', label: 'Mastered' },
];

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  const day = 86400000;
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < day) return `${Math.floor(d / 3600000)}h ago`;
  if (d < 7 * day) return `${Math.floor(d / day)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function MyDoubts() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'all' | DoubtStatus>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const { doubts, isLoading, refetch } = useDoubts(status === 'all' ? undefined : { status });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return doubts;
    return doubts.filter((d) =>
      (d.questionText || '').toLowerCase().includes(q) ||
      (d.chapterTitle || '').toLowerCase().includes(q) ||
      (d.subject || '').toLowerCase().includes(q) ||
      (d.tags || []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [doubts, query]);

  // Group by subject for a revision-notebook feel.
  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const d of filtered) {
      const key = d.subject || 'General Doubts';
      if (!map.has(key)) map.set(key, [] as any);
      (map.get(key) as any).push(d);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const openCount = doubts.filter((d) => d.status === 'open').length;
  const reviewedCount = doubts.filter((d) => d.status === 'reviewed').length;

  return (
    <div className="w-full min-h-full pb-14 bg-slate-50 dark:bg-[#131315] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-7">
        {/* ── Top Header ────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-9 h-9 rounded-xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center border border-[#8ba32b]/20 dark:border-[#c8e558]/20 shrink-0">
                <NotebookPen className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 dark:text-white tracking-tight">
                My Doubts &amp; Revision Notebook
              </h1>
            </div>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Questions scanned from your textbook or AI tutor — review key concepts, save notes, and track mastery.
            </p>
          </div>

          {/* Quick Stats Chips */}
          <div className="flex items-center gap-2">
            <div className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] shadow-2xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">Open:</span>
              <span className="text-[12.5px] font-bold text-slate-900 dark:text-white">{openCount}</span>
            </div>
            <div className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] shadow-2xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#8ba32b] dark:bg-[#c8e558]" />
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">Mastered:</span>
              <span className="text-[12.5px] font-bold text-slate-900 dark:text-white">{reviewedCount}</span>
            </div>
          </div>
        </div>

        {/* ── Controls Bar ─────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-7">
          <div className="inline-flex items-center bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-1 shadow-2xs">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setStatus(f.id)}
                className={cn(
                  'px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold transition-all cursor-pointer',
                  status === f.id
                    ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions, chapters, formulas, or tags…"
              className="w-full pl-10 pr-3.5 py-2 rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#1a1a1e] text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8ba32b]/20 dark:focus:ring-[#c8e558]/20 focus:border-[#8ba32b] dark:focus:border-[#c8e558] shadow-2xs"
            />
          </div>
        </div>

        {/* ── Content Grid / States ────────────────────────────── */}
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[#8ba32b] dark:text-[#c8e558]" />
            <span className="text-[13px] text-slate-400">Loading your doubts notebook…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 flex flex-col items-center text-center bg-white dark:bg-[#1a1a1e] rounded-3xl border border-slate-200/90 dark:border-white/[0.08] p-8 shadow-2xs">
            <div className="w-16 h-16 rounded-2xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center mb-4 border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
              <ScanLine className="w-8 h-8" />
            </div>
            <h3 className="text-[17px] font-bold text-slate-900 dark:text-white">No saved doubts yet</h3>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 max-w-md leading-relaxed">
              Open any document or chapter reader, scan a question, and click <span className="font-semibold text-slate-700 dark:text-slate-300">“Save to My Doubts”</span> to build your personalized revision notebook.
            </p>
            <button
              onClick={() => navigate('/documents')}
              className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 text-[13px] font-bold shadow-md hover:opacity-90 transition-all cursor-pointer active:scale-98"
            >
              <BookOpen className="w-4 h-4" /> Browse Curriculum Books
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map(([subject, items]) => (
              <div key={subject}>
                <div className="flex items-center gap-2 mb-3.5">
                  <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {subject}
                  </h2>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                    {items.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setOpenId(d.id)}
                      className="group text-left rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#1a1a1e] overflow-hidden hover:border-slate-300 dark:hover:border-white/20 hover:shadow-md transition-all flex flex-col cursor-pointer shadow-2xs"
                    >
                      {d.thumbDataUrl && (
                        <div className="h-32 bg-slate-100 dark:bg-[#161619] border-b border-slate-100 dark:border-white/[0.06] overflow-hidden flex items-center justify-center p-2">
                          <img src={d.thumbDataUrl} alt="" className="w-full h-full object-contain rounded-lg" />
                        </div>
                      )}
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className={cn(
                                'text-[10.5px] font-bold px-2 py-0.5 rounded-full border',
                                d.status === 'reviewed'
                                  ? 'bg-[#8ba32b]/15 dark:bg-[#c8e558]/15 text-[#8ba32b] dark:text-[#c8e558] border-[#8ba32b]/25 dark:border-[#c8e558]/25'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
                              )}
                            >
                              {d.status === 'reviewed' ? 'Mastered' : 'Needs Review'}
                            </span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-auto">
                              {timeAgo(d.createdAt)}
                            </span>
                          </div>

                          <p className="text-[13.5px] text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug font-semibold group-hover:text-[#8ba32b] dark:group-hover:text-[#c8e558] transition-colors">
                            {d.questionText || d.answerPreview || 'Scanned question & solution'}
                          </p>
                        </div>

                        {d.chapterTitle && (
                          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between text-[11.5px] text-slate-400 dark:text-slate-500">
                            <span className="truncate">{d.chapterTitle}</span>
                            <ChevronRight className="w-3.5 h-3.5 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Detail Modal ─────────────────────────────────────── */}
        {openId && (
          <DoubtDetail id={openId} onClose={() => setOpenId(null)} onChanged={() => refetch()} />
        )}
      </div>
    </div>
  );
}

// ─── Detail modal ───────────────────────────────────────────────────────────

function DoubtDetail({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [doubt, setDoubt] = useState<Doubt | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<'save' | 'status' | 'delete' | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    doubtsApi
      .get(id)
      .then((d) => {
        if (!cancelled) {
          setDoubt(d);
          setNotes(d.notes || '');
        }
      })
      .catch(() => {
        if (!cancelled) setDoubt(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveNotes = async () => {
    if (!doubt) return;
    setBusy('save');
    try {
      await doubtsApi.update(doubt.id, { notes });
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const toggleStatus = async () => {
    if (!doubt) return;
    setBusy('status');
    const next: DoubtStatus = doubt.status === 'reviewed' ? 'open' : 'reviewed';
    try {
      const u = await doubtsApi.update(doubt.id, { status: next });
      setDoubt(u);
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const del = async () => {
    if (!doubt) return;
    setBusy('delete');
    try {
      await doubtsApi.remove(doubt.id);
      onChanged();
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-3xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200/90 dark:border-white/[0.08] shrink-0">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-slate-900 dark:text-white truncate">
              {doubt?.chapterTitle || 'Saved Doubt'}
            </div>
            {doubt && (
              <div className="text-[12px] text-slate-400 dark:text-slate-500 truncate">
                {[doubt.bookTitle, doubt.subject].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-24 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#8ba32b] dark:text-[#c8e558]" />
          </div>
        ) : !doubt ? (
          <div className="py-20 text-center text-[14px] text-slate-500 dark:text-slate-400">
            This doubt could not be loaded.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {doubt.imageDataUrl && (
              <div className="rounded-2xl overflow-hidden border border-slate-200/90 dark:border-white/[0.08] bg-slate-50 dark:bg-[#161619] p-2">
                <img
                  src={doubt.imageDataUrl}
                  alt="Scanned question"
                  className="w-full object-contain max-h-72 rounded-xl"
                />
              </div>
            )}

            {doubt.questionText && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                  Scanned Question
                </div>
                <div className="text-[13.5px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-[#232328] rounded-2xl p-4 border border-slate-200/70 dark:border-white/[0.06]">
                  {doubt.questionText}
                </div>
              </div>
            )}

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
                <span>AI Tutor Explanation &amp; Solution</span>
              </div>
              <div className="bg-slate-50/70 dark:bg-[#232328]/70 rounded-2xl p-4.5 border border-slate-200/70 dark:border-white/[0.06] text-[13.5px] leading-relaxed">
                <MarkdownMessage content={doubt.answer} />
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                My Revision Notes
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Add a revision note — key formula, concept trick, or where you got stuck…"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#232328] text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8ba32b]/20 dark:focus:ring-[#c8e558]/20 focus:border-[#8ba32b] dark:focus:border-[#c8e558]"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={saveNotes}
                  disabled={busy === 'save' || notes === (doubt.notes || '')}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[12px] font-bold bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer"
                >
                  {busy === 'save' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Save Note</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer actions */}
        {doubt && !loading && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200/90 dark:border-white/[0.08] bg-slate-50/50 dark:bg-[#161619]/50 shrink-0">
            <button
              onClick={del}
              disabled={busy === 'delete'}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {busy === 'delete' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>Delete Doubt</span>
            </button>
            <button
              onClick={toggleStatus}
              disabled={busy === 'status'}
              className={cn(
                'inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-[13px] font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm active:scale-98',
                doubt.status === 'reviewed'
                  ? 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/15'
                  : 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 hover:opacity-90',
              )}
            >
              {busy === 'status' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ClipboardCheck className="w-3.5 h-3.5" />
              )}
              <span>{doubt.status === 'reviewed' ? 'Mark as Needs Review' : 'Mark as Mastered'}</span>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

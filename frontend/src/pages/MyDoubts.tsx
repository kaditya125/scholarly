import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  NotebookPen, Loader2, Trash2, X, Check, ClipboardCheck, Search, BookOpen, ScanLine,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDoubts } from '../hooks/api/useDoubts';
import { doubtsApi, Doubt, DoubtStatus } from '../lib/api/doubts';
import MarkdownMessage from '../components/chat/MarkdownMessage';
import { cn } from '../lib/utils';

const FILTERS: { id: 'all' | DoubtStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'reviewed', label: 'Reviewed' },
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
      const key = d.subject || 'Other';
      if (!map.has(key)) map.set(key, [] as any);
      (map.get(key) as any).push(d);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="w-full max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[26px] md:text-[30px] font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <NotebookPen className="w-7 h-7 text-indigo-500" /> My Doubts
          </h1>
          <p className="text-[14px] text-slate-500 dark:text-gray-400 mt-1">
            Questions you scanned and saved — your revision notebook. Review, add notes, and mark them done.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="inline-flex items-center bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 rounded-xl p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatus(f.id)}
              className={cn(
                'px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors',
                status === f.id ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions, chapters, tags…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] text-[13.5px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-20 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4">
            <ScanLine className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="text-[16px] font-bold text-slate-800 dark:text-gray-100">No saved doubts yet</h3>
          <p className="text-[13.5px] text-slate-500 dark:text-gray-400 mt-1 max-w-sm">
            Open a chapter, scan a question, and tap “Save to My Doubts” to build your revision notebook.
          </p>
          <button onClick={() => navigate('/documents')} className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13.5px] font-semibold">
            <BookOpen className="w-4 h-4" /> Browse books
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([subject, items]) => (
            <div key={subject}>
              <h2 className="text-[13px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500 mb-3">
                {subject} <span className="text-slate-300 dark:text-gray-600">· {items.length}</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setOpenId(d.id)}
                    className="group text-left rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] overflow-hidden hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-sm transition-all flex flex-col"
                  >
                    {d.thumbDataUrl && (
                      <div className="h-28 bg-slate-50 dark:bg-black/20 border-b border-slate-100 dark:border-white/[0.06] overflow-hidden flex items-center justify-center">
                        <img src={d.thumbDataUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="p-3.5 flex-1 flex flex-col">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={cn(
                          'text-[10.5px] font-bold px-1.5 py-0.5 rounded-full',
                          d.status === 'reviewed'
                            ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
                        )}>
                          {d.status === 'reviewed' ? 'Reviewed' : 'Open'}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-gray-500 ml-auto">{timeAgo(d.createdAt)}</span>
                      </div>
                      <p className="text-[13px] text-slate-700 dark:text-gray-200 line-clamp-2 leading-snug font-medium">
                        {d.questionText || d.answerPreview || 'Scanned question'}
                      </p>
                      {d.chapterTitle && (
                        <p className="text-[11.5px] text-slate-400 dark:text-gray-500 mt-1.5 truncate">{d.chapterTitle}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {openId && (
        <DoubtDetail id={openId} onClose={() => setOpenId(null)} onChanged={() => refetch()} />
      )}
    </div>
  );
}

// ─── Detail modal ───────────────────────────────────────────────────────────

function DoubtDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [doubt, setDoubt] = useState<Doubt | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<'save' | 'status' | 'delete' | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    doubtsApi.get(id)
      .then((d) => { if (!cancelled) { setDoubt(d); setNotes(d.notes || ''); } })
      .catch(() => { if (!cancelled) setDoubt(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveNotes = async () => {
    if (!doubt) return;
    setBusy('save');
    try { await doubtsApi.update(doubt.id, { notes }); onChanged(); } finally { setBusy(null); }
  };
  const toggleStatus = async () => {
    if (!doubt) return;
    setBusy('status');
    const next: DoubtStatus = doubt.status === 'reviewed' ? 'open' : 'reviewed';
    try { const u = await doubtsApi.update(doubt.id, { status: next }); setDoubt(u); onChanged(); } finally { setBusy(null); }
  };
  const del = async () => {
    if (!doubt) return;
    setBusy('delete');
    try { await doubtsApi.remove(doubt.id); onChanged(); onClose(); } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-[#151516] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-white/10 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-slate-900 dark:text-white truncate">{doubt?.chapterTitle || 'Saved doubt'}</div>
            {doubt && <div className="text-[11.5px] text-slate-400 dark:text-gray-500 truncate">{[doubt.bookTitle, doubt.subject].filter(Boolean).join(' · ')}</div>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>

        {loading ? (
          <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
        ) : !doubt ? (
          <div className="py-20 text-center text-[14px] text-slate-500 dark:text-gray-400">This doubt could not be loaded.</div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
            {doubt.imageDataUrl && (
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20">
                <img src={doubt.imageDataUrl} alt="Scanned question" className="w-full object-contain max-h-72" />
              </div>
            )}

            {doubt.questionText && (
              <div>
                <div className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500 mb-1.5">Question</div>
                <div className="text-[13.5px] text-slate-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-white/[0.03] rounded-lg p-3 border border-slate-100 dark:border-white/[0.06]">
                  {doubt.questionText}
                </div>
              </div>
            )}

            <div>
              <div className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500 mb-1.5">AI answer</div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-[14px] leading-relaxed">
                <MarkdownMessage content={doubt.answer} />
              </div>
            </div>

            <div>
              <div className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500 mb-1.5">My notes</div>
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                placeholder="Add a note — why you got stuck, the trick to remember…"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f0f10] text-[13.5px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <button
                onClick={saveNotes} disabled={busy === 'save' || notes === (doubt.notes || '')}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-gray-200 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save note
              </button>
            </div>
          </div>
        )}

        {/* Footer actions */}
        {doubt && !loading && (
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 dark:border-white/10 shrink-0">
            <button
              onClick={del} disabled={busy === 'delete'}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500 dark:text-gray-400 hover:text-rose-500 disabled:opacity-50 transition-colors"
            >
              {busy === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
            </button>
            <button
              onClick={toggleStatus} disabled={busy === 'status'}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-50',
                doubt.status === 'reviewed'
                  ? 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-gray-200 hover:bg-slate-200 dark:hover:bg-white/10'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white',
              )}
            >
              {busy === 'status' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
              {doubt.status === 'reviewed' ? 'Mark as open' : 'Mark reviewed'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

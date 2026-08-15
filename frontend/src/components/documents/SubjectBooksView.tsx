import React, { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Layers, Sparkles, Filter } from 'lucide-react';
import { motion } from 'motion/react';
import { BookSummary } from '../../lib/api/documents';
import { PremiumBookCard } from './PremiumBookCard';
import { getSubjectMeta } from './subjectMeta';
import { cn } from '../../lib/utils';

interface SubjectBooksViewProps {
  subject: string;
  books: BookSummary[];
  onBack: () => void;
  onOpenBook: (book: BookSummary) => void;
}

const classNum = (c?: string) => (c ? parseInt(c.replace(/\D/g, ''), 10) || 0 : 0);

export function SubjectBooksView({ subject, books, onBack, onOpenBook }: SubjectBooksViewProps) {
  const meta = getSubjectMeta(subject);
  const [classFilter, setClassFilter] = useState<string | null>(null);

  const classes = useMemo(
    () =>
      Array.from(new Set(books.map((b) => b.className).filter(Boolean))).sort(
        (a, b) => classNum(a as string) - classNum(b as string),
      ) as string[],
    [books],
  );

  const visible = useMemo(() => {
    const list = classFilter ? books.filter((b) => b.className === classFilter) : books;
    // Sort by class, then by book name so the grid reads in a sensible order.
    return [...list].sort(
      (a, b) =>
        classNum(a.className) - classNum(b.className) ||
        (a.bookName || a.title).localeCompare(b.bookName || b.title),
    );
  }, [books, classFilter]);

  const totalChapters = books.reduce((s, b) => s + b.chapterCount, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-4">
      
      {/* ── Top Navigation & Sleek Ribbon ────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#1a1a1e] text-[12px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232328] transition-all cursor-pointer shadow-2xs active:scale-98 shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
      </div>

      {/* ── Ultra-Sleek & Premium Header Ribbon ───────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#1a1a1e] rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-3 sm:px-4 sm:py-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-xs shrink-0', meta.gradient)}>
            <meta.icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[17px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">
                {subject}
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558] border border-[#8ba32b]/30 dark:border-[#c8e558]/30">
                NCERT Curriculum
              </span>
            </div>
            <p className="text-[11.5px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{books.length}</span> books
              <span>·</span>
              <span>{totalChapters} interactive chapters</span>
            </p>
          </div>
        </div>

        {/* Quick Stat Pill on the Right */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-50 dark:bg-[#202025] border border-slate-200/60 dark:border-white/[0.06] text-[11px] font-medium text-slate-600 dark:text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
            <span>AI Chapter Reader &amp; Tests Ready</span>
          </div>
        </div>
      </div>

      {/* ── Compact Class Filter Pills ────────────────────────── */}
      {classes.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          <button
            onClick={() => setClassFilter(null)}
            className={cn(
              'px-3 py-1 rounded-full text-[11.5px] font-bold transition-all border cursor-pointer shrink-0 shadow-2xs',
              !classFilter
                ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 border-transparent shadow-xs'
                : 'bg-white dark:bg-[#1a1a1e] text-slate-600 dark:text-slate-300 border-slate-200/90 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-[#232328]'
            )}
          >
            All classes
          </button>
          {classes.map((c) => {
            const active = classFilter === c;
            return (
              <button
                key={c}
                onClick={() => setClassFilter(active ? null : c)}
                className={cn(
                  'px-3 py-1 rounded-full text-[11.5px] font-bold transition-all border cursor-pointer shrink-0 shadow-2xs',
                  active
                    ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 border-transparent shadow-xs'
                    : 'bg-white dark:bg-[#1a1a1e] text-slate-600 dark:text-slate-300 border-slate-200/90 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-[#232328]'
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Compact & Aesthetic Book Cards Grid ───────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3.5 pb-12">
        {visible.map((book, i) => (
          <PremiumBookCard key={book.notebookId} book={book} onOpen={onOpenBook} index={i} />
        ))}
      </div>
    </motion.div>
  );
}

import React from 'react';
import { BookOpen, Clock3, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { BookSummary } from '../../lib/api/documents';
import { BookCover } from './BookCover';
import { getSubjectMeta } from './subjectMeta';
import { cn } from '../../lib/utils';

interface PremiumBookCardProps {
  book: BookSummary;
  onOpen: (book: BookSummary) => void;
  index: number;
}

/**
 * Ultra-sleek, compact, and minimalist academic book card.
 */
export function PremiumBookCard({ book, onOpen, index }: PremiumBookCardProps) {
  const meta = getSubjectMeta(book.subject);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.3), duration: 0.25 }}
      onClick={() => onOpen(book)}
      className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#1a1a1e] p-2.5 sm:p-3 shadow-2xs hover:shadow-md hover:border-slate-300 dark:hover:border-white/20 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden text-left"
    >
      <div>
        {/* ── Cover Artwork Thumbnail ──────────────────────────── */}
        <div className="relative w-full h-36 sm:h-40 rounded-xl overflow-hidden bg-slate-100 dark:bg-[#161619] border border-slate-200/70 dark:border-white/[0.06] mb-2.5 shadow-2xs">
          <BookCover
            notebookId={book.notebookId}
            subject={book.subject}
            title={book.bookName || book.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />

          {/* Floating Badges */}
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1 pointer-events-none">
            {book.className && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900/90 text-white dark:bg-[#c8e558] dark:text-slate-950 shadow-xs backdrop-blur-xs">
                {book.className}
              </span>
            )}
            <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-black/60 text-white border border-white/10 backdrop-blur-md ml-auto">
              NCERT
            </span>
          </div>

          {/* Bottom Gradient overlay */}
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/35 to-transparent pointer-events-none" />
        </div>

        {/* ── Title & Subject ─────────────────────────────────── */}
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#242429] text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-white/[0.05]">
            {book.subject}
          </span>
        </div>

        <h3 className="text-[13px] font-bold text-slate-900 dark:text-white leading-snug line-clamp-1 group-hover:text-[#8ba32b] dark:group-hover:text-[#c8e558] transition-colors mb-0.5">
          {book.bookName || book.title}
        </h3>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mb-2">
          AI-powered study &amp; tests
        </p>
      </div>

      {/* ── Footer Stats & CTA ────────────────────────────────── */}
      <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="w-3 h-3 text-[#8ba32b] dark:text-[#c8e558]" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">{book.chapterCount}</span> ch
          </span>
          {book.estimatedStudyHours > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="w-3 h-3 text-amber-500" />
              <span>{book.estimatedStudyHours}h</span>
            </span>
          )}
        </div>

        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 group-hover:bg-slate-900 group-hover:text-white dark:group-hover:bg-[#c8e558] dark:group-hover:text-slate-950 transition-all flex items-center justify-center shrink-0 shadow-2xs">
          <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </motion.div>
  );
}

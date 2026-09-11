import React from 'react';
import { BookOpen, Clock3, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { BookSummary } from '../../lib/api/documents';
import { BookCover } from './BookCover';

interface PremiumBookCardProps {
  book: BookSummary;
  onOpen: (book: BookSummary) => void;
  index: number;
}

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * A single book.
 *
 * The cover here is the real thing — the first page of the book's own PDF, rasterised — so unlike
 * the invented artwork this replaced elsewhere on the page, it carries information. A student
 * recognises their textbook by its cover faster than by its title, so it stays.
 *
 * What went: a hover shadow (the rest of the app lifts by border, not elevation), an amber clock
 * that put a second accent beside the lime, a scrim gradient over the cover with no text on it to
 * make legible, and a `getSubjectMeta` call whose result was never read.
 */
export function PremiumBookCard({ book, onOpen, index }: PremiumBookCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.022, duration: 0.32, ease: EASE }}
      onClick={() => onOpen(book)}
      className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#1a1a1e] p-2.5 sm:p-3 hover:border-[#8ba32b]/45 dark:hover:border-[#c8e558]/35 transition-colors duration-200 cursor-pointer overflow-hidden text-left"
    >
      <div>
        {/* ── Cover Artwork Thumbnail ──────────────────────────── */}
        <div className="relative w-full h-36 sm:h-40 rounded-xl overflow-hidden bg-slate-100 dark:bg-[#161619] border border-slate-200/70 dark:border-white/[0.06] mb-2.5">
          <BookCover
            notebookId={book.notebookId}
            subject={book.subject}
            title={book.bookName || book.title}
            className="w-full h-full object-cover"
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
              <Clock3 className="w-3 h-3 text-slate-400 dark:text-slate-500" />
              <span>{book.estimatedStudyHours}h</span>
            </span>
          )}
        </div>

        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 group-hover:bg-slate-900 group-hover:text-white dark:group-hover:bg-[#c8e558] dark:group-hover:text-slate-950 transition-colors flex items-center justify-center shrink-0">
          <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </motion.div>
  );
}

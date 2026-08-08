import { BookOpen, Clock3, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { BookSummary } from '../../lib/api/documents';
import { BookCover } from './BookCover';
import { getSubjectMeta } from './subjectMeta';
import { cn } from '../../lib/utils';

interface BookCardProps {
  book: BookSummary;
  onOpen: (book: BookSummary) => void;
  index: number;
}

export function BookCard({ book, onOpen, index }: BookCardProps) {
  const meta = getSubjectMeta(book.subject);
  const isFullyReady = book.readyChapterCount >= book.chapterCount;

  return (
    <motion.button
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4), duration: 0.3 }}
      onClick={() => onOpen(book)}
      className="group flex flex-col text-left bg-white dark:bg-[#1a1a1b] rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden hover:shadow-xl hover:-translate-y-1 hover:border-slate-300 dark:hover:border-white/20 transition-all duration-300"
    >
      <div className="relative w-full aspect-[3/4] overflow-hidden">
        <BookCover notebookId={book.notebookId} subject={book.subject} title={book.title} className="w-full h-full" />
        {/* Subtle gradient so the title never fights a busy cover image */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
        {book.className && (
          <span className="absolute top-2.5 left-2.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/90 dark:bg-black/60 text-slate-700 dark:text-gray-200 backdrop-blur-sm shadow-sm">
            {book.className}
          </span>
        )}
        {!isFullyReady && (
          <span className="absolute top-2.5 right-2.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/90 text-white backdrop-blur-sm shadow-sm">
            {book.readyChapterCount}/{book.chapterCount} ready
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3.5">
        <span className={cn('inline-flex items-center gap-1 self-start text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full', meta.accent)}>
          <meta.icon className="w-3 h-3" /> {book.subject}
        </span>
        <h3 className="font-bold text-[14.5px] text-slate-900 dark:text-gray-100 leading-snug line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
          {book.bookName || book.title}
        </h3>
        <div className="flex items-center justify-between text-[12px] text-slate-400 dark:text-gray-500 mt-0.5">
          <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {book.chapterCount} chapters</span>
          {book.estimatedStudyHours > 0 && (
            <span className="flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" /> {book.estimatedStudyHours}h</span>
          )}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between px-3.5 py-2.5 border-t border-slate-100 dark:border-white/5 text-[12.5px] font-semibold text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-50/60 dark:group-hover:bg-indigo-500/5 transition-colors">
        View book <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </motion.button>
  );
}

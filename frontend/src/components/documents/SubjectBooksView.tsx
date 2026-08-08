import { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';
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
    () => Array.from(new Set(books.map((b) => b.className).filter(Boolean))).sort((a, b) => classNum(a as string) - classNum(b as string)) as string[],
    [books]
  );

  const visible = useMemo(() => {
    const list = classFilter ? books.filter((b) => b.className === classFilter) : books;
    // Sort by class, then by book name so the grid reads in a sensible order.
    return [...list].sort((a, b) => classNum(a.className) - classNum(b.className) || (a.bookName || a.title).localeCompare(b.bookName || b.title));
  }, [books, classFilter]);

  const totalChapters = books.reduce((s, b) => s + b.chapterCount, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 transition-colors mb-5"
      >
        <ArrowLeft className="w-4 h-4" /> All collections
      </button>

      {/* Subject header */}
      <div className="flex items-center gap-4 mb-6">
        <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br shadow-md shrink-0', meta.gradient)}>
          <meta.icon className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-[26px] md:text-[30px] font-bold text-slate-900 dark:text-white leading-tight">{subject}</h1>
          <p className="text-[13.5px] text-slate-500 dark:text-gray-400 flex items-center gap-1.5 mt-0.5">
            <BookOpen className="w-4 h-4" /> {books.length} book{books.length > 1 ? 's' : ''} · {totalChapters} chapters
          </p>
        </div>
      </div>

      {/* Class filter */}
      {classes.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setClassFilter(null)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors border',
              !classFilter
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                : 'bg-white dark:bg-[#1a1a1b] text-slate-600 dark:text-gray-300 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
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
                  'px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors border',
                  active
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                    : 'bg-white dark:bg-[#1a1a1b] text-slate-600 dark:text-gray-300 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}

      {/* Premium book cards — auto-fill with a capped track width so cards stay a consistent
          small size and don't stretch to fill the row when a subject has only a few books. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-4 gap-y-8 pb-10">
        {visible.map((book, i) => (
          <PremiumBookCard key={book.notebookId} book={book} onOpen={onOpenBook} index={i} />
        ))}
      </div>
    </motion.div>
  );
}

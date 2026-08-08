import { BookOpen, Clock3 } from 'lucide-react';
import { motion } from 'motion/react';
import { BookSummary } from '../../lib/api/documents';
import { BookCover } from './BookCover';
import { Book3D } from './Book3D';
import { getSubjectMeta } from './subjectMeta';

interface PremiumBookCardProps {
  book: BookSummary;
  onOpen: (book: BookSummary) => void;
  index: number;
}

/**
 * A single book rendered as a 3D hardback: the real cover on the front, subject-coloured spine
 * with the book's class printed on it, and its title + quick stats beneath. The whole book is the
 * click target that opens it.
 */
export function PremiumBookCard({ book, onOpen, index }: PremiumBookCardProps) {
  const meta = getSubjectMeta(book.subject);
  const spineLabel = book.className ? `${book.subject} · ${book.className}` : book.bookName || book.title;

  return (
    <motion.button
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.32 }}
      onClick={() => onOpen(book)}
      className="group flex flex-col items-center text-center outline-none"
    >
      <div className="h-[248px] flex items-end justify-center mb-3">
        <Book3D
          spineGradient={meta.gradient}
          spineLabel={spineLabel}
          cover={
            <BookCover
              notebookId={book.notebookId}
              subject={book.subject}
              title={book.bookName || book.title}
              className="w-full h-full"
            />
          }
          badge={
            book.className ? (
              <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/90 dark:bg-black/70 text-slate-700 dark:text-gray-100 shadow-sm backdrop-blur-sm">
                {book.className}
              </span>
            ) : undefined
          }
        />
      </div>

      <h3 className="text-[13.5px] font-bold text-slate-900 dark:text-gray-100 leading-tight line-clamp-2 px-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
        {book.bookName || book.title}
      </h3>
      <div className="flex items-center justify-center gap-2.5 mt-1.5 text-[11.5px] text-slate-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1">
          <BookOpen className="w-3 h-3" /> {book.chapterCount} ch
        </span>
        {book.estimatedStudyHours > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock3 className="w-3 h-3" /> {book.estimatedStudyHours}h
          </span>
        )}
      </div>
    </motion.button>
  );
}

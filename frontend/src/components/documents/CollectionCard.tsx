import { motion } from 'motion/react';
import { BookSummary } from '../../lib/api/documents';
import { BookCover } from './BookCover';
import { getSubjectMeta } from './subjectMeta';
import { cn } from '../../lib/utils';

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

interface CollectionCardProps {
  subject: string;
  books: BookSummary[];
  onOpen: (subject: string) => void;
  index: number;
}

/**
 * A subject shown as a document FOLDER (file-jacket template): a frosted, subject-tinted front flap
 * with a badge and a stamped label, a matching back flap for depth, and up to three real books
 * tucked inside. On hover the books fan up and out of the folder in a slow, staggered cascade.
 * Clicking opens the subject's books.
 */
export function CollectionCard({ subject, books, onOpen, index }: CollectionCardProps) {
  const meta = getSubjectMeta(subject);
  const totalChapters = books.reduce((s, b) => s + b.chapterCount, 0);
  const latest = Math.max(...books.map((b) => b.updatedAt || 0));

  // Up to 3 distinct books (spread across the subject) tucked into the folder.
  const startIdx = hash(subject) % books.length;
  const step = Math.max(1, Math.floor(books.length / 3));
  const stack: BookSummary[] = [];
  const seen = new Set<number>();
  for (let k = 0; k < Math.min(3, books.length); k++) {
    let idx = (startIdx + k * step) % books.length;
    while (seen.has(idx)) idx = (idx + 1) % books.length;
    seen.add(idx);
    stack.push(books[idx]);
  }
  const [bookA, bookB, bookC] = stack; // A = front-most

  const docBase =
    'absolute top-3 bottom-3 left-5 right-1 origin-bottom rounded-md overflow-hidden bg-white dark:bg-[#1A1A1A] shadow-[0_12px_28px_-8px_rgba(0,0,0,0.5)] dark:shadow-[0_12px_28px_-8px_rgba(0,0,0,0.9)] transition-transform duration-700 ease-out';

  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.45), duration: 0.35 }}
      onClick={() => onOpen(subject)}
      className="group relative z-0 hover:z-20 flex flex-col items-center text-center w-full outline-none [perspective:1300px]"
    >
      <div className="relative h-[248px] w-full flex items-center justify-center mb-2.5">
        <div
          className="relative [transform-style:preserve-3d] transition-transform duration-700 ease-out [transform:rotateY(-15deg)] group-hover:[transform:rotateY(-9deg)_translateY(-6px)]"
          style={{ width: 156, height: 214 }}
        >
          {/* Back flap of the folder */}
          <div
            className={cn('absolute inset-0 rounded-xl bg-gradient-to-br shadow-lg dark:shadow-2xl', meta.gradient)}
            style={{ transform: 'translateZ(-15px) translateX(11px)' }}
          >
            <div className="absolute inset-0 rounded-xl bg-black/15 dark:bg-black/40" />
          </div>

          {/* Book C — backmost, comes out last & lowest */}
          {bookC && (
            <div className={cn(docBase, 'delay-200 [transform:translateZ(-12px)_translateX(14px)] group-hover:[transform:translateZ(-12px)_translateX(28px)_translateY(12px)_rotate(-5deg)]')}>
              <BookCover notebookId={bookC.notebookId} subject={subject} title={bookC.bookName || bookC.title} className="w-full h-full" />
              <span className="absolute inset-0 bg-black/10 dark:bg-black/30" />
            </div>
          )}

          {/* Book B — middle */}
          {bookB && (
            <div className={cn(docBase, 'delay-100 [transform:translateZ(-8px)_translateX(20px)] group-hover:[transform:translateZ(-8px)_translateX(42px)_translateY(-12px)_rotate(3deg)]')}>
              <BookCover notebookId={bookB.notebookId} subject={subject} title={bookB.bookName || bookB.title} className="w-full h-full" />
              <span className="absolute inset-0 bg-black/5 dark:bg-black/15" />
            </div>
          )}

          {/* Book A — front-most, comes out first, highest */}
          <div className={cn(docBase, '[transform:translateZ(-4px)_translateX(26px)] group-hover:[transform:translateZ(-4px)_translateX(48px)_translateY(-40px)_rotate(8deg)]')}>
            <BookCover notebookId={bookA.notebookId} subject={subject} title={bookA.bookName || bookA.title} className="w-full h-full" />
            <span className="absolute inset-y-0 right-0 w-[3px] bg-gradient-to-l from-black/15 dark:from-black/40 to-transparent" />
          </div>

          {/* Front flap — frosted, subject-tinted glass with badge + stamped label */}
          <div
            className="absolute inset-0 rounded-xl overflow-hidden border border-white/50 dark:border-white/20 shadow-2xl backdrop-blur-md"
            style={{ transform: 'translateZ(12px)' }}
          >
            <div className="absolute inset-0 bg-white/55 dark:bg-black/30" />
            <div className={cn('absolute inset-0 bg-gradient-to-br opacity-35 dark:opacity-40', meta.gradient)} />
            <div className="absolute inset-0 bg-gradient-to-br from-white/55 dark:from-white/10 via-transparent to-transparent" />
            <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white/25 dark:from-white/5 to-transparent" />

            {/* Badge */}
            <div className="absolute top-3 left-3 w-7 h-7 rounded-full bg-white/85 dark:bg-black/40 border border-white/70 dark:border-white/20 flex items-center justify-center shadow-sm backdrop-blur-md">
              <meta.icon className="w-3.5 h-3.5 text-slate-700 dark:text-gray-300" />
            </div>

            {/* Stamped label */}
            <div className="absolute bottom-3.5 left-3.5 right-3">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-slate-800 dark:text-gray-100 leading-tight truncate">
                {subject}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-600 dark:text-gray-400 mt-1.5">
                {books.length} Book{books.length > 1 ? 's' : ''} · {totalChapters} Ch
              </p>
            </div>
          </div>
        </div>

        {/* Ground shadow */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 h-3 w-[60%] rounded-[50%] bg-black/25 blur-md transition-all duration-700 ease-out group-hover:w-[74%] group-hover:bg-black/20" />
      </div>

      {/* Caption */}
      <div className="px-1 w-full">
        <h3 className="font-bold text-[14px] text-slate-900 dark:text-gray-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
          {subject}
        </h3>
        <p className="text-[11.5px] text-slate-400 dark:text-gray-500 mt-0.5">Updated {timeAgo(latest)}</p>
      </div>
    </motion.button>
  );
}

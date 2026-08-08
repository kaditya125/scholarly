import { useState } from 'react';
import { motion } from 'motion/react';
import { MoreVertical, BookOpen, GraduationCap, ClipboardCheck, ListTree, Hourglass } from 'lucide-react';
import { BookChapter, BookDetail, chapterLabel } from '../../lib/api/documents';
import { getSubjectMeta } from './subjectMeta';
import { useChapterCover } from '../../hooks/ai/useChapterCover';
import { cn } from '../../lib/utils';

const DIFFICULTY_STYLE: Record<string, string> = {
  Easy: 'text-emerald-700 bg-emerald-100',
  Medium: 'text-amber-700 bg-amber-100',
  Hard: 'text-rose-700 bg-rose-100',
};

interface ChapterFileCardProps {
  book: BookDetail;
  chapter: BookChapter;
  index: number;
  onRead: () => void;
  onLearn: () => void;
  onTest: () => void;
  onOpen: () => void;
}

/**
 * A chapter presented as a PDF file card (à la the "Suggested Files" template): a document-page
 * thumbnail synthesized from the chapter's real content (subject strip, chapter title, section
 * headings and paragraph lines), a red PDF tag with the title + meta, and a kebab menu. The
 * thumbnail opens the in-app PDF reader; the menu exposes Read / Learn / Test / details.
 */
export function ChapterFileCard({ book, chapter, index, onRead, onLearn, onTest, onOpen }: ChapterFileCardProps) {
  const meta = getSubjectMeta(book.subject);
  const [menuOpen, setMenuOpen] = useState(false);
  const label = chapterLabel(chapter);
  const ready = chapter.status === 'READY' || chapter.status === 'READY_DEGRADED';
  // The chapter's REAL first page (rendered client-side); only fetched once the chapter is ready.
  const { coverUrl } = useChapterCover(book.notebookId, chapter.sourceId, ready);

  const sections = (
    chapter.headings && chapter.headings.length
      ? chapter.headings
      : (chapter.keyConcepts || []).map((k) => k.term)
  )
    .filter(Boolean)
    .slice(0, 3);

  const MenuItem = ({ icon, text, onClick }: { icon: React.ReactNode; text: string; onClick: () => void }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setMenuOpen(false);
        onClick();
      }}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 text-left"
    >
      {icon}
      {text}
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.3 }}
      className="group"
    >
      {/* Thumbnail — a synthesized document page; opens the reader */}
      <button
        onClick={onRead}
        title={`Read ${label}`}
        className="relative block w-full aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/20 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-all"
      >
        <div className="absolute inset-0 bg-white">
          {/* subject-branded top strip */}
          <div className={cn('h-1.5 w-full bg-gradient-to-r', meta.gradient)} />
          {/* dog-ear */}
          <div className="absolute top-1.5 right-0 w-5 h-5 bg-slate-100" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
          <div className="p-3">
            <p className="text-[7.5px] font-bold uppercase tracking-wider text-slate-400 truncate">
              {book.subject}
              {book.className ? ` · ${book.className}` : ''}
            </p>
            <p className="text-[10px] font-bold text-slate-800 leading-tight mt-1 line-clamp-2">{label}</p>
            <div className="mt-2.5 space-y-2">
              {(sections.length ? sections : ['', '', '']).map((s, i) => (
                <div key={i}>
                  {s ? <p className="text-[6.5px] font-semibold text-slate-500 truncate">{s}</p> : null}
                  <div className="mt-1 space-y-1">
                    <div className="h-[2px] bg-slate-200 rounded w-full" />
                    <div className="h-[2px] bg-slate-200 rounded w-[86%]" />
                    <div className="h-[2px] bg-slate-200 rounded w-[70%]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Real first page of the chapter, rendered over the synthesized fallback once loaded. */}
        {coverUrl && (
          <img
            src={coverUrl}
            alt={`First page of ${label}`}
            className="absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-300"
            draggable={false}
          />
        )}

        {chapter.difficulty && (
          <span className={cn('absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full', DIFFICULTY_STYLE[chapter.difficulty])}>
            {chapter.difficulty}
          </span>
        )}
        {!ready && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-900/70 text-white">
            <Hourglass className="w-2.5 h-2.5" /> Processing
          </span>
        )}
      </button>

      {/* Footer — PDF tag + title + meta + menu */}
      <div className="flex items-center gap-2 mt-2.5">
        <div className="w-7 h-8 rounded-[5px] bg-red-500 flex items-center justify-center shrink-0 shadow-sm">
          <span className="text-white text-[7px] font-black tracking-tight">PDF</span>
        </div>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="text-[13px] font-bold text-slate-800 dark:text-gray-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {label}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-gray-500 truncate">
            PDF · {book.className || book.subject}
            {chapter.estimatedStudyTimeMinutes ? ` · ${chapter.estimatedStudyTimeMinutes} min` : ''}
          </p>
        </button>
        <div className="relative shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Chapter actions"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-40 w-40 rounded-xl bg-white dark:bg-[#1e1e1f] border border-slate-200 dark:border-white/10 shadow-xl py-1">
                <MenuItem icon={<BookOpen className="w-3.5 h-3.5" />} text="Read" onClick={onRead} />
                <MenuItem icon={<GraduationCap className="w-3.5 h-3.5" />} text="Learn" onClick={onLearn} />
                <MenuItem icon={<ClipboardCheck className="w-3.5 h-3.5" />} text="Take test" onClick={onTest} />
                <MenuItem icon={<ListTree className="w-3.5 h-3.5" />} text="View details" onClick={onOpen} />
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

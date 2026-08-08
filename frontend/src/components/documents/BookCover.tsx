import { useBookCover } from '../../hooks/ai/useBookCover';
import { SubjectCover } from './SubjectCover';
import { cn } from '../../lib/utils';

interface BookCoverProps {
  notebookId: string;
  subject?: string;
  title: string;
  className?: string;
  /** Skip fetching/rasterizing the real cover (e.g. off-screen or decorative back cards). */
  lazy?: boolean;
}

/**
 * Book cover: renders the designed subject cover instantly as a base, then overlays the REAL
 * NCERT book cover (page 1 of the book's prelims PDF, fetched + rasterized client-side) once it
 * loads. If the real cover is unavailable, the clean subject cover simply remains — never a
 * broken image or an inner chapter page.
 */
export function BookCover({ notebookId, subject, title, className, lazy }: BookCoverProps) {
  const { coverUrl } = useBookCover(notebookId, !lazy);

  return (
    <div className={cn('relative w-full h-full overflow-hidden bg-slate-100 dark:bg-white/5', className)}>
      {/* Instant, always-present base so there's never an empty flash while the cover loads. */}
      <SubjectCover subject={subject || 'Textbook'} className="absolute inset-0" />

      {/* Real cover fades in on top when ready. */}
      {coverUrl && (
        <img
          src={coverUrl}
          alt={`Cover of ${title}`}
          className="absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-300"
          draggable={false}
        />
      )}
    </div>
  );
}

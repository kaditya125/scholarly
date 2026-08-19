import { useEffect, useRef, useState } from 'react';
import { useBookCover } from '../../hooks/ai/useBookCover';
import { SubjectCover } from './SubjectCover';
import { cn } from '../../lib/utils';

interface BookCoverProps {
  notebookId: string;
  subject?: string;
  title: string;
  className?: string;
  /** Skip fetching/rasterizing the real cover entirely (e.g. decorative back cards). Viewport
   *  visibility already gates the normal case — this is for callers that know better. */
  lazy?: boolean;
}

/**
 * Book cover: renders the designed subject cover instantly as a base, then overlays the REAL
 * NCERT book cover (page 1 of the book's prelims PDF, fetched + rasterized client-side) once it
 * loads. If the real cover is unavailable, the clean subject cover simply remains — never a
 * broken image or an inner chapter page.
 *
 * The real cover only starts loading once this card is actually near the viewport. A collection
 * grid can mount dozens of these at once, and each real cover means downloading a full PDF and
 * rasterizing it client-side — without this gate, every card in the grid fired that work
 * simultaneously on mount, which is what was hanging the page on mobile (weaker CPU, much less
 * memory than desktop, and a narrower viewport doesn't reduce how many cards MOUNT — a
 * multi-column grid still instantiates every card, just at a smaller draw size).
 */
export function BookCover({ notebookId, subject, title, className, lazy }: BookCoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);

  useEffect(() => {
    if (lazy || isNearViewport) return;
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      // No IO support: fail open rather than never show a cover.
      setIsNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsNearViewport(true);
      },
      { rootMargin: '200px' } // start loading a little before it scrolls into view
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [lazy, isNearViewport]);

  const { coverUrl } = useBookCover(notebookId, !lazy && isNearViewport);

  return (
    <div ref={containerRef} className={cn('relative w-full h-full overflow-hidden bg-slate-100 dark:bg-white/5', className)}>
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

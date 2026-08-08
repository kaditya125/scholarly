import { getSubjectMeta } from './subjectMeta';
import { cn } from '../../lib/utils';

interface SubjectCoverProps {
  subject: string;
  className?: string;
  /** Compact styling for small surfaces like the collection stacks. */
  compact?: boolean;
}

/**
 * A designed, premium "book cover" for a subject — a subject-colored gradient with soft depth,
 * a dot pattern, and the subject emblem. Used instead of rasterizing a chapter PDF's first page
 * (which is inner text, not a cover), so browse surfaces stay clean, consistent, and instant.
 */
export function SubjectCover({ subject, className, compact }: SubjectCoverProps) {
  const meta = getSubjectMeta(subject);
  const Icon = meta.icon;

  return (
    <div className={cn('relative w-full h-full overflow-hidden bg-gradient-to-br', meta.gradient, className)}>
      {/* Soft depth blobs */}
      <div className="absolute -top-8 -right-10 w-32 h-32 rounded-full bg-white/15 blur-2xl" />
      <div className="absolute -bottom-10 -left-8 w-32 h-32 rounded-full bg-black/10 blur-2xl" />

      {/* Subtle dot pattern */}
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1.4px)',
          backgroundSize: compact ? '12px 12px' : '18px 18px',
        }}
      />

      {/* Watermark emblem */}
      <Icon className={cn('absolute text-white/10', compact ? '-right-3 -bottom-3 w-20 h-20' : '-right-5 -bottom-6 w-40 h-40')} strokeWidth={1} />

      {/* Top label (full size only) */}
      {!compact && (
        <div className="absolute top-4 left-4 right-4">
          <div className="text-white/75 text-[9.5px] font-bold uppercase tracking-[0.22em]">Textbook</div>
          <div className="h-px bg-white/25 mt-1.5 w-8" />
        </div>
      )}

      {/* Center emblem + subject name */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3">
        <div className={cn('rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20', compact ? 'w-9 h-9' : 'w-14 h-14')}>
          <Icon className={cn('text-white', compact ? 'w-5 h-5' : 'w-7 h-7')} strokeWidth={1.75} />
        </div>
        {!compact && <div className="text-white font-bold text-[15px] tracking-tight text-center leading-tight">{subject}</div>}
      </div>
    </div>
  );
}

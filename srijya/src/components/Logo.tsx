import { COMPANY } from '@/site.config';

/**
 * The mark.
 *
 * A plain weave, reduced to four threads: two warp, two weft, with a break in
 * whichever thread passes underneath at each of the four crossings. That is the
 * whole idea of the company name in the smallest number of strokes — separate
 * threads, held in tension, producing a structure none of them has on its own.
 *
 * It is drawn as strokes on a 24-unit grid so it stays a single colour, scales to
 * a 16px favicon without a raster, and works on either theme by inheriting
 * `currentColor`.
 */
export function LoomMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="square"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Warp — vertical. Each break marks a crossing this thread passes under. */}
      <path d="M8.5 2.5v12.4M8.5 19.1v2.4" />
      <path d="M15.5 2.5v2.4M15.5 9.1v12.4" />
      {/* Weft — horizontal. The four breaks alternate, so the weave reads as plain. */}
      <path d="M2.5 7h3.9M10.6 7h10.9" />
      <path d="M2.5 17h10.9M17.6 17h3.9" />
    </svg>
  );
}

/**
 * Mark plus wordmark. The company name is set in two lines — the way it reads on
 * the registration — with the second line quieter, so the lockup stays compact in
 * a 68px navigation bar without shrinking the name itself.
 */
export function Logo({
  stacked = true,
  className = '',
}: {
  /** False collapses to a single line, which is what small screens want. */
  stacked?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LoomMark size={stacked ? 26 : 22} className="shrink-0 text-ink" />
      {stacked ? (
        <span className="flex flex-col leading-none">
          <span className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">
            {COMPANY.nameParts[0]}
          </span>
          <span className="mt-[3px] font-mono text-[0.5625rem] font-medium uppercase tracking-[0.22em] text-ink-3">
            {COMPANY.nameParts[1]}
          </span>
        </span>
      ) : (
        <span className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">
          {COMPANY.nameParts[0]}
          <span className="text-ink-3"> {COMPANY.nameParts[1]}</span>
        </span>
      )}
    </span>
  );
}

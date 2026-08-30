import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Sadhya brand marks — the single source of truth for the logo.
 *
 * ── The mark ────────────────────────────────────────────────────────────────────────
 * Sadhya (साध्य) means "the goal that is to be attained", so the mark is a peak with a
 * detached dot above it: the ascent, and the goal it points at. The gap between the two
 * is deliberate and is the whole idea — the goal is in sight, not yet reached.
 *
 * The peak is `currentColor` so it inherits legible contrast in both themes; only the
 * goal dot is fixed to the brand accent, which is the same `#c8e558` used for accents
 * throughout the product.
 */

const ACCENT = '#c8e558';

export function LogoMark({
  className,
  style,
}: {
  className?: string;
  /** Escape hatch for the few call sites that size the mark with a numeric pixel prop. */
  style?: React.CSSProperties;
}) {
  return (
    <svg className={cn('w-6 h-6 shrink-0 inline-block text-slate-900 dark:text-white', className)} style={style} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* The goal — always the brand accent, never theme-dependent. */}
      <circle cx="17.8" cy="5.4" r="2.5" fill={ACCENT} />
      {/*
        A ridge line rather than a single peak: the near ridge at full strength, the far
        one held back to 50% so the mark reads with depth instead of as a flat chevron.
        Strokes are 2.5 (a touch heavier than they look like they need) so the two ridges
        stay distinguishable rather than merging at favicon size.
      */}
      <path
        d="M2.6 20.4l6.2-8.4 3.6 4.6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.4 20.4l4.2-5.4 4.8 5.4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
    </svg>
  );
}

/**
 * Mark + wordmark lockup. `showWordmark={false}` gives the mark alone, for tight
 * spots like a collapsed sidebar.
 */
export function Logo({
  className,
  markClassName = 'w-6 h-6',
  wordClassName = 'text-[17px]',
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  wordClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={markClassName} />
      {showWordmark && (
        <span className={cn('font-semibold tracking-[-0.01em]', wordClassName)}>
          Sadhya<span className="text-[#c8e558]">.</span>
        </span>
      )}
    </span>
  );
}

export default Logo;

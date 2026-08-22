import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';

/**
 * Sadhya brand marks — the single source of truth for the logo.
 *
 * ── The mark ────────────────────────────────────────────────────────────────────────
 * Sadhya (साध्य) means "the goal that is to be attained", so the mark is a peak with a
 * detached dot above it: the ascent, and the goal it points at.
 * The animated dot continuously jumps up from behind the mountain peak in an energetic
 * learning loop, resting at the summit before cycling.
 */

const ACCENT = '#c8e558';

export function LogoMark({
  className = 'w-6 h-6',
  style,
}: {
  className?: string;
  /** Escape hatch for the few call sites that size the mark with a numeric pixel prop. */
  style?: React.CSSProperties;
}) {
  const reduced = useReducedMotion();

  return (
    <svg className={cn('overflow-visible group/mark', className)} style={style} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* 
        Layer 1 (Behind Peaks): The Goal Dot jumping up in a smooth loop from behind the mountain.
        Rendered before the paths so the mountain peaks physically occlude it on launch.
      */}
      <motion.g
        animate={reduced ? {} : {
          y: [9, -3.5, 0.4, -0.8, 0, 0, 9],
          x: [-0.5, -0.8, 0, 0, 0, 0, -0.5],
          scale: [0.6, 1.15, 0.96, 1.04, 1, 1, 0.6],
          opacity: [0.3, 1, 1, 1, 1, 1, 0.3],
        }}
        transition={{
          duration: 3.2,
          repeat: Infinity,
          ease: [0.22, 1, 0.36, 1],
          times: [0, 0.32, 0.46, 0.56, 0.64, 0.88, 1],
        }}
        style={{ originX: '17.8px', originY: '5.4px' }}
      >
        {/* Pulsing Beacon Glow behind the dot */}
        <circle
          cx="17.8"
          cy="5.4"
          r="4.5"
          fill={ACCENT}
          className="animate-ping opacity-25"
        />
        {/* The Goal Dot */}
        <circle
          cx="17.8"
          cy="5.4"
          r="2.5"
          fill={ACCENT}
          className="drop-shadow-[0_0_6px_rgba(200,229,88,0.9)]"
        />
      </motion.g>

      {/*
        Layer 2 (Front): Near & Far Ridge lines rendered on top of the dot
        so the jump visibly emerges from behind the mountains.
      */}
      <path
        d="M2.6 20.4l6.2-8.4 3.6 4.6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-transform duration-300 group-hover/mark:-translate-y-0.5"
      />
      <path
        d="M12.4 20.4l4.2-5.4 4.8 5.4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
        className="transition-transform duration-300 group-hover/mark:-translate-y-0.5"
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
        <span className={cn('font-semibold tracking-[-0.01em]', wordClassName)}>Sadhya</span>
      )}
    </span>
  );
}

export default Logo;

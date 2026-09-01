import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Hand-drawn marker annotations — the "someone marked up this page with a felt pen" flourish.
 *
 * ── WHY THIS IS ONE FILE ──────────────────────────────────────────────────────────────────
 * The underline arc already existed TWICE, copied between Landing.tsx and ForTeachers.tsx with
 * the same path data, the same easing and the same accent, declared independently in each. A
 * third and fourth copy were the obvious next step as this spreads across the marketing pages,
 * and the copies had already begun to drift — one was named `Underline`, the other
 * `HeroUnderline`. Drawing style is exactly the kind of thing that must not fork: two arcs with
 * slightly different curvature on two pages reads as sloppiness, not as character.
 *
 * ── WHAT MAKES IT LOOK HAND-DRAWN ─────────────────────────────────────────────────────────
 * Three things, and none of them is the color:
 *   1. The stroke is DRAWN, not revealed. `pathLength` 0→1 traces the line the way a pen moves,
 *      so the eye follows a gesture instead of watching a shape fade in.
 *   2. The geometry is imperfect. The underline rises slightly to the right; the circle overshoots
 *      its own start rather than closing cleanly. A mathematically perfect ellipse reads as a
 *      border, not a pen mark.
 *   3. Round caps, and a weight that stays constant while the text scales.
 *
 * ── WHY whileInView AND NOT animate ───────────────────────────────────────────────────────
 * These are going on sections far below the fold. Animating on mount would mean every annotation
 * on the page finishes drawing before the reader ever scrolls to it, so they would arrive to a
 * static mark and never see the gesture — the entire point. `whileInView` with `once` draws each
 * one as it is reached. In a hero, which is in view at mount, this behaves identically to the
 * old on-mount animation, so nothing regresses for the two existing call sites.
 *
 * ── ACCESSIBILITY ─────────────────────────────────────────────────────────────────────────
 * Every mark is decorative: `aria-hidden`, `pointer-events-none`, and never the only thing
 * carrying meaning. Under `prefers-reduced-motion` the mark is rendered in its FINAL state
 * rather than removed — a reader who asked for less motion still gets the emphasis, just not
 * the animation. That is why `initial={false}` is used rather than dropping the SVG.
 */

/** House accent. Overridable per call site, but changing it here changes it everywhere. */
export const ANNOTATE_ACCENT = '#c8e558';

/** The same easing curve the surrounding page sections use, so marks feel native to the motion. */
const EASE = [0.22, 1, 0.36, 1] as const;

/** Shared: annotations draw slightly before they are fully on screen. */
const VIEWPORT = { once: true, margin: '-60px' } as const;

type MarkProps = {
  children: ReactNode;
  /** Seconds to wait before the stroke starts. Stagger these when marking two words nearby. */
  delay?: number;
  color?: string;
  className?: string;
};

/**
 * A hand-drawn arc beneath a word or phrase.
 *
 * Wraps inline, so it goes around the WORDS being emphasised, not the whole heading:
 *   Programs to take your startup <Underline>further</Underline>
 */
export function Underline({ children, delay = 0.35, color = ANNOTATE_ACCENT, className }: MarkProps) {
  const reduced = useReducedMotion();
  return (
    <span className={`relative inline-block whitespace-nowrap ${className ?? ''}`}>
      {children}
      <svg
        className="absolute -bottom-1 sm:-bottom-1.5 left-0 w-full overflow-visible pointer-events-none"
        height="11"
        viewBox="0 0 100 11"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden
      >
        {/*
         * Deliberately not level: it dips under the middle of the word and lifts at the right,
         * the way a hand does when it underlines quickly. preserveAspectRatio="none" lets it
         * stretch to any word width while the stroke weight stays put.
         */}
        <motion.path
          d="M1.5 5C18 8.8 44 9.6 98.5 2.6"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={VIEWPORT}
          transition={{
            pathLength: { duration: reduced ? 0 : 0.85, ease: EASE, delay: reduced ? 0 : delay },
            opacity: { duration: reduced ? 0 : 0.2, delay: reduced ? 0 : delay },
          }}
        />
      </svg>
    </span>
  );
}

/**
 * A hand-drawn loop around a word — the strongest mark available, so use it once per page.
 *
 * Sized off the text it wraps rather than a fixed box, so it survives a heading that reflows or
 * a font that loads late.
 *
 * ── THE ONE CONSTRAINT ────────────────────────────────────────────────────────────────────
 * The loop overshoots the wrapped word vertically, and an inline-block's box IS the line box —
 * so on a heading with tight leading the overshoot lands on the glyphs of the line below as soon
 * as the heading wraps. Give any heading carrying a Circle leading of roughly 1.3 or more. That
 * does not add a gap between the line BOXES (it cannot), but it pushes the next line's glyphs
 * far enough down that the loop passes through whitespace instead of through letters.
 */
export function Circle({ children, delay = 0.45, color = ANNOTATE_ACCENT, className }: MarkProps) {
  const reduced = useReducedMotion();
  return (
    <span className={`relative inline-block whitespace-nowrap ${className ?? ''}`}>
      {children}
      <svg
        className="absolute pointer-events-none overflow-visible"
        /*
         * Padded outward so the loop clears the glyphs — a circle touching the letters reads as a
         * badge. Percentages of the wrapped text, so it scales with the type.
         *
         * WIDE AND FLAT, deliberately. A hand drawing a circle around a word sweeps sideways; a
         * tall oval reads as a bubble. It is also the safe direction to grow: horizontal overshoot
         * lands in the word spacing, while vertical overshoot lands on the NEXT LINE when the
         * heading wraps. Measured at 375px, the original 24% vertical ran 9px into the line below.
         * See the leading note in the doc comment above.
         */
        style={{ left: '-9%', right: '-9%', top: '-15%', bottom: '-15%', width: '118%', height: '130%' }}
        viewBox="0 0 100 50"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden
      >
        {/*
         * One continuous stroke that passes its own starting point and keeps going for a short
         * tail. That overlap is the whole trick: a closed ellipse looks printed, an overshot one
         * looks drawn. Starting at the top-centre means the tail lands top-left, out of the way
         * of the reading direction.
         */}
        <motion.path
          d="M52 3C30 3 4 10 4 25C4 39 28 47 53 47C77 47 96 38 96 24C96 11 74 3 48 3C36 3 26 6 20 10"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={VIEWPORT}
          transition={{
            pathLength: { duration: reduced ? 0 : 1.05, ease: EASE, delay: reduced ? 0 : delay },
            opacity: { duration: reduced ? 0 : 0.2, delay: reduced ? 0 : delay },
          }}
        />
      </svg>
    </span>
  );
}

/**
 * Directions a {@link Arrow} can sweep. Named for where the arrow STARTS relative to what it
 * points at, because that is what a caller is deciding when they place one.
 */
export type ArrowVariant = 'from-left' | 'from-right' | 'from-above';

/** Shaft, then the two head strokes. Head is a separate path so it can land after the shaft. */
const ARROW_PATHS: Record<ArrowVariant, { box: string; shaft: string; head: string }> = {
  // Sweeps down and to the right — the Google-style arrow that sits left of a CTA.
  'from-left': {
    box: '0 0 120 90',
    shaft: 'M8 6C12 42 34 70 96 76',
    head: 'M76 62L98 77L74 88',
  },
  // Mirror image, for a CTA whose free space is on its right.
  'from-right': {
    box: '0 0 120 90',
    shaft: 'M112 6C108 42 86 70 24 76',
    head: 'M44 62L22 77L46 88',
  },
  // Drops from above onto the target — for a mark that sits over a centred button.
  'from-above': {
    box: '0 0 90 110',
    shaft: 'M12 6C46 18 66 46 60 96',
    head: 'M42 74L61 102L78 72',
  },
};

/**
 * A curved arrow pointing at something — a CTA, a control, the next step.
 *
 * Positioned by the CALLER, not by this component: an arrow is only ever right for one specific
 * layout, and a component that guessed its own placement would be wrong on most of them. Give it
 * an absolute-positioning className against a `relative` parent.
 *
 *   <div className="relative">
 *     <Arrow variant="from-left" className="absolute -left-24 -top-6 w-24 hidden md:block" />
 *     <button>Find programs available to you</button>
 *   </div>
 *
 * Hide it below `md`: on a narrow screen there is no room beside a CTA, and an arrow pointing at
 * nothing is worse than no arrow.
 */
export function Arrow({
  variant = 'from-left',
  delay = 0.5,
  color = ANNOTATE_ACCENT,
  className,
}: {
  variant?: ArrowVariant;
  delay?: number;
  color?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const { box, shaft, head } = ARROW_PATHS[variant];
  const draw = (d: number, dur: number) => ({
    pathLength: { duration: reduced ? 0 : dur, ease: EASE, delay: reduced ? 0 : d },
    opacity: { duration: reduced ? 0 : 0.15, delay: reduced ? 0 : d },
  });

  return (
    <svg
      className={`pointer-events-none overflow-visible ${className ?? ''}`}
      viewBox={box}
      fill="none"
      aria-hidden
    >
      <motion.path
        d={shaft}
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={VIEWPORT}
        transition={draw(delay, 0.7)}
      />
      {/*
       * The head is drawn AFTER the shaft arrives, not with it. Drawing both together looks like
       * a shape appearing; drawing the head last looks like the hand finished the stroke and
       * flicked the point on — which is what sells the gesture.
       */}
      <motion.path
        d={head}
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={VIEWPORT}
        transition={draw(delay + 0.55, 0.3)}
      />
    </svg>
  );
}

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';
import { SITE } from '../../lib/siteConfig';

/**
 * The brand tagline, written on as if by hand.
 *
 * ── How the effect works ────────────────────────────────────────────────────────────
 * Not an SVG stroke animation: that needs single-stroke path data per glyph, which a font
 * cannot give you, and tracing a script font's *outline* looks like tracing, not writing.
 * Instead the text is revealed left-to-right with an animated `clip-path`, and a faint
 * vertical nib travels along the reveal edge. The nib is the part that sells it — a bare
 * wipe reads as a transition, a wipe with a pen tip reads as handwriting.
 *
 * `clip-path` rather than an animated width, because width would reflow and re-wrap the
 * text mid-animation. The insets bleed generously above and below so Caveat's ascenders
 * and descenders are never clipped.
 *
 * Respects `prefers-reduced-motion` by rendering the finished line with no animation at
 * all — the tagline is content, so it must survive the animation being switched off.
 */
export function HandwrittenTagline({
  text = SITE.tagline,
  className,
  style,
  delay = 0.2,
  duration = 2.0,
  showNib = true,
  animated = true,
}: {
  text?: string;
  className?: string;
  /** For call sites that need to align the line against a pixel-sized mark. */
  style?: React.CSSProperties;
  delay?: number;
  duration?: number;
  showNib?: boolean;
  animated?: boolean;
}) {
  const reduced = useReducedMotion();

  const base = cn('font-script leading-[1.15] whitespace-nowrap', className);

  /* Leading rule, in the attribution/signature idiom. Sized in `em` so it stays in
     proportion across the 15px, 16px and 19px placements instead of needing a value each. */
  const rule = 'h-[1.5px] w-[1.4em] bg-current shrink-0 origin-left';

  if (reduced || !animated) {
    return (
      <span className={cn('inline-flex items-center gap-2', base)} style={style}>
        <span className={cn(rule, 'opacity-70')} aria-hidden="true" />
        {text}
      </span>
    );
  }

  // Eases in fast and settles slowly, the way a written line actually lands.
  const ease = [0.22, 0.61, 0.36, 1] as const;

  // The rule is drawn first and the writing follows, so it reads as one continuous gesture —
  // the opening stroke, then the words. They overlap slightly rather than running end to end,
  // which would feel like two separate animations queued up.
  const ruleDuration = 0.4;
  const textDelay = delay + ruleDuration * 0.7;

  /*
   * Animates on mount (`animate`), NOT on scroll-into-view.
   *
   * This started as `whileInView` with a 60%-visible threshold, which was a latent bug: the
   * initial keyframe clips the text away entirely, so anywhere the observer did not fire —
   * a footer the viewport never covers 60% of, a short window — the tagline stayed clipped
   * and was invisible forever. Tying "is this readable at all" to a scroll heuristic is the
   * wrong trade; the line is content first and an effect second.
   */
  return (
    <span className={cn('inline-flex items-center gap-2', base)} style={style}>
      <motion.span
        aria-hidden="true"
        className={rule}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 0.7 }}
        transition={{ duration: ruleDuration, delay, ease }}
      />

      <span className="relative inline-block">
        <motion.span
          className="inline-block"
          initial={{ clipPath: 'inset(-35% 100% -35% -3%)' }}
          animate={{ clipPath: 'inset(-35% -6% -35% -3%)' }}
          transition={{ duration, delay: textDelay, ease }}
        >
          {text}
        </motion.span>

        {showNib && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute top-[14%] bottom-[16%] w-px bg-current"
            initial={{ left: '0%', opacity: 0 }}
            animate={{ left: '100%', opacity: [0, 0.5, 0.5, 0] }}
            transition={{
              left: { duration, delay: textDelay, ease },
              opacity: { duration, delay: textDelay, times: [0, 0.06, 0.9, 1] },
            }}
          />
        )}
      </span>
    </span>
  );
}

export default HandwrittenTagline;

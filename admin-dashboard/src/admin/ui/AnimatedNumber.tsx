import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

interface AnimatedNumberProps {
  value: number;
  /** Decimal places to display. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Group integer part with locale separators (default true). */
  group?: boolean;
  durationMs?: number;
  className?: string;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Count-up animated number. Purely presentational — the final rendered value
 * always equals `value`. Respects prefers-reduced-motion (jumps to final).
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  group = true,
  durationMs = 900,
  className,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduce || durationMs <= 0) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = easeOutCubic(t);
      setDisplay(from + (value - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value, durationMs, reduce]);

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: group,
  });

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

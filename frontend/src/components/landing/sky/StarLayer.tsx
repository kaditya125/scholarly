import { useMemo } from 'react';
import { DEPTHS, FIELDS, buildGlints } from './starfield';

/**
 * The star system, shared by every phase that shows any: night at full strength, dawn
 * washing them out, dusk bringing them back, aurora holding them behind the curtains.
 *
 * The whole thing hangs off one `--sky-star-a`, set per phase, so a sunrise can dissolve
 * the stars without this component knowing anything about the time of day.
 */
export default function StarLayer({ compact }: { compact: boolean }) {
  const glints = useMemo(() => buildGlints(compact ? 7 : 16, 0x9c7f21), [compact]);

  return (
    <div className="sky-stars">
      {DEPTHS.map((depth) => (
        <div
          key={depth}
          className={`sky-field sky-field--${depth}`}
          style={{
            backgroundImage: FIELDS[depth].image,
            backgroundSize: `${FIELDS[depth].tile}px ${FIELDS[depth].tile}px`,
          }}
        />
      ))}

      {glints.map((s, i) => (
        <span
          key={i}
          className="sky-glint"
          style={
            {
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              background: `rgba(${s.tint},1)`,
              boxShadow: `0 0 ${s.size * 3}px ${s.size * 0.8}px rgba(${s.tint},0.35)`,
              '--a': s.alpha,
              '--delay': `${s.delay}s`,
              '--d': `${s.duration}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

import type { CSSProperties } from 'react';

/**
 * The hero visual.
 *
 * A loom mid-work, read structurally rather than literally. The upper two thirds
 * are warp alone — threads under tension, no cloth yet. Weft begins around the
 * middle and grows denser toward the bottom, so the field resolves from separate
 * threads into fabric as the eye travels down it. Three shuttles cross the
 * boundary between the two. That is the company name as a diagram, and it is the
 * reason the visual is not simply a grid: a grid has no direction.
 *
 * Built as one inline SVG. No canvas, no animation library, no requestAnimationFrame:
 * the movement is three dash offsets and a handful of opacities driven by CSS
 * keyframes, which the compositor handles without waking the main thread.
 * `prefers-reduced-motion` stops all of it and leaves the cloth standing (styles.css).
 */

const WIDTH = 520;
const HEIGHT = 560;

/** Warp: dense, evenly tensioned, unevenly lit. */
const WARP = Array.from({ length: 31 }, (_, i) => {
  const x = 10 + i * 17;
  /* A repeating but non-obvious pattern of weights, so the eye reads threads
     catching light rather than ruled lines. */
  const weight = [0.12, 0.2, 0.1, 0.28, 0.13, 0.1, 0.22, 0.12][i % 8] ?? 0.13;
  return { x, weight };
});

/** Structural threads — a few warps held brighter, on a long, slow cycle. */
const LIT_WARP = new Set([61, 163, 265, 384, 469]);

/**
 * Weft: nothing above the weave line, then passes that tighten and darken toward
 * the bottom. This is the cloth being formed.
 */
const WEFT = [
  { y: 322, opacity: 0.1 },
  { y: 356, opacity: 0.13 },
  { y: 388, opacity: 0.16 },
  { y: 418, opacity: 0.19 },
  { y: 446, opacity: 0.22 },
  { y: 472, opacity: 0.25 },
  { y: 496, opacity: 0.28 },
  { y: 518, opacity: 0.31 },
];

/** The shuttles, crossing at the working edge of the cloth. */
const SHUTTLES = [
  { y: 288, len: 96, dur: 12, delay: 0 },
  { y: 322, len: 64, dur: 16, delay: 5 },
  { y: 250, len: 78, dur: 14, delay: 9.5 },
];

/** Intersections that catch the light, clustered where the weave is active. */
const NODES = [
  { x: 163, y: 322, dur: 7, delay: 0.4, accent: true },
  { x: 282, y: 356, dur: 8.5, delay: 2.6, accent: false },
  { x: 384, y: 388, dur: 6.4, delay: 1.3, accent: false },
  { x: 95, y: 418, dur: 9, delay: 4.1, accent: false },
  { x: 469, y: 446, dur: 7.6, delay: 3.2, accent: true },
  { x: 231, y: 472, dur: 8, delay: 5.4, accent: false },
  { x: 333, y: 518, dur: 6.8, delay: 1.9, accent: false },
];

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

/* The shuttle's dash starts just before the line and finishes just past it. */
const DASH_FROM = 96;
const DASH_TO = -(WIDTH + 40);

export default function LoomField({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      role="img"
      aria-label="An abstract loom: fine vertical threads across the upper field, resolving into woven cloth below, with light catching a few of the crossings."
      style={{
        // Dissolve into the page instead of ending on a hard edge.
        maskImage: 'radial-gradient(ellipse 80% 78% at 50% 52%, #000 50%, transparent 90%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 78% at 50% 52%, #000 50%, transparent 90%)',
      }}
    >
      {/* Warp.

          Strokes deliberately scale with the viewBox rather than being pinned to
          one device pixel: at phone size the field renders at about 0.6×, so a
          non-scaling hairline would sit at the same weight against 40% of the
          spacing and the whole thing would read as dense striping. Letting the
          stroke shrink with the drawing keeps the *texture* constant instead. */}
      <g className="text-ink" stroke="currentColor" strokeWidth={1}>
        {WARP.map(({ x, weight }) =>
          LIT_WARP.has(x) ? (
            <line
              key={x}
              x1={x}
              y1={8}
              x2={x}
              y2={HEIGHT - 8}
              opacity={0.32}
              className="warp-lit"
              style={{ '--dur': '15s', '--delay': `${(x % 11) * 0.8}s` } as CSSVars}
            />
          ) : (
            <line key={x} x1={x} y1={8} x2={x} y2={HEIGHT - 8} opacity={weight} />
          )
        )}
      </g>

      {/* Weft — the cloth */}
      <g className="text-ink" stroke="currentColor" strokeWidth={1.1}>
        {WEFT.map(({ y, opacity }) => (
          <line key={y} x1={10} y1={y} x2={WIDTH - 10} y2={y} opacity={opacity} />
        ))}
      </g>

      {/* Shuttles */}
      <g
        className="text-accent"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
      >
        {SHUTTLES.map((shuttle) => (
          <line
            key={shuttle.y}
            x1={10}
            y1={shuttle.y}
            x2={WIDTH - 10}
            y2={shuttle.y}
            className="weft"
            style={
              {
                '--len': `${shuttle.len}`,
                '--from': `${DASH_FROM}`,
                '--to': `${DASH_TO}`,
                '--dur': `${shuttle.dur}s`,
                '--delay': `${shuttle.delay}s`,
              } as CSSVars
            }
          />
        ))}
      </g>

      {/* Intersections */}
      <g>
        {NODES.map((node) => (
          <rect
            key={`${node.x}-${node.y}`}
            x={node.x - 2}
            y={node.y - 2}
            width={4}
            height={4}
            className={`node ${node.accent ? 'text-accent' : 'text-ink'}`}
            fill="currentColor"
            style={{ '--dur': `${node.dur}s`, '--delay': `${node.delay}s` } as CSSVars}
          />
        ))}
      </g>
    </svg>
  );
}

/**
 * The same motif at rule scale — a hairline with a few threads crossing it.
 * Used to close a section without introducing another box.
 */
export function LoomRule({ className = '' }: { className?: string }) {
  const ticks = [0.08, 0.14, 0.21, 0.34, 0.42, 0.55, 0.63, 0.71, 0.86, 0.93];
  return (
    <svg
      viewBox="0 0 1000 16"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g className="text-ink" stroke="currentColor" vectorEffect="non-scaling-stroke">
        <line x1={0} y1={8} x2={1000} y2={8} opacity={0.16} strokeWidth={1} />
        {ticks.map((t) => (
          <line key={t} x1={t * 1000} y1={0} x2={t * 1000} y2={16} opacity={0.14} strokeWidth={1} />
        ))}
      </g>
    </svg>
  );
}

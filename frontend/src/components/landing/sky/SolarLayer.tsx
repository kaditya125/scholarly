/**
 * The sun, and the few clouds that make its light legible.
 *
 * This component holds no colours and no positions of its own — every one of them arrives
 * as a custom property from `palette.ts`, so the same three elements are a red disc sitting
 * on the horizon at 05:30, a small white one high overhead at noon, and a swollen orange one
 * going down at 18:20. The halo is a separate, much larger bloom: it is what makes a low
 * sun read as genuinely low rather than merely small.
 */

/** Soft, wide, slow. Positions are fixed; only the colour and opacity move with the hour. */
const CLOUDS = [
  { top: '14%', left: '-6%', width: '46%', height: '13%', duration: '190s' },
  { top: '31%', left: '38%', width: '54%', height: '11%', duration: '260s' },
  { top: '57%', left: '8%', width: '40%', height: '9%', duration: '220s' },
  { top: '72%', left: '52%', width: '48%', height: '10%', duration: '300s' },
];

export default function SolarLayer({ compact }: { compact: boolean }) {
  const clouds = compact ? CLOUDS.slice(0, 2) : CLOUDS;

  return (
    <>
      <div className="sky-sun-halo" />
      <div className="sky-sun" />

      {clouds.map((c, i) => (
        <div
          key={i}
          className="sky-cloud"
          style={
            {
              top: c.top,
              left: c.left,
              width: c.width,
              height: c.height,
              '--d': c.duration,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}

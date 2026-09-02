/**
 * The evening display: curtains of light over a mountain skyline.
 *
 * Real aurora is emission from oxygen and nitrogen high in the atmosphere, which is why the
 * palette here is not free choice — the dominant green is atomic oxygen at 557.7 nm, the
 * deep red above it the same atom at 630 nm, and the violet-blue fringe is ionised
 * nitrogen. Using those three and nothing else is most of what makes it read as an aurora
 * rather than as coloured smoke.
 *
 * Each curtain is a soft band, striated along its length to suggest the field lines it
 * follows, masked so it dissolves before it reaches the ground, and blended additively so
 * overlapping curtains brighten the way real ones do.
 */

interface Curtain {
  left: string;
  width: string;
  /** "r,g,b" — see the emission lines above. */
  color: string;
  /** Multiplier on the phase-wide `--aurora-a`, so one swell moves all of them together. */
  weight: number;
  duration: string;
  delay: string;
}

const CURTAINS: Curtain[] = [
  { left: '-6%', width: '46%', color: '74,222,128', weight: 0.85, duration: '19s', delay: '0s' },
  { left: '22%', width: '52%', color: '45,212,191', weight: 1, duration: '27s', delay: '-6s' },
  { left: '54%', width: '44%', color: '129,140,248', weight: 0.62, duration: '23s', delay: '-13s' },
  { left: '30%', width: '38%', color: '244,114,182', weight: 0.3, duration: '33s', delay: '-3s' },
];

/**
 * Two ridges rather than one: the near range darker and higher, the far range lighter and
 * lower. That single overlap is what gives a flat silhouette any sense of depth.
 */
function Ridge() {
  return (
    <svg className="sky-ridge" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden>
      <path
        d="M0,200 L0,148 L74,104 L142,138 L226,86 L300,132 L382,98 L470,146 L548,110 L640,152 L724,120 L812,158 L900,126 L988,162 L1074,134 L1152,166 L1200,142 L1200,200 Z"
        fill="rgba(12,20,30,0.72)"
      />
      <path
        d="M0,200 L0,176 L96,128 L188,170 L272,118 L368,164 L452,126 L556,172 L648,138 L744,178 L840,144 L940,182 L1040,150 L1130,186 L1200,160 L1200,200 Z"
        fill="rgba(4,7,12,0.92)"
      />
    </svg>
  );
}

export default function AuroraLayer({ compact }: { compact: boolean }) {
  const curtains = compact ? CURTAINS.slice(0, 3) : CURTAINS;

  return (
    <>
      {curtains.map((c, i) => (
        <div
          key={i}
          className="sky-curtain"
          style={
            {
              left: c.left,
              width: c.width,
              '--c': c.color,
              '--a': `calc(var(--aurora-a, 0.7) * ${c.weight})`,
              '--d': c.duration,
              '--delay': c.delay,
            } as React.CSSProperties
          }
        />
      ))}
      <Ridge />
    </>
  );
}

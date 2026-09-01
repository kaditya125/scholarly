import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * The drawing half of NightSky. Split out from the gate in `NightSky.tsx` and loaded
 * lazily by it, so the star fields, the planets and ~200 lines of CSS only reach the
 * browser on a page that is actually going to show them — never in daylight, never in
 * light mode.
 *
 * Mounting this component means it is night: it does no checking of its own.
 */

// ─── Star fields ─────────────────────────────────────────────────────────────

/** Seeded PRNG, so a given field is identical on every render and every visit. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mostly white, with the odd blue giant and warm dwarf so the field is not monochrome. */
const STAR_TINTS = ['255,255,255', '255,255,255', '255,255,255', '198,216,255', '255,229,193'];

interface FieldSpec {
  seed: number;
  /** Side of the repeating tile, in px. Larger tiles read as sparser, further-away stars. */
  tile: number;
  count: number;
  radius: number;
  minAlpha: number;
  maxAlpha: number;
  /** Sharp stars are points; soft ones carry a halo, which reads as brighter and closer. */
  sharp?: boolean;
}

function buildField(spec: FieldSpec): string {
  const rand = mulberry32(spec.seed);
  const stops: string[] = [];
  for (let i = 0; i < spec.count; i++) {
    const x = (rand() * spec.tile).toFixed(1);
    const y = (rand() * spec.tile).toFixed(1);
    const alpha = (spec.minAlpha + rand() * (spec.maxAlpha - spec.minAlpha)).toFixed(2);
    const tint = STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)];
    const core = spec.sharp ? '55%' : '18%';
    stops.push(
      `radial-gradient(${spec.radius}px ${spec.radius}px at ${x}px ${y}px, rgba(${tint},${alpha}) 0 ${core}, rgba(${tint},0) 100%)`,
    );
  }
  return stops.join(',');
}

const FIELDS = {
  /** Unresolved galactic haze — too faint to pick out individually, dense enough to feel. */
  dust: {
    image: buildField({ seed: 0x1f35c1, tile: 120, count: 24, radius: 0.7, minAlpha: 0.08, maxAlpha: 0.2, sharp: true }),
    tile: 120,
  },
  far: {
    image: buildField({ seed: 0x5adb41, tile: 560, count: 12, radius: 2.6, minAlpha: 0.16, maxAlpha: 0.38 }),
    tile: 560,
  },
  mid: {
    image: buildField({ seed: 0x77c209, tile: 330, count: 15, radius: 1.7, minAlpha: 0.28, maxAlpha: 0.58 }),
    tile: 330,
  },
  near: {
    image: buildField({ seed: 0xa3e17b, tile: 210, count: 17, radius: 1.1, minAlpha: 0.5, maxAlpha: 0.95, sharp: true }),
    tile: 210,
  },
} as const;

const DEPTHS = ['dust', 'far', 'mid', 'near'] as const;

// ─── The stars that actually glitter ─────────────────────────────────────────

interface Glint {
  x: number;
  y: number;
  size: number;
  alpha: number;
  delay: number;
  duration: number;
  tint: string;
}

/**
 * A tiled field can only twinkle as one body. These few are real elements, each on its own
 * phase, and they are what sells the scintillation — the fields behind them only have to
 * shimmer.
 */
function buildGlints(count: number, seed: number): Glint[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x: +(rand() * 100).toFixed(2),
    y: +(rand() * 100).toFixed(2),
    size: +(1.2 + rand() * 1.8).toFixed(2),
    alpha: +(0.5 + rand() * 0.45).toFixed(2),
    delay: +(rand() * 9).toFixed(2),
    duration: +(3.2 + rand() * 5.5).toFixed(2),
    tint: STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)],
  }));
}

// ─── Distant bodies ──────────────────────────────────────────────────────────

function Moon() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <radialGradient id="ns-moon-face" cx="34%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#fdf7e6" stopOpacity="0.98" />
          <stop offset="62%" stopColor="#ded4b2" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#8d8770" stopOpacity="0.32" />
        </radialGradient>
        <radialGradient id="ns-moon-halo" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="#e8e2c8" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#e8e2c8" stopOpacity="0" />
        </radialGradient>
        {/* The night side is carved out rather than shaded, so the terminator stays crisp. */}
        <mask id="ns-moon-lit">
          <rect width="100" height="100" fill="#000" />
          <circle cx="46" cy="52" r="30" fill="#fff" />
          <circle cx="66" cy="41" r="29" fill="#000" />
        </mask>
      </defs>
      <circle cx="46" cy="52" r="48" fill="url(#ns-moon-halo)" />
      <g mask="url(#ns-moon-lit)">
        <circle cx="46" cy="52" r="30" fill="url(#ns-moon-face)" />
        <circle cx="34" cy="45" r="5.5" fill="#8d8770" opacity="0.22" />
        <circle cx="41" cy="63" r="3.4" fill="#8d8770" opacity="0.18" />
        <circle cx="27" cy="58" r="2.4" fill="#8d8770" opacity="0.15" />
      </g>
    </svg>
  );
}

function RingedPlanet() {
  return (
    <svg viewBox="0 0 120 120" className="w-full h-full">
      <defs>
        <radialGradient id="ns-saturn-body" cx="32%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#cbb79a" stopOpacity="0.85" />
          <stop offset="58%" stopColor="#9a7f63" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#2b2338" stopOpacity="0.5" />
        </radialGradient>
        <linearGradient id="ns-saturn-ring" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d8c9ae" stopOpacity="0" />
          <stop offset="22%" stopColor="#d8c9ae" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#f0e6cf" stopOpacity="0.75" />
          <stop offset="78%" stopColor="#d8c9ae" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#d8c9ae" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Ring behind the globe, then the globe, then the near half of the ring in front. */}
      <ellipse cx="60" cy="62" rx="52" ry="13" fill="none" stroke="url(#ns-saturn-ring)" strokeWidth="3.5" />
      <circle cx="60" cy="58" r="25" fill="url(#ns-saturn-body)" />
      <path d="M8 62 A 52 13 0 0 0 112 62" fill="none" stroke="url(#ns-saturn-ring)" strokeWidth="3.5" />
    </svg>
  );
}

function DistantPlanet() {
  return (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <defs>
        <radialGradient id="ns-planet-body" cx="34%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#9fc6e8" stopOpacity="0.8" />
          <stop offset="55%" stopColor="#5c7fb0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#1c1b33" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <circle cx="30" cy="30" r="17" fill="url(#ns-planet-body)" />
    </svg>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const SKY_CSS = `
.ns-root {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  contain: layout paint style;
  animation: ns-rise 3s ease-out both;
}

/* Carries the scroll fade. Kept separate from the root so the entrance animation and the
   scroll response multiply instead of fighting over one opacity. */
.ns-veil {
  position: absolute;
  inset: 0;
  opacity: var(--ns-fade, 1);
}

.ns-wash {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(115% 78% at 80% -12%, rgba(97,82,178,0.22) 0%, rgba(97,82,178,0) 62%),
    radial-gradient(95% 72% at 10% 6%, rgba(32,92,146,0.17) 0%, rgba(32,92,146,0) 66%),
    radial-gradient(130% 96% at 46% 118%, rgba(10,12,30,0.5) 0%, rgba(10,12,30,0) 58%);
}

/* The galactic plane, tilted off-axis so it does not read as a banner. */
.ns-band {
  position: absolute;
  left: -28%;
  right: -28%;
  top: -20%;
  height: 96%;
  transform: rotate(-13deg);
  background:
    radial-gradient(58% 40% at 50% 50%, rgba(171,153,255,0.14) 0%, rgba(124,143,255,0.07) 40%, rgba(124,143,255,0) 74%),
    radial-gradient(36% 19% at 31% 45%, rgba(255,197,152,0.09) 0%, rgba(255,197,152,0) 72%),
    radial-gradient(29% 15% at 71% 56%, rgba(142,221,255,0.085) 0%, rgba(142,221,255,0) 72%);
}

/* Oversized, so the parallax drift never exposes an edge. */
.ns-field {
  position: absolute;
  inset: -14%;
  background-repeat: repeat;
}

.ns-field--dust { animation: ns-shimmer-a 13s ease-in-out infinite alternate, ns-drift-a 260s linear infinite alternate; }
.ns-field--far  { animation: ns-shimmer-b 17s ease-in-out infinite alternate, ns-drift-b 210s linear infinite alternate; }
.ns-field--mid  { animation: ns-shimmer-a 9s  ease-in-out infinite alternate, ns-drift-c 150s linear infinite alternate; }
.ns-field--near { animation: ns-shimmer-b 6s  ease-in-out infinite alternate, ns-drift-b 110s linear infinite alternate; }

.ns-glint {
  position: absolute;
  border-radius: 9999px;
  opacity: 0;
  animation: ns-glint var(--ns-dur) ease-in-out var(--ns-delay) infinite;
}

.ns-body {
  position: absolute;
  animation: ns-float var(--ns-dur) ease-in-out infinite alternate;
}

.ns-meteor {
  position: absolute;
  width: 150px;
  height: 1.5px;
  border-radius: 9999px;
  background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 55%, rgba(255,255,255,0.95) 100%);
  opacity: 0;
  animation: ns-meteor var(--ns-dur) linear var(--ns-delay) infinite;
}

@keyframes ns-rise { from { opacity: 0; } to { opacity: 1; } }

@keyframes ns-shimmer-a { from { opacity: 0.62; } to { opacity: 1; } }
@keyframes ns-shimmer-b { from { opacity: 1; } to { opacity: 0.55; } }

@keyframes ns-drift-a { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(28px, -16px, 0); } }
@keyframes ns-drift-b { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(-34px, 12px, 0); } }
@keyframes ns-drift-c { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(18px, 22px, 0); } }

@keyframes ns-glint {
  0%, 100% { opacity: 0.06; transform: scale(0.55); }
  50%      { opacity: var(--ns-alpha); transform: scale(1); }
}

@keyframes ns-float {
  from { transform: translate3d(0, 0, 0); }
  to   { transform: translate3d(0, -14px, 0); }
}

/* Idle for most of the cycle — a meteor you can predict stops being a meteor. */
@keyframes ns-meteor {
  0%   { opacity: 0; transform: translate3d(0, 0, 0) rotate(var(--ns-angle)); }
  1.5% { opacity: 0; }
  3%   { opacity: 0.85; }
  9%   { opacity: 0; transform: translate3d(var(--ns-dx), var(--ns-dy), 0) rotate(var(--ns-angle)); }
  100% { opacity: 0; transform: translate3d(var(--ns-dx), var(--ns-dy), 0) rotate(var(--ns-angle)); }
}

/* On small screens the sky sits behind body copy — there are no side gutters to hide the
   planets in. Pull it back rather than drop it. */
@media (max-width: 640px) {
  .ns-veil { opacity: calc(var(--ns-fade, 1) * 0.72); }
}

@media (prefers-reduced-motion: reduce) {
  .ns-root, .ns-root * { animation: none !important; }
  .ns-glint { opacity: var(--ns-alpha); }
  .ns-meteor { display: none; }
}
`;

// ─── Component ───────────────────────────────────────────────────────────────

export default function NightSkyLayers() {
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // The sky belongs to the top of the page. Past the first screen it recedes, so no
  // section of body copy has to compete with a star field for contrast. Written straight
  // to a custom property rather than to state — this runs on every scroll frame.
  useEffect(() => {
    let frame = 0;
    const apply = () => {
      frame = 0;
      const travel = Math.min(window.scrollY / (window.innerHeight * 0.9), 1);
      rootRef.current?.style.setProperty('--ns-fade', (1 - travel * 0.72).toFixed(3));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    // A resize changes the viewport height the fade is measured against, and fires no scroll.
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const glints = useMemo(() => buildGlints(compact ? 7 : 16, 0x9c7f21), [compact]);

  return (
    <div ref={rootRef} className="ns-root" aria-hidden>
      <style>{SKY_CSS}</style>
      <div className="ns-veil">
        <div className="ns-wash" />
        <div className="ns-band" />

        {DEPTHS.map((depth) => (
          <div
            key={depth}
            className={`ns-field ns-field--${depth}`}
            style={{
              backgroundImage: FIELDS[depth].image,
              backgroundSize: `${FIELDS[depth].tile}px ${FIELDS[depth].tile}px`,
            }}
          />
        ))}

        {glints.map((s, i) => (
          <span
            key={i}
            className="ns-glint"
            style={
              {
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${s.size}px`,
                height: `${s.size}px`,
                background: `rgba(${s.tint},1)`,
                boxShadow: `0 0 ${s.size * 3}px ${s.size * 0.8}px rgba(${s.tint},0.35)`,
                '--ns-alpha': s.alpha,
                '--ns-delay': `${s.delay}s`,
                '--ns-dur': `${s.duration}s`,
              } as React.CSSProperties
            }
          />
        ))}

        <div
          className="ns-body"
          style={
            {
              top: '3%',
              right: '6%',
              width: 'clamp(96px, 13vw, 170px)',
              height: 'clamp(96px, 13vw, 170px)',
              opacity: 0.5,
              '--ns-dur': '34s',
            } as React.CSSProperties
          }
        >
          <Moon />
        </div>

        <div
          className="ns-body"
          style={
            {
              bottom: '11%',
              left: '3%',
              width: 'clamp(92px, 12vw, 160px)',
              height: 'clamp(92px, 12vw, 160px)',
              opacity: 0.3,
              '--ns-dur': '46s',
            } as React.CSSProperties
          }
        >
          <RingedPlanet />
        </div>

        <div
          className="ns-body"
          style={
            {
              top: '58%',
              right: '19%',
              width: 'clamp(34px, 4.5vw, 62px)',
              height: 'clamp(34px, 4.5vw, 62px)',
              opacity: 0.34,
              '--ns-dur': '58s',
            } as React.CSSProperties
          }
        >
          <DistantPlanet />
        </div>

        {!reducedMotion && !compact && (
          <>
            <span
              className="ns-meteor"
              style={
                {
                  top: '12%',
                  left: '18%',
                  '--ns-angle': '19deg',
                  '--ns-dx': '520px',
                  '--ns-dy': '180px',
                  '--ns-dur': '17s',
                  '--ns-delay': '4s',
                } as React.CSSProperties
              }
            />
            <span
              className="ns-meteor"
              style={
                {
                  top: '34%',
                  left: '52%',
                  '--ns-angle': '27deg',
                  '--ns-dx': '400px',
                  '--ns-dy': '205px',
                  '--ns-dur': '29s',
                  '--ns-delay': '13s',
                } as React.CSSProperties
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

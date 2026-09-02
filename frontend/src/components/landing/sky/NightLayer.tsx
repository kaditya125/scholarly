/**
 * What only full dark shows: the galactic band, a crescent moon, two planets, and the
 * occasional meteor. The stars themselves come from StarLayer, which several phases share.
 */

function Moon() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <radialGradient id="sky-moon-face" cx="34%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#fdf7e6" stopOpacity="0.98" />
          <stop offset="62%" stopColor="#ded4b2" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#8d8770" stopOpacity="0.32" />
        </radialGradient>
        <radialGradient id="sky-moon-halo" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="#e8e2c8" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#e8e2c8" stopOpacity="0" />
        </radialGradient>
        {/* The night side is carved out rather than shaded, so the terminator stays crisp. */}
        <mask id="sky-moon-lit">
          <rect width="100" height="100" fill="#000" />
          <circle cx="46" cy="52" r="30" fill="#fff" />
          <circle cx="66" cy="41" r="29" fill="#000" />
        </mask>
      </defs>
      <circle cx="46" cy="52" r="48" fill="url(#sky-moon-halo)" />
      <g mask="url(#sky-moon-lit)">
        <circle cx="46" cy="52" r="30" fill="url(#sky-moon-face)" />
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
        <radialGradient id="sky-saturn-body" cx="32%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#cbb79a" stopOpacity="0.85" />
          <stop offset="58%" stopColor="#9a7f63" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#2b2338" stopOpacity="0.5" />
        </radialGradient>
        <linearGradient id="sky-saturn-ring" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d8c9ae" stopOpacity="0" />
          <stop offset="22%" stopColor="#d8c9ae" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#f0e6cf" stopOpacity="0.75" />
          <stop offset="78%" stopColor="#d8c9ae" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#d8c9ae" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Ring behind the globe, then the globe, then the near half of the ring in front. */}
      <ellipse cx="60" cy="62" rx="52" ry="13" fill="none" stroke="url(#sky-saturn-ring)" strokeWidth="3.5" />
      <circle cx="60" cy="58" r="25" fill="url(#sky-saturn-body)" />
      <path d="M8 62 A 52 13 0 0 0 112 62" fill="none" stroke="url(#sky-saturn-ring)" strokeWidth="3.5" />
    </svg>
  );
}

function DistantPlanet() {
  return (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <defs>
        <radialGradient id="sky-planet-body" cx="34%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#9fc6e8" stopOpacity="0.8" />
          <stop offset="55%" stopColor="#5c7fb0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#1c1b33" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <circle cx="30" cy="30" r="17" fill="url(#sky-planet-body)" />
    </svg>
  );
}

interface Props {
  compact: boolean;
  reducedMotion: boolean;
  /** Bodies fade in over dusk's last stretch rather than snapping on at 21:00. */
  intensity: number;
}

export default function NightLayer({ compact, reducedMotion, intensity }: Props) {
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: intensity, transition: 'opacity 6s linear' }}>
      <div className="sky-band" />

      <div
        className="sky-body"
        style={
          {
            top: '3%',
            right: '6%',
            width: 'clamp(96px, 13vw, 170px)',
            height: 'clamp(96px, 13vw, 170px)',
            opacity: 0.5,
            '--d': '34s',
          } as React.CSSProperties
        }
      >
        <Moon />
      </div>

      <div
        className="sky-body"
        style={
          {
            bottom: '11%',
            left: '3%',
            width: 'clamp(92px, 12vw, 160px)',
            height: 'clamp(92px, 12vw, 160px)',
            opacity: 0.3,
            '--d': '46s',
          } as React.CSSProperties
        }
      >
        <RingedPlanet />
      </div>

      <div
        className="sky-body"
        style={
          {
            top: '58%',
            right: '19%',
            width: 'clamp(34px, 4.5vw, 62px)',
            height: 'clamp(34px, 4.5vw, 62px)',
            opacity: 0.34,
            '--d': '58s',
          } as React.CSSProperties
        }
      >
        <DistantPlanet />
      </div>

      {!reducedMotion && !compact && (
        <>
          <span
            className="sky-meteor"
            style={
              {
                top: '12%',
                left: '18%',
                '--angle': '19deg',
                '--dx': '520px',
                '--dy': '180px',
                '--d': '17s',
                '--delay': '4s',
              } as React.CSSProperties
            }
          />
          <span
            className="sky-meteor"
            style={
              {
                top: '34%',
                left: '52%',
                '--angle': '27deg',
                '--dx': '400px',
                '--dy': '205px',
                '--d': '29s',
                '--delay': '13s',
              } as React.CSSProperties
            }
          />
        </>
      )}
    </div>
  );
}

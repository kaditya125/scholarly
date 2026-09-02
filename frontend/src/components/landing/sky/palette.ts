import { ramp, rampColor, type SkyPhase } from './phase';

/**
 * What each phase actually looks like — every colour, the sun's track across the viewport,
 * and how much of the star field is showing, expressed as custom properties the stylesheet
 * reads.
 *
 * Values are keyframed rather than linear: three stops let a phase turn a corner partway
 * through, which is the difference between a sun that reddens *as* it falls and one that
 * cross-fades evenly from gold to red.
 *
 * Every wash is deliberately translucent. The page underneath is near-black already, and a
 * fully opaque sky would replace that background rather than sit behind it — body copy has
 * to stay readable at every hour.
 */

export const PHASE_TINT: Record<SkyPhase, string> = {
  dawn: '#ff9a5c',
  day: '#7dd3fc',
  dusk: '#fb7185',
  aurora: '#4ade80',
  night: '#93a4ff',
};

type Vars = Record<string, string>;

const pct = (n: number) => `${n.toFixed(2)}%`;
const px = (n: number) => `${n.toFixed(1)}px`;
const num = (n: number) => n.toFixed(3);

/** A vertical wash: deep at the top, warm along the bottom. */
function verticalWash(top: string, topA: number, mid: string, midA: number, low: string, lowA: number): string {
  return (
    `linear-gradient(to bottom, ` +
    `rgba(${top},${num(topA)}) 0%, ` +
    `rgba(${mid},${num(midA)}) 44%, ` +
    `rgba(${low},${num(lowA)}) 82%, ` +
    `rgba(${low},${num(lowA * 0.45)}) 100%)`
  );
}

function dawn(t: number): Vars {
  const top = rampColor(['#070c22', '#16203f', '#2b3a63'], t);
  const mid = rampColor(['#131634', '#2d2a4d', '#46466f'], t);
  const low = rampColor(['#3a1f36', '#7d3340', '#b8683f'], t);
  return {
    '--sky-wash': verticalWash(top, ramp([0.55, 0.5, 0.42], t), mid, ramp([0.45, 0.42, 0.34], t), low, ramp([0.2, 0.34, 0.3], t)),
    '--sky-horizon': rampColor(['#8e2f2a', '#c4552b', '#e0904a'], t),
    '--sky-horizon-a': num(ramp([0.04, 0.22, 0.13], t)),
    '--sky-star-a': num(ramp([0.75, 0.18, 0], t)),
    '--sun-x': pct(ramp([16, 27], t)),
    '--sun-y': pct(ramp([112, 82, 56], t)),
    '--sun-size': px(ramp([124, 96, 74], t)),
    '--sun-core': rampColor(['#ff3d20', '#ff7a33', '#ffc978'], t),
    '--sun-edge': rampColor(['#a8301a', '#e2652c', '#ffab55'], t),
    '--sun-a': num(ramp([0.18, 0.72, 0.88], t)),
    '--cloud': rampColor(['#7a3b3a', '#e08c5c', '#ffc79a'], t),
    '--cloud-a': num(ramp([0.05, 0.13, 0.1], t)),
    '--phase-tint': PHASE_TINT.dawn,
  };
}

function day(t: number): Vars {
  const top = rampColor(['#1b2b4a', '#223554', '#1e3050'], t);
  const mid = rampColor(['#263d5e', '#2c4668', '#274063'], t);
  const low = rampColor(['#31506f', '#3a5a7a', '#355472'], t);
  return {
    '--sky-wash': verticalWash(top, 0.2, mid, 0.14, low, 0.1),
    '--sky-horizon': '#5b83aa',
    '--sky-horizon-a': num(0.05),
    '--sky-star-a': '0',
    // A shallow arc across the top of the viewport, peaking around midday.
    '--sun-x': pct(ramp([28, 52, 78], t)),
    '--sun-y': pct(ramp([22, 11, 22], t)),
    '--sun-size': px(ramp([56, 48, 56], t)),
    '--sun-core': '#fff8e4',
    '--sun-edge': rampColor(['#ffd88a', '#fff0c4', '#ffd88a'], t),
    '--sun-a': num(ramp([0.42, 0.55, 0.42], t)),
    '--cloud': '#cfe0f5',
    '--cloud-a': num(0.07),
    '--phase-tint': PHASE_TINT.day,
  };
}

function dusk(t: number): Vars {
  const top = rampColor(['#243a63', '#241c3c', '#0d0b1c'], t);
  const mid = rampColor(['#3d3a63', '#3a2440', '#171227'], t);
  const low = rampColor(['#c9702e', '#b03a2c', '#3c1430'], t);
  return {
    '--sky-wash': verticalWash(top, ramp([0.36, 0.48, 0.55], t), mid, ramp([0.3, 0.4, 0.46], t), low, ramp([0.26, 0.3, 0.24], t)),
    '--sky-horizon': rampColor(['#e0904a', '#e0642c', '#7a2440'], t),
    '--sky-horizon-a': num(ramp([0.1, 0.26, 0.07], t)),
    '--sky-star-a': num(ramp([0, 0.08, 0.6], t)),
    '--sun-x': pct(ramp([72, 84], t)),
    '--sun-y': pct(ramp([42, 78, 114], t)),
    '--sun-size': px(ramp([62, 84, 112], t)),
    '--sun-core': rampColor(['#ffc061', '#ff7b3a', '#e0402a'], t),
    '--sun-edge': rampColor(['#ffab55', '#e2562a', '#96261f'], t),
    '--sun-a': num(ramp([0.9, 0.78, 0.3], t)),
    '--cloud': rampColor(['#ffc79a', '#e07a5c', '#5c2b3d'], t),
    '--cloud-a': num(ramp([0.11, 0.13, 0.05], t)),
    '--phase-tint': PHASE_TINT.dusk,
  };
}

function aurora(t: number): Vars {
  const top = rampColor(['#070d1e', '#050912', '#04070f'], t);
  const mid = rampColor(['#0a1526', '#071019', '#050a12'], t);
  const low = rampColor(['#0d2431', '#0b2b30', '#092227'], t);
  return {
    '--sky-wash': verticalWash(top, 0.5, mid, 0.45, low, 0.3),
    '--sky-horizon': '#124a44', // teal ground glow pooling under the curtains
    '--sky-horizon-a': num(ramp([0.08, 0.16, 0.12], t)),
    '--sky-star-a': num(ramp([0.6, 0.88, 0.95], t)),
    '--sun-a': '0',
    '--sun-x': '50%',
    '--sun-y': '130%',
    '--sun-size': '0px',
    '--sun-core': '#000000',
    '--sun-edge': '#000000',
    '--cloud-a': '0',
    '--cloud': '#000000',
    // Drives every curtain's opacity together, so the display swells and settles.
    '--aurora-a': num(ramp([0.42, 0.92, 0.78], t)),
    '--phase-tint': PHASE_TINT.aurora,
  };
}

function night(): Vars {
  return {
    // Kept radial rather than vertical: at full dark there is no horizon to grade towards,
    // only pools of colour where the galaxy is thickest.
    '--sky-wash':
      'radial-gradient(115% 78% at 80% -12%, rgba(97,82,178,0.22) 0%, rgba(97,82,178,0) 62%),' +
      'radial-gradient(95% 72% at 10% 6%, rgba(32,92,146,0.17) 0%, rgba(32,92,146,0) 66%),' +
      'radial-gradient(130% 96% at 46% 118%, rgba(10,12,30,0.5) 0%, rgba(10,12,30,0) 58%)',
    '--sky-horizon': '#0a0c1e',
    '--sky-horizon-a': '0.18',
    '--sky-star-a': '1',
    '--sun-a': '0',
    '--sun-x': '50%',
    '--sun-y': '130%',
    '--sun-size': '0px',
    '--sun-core': '#000000',
    '--sun-edge': '#000000',
    '--cloud-a': '0',
    '--cloud': '#000000',
    '--phase-tint': PHASE_TINT.night,
  };
}

export function skyVarsFor(phase: SkyPhase, progress: number): Vars {
  switch (phase) {
    case 'dawn':
      return dawn(progress);
    case 'day':
      return day(progress);
    case 'dusk':
      return dusk(progress);
    case 'aurora':
      return aurora(progress);
    case 'night':
    default:
      return night();
  }
}

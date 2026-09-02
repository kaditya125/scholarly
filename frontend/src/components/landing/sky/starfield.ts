/**
 * Seeded star fields, shared by every phase that shows stars — night at full strength,
 * dawn and dusk fading them in or out, aurora holding them behind the curtains.
 *
 * The fields are tiled CSS radial-gradients rather than one element per star: four DOM
 * nodes cover any viewport at any size, they paint once, and animating them touches only
 * opacity and transform. The seeds are fixed, so it is the same sky on every visit.
 */

/** Deterministic PRNG — a given field is identical on every render and every reload. */
export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mostly white, with the odd blue giant and warm dwarf so the field is not monochrome. */
export const STAR_TINTS = ['255,255,255', '255,255,255', '255,255,255', '198,216,255', '255,229,193'];

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

export const FIELDS = {
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

export const DEPTHS = ['dust', 'far', 'mid', 'near'] as const;

export interface Glint {
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
export function buildGlints(count: number, seed: number): Glint[] {
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

/**
 * The day, cut into the five moods the sky layer knows how to draw, plus the small amount
 * of interpolation maths the layers need to move smoothly through each one.
 *
 * Boundaries are plain local wall-clock hours, not real solar geometry. Actual sunrise and
 * sunset depend on latitude and the date, and getting them right would mean asking the
 * visitor for their location — a permission prompt is far too high a price for a background.
 * The times below are tuned for Indian latitudes, which is where this site's students are.
 */

export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'aurora' | 'night';

export interface PhaseWindow {
  phase: SkyPhase;
  /** Local wall-clock hour the phase opens at. */
  start: number;
  /**
   * Local wall-clock hour it closes at. `night` runs through midnight, so it is expressed
   * on a scale that continues past 24 — its end of 29 means 05:00 the next morning.
   */
  end: number;
  label: string;
  /** One line for the readout: what is actually happening up there. */
  note: string;
}

export const PHASES: readonly PhaseWindow[] = [
  { phase: 'dawn', start: 5, end: 8, label: 'Dawn', note: 'Sun climbing to the horizon' },
  { phase: 'day', start: 8, end: 16.5, label: 'Day', note: 'Sun high, colour washed out' },
  { phase: 'dusk', start: 16.5, end: 19, label: 'Dusk', note: 'Sun going down, sky reddening' },
  { phase: 'aurora', start: 19, end: 21, label: 'Aurora', note: 'Solar wind exciting the upper air' },
  { phase: 'night', start: 21, end: 29, label: 'Night', note: 'Full dark, stars out' },
] as const;

/** The hour the table starts at; anything earlier belongs to the previous day's night. */
const DAY_START = PHASES[0].start;

export const hoursOf = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

export interface SkyMoment {
  window: PhaseWindow;
  /** 0 at the opening of the window, 1 at its close. */
  progress: number;
  /** The phase that follows, and how many hours until it starts. */
  next: PhaseWindow;
  hoursToNext: number;
  /** Local hour as a float, 0–24. */
  hour: number;
}

export function momentAt(now: Date = new Date()): SkyMoment {
  const hour = hoursOf(now);
  // Before 05:00 we are still in the night that began yesterday, so shift onto the
  // continuous scale the table is written on: 02:30 becomes 26.5.
  const scaled = hour < DAY_START ? hour + 24 : hour;

  let i = PHASES.findIndex((w) => scaled >= w.start && scaled < w.end);
  if (i === -1) i = PHASES.length - 1;

  const window = PHASES[i];
  const span = window.end - window.start;
  const progress = clamp((scaled - window.start) / span, 0, 1);

  return {
    window,
    progress,
    next: PHASES[(i + 1) % PHASES.length],
    hoursToNext: Math.max(window.end - scaled, 0),
    hour,
  };
}

/** "2h 14m", or "14m" under the hour — for the readout's countdown to the next phase. */
export function formatGap(hours: number): string {
  const total = Math.max(Math.round(hours * 60), 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Wall-clock label for a boundary on the table's continuous scale (29 → "05:00"). */
export function formatBoundary(scaledHour: number): string {
  const h = Math.floor(scaledHour) % 24;
  const m = Math.round((scaledHour % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Interpolation ───────────────────────────────────────────────────────────

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Walk a list of keyframes with `t` in 0–1. Two stops is a straight lerp; three or more
 * lets a phase turn a corner partway through — the sun reddens *as* it falls rather than
 * fading evenly from one colour to the other.
 */
export function ramp(stops: readonly number[], t: number): number {
  if (stops.length === 1) return stops[0];
  const x = clamp(t, 0, 1) * (stops.length - 1);
  const i = Math.min(Math.floor(x), stops.length - 2);
  return lerp(stops[i], stops[i + 1], x - i);
}

type Rgb = [number, number, number];

const HEX = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

function toRgb(hex: string): Rgb {
  const m = HEX.exec(hex.trim());
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** Same keyframe walk as `ramp`, in colour. Returns an "r,g,b" triple for use in rgba(). */
export function rampColor(stops: readonly string[], t: number): string {
  if (stops.length === 1) return toRgb(stops[0]).join(',');
  const x = clamp(t, 0, 1) * (stops.length - 1);
  const i = Math.min(Math.floor(x), stops.length - 2);
  const f = x - i;
  const a = toRgb(stops[i]);
  const b = toRgb(stops[i + 1]);
  return a.map((c, k) => Math.round(lerp(c, b[k], f))).join(',');
}

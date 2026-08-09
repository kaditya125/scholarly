/**
 * Emotion + genre → music category, and the volume policy for beds.
 *
 * Deterministic. The Director never asks an LLM which music to use: the mapping
 * from mood to category is a stable creative rule, and making it data means it
 * is reviewable, testable and adjustable without a prompt change.
 */

import type { Emotion, MediaGenre } from '../schema/common.schema';
import type { MusicCategory, MusicTempo } from '../schema/audio.schema';

/**
 * Primary mapping. Educational genres bias toward unobtrusive categories even
 * for dramatic emotions — a study podcast should never sound like a thriller.
 */
const EMOTION_TO_CATEGORY: Record<Emotion, MusicCategory> = {
  neutral: 'educational',
  happy: 'inspirational',
  sad: 'sad',
  fear: 'mystery',
  excited: 'adventure',
  calm: 'calm_piano',
  hope: 'inspirational',
  angry: 'epic',
  curious: 'documentary',
  suspense: 'mystery',
  mystery: 'mystery',
  romantic: 'strings',
  heroic: 'epic',
  victory: 'victory',
  failure: 'sad',
  wonder: 'space',
  surprise: 'adventure',
};

/**
 * Genre overrides. An educational or meditation episode should stay calm
 * regardless of how dramatic a scene's emotion is — comprehension first.
 */
const GENRE_CEILING: Partial<Record<MediaGenre, MusicCategory[]>> = {
  educational: [
    'educational', 'documentary', 'calm_piano', 'inspirational',
    'ambient_synth', 'strings', 'science', 'nature',
  ],
  meditation: ['meditation', 'calm_piano', 'ambient_synth', 'nature'],
  news: ['documentary', 'educational'],
};

/**
 * Nearest tonal substitutes, in preference order.
 *
 * Without this, any out-of-palette category collapsed to the genre's first
 * option — so `wonder → space` became a flat `educational` bed even though
 * `ambient_synth` was available and allowed. The affinity chain preserves the
 * mood as far as the genre permits before giving up.
 */
const CATEGORY_AFFINITY: Partial<Record<MusicCategory, MusicCategory[]>> = {
  space: ['ambient_synth', 'science', 'documentary'],
  epic: ['strings', 'inspirational', 'documentary'],
  adventure: ['inspirational', 'documentary', 'educational'],
  mystery: ['ambient_synth', 'documentary'],
  horror: ['ambient_synth', 'documentary'],
  fantasy: ['strings', 'ambient_synth', 'documentary'],
  victory: ['inspirational', 'strings', 'educational'],
  sad: ['calm_piano', 'strings', 'ambient_synth'],
  meditation: ['calm_piano', 'ambient_synth', 'nature'],
  nature: ['ambient_synth', 'calm_piano'],
  historical: ['documentary', 'strings'],
  science: ['documentary', 'ambient_synth'],
  strings: ['calm_piano', 'inspirational'],
  calm_piano: ['ambient_synth', 'strings'],
  inspirational: ['educational', 'documentary'],
  ambient_synth: ['calm_piano', 'documentary'],
  documentary: ['educational'],
  educational: ['documentary'],
};

/**
 * Pick a category for a scene. When the genre constrains the palette, walk the
 * affinity chain to keep as much of the emotional colour as the genre allows,
 * and only then fall back to the genre's safest option.
 */
export function musicCategoryFor(
  emotion: Emotion,
  genre: MediaGenre
): MusicCategory {
  const fromEmotion = EMOTION_TO_CATEGORY[emotion] ?? 'educational';
  const allowed = GENRE_CEILING[genre];
  if (!allowed) return fromEmotion;
  if (allowed.includes(fromEmotion)) return fromEmotion;

  for (const substitute of CATEGORY_AFFINITY[fromEmotion] ?? []) {
    if (allowed.includes(substitute)) return substitute;
  }
  return allowed[0];
}

/** Intensity → tempo band, used to narrow asset selection. */
export function tempoForIntensity(intensity: number): MusicTempo {
  if (intensity < 0.25) return 'slow';
  if (intensity < 0.55) return 'moderate';
  if (intensity < 0.8) return 'upbeat';
  return 'driving';
}

/**
 * Bed volume policy — the STATIC level, before the mixer's dynamic ducking.
 *
 * This deliberately does NOT sit below the duck floor. It used to, and the result
 * was inaudible music: the filter graph applies `sidechaincompress` keyed to the
 * voice, so a bed pinned under the duck floor gets attenuated TWICE — once
 * statically here, then again whenever anyone speaks.
 *
 * Measured on a real 5-minute episode: beds landed at -13 dB, roughly -36 LUFS,
 * about 20 dB under the narration and inaudible in practice. The intro and outro
 * stings at -7.5 dB were the ONLY music listeners could hear — and those exceed
 * the duck floor, which is precisely why they were audible.
 *
 * The policy is therefore: pick a musical level here, and trust the sidechain
 * compressor to get out of the narrator's way. `duckFloorDb` still shapes the
 * result, but as a reference point rather than a hard ceiling.
 */

/**
 * Static bed level with no adjustments — present but subordinate.
 *
 * Sits deliberately BELOW the SFX layer (see SFXPlanner.SFX_PROMINENCE_DB). The
 * mix hierarchy under narration is:
 *
 *   voice            loudest
 *   sfx        -3 to -7 dB    brief events, meant to be noticed
 *   intro/outro     -6 dB     no voice competing with them
 *   bed            -10 dB     continuous, must not mask an effect
 *   ambience  -21 to -26 dB   atmosphere, barely conscious
 *
 * An earlier pass set the bed to -6, which made a one-second effect at -16.5 dB
 * inaudible underneath it.
 */
const BED_BASE_DB = -12;
/** Never louder than this: a bed at -6 masked the effects layer entirely. */
const BED_MAX_DB = -8;
/** Never quieter than this: below it the bed may as well not be rendered. */
const BED_MIN_DB = -22;

export function bedVolumeDb(opts: {
  intensity: number;
  /** Duck floor = voiceBusGainDb + duckingDb. Kept for reference and tests. */
  duckFloorDb: number;
  /** From the Producer's accessibility strategy. */
  reduceBackground: boolean;
  cinematicIntensity: 'subtle' | 'balanced' | 'dramatic';
}): number {
  let db = BED_BASE_DB;

  // Busier scenes let the bed come up slightly.
  db += opts.intensity * 2;

  switch (opts.cinematicIntensity) {
    case 'subtle':
      // Study material: keep music well back, clarity first.
      db -= 5;
      break;
    case 'dramatic':
      db += 1.5;
      break;
    default:
      break;
  }

  // Accessibility: narration dominant. Still audible, just further back.
  if (opts.reduceBackground) db -= 5;

  return round1(Math.max(BED_MIN_DB, Math.min(BED_MAX_DB, db)));
}

/** Intro/outro themes sit louder than a bed since no one is speaking over them. */
export function themeVolumeDb(bedDb: number): number {
  return round1(Math.min(-6, bedDb + 6));
}

/**
 * Crossfade length for a transition. Longer for musical resolutions, shorter
 * for cuts. Always > 0 for non-cut transitions so the "never stop abruptly"
 * invariant holds by construction.
 */
export function crossfadeMsFor(
  transition: 'cut' | 'crossfade' | 'resolve' | 'swell' | 'drop'
): number {
  switch (transition) {
    case 'cut':
      return 0;
    case 'resolve':
      return 3000;
    case 'swell':
      return 2500;
    case 'drop':
      return 1200;
    case 'crossfade':
    default:
      return 2000;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

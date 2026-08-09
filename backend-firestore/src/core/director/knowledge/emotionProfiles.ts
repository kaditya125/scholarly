/**
 * Emotion → delivery profile map.
 *
 * Deterministic, exhaustive over the closed `Emotion` union. A compile-time
 * `Record<Emotion, ...>` plus a runtime coverage test means adding an emotion to
 * the schema is an unavoidable obligation here — no emotion can silently fall
 * through to a default.
 *
 * Values are MULTIPLIERS and OFFSETS applied on top of a character's base voice
 * profile, never absolutes. Two characters expressing `excited` should still
 * sound like themselves.
 *
 * Calibration notes:
 *   - Rate multipliers stay within 0.9–1.12. Beyond that TTS starts to sound
 *     comical rather than emotional, and comprehension drops.
 *   - `elevenLabsStability` is INVERSELY related to expressiveness: low
 *     stability yields more variation, which suits excited/angry and ruins calm.
 *   - `musicIntensityBias` nudges the scene's music intensity so score and
 *     narration move together instead of fighting.
 */

import { ALL_EMOTIONS, type Emotion } from '../schema/common.schema';

export interface EmotionProfile {
  emotion: Emotion;
  /** × the character's baseSpeakingRate. */
  rateMultiplier: number;
  /** Semitones added to basePitch. */
  pitchOffset: number;
  /** dB added to the line's volume. */
  volumeOffsetDb: number;
  /** Silence appended after the line, in ms. */
  pauseAfterMs: number;
  /** ElevenLabs `style` — expressiveness, 0..1. */
  elevenLabsStyle: number;
  /** ElevenLabs `stability` — LOW means more variation, 0..1. */
  elevenLabsStability: number;
  /** −1..+1 nudge applied to scene music intensity. */
  musicIntensityBias: number;
}

/**
 * Exhaustive by construction: TypeScript errors if an emotion is missing.
 */
export const EMOTION_PROFILES: Record<Emotion, EmotionProfile> = {
  neutral: {
    emotion: 'neutral',
    rateMultiplier: 1,
    pitchOffset: 0,
    volumeOffsetDb: 0,
    pauseAfterMs: 250,
    elevenLabsStyle: 0.2,
    elevenLabsStability: 0.6,
    musicIntensityBias: 0,
  },
  happy: {
    emotion: 'happy',
    rateMultiplier: 1.05,
    pitchOffset: 1,
    volumeOffsetDb: 0.5,
    pauseAfterMs: 220,
    elevenLabsStyle: 0.5,
    elevenLabsStability: 0.45,
    musicIntensityBias: 0.2,
  },
  sad: {
    emotion: 'sad',
    rateMultiplier: 0.92,
    pitchOffset: -1.5,
    volumeOffsetDb: -1.5,
    pauseAfterMs: 550,
    elevenLabsStyle: 0.4,
    elevenLabsStability: 0.65,
    musicIntensityBias: -0.2,
  },
  fear: {
    emotion: 'fear',
    rateMultiplier: 1.06,
    pitchOffset: 1,
    volumeOffsetDb: -1,
    pauseAfterMs: 400,
    elevenLabsStyle: 0.6,
    elevenLabsStability: 0.35,
    musicIntensityBias: 0.3,
  },
  excited: {
    emotion: 'excited',
    rateMultiplier: 1.12,
    pitchOffset: 2,
    volumeOffsetDb: 1,
    pauseAfterMs: 180,
    elevenLabsStyle: 0.7,
    elevenLabsStability: 0.3,
    musicIntensityBias: 0.4,
  },
  calm: {
    emotion: 'calm',
    rateMultiplier: 0.95,
    pitchOffset: -0.5,
    volumeOffsetDb: -0.5,
    pauseAfterMs: 400,
    elevenLabsStyle: 0.15,
    elevenLabsStability: 0.75,
    musicIntensityBias: -0.25,
  },
  hope: {
    emotion: 'hope',
    rateMultiplier: 1,
    pitchOffset: 0.5,
    volumeOffsetDb: 0,
    pauseAfterMs: 300,
    elevenLabsStyle: 0.4,
    elevenLabsStability: 0.55,
    musicIntensityBias: 0.15,
  },
  angry: {
    emotion: 'angry',
    rateMultiplier: 1.08,
    pitchOffset: 0.5,
    volumeOffsetDb: 1.5,
    pauseAfterMs: 300,
    elevenLabsStyle: 0.75,
    elevenLabsStability: 0.3,
    musicIntensityBias: 0.35,
  },
  curious: {
    emotion: 'curious',
    rateMultiplier: 1.02,
    pitchOffset: 1,
    volumeOffsetDb: 0,
    pauseAfterMs: 350,
    elevenLabsStyle: 0.45,
    elevenLabsStability: 0.5,
    musicIntensityBias: 0.1,
  },
  suspense: {
    emotion: 'suspense',
    rateMultiplier: 0.94,
    pitchOffset: -0.5,
    volumeOffsetDb: -1,
    pauseAfterMs: 700,
    elevenLabsStyle: 0.55,
    elevenLabsStability: 0.5,
    musicIntensityBias: 0.35,
  },
  mystery: {
    emotion: 'mystery',
    rateMultiplier: 0.93,
    pitchOffset: -1,
    volumeOffsetDb: -1.5,
    pauseAfterMs: 650,
    elevenLabsStyle: 0.5,
    elevenLabsStability: 0.55,
    musicIntensityBias: 0.25,
  },
  romantic: {
    emotion: 'romantic',
    rateMultiplier: 0.94,
    pitchOffset: -0.5,
    volumeOffsetDb: -1,
    pauseAfterMs: 500,
    elevenLabsStyle: 0.5,
    elevenLabsStability: 0.6,
    musicIntensityBias: -0.1,
  },
  heroic: {
    emotion: 'heroic',
    rateMultiplier: 1.02,
    pitchOffset: 0,
    volumeOffsetDb: 1.5,
    pauseAfterMs: 350,
    elevenLabsStyle: 0.6,
    elevenLabsStability: 0.45,
    musicIntensityBias: 0.5,
  },
  victory: {
    emotion: 'victory',
    rateMultiplier: 1.06,
    pitchOffset: 1.5,
    volumeOffsetDb: 1.5,
    pauseAfterMs: 300,
    elevenLabsStyle: 0.7,
    elevenLabsStability: 0.35,
    musicIntensityBias: 0.55,
  },
  failure: {
    emotion: 'failure',
    rateMultiplier: 0.9,
    pitchOffset: -2,
    volumeOffsetDb: -2,
    pauseAfterMs: 600,
    elevenLabsStyle: 0.45,
    elevenLabsStability: 0.65,
    musicIntensityBias: -0.3,
  },
  wonder: {
    emotion: 'wonder',
    rateMultiplier: 0.97,
    pitchOffset: 1,
    volumeOffsetDb: 0,
    pauseAfterMs: 500,
    elevenLabsStyle: 0.55,
    elevenLabsStability: 0.45,
    musicIntensityBias: 0.3,
  },
  surprise: {
    emotion: 'surprise',
    rateMultiplier: 1.1,
    pitchOffset: 2.5,
    volumeOffsetDb: 1,
    pauseAfterMs: 450,
    elevenLabsStyle: 0.7,
    elevenLabsStability: 0.3,
    musicIntensityBias: 0.25,
  },
};

/** Never throws — unknown input degrades to neutral. */
export function emotionProfile(emotion: Emotion): EmotionProfile {
  return EMOTION_PROFILES[emotion] ?? EMOTION_PROFILES.neutral;
}

/**
 * Emotions appropriate to a speaker role. Prevents a Student character
 * delivering a `heroic` line, and keeps educational roles from melodrama.
 * Falls back to a broad-but-safe set for unrecognised roles.
 */
const ROLE_EMOTIONS: Record<string, Emotion[]> = {
  teacher: ['neutral', 'calm', 'happy', 'curious', 'hope', 'wonder'],
  'ai tutor': ['neutral', 'calm', 'happy', 'curious', 'hope'],
  student: ['neutral', 'curious', 'happy', 'surprise', 'wonder', 'excited'],
  narrator: [
    'neutral', 'calm', 'curious', 'suspense', 'mystery',
    'wonder', 'heroic', 'hope', 'sad',
  ],
  host: ['neutral', 'happy', 'curious', 'excited', 'hope'],
  'subject expert': ['neutral', 'calm', 'curious', 'wonder'],
  mentor: ['neutral', 'calm', 'hope', 'happy', 'curious'],
  'exam coach': ['neutral', 'excited', 'hope', 'heroic', 'victory'],
  examiner: ['neutral', 'calm'],
  child: ['neutral', 'happy', 'curious', 'surprise', 'excited', 'wonder'],
  villain: ['neutral', 'angry', 'mystery', 'suspense'],
  king: ['neutral', 'heroic', 'angry', 'calm'],
  doctor: ['neutral', 'calm', 'hope'],
  scientist: ['neutral', 'curious', 'wonder', 'calm'],
  robot: ['neutral', 'calm'],
  guide: ['neutral', 'calm', 'curious', 'wonder', 'hope'],
};

/** Broad default: expressive enough to be interesting, never melodramatic. */
const DEFAULT_ALLOWED: Emotion[] = [
  'neutral', 'calm', 'happy', 'curious', 'hope', 'wonder', 'excited',
];

export function allowedEmotionsForRole(role: string): Emotion[] {
  const key = (role || '').trim().toLowerCase();
  return ROLE_EMOTIONS[key] ?? DEFAULT_ALLOWED;
}

/**
 * Clamp an emotion into a character's permitted range. Returns the nearest
 * safe emotion rather than throwing, so a planner overreach degrades quietly.
 */
export function clampEmotion(emotion: Emotion, allowed: Emotion[]): Emotion {
  if (allowed.includes(emotion)) return emotion;
  if (allowed.includes('neutral')) return 'neutral';
  return allowed[0] ?? 'neutral';
}

/** Runtime guard used by tests to prove exhaustiveness. */
export function assertEmotionCoverage(): { covered: number; missing: Emotion[] } {
  const missing = ALL_EMOTIONS.filter((e) => !EMOTION_PROFILES[e]);
  return { covered: ALL_EMOTIONS.length - missing.length, missing };
}

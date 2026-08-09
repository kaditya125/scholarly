/**
 * EmotionPlanner — builds the GLOBAL emotion curve, then derives per-line
 * delivery from it.
 *
 * This is the requirement that emotions must not be classified sentence by
 * sentence in isolation. The curve is authored first, at episode scale; each
 * line then takes a LOCAL DEVIATION from the curve, clamped to what its
 * character is allowed to express.
 *
 * Fully deterministic — the arc shape and scene moods come from the
 * NarrativeAnalyzer, and everything here is interpolation plus lookup.
 */

import type { IPlanner } from '../interfaces';
import {
  EmotionCurveSchema,
  type DeliveryDirection,
  type EmotionArcType,
  type EmotionCurve,
} from '../schema/audio.schema';
import type { Emotion } from '../schema/common.schema';
import type { Scene } from '../schema/scene.schema';
import type { Character } from '../schema/character.schema';
import {
  clampEmotion,
  emotionProfile,
} from '../knowledge/emotionProfiles';

export interface EmotionPlannerInput {
  scenes: Scene[];
  arcType: EmotionArcType;
  /** Cap from the Producer's accessibility strategy. */
  maxSpeakingRate?: number;
  cinematicIntensity: 'subtle' | 'balanced' | 'dramatic';
}

export class EmotionPlanner implements IPlanner<EmotionPlannerInput, EmotionCurve> {
  readonly name = 'EmotionPlanner';

  async plan(input: EmotionPlannerInput): Promise<EmotionCurve> {
    return this.fallback(input);
  }

  /** Pure — no LLM, so plan and fallback are identical. */
  fallback(input: EmotionPlannerInput): EmotionCurve {
    const scenes = input.scenes;
    if (scenes.length === 0) {
      return EmotionCurveSchema.parse({
        keyframes: [
          { atProgress: 0, emotion: 'neutral', intensity: 0.4, sceneId: 'scene_0' },
        ],
        arcType: 'steady',
      });
    }

    // One keyframe per scene boundary, positioned by cumulative estimated
    // duration so the curve tracks real listening time rather than scene count.
    const totalMs = scenes.reduce((sum, s) => sum + s.estimatedDurationMs, 0) || 1;
    let elapsed = 0;

    const keyframes = scenes.map((scene) => {
      const atProgress = round2(elapsed / totalMs);
      elapsed += scene.estimatedDurationMs;
      return {
        atProgress,
        emotion: scene.dominantEmotion,
        intensity: intensityFor(scene, input.cinematicIntensity),
        sceneId: scene.id,
      };
    });

    // Anchor the end so interpolation covers the full 0..1 range.
    const last = scenes[scenes.length - 1];
    if (keyframes[keyframes.length - 1].atProgress < 1) {
      keyframes.push({
        atProgress: 1,
        emotion: last.dominantEmotion,
        intensity: intensityFor(last, input.cinematicIntensity),
        sceneId: last.id,
      });
    }

    return EmotionCurveSchema.parse({ keyframes, arcType: input.arcType });
  }

  /**
   * Per-line delivery, derived from the curve and the character's baseline.
   *
   * Returns ABSOLUTE values so the synthesizer needs no further arithmetic —
   * and records `prosodyUnsupported` when the bound voice rejects pitch/rate,
   * which Chirp 3 HD and Journey do.
   */
  deliveryFor(args: {
    scene: Scene;
    character: Character;
    curve: EmotionCurve;
    /** 0..1 position of this line through the episode. */
    progress: number;
    /** True for the first line of a scene — slightly more expressive. */
    isSceneOpener: boolean;
    maxSpeakingRate?: number;
    cinematicIntensity: 'subtle' | 'balanced' | 'dramatic';
  }): DeliveryDirection {
    const { scene, character, curve, progress } = args;

    // Local deviation: the scene's mood, clamped to the character's range.
    const target = clampEmotion(scene.dominantEmotion, character.allowedEmotions);
    const profile = emotionProfile(target);

    // Curve intensity at this point, blended with the scene's own energy.
    const curveIntensity = interpolateIntensity(curve, progress);
    const intensity = clamp01(curveIntensity * 0.6 + scene.energyLevel * 0.4);

    // Scale expression by cinematic intensity — 'subtle' keeps delivery close
    // to the character's baseline, which suits study material.
    const expressionScale = expressionScaleFor(args.cinematicIntensity) * intensity;

    const rate =
      character.voice.baseSpeakingRate *
      (1 + (profile.rateMultiplier - 1) * expressionScale);

    const capped =
      typeof args.maxSpeakingRate === 'number'
        ? Math.min(rate, args.maxSpeakingRate)
        : rate;

    return {
      emotion: target,
      intensity: round2(intensity),
      speakingRate: round2(clampRange(capped, 0.5, 2)),
      pitch: round2(
        clampRange(character.voice.basePitch + profile.pitchOffset * expressionScale, -6, 6)
      ),
      volumeDb: round2(clampRange(profile.volumeOffsetDb * expressionScale, -60, 12)),
      whisper: false,
      // A breath before a scene opener reads as a natural gear change.
      breathBefore: args.isSceneOpener,
      prosodyUnsupported: !character.voice.supportsProsody,
    };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Interpolate curve intensity at an arbitrary progress point. Linear between
 * the surrounding keyframes; clamps at both ends.
 */
export function interpolateIntensity(curve: EmotionCurve, progress: number): number {
  const kf = curve.keyframes;
  if (kf.length === 0) return 0.5;
  if (kf.length === 1) return kf[0].intensity;

  const p = clamp01(progress);
  if (p <= kf[0].atProgress) return kf[0].intensity;
  if (p >= kf[kf.length - 1].atProgress) return kf[kf.length - 1].intensity;

  for (let i = 1; i < kf.length; i++) {
    const prev = kf[i - 1];
    const next = kf[i];
    if (p <= next.atProgress) {
      const span = next.atProgress - prev.atProgress;
      if (span <= 0) return next.intensity;
      const t = (p - prev.atProgress) / span;
      return round2(prev.intensity + (next.intensity - prev.intensity) * t);
    }
  }
  return kf[kf.length - 1].intensity;
}

/** Emotion at a progress point — the nearest preceding keyframe. */
export function emotionAt(curve: EmotionCurve, progress: number): Emotion {
  const p = clamp01(progress);
  let current: Emotion = curve.keyframes[0]?.emotion ?? 'neutral';
  for (const kf of curve.keyframes) {
    if (kf.atProgress > p) break;
    current = kf.emotion;
  }
  return current;
}

/**
 * Scene intensity from energy and tension, scaled by the global cinematic
 * setting so a 'subtle' episode never swings hard.
 */
export function intensityFor(
  scene: Scene,
  cinematicIntensity: 'subtle' | 'balanced' | 'dramatic'
): number {
  const base = scene.energyLevel * 0.6 + scene.tensionLevel * 0.4;
  const scaled = base * expressionScaleFor(cinematicIntensity);
  // Floor keeps the curve from flatlining to zero, which reads as lifeless.
  return round2(clamp01(Math.max(0.15, scaled)));
}

export function expressionScaleFor(
  cinematicIntensity: 'subtle' | 'balanced' | 'dramatic'
): number {
  switch (cinematicIntensity) {
    case 'subtle':
      return 0.5;
    case 'dramatic':
      return 1;
    case 'balanced':
    default:
      return 0.75;
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clampRange(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const emotionPlanner = new EmotionPlanner();

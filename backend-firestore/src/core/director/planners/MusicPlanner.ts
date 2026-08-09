/**
 * MusicPlanner — plans the score as an EVOLVING soundtrack, not per-scene tracks.
 *
 * The key behaviour: when consecutive scenes map to the same category, the same
 * asset CONTINUES and only its intensity is automated. A new asset is introduced
 * only on a genuine category change, and always with a crossfade. That is what
 * makes a score feel composed rather than stitched.
 *
 * Two invariants are satisfied by construction here, so the validator's warnings
 * should never fire in practice:
 *   - every non-final bed has `crossfadeToNextMs > 0`  (no hard stops)
 *   - every bed sits below the duck floor              (narration stays clear)
 */

import type { IPlanner } from '../interfaces';
import {
  type MusicEvent,
  type MusicRole,
} from '../schema/audio.schema';
import type { Emotion, MediaGenre } from '../schema/common.schema';
import {
  AssetRequirementSchema,
  type AssetRequirement,
} from '../schema/requirement.schema';
import type { Scene } from '../schema/scene.schema';
import type { AssetManifest } from '../../../services/media/assets/AssetManifest';
import {
  bedVolumeDb,
  crossfadeMsFor,
  musicCategoryFor,
  tempoForIntensity,
  themeVolumeDb,
} from '../knowledge/musicMap';
import { emotionProfile } from '../knowledge/emotionProfiles';

export interface MusicPlannerInput {
  scenes: Scene[];
  genre: MediaGenre;
  manifest: AssetManifest;
  /** voiceBusGainDb + duckingDb from the mastering spec. */
  duckFloorDb: number;
  reduceBackground?: boolean;
  cinematicIntensity: 'subtle' | 'balanced' | 'dramatic';
  /** Total estimated episode duration, for intro/outro placement. */
  totalEstimatedMs: number;
}

const INTRO_MS = 6000;
const OUTRO_MS = 8000;

export class MusicPlanner implements IPlanner<MusicPlannerInput, MusicEvent[]> {
  readonly name = 'MusicPlanner';

  async plan(input: MusicPlannerInput): Promise<MusicEvent[]> {
    return this.fallback(input);
  }

  fallback(input: MusicPlannerInput): MusicEvent[] {
    if (input.scenes.length === 0) return [];

    // NOTE: deliberately NOT gated on catalogue contents. The Director states
    // what the score NEEDS; the AssetResolver decides how to obtain it. Gating
    // here would mean an empty catalogue produces no requirements, so a
    // generate-on-demand provider would never be asked for anything.
    const events: MusicEvent[] = [];
    let cursorMs = 0;

    // ── Intro theme ───────────────────────────────────────────────────────
    const introCategory = musicCategoryFor(input.scenes[0].dominantEmotion, input.genre);
    {
      const bedDb = bedVolumeDb({
        intensity: 0.5,
        duckFloorDb: input.duckFloorDb,
        reduceBackground: !!input.reduceBackground,
        cinematicIntensity: input.cinematicIntensity,
      });
      events.push({
        id: 'music_intro',
        kind: 'music',
        startMs: 0,
        durationMs: INTRO_MS,
        sceneId: input.scenes[0].id,
        priority: 25,
        requirement: musicRequirement({
          category: introCategory,
          emotion: input.scenes[0].dominantEmotion,
          genre: input.genre,
          intensity: 0.5,
          durationMs: INTRO_MS,
          role: 'intro',
        }),
        // Hint only — absent when the catalogue has nothing yet.
        ...maybeAssetId(this.selectAsset(input, introCategory, 0.5)),
        category: introCategory,
        role: 'intro',
        intensity: 0.5,
        tempo: tempoForIntensity(0.5),
        // Louder than a bed: nobody is speaking over an intro.
        volumeDb: themeVolumeDb(bedDb),
        loopStrategy: 'none',
        fadeInMs: 1200,
        fadeOutMs: 2500,
        crossfadeToNextMs: 2500,
        transitionType: 'crossfade',
      });
      cursorMs = INTRO_MS;
    }

    // ── Scene beds, with continuity ────────────────────────────────────────
    interface Run {
      category: ReturnType<typeof musicCategoryFor>;
      assetId: string | null;
      startMs: number;
      endMs: number;
      sceneId: string;
      intensity: number;
      emotion: Scene['dominantEmotion'];
    }
    const runs: Run[] = [];

    for (const scene of input.scenes) {
      const profile = emotionProfile(scene.dominantEmotion);
      const intensity = clamp01(
        scene.tensionLevel * 0.5 + scene.energyLevel * 0.3 + profile.musicIntensityBias * 0.4
      );
      const category = musicCategoryFor(scene.dominantEmotion, input.genre);
      const sceneStart = cursorMs;
      const sceneEnd = cursorMs + scene.estimatedDurationMs;
      cursorMs = sceneEnd;

      const previous = runs[runs.length - 1];
      if (previous && previous.category === category) {
        // CONTINUE the same bed — extend the run and take the higher intensity
        // so a rising sequence is reflected without restarting the track.
        previous.endMs = sceneEnd;
        previous.intensity = Math.max(previous.intensity, intensity);
        continue;
      }

      // A run is created regardless of catalogue availability — the resolver
      // fills it later. `assetId` is only a hint.
      runs.push({
        category,
        assetId: this.selectAsset(input, category, intensity),
        startMs: sceneStart,
        endMs: sceneEnd,
        sceneId: scene.id,
        intensity,
        emotion: scene.dominantEmotion,
      });
    }

    runs.forEach((run, i) => {
      const isFinalRun = i === runs.length - 1;
      const transitionType = isFinalRun ? 'resolve' : 'crossfade';
      // Non-final beds MUST overlap the next one — the no-hard-stop invariant.
      const crossfade = isFinalRun ? 0 : crossfadeMsFor('crossfade');
      const bedDurationMs = Math.max(1000, run.endMs - run.startMs);

      events.push({
        id: `music_bed_${i}`,
        kind: 'music',
        startMs: run.startMs,
        durationMs: bedDurationMs,
        sceneId: run.sceneId,
        priority: 20,
        requirement: musicRequirement({
          category: run.category,
          emotion: run.emotion,
          genre: input.genre,
          intensity: run.intensity,
          durationMs: bedDurationMs,
          role: 'bed',
        }),
        ...maybeAssetId(run.assetId),
        category: run.category,
        role: 'bed',
        intensity: round2(run.intensity),
        tempo: tempoForIntensity(run.intensity),
        volumeDb: bedVolumeDb({
          intensity: run.intensity,
          duckFloorDb: input.duckFloorDb,
          reduceBackground: !!input.reduceBackground,
          cinematicIntensity: input.cinematicIntensity,
        }),
        loopStrategy: 'seamless',
        fadeInMs: i === 0 ? 2000 : 1500,
        fadeOutMs: 1500,
        crossfadeToNextMs: crossfade,
        transitionType,
      });
    });

    // ── Outro theme ───────────────────────────────────────────────────────
    const lastScene = input.scenes[input.scenes.length - 1];
    const outroCategory = musicCategoryFor(lastScene.dominantEmotion, input.genre);
    {
      const bedDb = bedVolumeDb({
        intensity: 0.4,
        duckFloorDb: input.duckFloorDb,
        reduceBackground: !!input.reduceBackground,
        cinematicIntensity: input.cinematicIntensity,
      });
      const startMs = Math.max(0, cursorMs);
      events.push({
        id: 'music_outro',
        kind: 'music',
        startMs,
        durationMs: OUTRO_MS,
        sceneId: lastScene.id,
        priority: 25,
        requirement: musicRequirement({
          category: outroCategory,
          emotion: lastScene.dominantEmotion,
          genre: input.genre,
          intensity: 0.4,
          durationMs: OUTRO_MS,
          role: 'outro',
        }),
        ...maybeAssetId(this.selectAsset(input, outroCategory, 0.4)),
        category: outroCategory,
        role: 'outro',
        intensity: 0.4,
        tempo: tempoForIntensity(0.4),
        volumeDb: themeVolumeDb(bedDb),
        loopStrategy: 'none',
        fadeInMs: 2000,
        fadeOutMs: 4000,
        // Final event — 0 is permitted.
        crossfadeToNextMs: 0,
        transitionType: 'resolve',
      });
    }

    // Fix up crossfades: whichever event is genuinely last must be the only one
    // allowed a 0 crossfade. Adding the outro changes who that is.
    return sealCrossfades(events);
  }

  /**
   * Choose an asset for a category, preferring the closest intensity. Falls back
   * to any educational/documentary bed, then to any music at all, so a sparse
   * catalogue still yields a score.
   */
  private selectAsset(
    input: MusicPlannerInput,
    category: string,
    intensity: number
  ): string | null {
    const exact = input.manifest.findMusic({
      category,
      intensity,
      loopableOnly: false,
    });
    if (exact.length > 0) return exact[0].id;

    for (const fallbackCategory of ['educational', 'documentary', 'calm_piano']) {
      const found = input.manifest.findMusic({ category: fallbackCategory, intensity });
      if (found.length > 0) return found[0].id;
    }

    const any = input.manifest.list('music');
    return any.length > 0 ? any[0].id : null;
  }
}

// ---------------------------------------------------------------------------
// Requirement construction (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Stylistic register per media genre, passed to the resolver as `genre`.
 *
 * Separate from MusicCategory: category says WHAT instrumentation ('strings'),
 * register says in WHAT tradition ('cinematic_documentary'). A provider can use
 * either or neither.
 */
const GENRE_REGISTER: Record<string, string> = {
  documentary: 'cinematic_documentary',
  educational: 'educational_underscore',
  storytelling: 'narrative_score',
  interview: 'neutral_editorial',
  debate: 'neutral_editorial',
  news: 'neutral_editorial',
  drama: 'dramatic_score',
  comedy: 'light_playful',
};

export function genreRegister(genre: MediaGenre | string): string {
  return GENRE_REGISTER[String(genre).toLowerCase()] ?? 'educational_underscore';
}

/**
 * Build the semantic requirement for a music cue.
 *
 * Beds are loopable, themes are not: a bed must tile to cover a whole scene,
 * whereas an intro/outro plays once and resolves. That distinction matters
 * because the generative provider is capped at ~32s per clip, so a non-loopable
 * bed would be unsatisfiable.
 */
export function musicRequirement(params: {
  category: string;
  emotion: Emotion;
  genre: MediaGenre | string;
  intensity: number;
  durationMs: number;
  role: MusicRole;
}): AssetRequirement {
  const loopable = params.role === 'bed';
  return AssetRequirementSchema.parse({
    kind: 'music',
    category: params.category,
    emotion: params.emotion,
    genre: genreRegister(params.genre),
    intensity: round2(clamp01(params.intensity)),
    tempo: tempoForIntensity(params.intensity),
    durationMs: Math.max(1000, Math.round(params.durationMs)),
    loopable,
    tags: [params.role],
    description:
      `${params.role} music for a ${params.emotion} passage, ` +
      `${params.category} character`,
  });
}

/**
 * Spread helper: include `assetId` only when we actually have one, so the field
 * stays genuinely absent rather than explicitly undefined (Firestore rejects
 * undefined values).
 */
export function maybeAssetId(assetId: string | null): { assetId?: string } {
  return assetId ? { assetId } : {};
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Guarantee exactly one event carries a 0 crossfade: the last one by start time.
 * Every earlier event gets a positive crossfade, which is what the
 * MUSIC_NO_HARD_STOP invariant checks.
 */
export function sealCrossfades(events: MusicEvent[]): MusicEvent[] {
  if (events.length === 0) return events;

  const ordered = [...events].sort((a, b) => a.startMs - b.startMs);
  return ordered.map((e, i) => {
    const isLast = i === ordered.length - 1;
    if (isLast) return { ...e, crossfadeToNextMs: 0 };
    return {
      ...e,
      crossfadeToNextMs: e.crossfadeToNextMs > 0 ? e.crossfadeToNextMs : 2000,
    };
  });
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const musicPlanner = new MusicPlanner();

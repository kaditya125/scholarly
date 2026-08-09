/**
 * ScenePlanner — turns scene skeletons into full Scene objects.
 *
 * Deterministic. The semantic work (where scenes begin and end, what the setting
 * is) was done by the NarrativeAnalyzer; this planner adds transitions, timing
 * estimates and visual metadata from the knowledge maps.
 *
 * Timing here is PASS 1: word-count estimates that tell the renderers what to
 * fetch. `TimelineBuilder.resolve()` replaces them with measured TTS durations.
 */

import type { IPlanner } from '../interfaces';
import {
  SceneSchema,
  type LocationId,
  type Scene,
  type SceneTransition,
} from '../schema/scene.schema';
import type { CinematicIntensity, MediaGenre } from '../schema/common.schema';
import {
  AssetRequirementSchema,
  type AssetRequirement,
} from '../schema/requirement.schema';
import {
  buildAnimationPrompt,
  buildImagePrompt,
  buildVideoPrompt,
  cameraFor,
  lightingFor,
  paletteFor,
  transitionFor,
  visualStyleFor,
} from '../knowledge/visualStyles';
import { EDUCATIONAL_LOCATIONS } from '../knowledge/ambienceMap';
import { logger } from '../../../utils/logger';
import type { SceneSkeleton, ScriptLineLike } from './NarrativeAnalyzer';

/**
 * Semantic need for a scene-transition stinger.
 *
 * A short, non-loopable accent. Intensity tracks the cinematic dial, so a
 * 'dramatic' episode gets a punchier transition than a 'balanced' one without
 * the planner having to know anything about assets.
 */
export function stingerRequirement(
  durationMs: number,
  intensity: CinematicIntensity
): AssetRequirement {
  return AssetRequirementSchema.parse({
    kind: 'stinger',
    category: 'transition',
    intensity: intensity === 'dramatic' ? 0.8 : 0.55,
    durationMs: Math.max(300, durationMs),
    loopable: false,
    tags: ['transition', 'accent'],
    description: 'short musical accent marking a scene change',
  });
}

/**
 * Speaking rate for pass-1 estimates.
 *
 * Devanagari scripts pack more content per word, so a flat words-per-second
 * figure over-estimates Hindi/Sanskrit duration badly. These values are
 * deliberately conservative — under-estimating a scene is harmless because
 * pass 2 corrects it, whereas a wild over-estimate distorts music planning.
 */
const WORDS_PER_SEC_BY_LANGUAGE: Record<string, number> = {
  english: 2.5,
  hindi: 2.1,
  hinglish: 2.2,
  sanskrit: 1.9,
};

export interface ScenePlannerInput {
  skeletons: SceneSkeleton[];
  lines: ScriptLineLike[];
  language: string;
  genre: MediaGenre;
  topic: string;
  /** From the Producer: suppress atmospheric settings when true. */
  reduceBackground?: boolean;
  cinematicIntensity: 'subtle' | 'balanced' | 'dramatic';
}

export class ScenePlanner implements IPlanner<ScenePlannerInput, Scene[]> {
  readonly name = 'ScenePlanner';

  async plan(input: ScenePlannerInput): Promise<Scene[]> {
    return this.fallback(input);
  }

  /**
   * Pure and synchronous — there is no LLM here, so `plan()` and `fallback()`
   * are the same computation. Kept on the IPlanner shape for uniformity.
   */
  fallback(input: ScenePlannerInput): Scene[] {
    const wps = wordsPerSecond(input.language);
    const total = input.skeletons.length;

    return input.skeletons.map((sk, index) => {
      const location = this.resolveLocation(sk.location, input);
      const durationMs = estimateSceneDurationMs(sk, input.lines, wps);
      const camera = cameraFor(index, total, sk.dominantEmotion);

      const setting = {
        location,
        locationDescription: sk.locationDescription || '',
        timeOfDay: sk.timeOfDay,
        environment: environmentFor(location),
        ...(sk.locationDescription && /rain|storm|snow|fog|wind/i.test(sk.locationDescription)
          ? { weather: detectWeather(sk.locationDescription) }
          : {}),
      };

      const visualArgs = {
        setting,
        emotion: sk.dominantEmotion,
        genre: input.genre,
        sceneTitle: sk.title,
        topic: input.topic,
      };

      return SceneSchema.parse({
        id: `scene_${index}`,
        index,
        title: sk.title,
        chapterIndex: sk.chapterIndex,
        lineRange: { startLine: sk.startLine, endLine: sk.endLine },
        setting,
        dominantEmotion: sk.dominantEmotion,
        energyLevel: sk.energyLevel,
        tensionLevel: sk.tensionLevel,
        estimatedDurationMs: durationMs,
        startMs: 0,
        endMs: 0,
        transitionIn: this.transitionIn(index, input),
        transitionOut: this.transitionOut(index, total, input),
        visual: {
          imagePrompt: buildImagePrompt(visualArgs),
          videoPrompt: buildVideoPrompt({ ...visualArgs, movement: camera.movement }),
          animationPrompt: buildAnimationPrompt({
            sceneTitle: sk.title,
            topic: input.topic,
            emotion: sk.dominantEmotion,
          }),
          cameraAngle: camera.angle,
          cameraMovement: camera.movement,
          focalLength: camera.angle === 'close_up' ? '85mm' : '35mm',
          depthOfField: camera.angle === 'close_up' ? 'shallow' : 'medium',
          lighting: lightingFor(setting, sk.dominantEmotion),
          visualStyle: visualStyleFor(input.genre),
          colorPalette: paletteFor(sk.dominantEmotion),
          transitionType: transitionFor(sk.dominantEmotion, index === 0),
          aspectRatioHint: '16:9',
        },
      });
    });
  }

  /**
   * The scene keeps the location the NarrativeAnalyzer identified.
   *
   * This used to rewrite any non-educational location to 'neutral' whenever the
   * Producer asked to reduce background. Because 'neutral' has a deliberately
   * EMPTY ambience stack, that silently destroyed the sense of place for a whole
   * episode — a Titanic story was classified 'neutral · abstract' even though the
   * analyzer had correctly identified the ocean, and no ambience could ever be
   * planned as a result.
   *
   * Accessibility is now handled where it belongs, as a LEVEL decision rather
   * than a semantic one: AmbiencePlanner drops to a single base layer and trims
   * an extra 6dB under the duck floor when reduceBackground is set. The listener
   * still gets a quiet, unobtrusive bed instead of a mislabelled scene.
   */
  private resolveLocation(
    requested: LocationId,
    input: ScenePlannerInput
  ): LocationId {
    if (input.reduceBackground && !EDUCATIONAL_LOCATIONS.has(requested)) {
      logger.debug('[ScenePlanner] Keeping atmospheric location, attenuating instead', {
        location: requested,
      });
    }
    return requested;
  }

  private transitionIn(index: number, input: ScenePlannerInput): SceneTransition {
    if (index === 0) {
      return { style: 'fade_through_silence', durationMs: 800 };
    }
    const style = input.cinematicIntensity === 'subtle' ? 'crossfade' : 'stinger';
    const durationMs = input.cinematicIntensity === 'dramatic' ? 1200 : 1500;

    // No asset is chosen here — the Director never picks assets. Instead the
    // transition states WHAT it needs and the AssetResolver obtains it. Before
    // this existed, an assetless stinger was silently downgraded to a crossfade,
    // so the dramatic transition the planner asked for never actually happened.
    if (style !== 'stinger') return { style, durationMs };

    return {
      style,
      durationMs,
      stingerRequirement: stingerRequirement(durationMs, input.cinematicIntensity),
    };
  }

  private transitionOut(
    index: number,
    total: number,
    input: ScenePlannerInput
  ): SceneTransition {
    const isLast = index === total - 1;
    if (isLast) return { style: 'fade_through_silence', durationMs: 2000 };
    return {
      style: 'crossfade',
      durationMs: input.cinematicIntensity === 'subtle' ? 1800 : 1500,
    };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

export function wordsPerSecond(language: string): number {
  return WORDS_PER_SEC_BY_LANGUAGE[(language || '').toLowerCase()] ?? 2.5;
}

/** Pass-1 duration estimate from the scene's own lines. */
export function estimateSceneDurationMs(
  skeleton: SceneSkeleton,
  lines: ScriptLineLike[],
  wordsPerSec: number
): number {
  let words = 0;
  for (let i = skeleton.startLine; i <= skeleton.endLine && i < lines.length; i++) {
    words += countWords(lines[i]?.text || '');
  }
  // Floor at 1s so an empty scene still occupies the timeline.
  return Math.max(1000, Math.round((words / wordsPerSec) * 1000));
}

/**
 * Word count that works for Devanagari as well as Latin script. Splitting on
 * whitespace is correct for both; the per-language rate handles density.
 */
export function countWords(text: string): number {
  return (text || '').split(/\s+/).filter(Boolean).length;
}

export function environmentFor(
  location: LocationId
): 'indoor' | 'outdoor' | 'abstract' | 'space' {
  if (location === 'space') return 'space';
  if (location === 'neutral' || location === 'abstract') return 'abstract';

  const outdoor: LocationId[] = [
    'forest', 'river', 'ocean', 'mountain', 'desert', 'garden',
    'marketplace', 'village', 'city_street', 'battlefield',
    'ancient_rome', 'ancient_egypt', 'medieval_town', 'underwater',
  ];
  return outdoor.includes(location) ? 'outdoor' : 'indoor';
}

function detectWeather(
  description: string
): 'clear' | 'rain' | 'storm' | 'snow' | 'fog' | 'wind' | undefined {
  const d = description.toLowerCase();
  if (/storm|thunder/.test(d)) return 'storm';
  if (/rain/.test(d)) return 'rain';
  if (/snow/.test(d)) return 'snow';
  if (/fog|mist/.test(d)) return 'fog';
  if (/wind/.test(d)) return 'wind';
  return undefined;
}

export const scenePlanner = new ScenePlanner();

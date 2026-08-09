/**
 * Scene schema.
 *
 * A scene is a narrative unit with a consistent setting and mood. It maps back
 * to the existing `PodcastPlan.segments` via `chapterIndex`, which is what
 * keeps chapter markers and the transcript panel working unchanged.
 *
 * Scenes do NOT own their audio. Audio lives on tracks with absolute
 * timestamps and a `sceneId` back-reference, so a music bed can legally
 * crossfade across a scene boundary (AI_DIRECTOR_ARCHITECTURE.md §6.1).
 */

import { z } from 'zod';
import { EmotionSchema, UnitScalarSchema } from './common.schema';
import { AssetRequirementSchema } from './requirement.schema';
import { SceneVisualMetadataSchema } from './visual.schema';

// ---------------------------------------------------------------------------
// Setting
// ---------------------------------------------------------------------------

/**
 * Closed location vocabulary. Closed on purpose: `ambienceMap.ts` (Phase G)
 * must define a layer stack for every member, so a planner cannot invent a
 * location with no ambience behind it.
 */
export const LocationIdSchema = z.enum([
  // Neutral / abstract
  'neutral',
  'abstract',
  // Education
  'classroom',
  'library',
  'laboratory',
  'lecture_hall',
  'study_room',
  // Nature
  'forest',
  'river',
  'ocean',
  'mountain',
  'desert',
  'garden',
  // Built environment
  'marketplace',
  'temple',
  'castle',
  'village',
  'city_street',
  'office',
  'hospital',
  'cafe',
  'train_station',
  'airport',
  // Dramatic
  'battlefield',
  'space',
  'underwater',
  'cave',
  // Historical
  'ancient_rome',
  'ancient_egypt',
  'medieval_town',
  'industrial_era',
]);
export type LocationId = z.infer<typeof LocationIdSchema>;

export const TimeOfDaySchema = z.enum([
  'dawn',
  'morning',
  'midday',
  'afternoon',
  'evening',
  'night',
  'neutral',
]);
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

export const EnvironmentSchema = z.enum(['indoor', 'outdoor', 'abstract', 'space']);
export type Environment = z.infer<typeof EnvironmentSchema>;

export const WeatherSchema = z.enum([
  'clear',
  'rain',
  'storm',
  'snow',
  'fog',
  'wind',
]);
export type Weather = z.infer<typeof WeatherSchema>;

export const SceneSettingSchema = z.object({
  location: LocationIdSchema,
  /** Free text; feeds the future image prompt. */
  locationDescription: z.string().default(''),
  timeOfDay: TimeOfDaySchema.default('neutral'),
  environment: EnvironmentSchema.default('abstract'),
  weather: WeatherSchema.optional(),
  era: z.string().optional(),
  crowdDensity: z.enum(['empty', 'sparse', 'moderate', 'crowded']).optional(),
});
export type SceneSetting = z.infer<typeof SceneSettingSchema>;

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export const SceneTransitionStyleSchema = z.enum([
  'cut',
  'crossfade',
  'fade_through_silence',
  'stinger',
  'whoosh',
  'musical_resolve',
]);
export type SceneTransitionStyle = z.infer<typeof SceneTransitionStyleSchema>;

export const SceneTransitionSchema = z.object({
  style: SceneTransitionStyleSchema.default('crossfade'),
  durationMs: z.number().int().min(0).max(10_000).default(1500),
  /**
   * Semantic need for the stinger, when style is 'stinger'. Set by the
   * ScenePlanner and satisfied later by the AssetResolver — the same seam music
   * and ambience use. Its presence is what makes an assetless stinger a
   * DEFERRED resolution rather than a defect.
   */
  stingerRequirement: AssetRequirementSchema.optional(),
  /** Optional cache hint, resolved from the catalogue when one was available. */
  stingerAssetId: z.string().optional(),
});
export type SceneTransition = z.infer<typeof SceneTransitionSchema>;

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export const SceneSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  title: z.string().min(1),

  /** Joins back to the existing PodcastPlan.segments[].index. */
  chapterIndex: z.number().int().nonnegative(),
  /** Inclusive range of script line indices this scene covers. */
  lineRange: z.object({
    startLine: z.number().int().nonnegative(),
    endLine: z.number().int().nonnegative(),
  }),

  setting: SceneSettingSchema,

  dominantEmotion: EmotionSchema,
  energyLevel: UnitScalarSchema.default(0.5),
  /** Drives music intensity selection. */
  tensionLevel: UnitScalarSchema.default(0.3),

  /** Pass-1 estimate from word counts. */
  estimatedDurationMs: z.number().int().nonnegative(),
  /** Pass-2 resolved absolutes (0 until the timeline is resolved). */
  startMs: z.number().int().nonnegative().default(0),
  endMs: z.number().int().nonnegative().default(0),

  transitionIn: SceneTransitionSchema,
  transitionOut: SceneTransitionSchema,

  visual: SceneVisualMetadataSchema,
});
export type Scene = z.infer<typeof SceneSchema>;

/** All locations as a runtime array — used by ambience maps and tests. */
export const ALL_LOCATIONS: readonly LocationId[] = LocationIdSchema.options;

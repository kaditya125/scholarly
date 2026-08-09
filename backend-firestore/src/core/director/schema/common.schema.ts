/**
 * Shared schema primitives for the AI Director / AI Producer platform.
 *
 * Zod is the SINGLE source of truth: every TypeScript type in this layer is
 * inferred from a schema via `z.infer`, so a runtime-valid document is
 * guaranteed to be type-valid and vice versa. Nothing here is hand-typed.
 *
 * Phase A: definitions only. Nothing in this directory is wired into the
 * podcast pipeline yet (see AI_DIRECTOR_ARCHITECTURE.md §16 Stage 0).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Track kinds
// ---------------------------------------------------------------------------

/**
 * Every timeline event belongs to exactly one track. `visual` is populated from
 * day one but consumed by no renderer yet — that is what makes a future video
 * renderer a pure addition rather than a redesign.
 */
export const TrackKindSchema = z.enum([
  'voice',
  'music',
  'ambience',
  'sfx',
  'pause',
  'visual',
]);
export type TrackKind = z.infer<typeof TrackKindSchema>;

// ---------------------------------------------------------------------------
// Emotion vocabulary
// ---------------------------------------------------------------------------

/**
 * The closed emotion set. Closed on purpose: `emotionProfiles.ts` (Phase C)
 * must provide a delivery profile for every member, so adding an emotion is a
 * compile-time obligation rather than a runtime surprise.
 */
export const EmotionSchema = z.enum([
  'neutral',
  'happy',
  'sad',
  'fear',
  'excited',
  'calm',
  'hope',
  'angry',
  'curious',
  'suspense',
  'mystery',
  'romantic',
  'heroic',
  'victory',
  'failure',
  'wonder',
  'surprise',
]);
export type Emotion = z.infer<typeof EmotionSchema>;

/** All emotions as a runtime array — used by planners and tests for exhaustiveness. */
export const ALL_EMOTIONS: readonly Emotion[] = EmotionSchema.options;

// ---------------------------------------------------------------------------
// Asset references
// ---------------------------------------------------------------------------

export const AssetKindSchema = z.enum(['music', 'ambience', 'sfx', 'stinger']);
export type AssetKind = z.infer<typeof AssetKindSchema>;

/**
 * A pointer to a physical file in the shared asset library. Planners emit these;
 * the AssetManifest validates them. An unresolvable ref degrades the render
 * (the layer is skipped) and is never fatal.
 */
export const AssetRefSchema = z.object({
  kind: AssetKindSchema,
  id: z.string().min(1),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

// ---------------------------------------------------------------------------
// Spatial audio — DESIGNED ONLY, ignored by the v1 mixer
// ---------------------------------------------------------------------------

export const SpatialMovementSchema = z.object({
  fromPan: z.number().min(-1).max(1),
  toPan: z.number().min(-1).max(1),
  fromDistance: z.number().min(0).max(1),
  toDistance: z.number().min(0).max(1),
  durationMs: z.number().int().nonnegative(),
  easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out']),
});
export type SpatialMovement = z.infer<typeof SpatialMovementSchema>;

export const ReverbSpecSchema = z.object({
  roomSize: z.enum([
    'tiny',
    'small',
    'medium',
    'large',
    'hall',
    'cathedral',
    'outdoor',
  ]),
  wetLevel: z.number().min(0).max(1),
  decayMs: z.number().int().nonnegative(),
  earlyReflectionsMs: z.number().int().nonnegative().optional(),
  environment: z.string().optional(),
});
export type ReverbSpec = z.infer<typeof ReverbSpecSchema>;

/**
 * Optional on every event. The v1 mixer discards it; a future binaural mixer
 * treats `undefined` as centre/dry, so timelines authored today need no
 * migration when spatial rendering lands.
 */
export const SpatialSpecSchema = z.object({
  pan: z.number().min(-1).max(1).default(0),
  distance: z.number().min(0).max(1).default(0),
  elevation: z.number().min(-1).max(1).optional(),
  movement: SpatialMovementSchema.optional(),
  reverb: ReverbSpecSchema.optional(),
});
export type SpatialSpec = z.infer<typeof SpatialSpecSchema>;

// ---------------------------------------------------------------------------
// Base timeline event
// ---------------------------------------------------------------------------

/**
 * Fields shared by every event on every track. Absolute `startMs` (from
 * timeline zero) is what lets music, ambience and stingers cross scene
 * boundaries without special-casing — see the track-model rationale in
 * AI_DIRECTOR_ARCHITECTURE.md §6.1.
 */
export const TimelineEventBaseSchema = z.object({
  id: z.string().min(1),
  kind: TrackKindSchema,
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  sceneId: z.string().min(1),
  /** Higher wins when the mixer must resolve an overlap or drop a cue. */
  priority: z.number().int().min(0).max(100).default(50),
  spatial: SpatialSpecSchema.optional(),
});
export type TimelineEventBase = z.infer<typeof TimelineEventBaseSchema>;

// ---------------------------------------------------------------------------
// Shared value objects
// ---------------------------------------------------------------------------

export const GenderSchema = z.enum(['male', 'female', 'neutral']);
export type Gender = z.infer<typeof GenderSchema>;

export const AgeBandSchema = z.enum([
  'child',
  'teen',
  'young_adult',
  'adult',
  'elderly',
]);
export type AgeBand = z.infer<typeof AgeBandSchema>;

export const CinematicIntensitySchema = z.enum(['subtle', 'balanced', 'dramatic']);
export type CinematicIntensity = z.infer<typeof CinematicIntensitySchema>;

export const MediaGenreSchema = z.enum([
  'educational',
  'documentary',
  'storytelling',
  'interview',
  'debate',
  'news',
  'meditation',
  'drama',
]);
export type MediaGenre = z.infer<typeof MediaGenreSchema>;

export const NarrativeStyleSchema = z.enum([
  'linear',
  'problem_solution',
  'chronological',
  'question_driven',
  'story_arc',
  'compare_contrast',
]);
export type NarrativeStyle = z.infer<typeof NarrativeStyleSchema>;

/**
 * Decibel gain relative to unity. Bounded to catch a planner emitting a raw
 * 0..1 amplitude where dB was expected — a mistake that would otherwise only
 * surface as unlistenable audio.
 */
export const DecibelSchema = z.number().min(-60).max(12);

/** A 0..1 normalised scalar (intensity, energy, tension, personality traits). */
export const UnitScalarSchema = z.number().min(0).max(1);

/**
 * Visual metadata schema — populated from day one, consumed by nothing yet.
 *
 * This is the core of the extensibility claim in AI_DIRECTOR_ARCHITECTURE.md
 * §15: the expensive part of video generation is deciding WHAT TO SHOW, and
 * that decision is made here, cheaply, while the script context is already
 * loaded. A future VideoRenderer, AvatarRenderer or ShortsRenderer reads these
 * fields and needs no Director change.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Cinematography
// ---------------------------------------------------------------------------

export const CameraAngleSchema = z.enum([
  'eye_level',
  'low',
  'high',
  'birds_eye',
  'close_up',
  'medium',
  'wide',
  'extreme_wide',
]);
export type CameraAngle = z.infer<typeof CameraAngleSchema>;

export const CameraMovementSchema = z.enum([
  'static',
  'pan_left',
  'pan_right',
  'zoom_in',
  'zoom_out',
  'dolly',
  'orbit',
  'handheld',
]);
export type CameraMovement = z.infer<typeof CameraMovementSchema>;

export const FocalLengthSchema = z.enum(['24mm', '35mm', '50mm', '85mm', '135mm']);
export type FocalLength = z.infer<typeof FocalLengthSchema>;

export const DepthOfFieldSchema = z.enum(['shallow', 'medium', 'deep']);
export type DepthOfField = z.infer<typeof DepthOfFieldSchema>;

// ---------------------------------------------------------------------------
// Look
// ---------------------------------------------------------------------------

export const LightingSchema = z.enum([
  'natural',
  'golden_hour',
  'blue_hour',
  'harsh',
  'soft',
  'dramatic',
  'low_key',
  'high_key',
  'neon',
]);
export type Lighting = z.infer<typeof LightingSchema>;

export const VisualStyleSchema = z.enum([
  'photorealistic',
  'cinematic',
  'documentary',
  'illustration',
  'anime',
  '3d_render',
  'watercolour',
]);
export type VisualStyle = z.infer<typeof VisualStyleSchema>;

export const ColorPaletteSchema = z.object({
  primary: z.string().min(1),
  secondary: z.string().min(1),
  accent: z.string().min(1),
  mood: z.string().min(1),
});
export type ColorPalette = z.infer<typeof ColorPaletteSchema>;

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export const VisualTransitionSchema = z.enum([
  'cut',
  'dissolve',
  'fade_black',
  'wipe',
  'zoom_blur',
  'match_cut',
]);
export type VisualTransition = z.infer<typeof VisualTransitionSchema>;

/**
 * Lets a future Shorts renderer reuse the SAME timeline: it selects 9:16
 * events plus the highest-priority window of the emotion curve, with no
 * Director involvement.
 */
export const AspectRatioHintSchema = z.enum(['16:9', '9:16', '1:1']);
export type AspectRatioHint = z.infer<typeof AspectRatioHintSchema>;

// ---------------------------------------------------------------------------
// Scene visual metadata
// ---------------------------------------------------------------------------

export const SceneVisualMetadataSchema = z.object({
  // Generation prompts
  imagePrompt: z.string().min(1),
  videoPrompt: z.string().min(1),
  animationPrompt: z.string().optional(),

  // Cinematography
  cameraAngle: CameraAngleSchema.default('medium'),
  cameraMovement: CameraMovementSchema.default('static'),
  focalLength: FocalLengthSchema.optional(),
  depthOfField: DepthOfFieldSchema.optional(),

  // Look
  lighting: LightingSchema.default('natural'),
  visualStyle: VisualStyleSchema.default('cinematic'),
  colorPalette: ColorPaletteSchema,

  // Editing
  transitionType: VisualTransitionSchema.default('dissolve'),
  aspectRatioHint: AspectRatioHintSchema.optional(),
});
export type SceneVisualMetadata = z.infer<typeof SceneVisualMetadataSchema>;

// ---------------------------------------------------------------------------
// Visual track
// ---------------------------------------------------------------------------

export const VisualTypeSchema = z.enum([
  'establishing_shot',
  'character_shot',
  'detail_shot',
  'diagram',
  'text_overlay',
  'transition',
]);
export type VisualType = z.infer<typeof VisualTypeSchema>;

/**
 * Declared here rather than in audio.schema.ts to keep the visual layer fully
 * self-contained — a future video renderer imports only this file.
 */
export const VisualEventSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('visual'),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  sceneId: z.string().min(1),
  priority: z.number().int().min(0).max(100).default(50),

  visualType: VisualTypeSchema,
  sceneVisual: SceneVisualMetadataSchema,
  /** Set for character shots — targets avatar generation and lip-sync. */
  characterId: z.string().optional(),
});
export type VisualEvent = z.infer<typeof VisualEventSchema>;

export const VisualTrackSchema = z.object({
  events: z.array(VisualEventSchema).default([]),
});
export type VisualTrack = z.infer<typeof VisualTrackSchema>;

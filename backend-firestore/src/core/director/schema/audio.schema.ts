/**
 * Audio track schemas: voice, pause, music, ambience, SFX, and the mastering
 * spec that governs the final mix.
 *
 * Every track is a flat list of absolutely-timed events. The mixer consumes
 * these directly; the Director never produces audio itself.
 */

import { z } from 'zod';
import {
  DecibelSchema,
  EmotionSchema,
  SpatialSpecSchema,
  TimelineEventBaseSchema,
  UnitScalarSchema,
} from './common.schema';
import { AssetRequirementSchema } from './requirement.schema';

// ===========================================================================
// VOICE
// ===========================================================================

/**
 * Per-line delivery direction. Values are ABSOLUTE (already combined with the
 * character's base profile) so the synthesizer needs no further arithmetic.
 */
export const DeliveryDirectionSchema = z.object({
  emotion: EmotionSchema,
  /** How strongly to express the emotion. */
  intensity: UnitScalarSchema.default(0.5),

  speakingRate: z.number().min(0.5).max(2).default(1),
  pitch: z.number().min(-6).max(6).default(0),
  volumeDb: DecibelSchema.default(0),

  /** Reserved for expressive-TTS / SSML emphasis. Unused in v1. */
  emphasisWords: z.array(z.string()).optional(),
  whisper: z.boolean().default(false),
  breathBefore: z.boolean().default(false),

  /**
   * Set when the bound voice rejects prosody (Chirp 3 HD / Journey). The
   * synthesizer must then omit pitch/rate and let the mixer compensate with
   * gain and pacing instead.
   */
  prosodyUnsupported: z.boolean().default(false),
});
export type DeliveryDirection = z.infer<typeof DeliveryDirectionSchema>;

/** Filled in by the VoiceSynthesizer after TTS returns. */
export const SynthesizedAudioSchema = z.object({
  storagePath: z.string().min(1),
  localPath: z.string().optional(),
  actualDurationMs: z.number().int().nonnegative(),
});
export type SynthesizedAudio = z.infer<typeof SynthesizedAudioSchema>;

export const VoiceEventSchema = TimelineEventBaseSchema.extend({
  kind: z.literal('voice'),
  /**
   * Index into the existing GeneratedScript.lines. The 1:1 order-preserving
   * relationship is the invariant that keeps transcript, chapters, click-to-seek
   * and the assets service working untouched (validated in validation.ts).
   */
  lineIndex: z.number().int().nonnegative(),
  characterId: z.string().min(1),
  text: z.string().min(1),
  emotion: EmotionSchema,
  delivery: DeliveryDirectionSchema,
  audio: SynthesizedAudioSchema.optional(),
});
export type VoiceEvent = z.infer<typeof VoiceEventSchema>;

export const VoiceTrackSchema = z.object({
  events: z.array(VoiceEventSchema).default([]),
});
export type VoiceTrack = z.infer<typeof VoiceTrackSchema>;

// ===========================================================================
// EMOTION CURVE
// ===========================================================================

export const EmotionArcTypeSchema = z.enum([
  'rising',
  'falling',
  'arc',
  'wave',
  'steady',
  'twist',
]);
export type EmotionArcType = z.infer<typeof EmotionArcTypeSchema>;

export const EmotionKeyframeSchema = z.object({
  /** Position through the episode, 0..1. */
  atProgress: UnitScalarSchema,
  emotion: EmotionSchema,
  intensity: UnitScalarSchema,
  sceneId: z.string().min(1),
});
export type EmotionKeyframe = z.infer<typeof EmotionKeyframeSchema>;

/**
 * The GLOBAL emotional shape of the episode. Per-line emotions are selected as
 * local deviations from this curve, constrained by the character's
 * `allowedEmotions` — which is what the requirement "do NOT detect emotions
 * sentence by sentence only" asks for.
 */
export const EmotionCurveSchema = z.object({
  keyframes: z.array(EmotionKeyframeSchema).min(1),
  arcType: EmotionArcTypeSchema.default('arc'),
});
export type EmotionCurve = z.infer<typeof EmotionCurveSchema>;

// ===========================================================================
// PAUSE
// ===========================================================================

export const PauseTypeSchema = z.enum([
  'breath',
  'beat',
  'dramatic',
  'suspense',
  'scene_gap',
  'emphasis',
  /** Education-specific: a deliberate beat after a dense definition. */
  'comprehension',
]);
export type PauseType = z.infer<typeof PauseTypeSchema>;

export const PauseEventSchema = TimelineEventBaseSchema.extend({
  kind: z.literal('pause'),
  pauseType: PauseTypeSchema,
  /** Whether music/ambience continue through the silence. */
  holdBackground: z.boolean().default(true),
});
export type PauseEvent = z.infer<typeof PauseEventSchema>;

export const PauseTrackSchema = z.object({
  events: z.array(PauseEventSchema).default([]),
});
export type PauseTrack = z.infer<typeof PauseTrackSchema>;

// ===========================================================================
// MUSIC
// ===========================================================================

export const MusicCategorySchema = z.enum([
  'documentary',
  'adventure',
  'epic',
  'sad',
  'mystery',
  'horror',
  'fantasy',
  'science',
  'educational',
  'meditation',
  'victory',
  'inspirational',
  'historical',
  'calm_piano',
  'strings',
  'ambient_synth',
  'space',
  'nature',
]);
export type MusicCategory = z.infer<typeof MusicCategorySchema>;

export const MusicRoleSchema = z.enum([
  'intro',
  'bed',
  'transition',
  'accent',
  'outro',
]);
export type MusicRole = z.infer<typeof MusicRoleSchema>;

export const MusicTempoSchema = z.enum(['slow', 'moderate', 'upbeat', 'driving']);
export type MusicTempo = z.infer<typeof MusicTempoSchema>;

export const MusicTransitionTypeSchema = z.enum([
  'cut',
  'crossfade',
  'resolve',
  'swell',
  'drop',
]);
export type MusicTransitionType = z.infer<typeof MusicTransitionTypeSchema>;

export const MusicLoopStrategySchema = z.enum([
  'none',
  'seamless',
  'crossfade_self',
]);
export type MusicLoopStrategy = z.infer<typeof MusicLoopStrategySchema>;

export const MusicEventSchema = TimelineEventBaseSchema.extend({
  kind: z.literal('music'),
  /**
   * What this cue NEEDS, semantically. This — not `assetId` — is the contract
   * between the Director and the Asset Resolver, which is what keeps the
   * timeline provider-agnostic.
   */
  requirement: AssetRequirementSchema,
  /**
   * OPTIONAL resolution hint. Present when a catalogue match was already known
   * at direction time; absent when the resolver must obtain the asset later.
   * Never rely on this being set — resolve `requirement` instead.
   */
  assetId: z.string().min(1).optional(),
  category: MusicCategorySchema,
  role: MusicRoleSchema,

  /** Selects a stem/variant within the category. */
  intensity: UnitScalarSchema.default(0.5),
  tempo: MusicTempoSchema.default('moderate'),
  /** Pre-duck level, typically -14..-20 dB. */
  volumeDb: DecibelSchema.default(-16),

  loopStrategy: MusicLoopStrategySchema.default('seamless'),
  fadeInMs: z.number().int().nonnegative().default(1500),
  fadeOutMs: z.number().int().nonnegative().default(1500),
  /**
   * Overlap into the next music event. Validation enforces > 0 for every
   * non-final event, which structurally guarantees "never stop abruptly".
   */
  crossfadeToNextMs: z.number().int().nonnegative().default(2000),
  transitionType: MusicTransitionTypeSchema.default('crossfade'),
});
export type MusicEvent = z.infer<typeof MusicEventSchema>;

export const MusicTrackSchema = z.object({
  events: z.array(MusicEventSchema).default([]),
});
export type MusicTrack = z.infer<typeof MusicTrackSchema>;

// ===========================================================================
// AMBIENCE
// ===========================================================================

export const AmbienceLayerRoleSchema = z.enum([
  'base',
  'texture',
  'detail',
  'accent',
]);
export type AmbienceLayerRole = z.infer<typeof AmbienceLayerRoleSchema>;

export const AmbienceLoopBehaviorSchema = z.enum([
  'seamless',
  'crossfade',
  /** Randomised loop start — prevents perceptible repetition. */
  'random_offset',
]);
export type AmbienceLoopBehavior = z.infer<typeof AmbienceLoopBehaviorSchema>;

export const AmbienceLayerSchema = z.object({
  /** Semantic need for this layer. Resolved independently of the other layers. */
  requirement: AssetRequirementSchema,
  /** Optional cache hint — see MusicEvent.assetId. */
  assetId: z.string().min(1).optional(),
  layerRole: AmbienceLayerRoleSchema,
  volumeDb: DecibelSchema.default(-24),
  fadeInMs: z.number().int().nonnegative().default(2000),
  fadeOutMs: z.number().int().nonnegative().default(2000),
  loopBehavior: AmbienceLoopBehaviorSchema.default('random_offset'),
  /** Randomised offset window, so stacked layers never repeat in lockstep. */
  jitterMs: z.number().int().nonnegative().optional(),
  spatial: SpatialSpecSchema.optional(),
});
export type AmbienceLayer = z.infer<typeof AmbienceLayerSchema>;

/**
 * One environment = a STACK of simultaneous layers. Layered rather than
 * single-track because a believable place needs a base bed plus texture and
 * intermittent detail (see the ancient_rome example in the architecture doc).
 */
export const AmbienceEventSchema = TimelineEventBaseSchema.extend({
  kind: z.literal('ambience'),
  environmentId: z.string().min(1),
  layers: z.array(AmbienceLayerSchema).min(1).max(8),
});
export type AmbienceEvent = z.infer<typeof AmbienceEventSchema>;

export const AmbienceTrackSchema = z.object({
  events: z.array(AmbienceEventSchema).default([]),
});
export type AmbienceTrack = z.infer<typeof AmbienceTrackSchema>;

// ===========================================================================
// SFX
// ===========================================================================

export const SFXCategorySchema = z.enum([
  'door',
  'footsteps',
  'typing',
  'phone',
  'explosion',
  'animal',
  'weapon',
  'weather',
  'glass',
  'vehicle',
  'fire',
  'body',
  'time',
  'crowd',
  'water',
  'wind',
  'paper',
  'bell',
  'magic',
  'ui',
]);
export type SFXCategory = z.infer<typeof SFXCategorySchema>;

export const SFXSyncModeSchema = z.enum([
  'on_word',
  'after_line',
  'before_line',
  'absolute',
]);
export type SFXSyncMode = z.infer<typeof SFXSyncModeSchema>;

export const SFXEventSchema = TimelineEventBaseSchema.extend({
  kind: z.literal('sfx'),
  /** Semantic need for this cue. */
  requirement: AssetRequirementSchema,
  /** Optional cache hint — see MusicEvent.assetId. */
  assetId: z.string().min(1).optional(),
  effectCategory: SFXCategorySchema,

  /** The script word that triggered this cue (for debugging + the inspector). */
  triggerWord: z.string().optional(),
  triggerLineIndex: z.number().int().nonnegative().optional(),
  syncMode: SFXSyncModeSchema.default('after_line'),
  /**
   * Relative nudge. NEGATIVE is intentional and preferred: a cue landing just
   * before its word reads as deliberate, whereas landing late reads as a bug.
   */
  offsetMs: z.number().int().min(-5000).max(5000).default(0),

  volumeDb: DecibelSchema.default(-10),
  fadeInMs: z.number().int().nonnegative().default(0),
  fadeOutMs: z.number().int().nonnegative().default(120),
  spatial: SpatialSpecSchema.optional(),
});
export type SFXEvent = z.infer<typeof SFXEventSchema>;

export const SFXTrackSchema = z.object({
  events: z.array(SFXEventSchema).default([]),
});
export type SFXTrack = z.infer<typeof SFXTrackSchema>;

// ===========================================================================
// MASTERING
// ===========================================================================

export const MasteringSpecSchema = z.object({
  /** Podcast loudness standard. */
  targetLufs: z.number().min(-30).max(-6).default(-16),
  truePeakDb: z.number().min(-6).max(0).default(-1),
  voiceBusGainDb: DecibelSchema.default(0),

  /**
   * How far background drops under speech. Sidechain-driven off the voice bus,
   * NOT static automation — this is what keeps narration intelligible without
   * per-scene manual tuning.
   */
  duckingDb: z.number().min(-40).max(0).default(-12),
  duckAttackMs: z.number().int().nonnegative().default(150),
  duckReleaseMs: z.number().int().nonnegative().default(400),

  compression: z
    .object({
      threshold: z.number(),
      ratio: z.number().min(1),
    })
    .optional(),
  eq: z
    .object({
      highPassHz: z.number().positive().optional(),
      presenceBoostDb: z.number().optional(),
    })
    .optional(),

  fadeInMs: z.number().int().nonnegative().default(500),
  fadeOutMs: z.number().int().nonnegative().default(1500),
});
export type MasteringSpec = z.infer<typeof MasteringSpecSchema>;

/** Conservative defaults suitable for an educational product. */
export const DEFAULT_MASTERING: MasteringSpec = MasteringSpecSchema.parse({});

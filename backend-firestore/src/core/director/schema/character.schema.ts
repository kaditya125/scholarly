/**
 * Character schema + persistent cast memory.
 *
 * Two responsibilities:
 *   1. Describe a character precisely enough to bind a concrete TTS voice.
 *   2. Carry future avatar/lip-sync metadata so a video renderer needs no
 *      Director change (AI_DIRECTOR_ARCHITECTURE.md §15).
 *
 * Consistency guarantee: the resolved cast is embedded in every MasterTimeline,
 * so re-rendering an old episode reproduces the original voices even if the
 * character memory document was later mutated or deleted. Memory is an
 * optimisation for cross-episode consistency, never a render dependency.
 */

import { z } from 'zod';
import {
  AgeBandSchema,
  EmotionSchema,
  GenderSchema,
  UnitScalarSchema,
} from './common.schema';

// ---------------------------------------------------------------------------
// Voice binding
// ---------------------------------------------------------------------------

export const VoiceProviderSchema = z.enum(['google', 'elevenlabs', 'gemini']);
export type VoiceProvider = z.infer<typeof VoiceProviderSchema>;

/**
 * A concrete, provider-native voice binding plus its baseline delivery.
 * Per-line emotion is applied as a delta on top of these base values.
 */
export const VoiceProfileSchema = z.object({
  provider: VoiceProviderSchema,
  /** Provider-native id: a Google voice name or an ElevenLabs voiceId. */
  voiceId: z.string().min(1),
  /** Human label for logs and the timeline inspector. */
  voiceLabel: z.string().optional(),

  baseSpeakingRate: z.number().min(0.5).max(2).default(1),
  basePitch: z.number().min(-6).max(6).default(0),
  baseEnergy: UnitScalarSchema.default(0.5),

  // ElevenLabs expressiveness knobs. Ignored by other providers.
  stability: UnitScalarSchema.optional(),
  similarityBoost: UnitScalarSchema.optional(),
  styleExaggeration: UnitScalarSchema.optional(),

  /**
   * Whether this voice accepts prosody at all. Chirp 3 HD and Journey reject
   * `pitch`/`speakingRate` outright, so emotion must be expressed via provider
   * routing or mix compensation instead. Mirrors `voiceSupportsProsody()` in
   * the existing tts.service.
   */
  supportsProsody: z.boolean().default(false),
});
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;

// ---------------------------------------------------------------------------
// Personality
// ---------------------------------------------------------------------------

export const SpeakingStyleSchema = z.enum([
  'conversational',
  'lecturing',
  'storytelling',
  'interviewing',
  'dramatic',
  'calm',
]);
export type SpeakingStyle = z.infer<typeof SpeakingStyleSchema>;

export const PersonalityProfileSchema = z.object({
  warmth: UnitScalarSchema.default(0.5),
  authority: UnitScalarSchema.default(0.5),
  energy: UnitScalarSchema.default(0.5),
  humour: UnitScalarSchema.default(0.3),
  formality: UnitScalarSchema.default(0.5),
  speakingStyle: SpeakingStyleSchema.default('conversational'),
  /** Reserved for a future script-rewriting pass. Unused in v1. */
  verbalTics: z.array(z.string()).optional(),
});
export type PersonalityProfile = z.infer<typeof PersonalityProfileSchema>;

// ---------------------------------------------------------------------------
// Future rendering
// ---------------------------------------------------------------------------

/**
 * Populated by the CharacterPlanner, consumed by nothing in v1. Captured now
 * because the expensive decision (what this character looks like) is cheapest
 * to make while the script context is already loaded.
 */
export const AvatarMetadataSchema = z.object({
  appearancePrompt: z.string().min(1),
  outfitPrompt: z.string().optional(),
  /** Anchors visual identity across scenes for character consistency. */
  referenceImageUrl: z.string().optional(),
  lipSyncModel: z.string().optional(),
});
export type AvatarMetadata = z.infer<typeof AvatarMetadataSchema>;

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------

export const CharacterSchema = z.object({
  /** Stable id, format `char_{slug}_{hash}`. Reused across episodes. */
  id: z.string().min(1),
  displayName: z.string().min(1),
  /** Free-form so scripts can introduce King, Robot, Doctor, Villain, … */
  role: z.string().min(1),

  gender: GenderSchema,
  ageBand: AgeBandSchema,
  estimatedAge: z.number().int().min(1).max(120).optional(),
  accent: z.string().default('neutral'),
  language: z.string().min(1),

  voice: VoiceProfileSchema,
  personality: PersonalityProfileSchema,

  defaultEmotion: EmotionSchema.default('neutral'),
  /**
   * Hard ceiling on expression. The EmotionPlanner may not assign an emotion
   * outside this set, which is what stops a Student character from suddenly
   * delivering a `heroic` line.
   */
  allowedEmotions: z.array(EmotionSchema).min(1),

  avatar: AvatarMetadataSchema.optional(),

  createdAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative(),
  episodeCount: z.number().int().nonnegative().default(0),
});
export type Character = z.infer<typeof CharacterSchema>;

// ---------------------------------------------------------------------------
// Cast
// ---------------------------------------------------------------------------

/**
 * The full resolved cast, embedded in the timeline. `primarySpeakerId` and
 * `narratorId` must reference members of `characters` — enforced in
 * validation.ts rather than here, so a partial cast can still be inspected
 * while being built.
 */
export const CharacterCastSchema = z.object({
  characters: z.array(CharacterSchema).min(1),
  narratorId: z.string().optional(),
  primarySpeakerId: z.string().min(1),
});
export type CharacterCast = z.infer<typeof CharacterCastSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic, collision-resistant character id from a name + role. */
export function buildCharacterId(displayName: string, role: string): string {
  const slug = `${displayName}-${role}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  // Small stable hash so two different names that slugify identically don't collide.
  let hash = 0;
  const raw = `${displayName}|${role}`;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return `char_${slug || 'unnamed'}_${Math.abs(hash).toString(36).slice(0, 6)}`;
}

/** Look a character up by id. Returns null rather than throwing. */
export function findCharacter(cast: CharacterCast, id: string): Character | null {
  return cast.characters.find((c) => c.id === id) ?? null;
}

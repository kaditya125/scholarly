/**
 * AssetRequirement — the Director's SEMANTIC request for audio.
 *
 * This is the contract that keeps the Director provider-agnostic. The Director
 * describes WHAT IS NEEDED; an AssetResolver decides HOW to obtain it:
 *
 *     AI Director → AssetRequirement → AssetResolver → { generated | licensed | CC0 }
 *
 * NOT:
 *     AI Director → Lyria → audio
 *
 * A requirement carries no provider, no file path, no vendor concept. The same
 * requirement can be satisfied by a generated bed today and a licensed track
 * tomorrow with no change to the Director or to a stored timeline.
 *
 * Requirements are also the CACHE KEY: `requirementFingerprint()` is stable
 * across runs, so an identical request reuses a previously-obtained asset
 * instead of regenerating it.
 */

import { z } from 'zod';
import { AssetKindSchema, EmotionSchema, UnitScalarSchema } from './common.schema';

// ---------------------------------------------------------------------------
// Requirement
// ---------------------------------------------------------------------------

export const AssetRequirementSchema = z.object({
  /** music | ambience | sfx | stinger */
  kind: AssetKindSchema,

  // ── Semantic descriptors ──
  /**
   * Broad category within the kind. For music this is a MusicCategory
   * ('documentary'); for ambience a LocationId ('classroom'); for sfx an
   * SFXCategory ('door'). Kept as a free string so a provider can support
   * categories the Director's closed unions don't yet name.
   */
  category: z.string().min(1),
  /** Dominant emotion this asset must support. */
  emotion: EmotionSchema.optional(),
  /** Stylistic register, e.g. 'cinematic_documentary', 'educational'. */
  genre: z.string().optional(),
  /** 0..1 — energy/drama the asset should carry. */
  intensity: UnitScalarSchema.optional(),
  /** Tempo band, for music. */
  tempo: z.enum(['slow', 'moderate', 'upbeat', 'driving']).optional(),

  // ── Technical constraints ──
  /** Target length. A provider may return longer; the engine loops or trims. */
  durationMs: z.number().int().positive(),
  /** Whether the asset must tile seamlessly. */
  loopable: z.boolean().default(false),

  // ── Ambience-specific ──
  /** Role within a layered environment stack. */
  layerRole: z.enum(['base', 'texture', 'detail', 'accent']).optional(),

  // ── SFX-specific ──
  /** The script word that triggered this cue, for provider prompting. */
  triggerWord: z.string().optional(),

  // ── Resolution hints ──
  /**
   * Free-form descriptors a provider may use to improve selection or a
   * generation prompt. Never required.
   */
  tags: z.array(z.string()).default([]),
  /**
   * Human-readable description of intent. A generation provider can use this
   * directly as prompt material; a catalogue provider ignores it.
   */
  description: z.string().optional(),
});
export type AssetRequirement = z.infer<typeof AssetRequirementSchema>;

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

/**
 * Stable cache key for a requirement.
 *
 * Deliberately EXCLUDES `durationMs` and `description`: a 60s and a 180s
 * educational bed at the same intensity should reuse one asset (the engine
 * loops it), and prose wording shouldn't fragment the cache. Including them
 * would make almost every request a cache miss, which for a paid generation
 * provider means paying repeatedly for near-identical audio.
 *
 * Intensity is bucketed to 0.25 steps for the same reason.
 */
export function requirementFingerprint(req: AssetRequirement): string {
  const parts = [
    req.kind,
    req.category.toLowerCase(),
    req.emotion ?? '-',
    (req.genre ?? '-').toLowerCase(),
    req.intensity != null ? bucket(req.intensity).toFixed(2) : '-',
    req.tempo ?? '-',
    req.loopable ? 'loop' : 'oneshot',
    req.layerRole ?? '-',
  ];

  // `triggerWord` participates for ONE-SHOTS, where the specific event IS the
  // asset's identity. Category alone is too coarse: a rocket launch, an engine
  // rumble, a landing thud and a passing train are all `vehicle`, and without
  // this they collapsed to a single fingerprint — so the first one generated
  // answered all four, and a Moon landing played a train.
  //
  // Appended only when present, so music and ambience fingerprints are
  // byte-identical to before and their (paid) cache entries stay valid.
  if (req.triggerWord) parts.push(req.triggerWord.toLowerCase());

  return parts.join('|');
}

/** Round to the nearest 0.25 so near-identical intensities share an asset. */
function bucket(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 4) / 4;
}

// ---------------------------------------------------------------------------
// Provenance — stored on the REGISTRY, never on the timeline
// ---------------------------------------------------------------------------

export const AssetProviderKindSchema = z.enum([
  'generated',
  'licensed',
  'cc0',
  'builtin',
]);
export type AssetProviderKind = z.infer<typeof AssetProviderKindSchema>;

/**
 * Everything we know about where an asset came from.
 *
 * Lives in the asset registry, NOT on the MasterTimeline — that separation is
 * what stops a timeline from becoming provider-specific. A timeline references
 * an opaque `assetId`; provenance is looked up when needed.
 */
export const AssetProvenanceSchema = z.object({
  assetId: z.string().min(1),
  kind: AssetKindSchema,

  /** Which class of provider produced this. */
  providerKind: AssetProviderKindSchema,
  /** Specific provider implementation name, e.g. 'vertex-lyria'. */
  provider: z.string().min(1),
  /** Model or catalogue version, when applicable. */
  providerModel: z.string().optional(),

  /** The prompt used, for generated assets. Enables reproduction and audit. */
  prompt: z.string().optional(),
  /** The requirement fingerprint this asset satisfies — the cache key. */
  fingerprint: z.string().min(1),

  // ── Semantic metadata (mirrors the requirement it satisfied) ──
  category: z.string().min(1),
  emotion: z.string().optional(),
  genre: z.string().optional(),
  intensity: z.number().min(0).max(1).optional(),

  // ── Technical ──
  durationMs: z.number().int().nonnegative(),
  loopable: z.boolean().default(false),
  loopStartMs: z.number().int().nonnegative().optional(),
  loopEndMs: z.number().int().nonnegative().optional(),
  storagePath: z.string().min(1),
  /** Content hash, so a re-download can be verified and duplicates detected. */
  checksum: z.string().optional(),
  bytes: z.number().int().nonnegative().optional(),

  // ── Legal ──
  licence: z.string().min(1),
  attribution: z.string().optional(),
  sourceUrl: z.string().optional(),

  createdAt: z.number().int().nonnegative(),
  /** Times this asset has been reused — informs pruning. */
  useCount: z.number().int().nonnegative().default(0),
});
export type AssetProvenance = z.infer<typeof AssetProvenanceSchema>;

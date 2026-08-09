/**
 * Asset catalogue schema.
 *
 * `catalogue.json` is the contract between the Director's knowledge maps and
 * the physical files in GCS. Planners may only emit asset ids present here,
 * which turns an invalid asset reference into a DESIGN-TIME error (caught by
 * `AssetManifest.validateRefs` before any render) rather than a render-time
 * failure.
 *
 * Licence is a required field, not optional metadata: shipping audio without a
 * recorded licence is the top legal risk in AI_DIRECTOR_ARCHITECTURE.md §18.1.
 */

import { z } from 'zod';
import { AssetKindSchema } from '../../../core/director/schema/common.schema';

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export const AssetLicenceSchema = z.enum([
  'CC0',
  'CC-BY',
  'CC-BY-SA',
  'commercial',
  'generated',
  'proprietary',
]);
export type AssetLicence = z.infer<typeof AssetLicenceSchema>;

export const AssetEntrySchema = z.object({
  id: z.string().min(1),
  kind: AssetKindSchema,
  /** Storage path relative to the asset root, e.g. `music/documentary/soft_bed.mp3`. */
  path: z.string().min(1),
  durationMs: z.number().int().positive(),

  /** Whether the file is safe to loop. */
  loopable: z.boolean().default(false),
  loopStartMs: z.number().int().nonnegative().optional(),
  loopEndMs: z.number().int().nonnegative().optional(),

  licence: AssetLicenceSchema,
  attribution: z.string().optional(),
  sourceUrl: z.string().optional(),

  /** Free-form tags used by planners for selection. */
  tags: z.array(z.string()).default([]),

  // ── Kind-specific selection hints (all optional) ──
  /** music: which MusicCategory this belongs to. */
  category: z.string().optional(),
  /** music: 0..1 intensity, so a planner can pick by scene tension. */
  intensity: z.number().min(0).max(1).optional(),
  /** music: tempo band. */
  tempo: z.enum(['slow', 'moderate', 'upbeat', 'driving']).optional(),
  /** ambience: which LocationId this belongs to. */
  environment: z.string().optional(),
  /** ambience: role within a layer stack. */
  layerRole: z.enum(['base', 'texture', 'detail', 'accent']).optional(),
  /** sfx: which SFXCategory this belongs to. */
  effectCategory: z.string().optional(),
});
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const ASSET_CATALOGUE_VERSION = 1 as const;

export const AssetCatalogueSchema = z.object({
  version: z.literal(ASSET_CATALOGUE_VERSION),
  /** GCS prefix all `path` values are relative to. */
  root: z.string().min(1).default('audio-assets'),
  generatedAt: z.number().int().nonnegative().optional(),
  assets: z.array(AssetEntrySchema).default([]),
});
export type AssetCatalogue = z.infer<typeof AssetCatalogueSchema>;

/** An empty but valid catalogue — the safe default when none is configured. */
export const EMPTY_CATALOGUE: AssetCatalogue = {
  version: ASSET_CATALOGUE_VERSION,
  root: 'audio-assets',
  assets: [],
};

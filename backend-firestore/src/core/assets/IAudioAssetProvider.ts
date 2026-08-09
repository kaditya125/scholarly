/**
 * IAudioAssetProvider — the seam that keeps the AI Director provider-agnostic.
 *
 * The Director emits an `AssetRequirement` ("suspenseful cinematic documentary
 * bed, intensity 0.75, loopable"). A provider decides HOW to satisfy it:
 * generate it, pick it from a licensed library, pull a CC0 file, or serve a
 * built-in catalogue entry. Nothing about the provider leaks back into the
 * timeline — only an opaque `assetId` plus a storage path does.
 *
 *     AI Director → AssetRequirement → AssetResolver → [ providers ] → ResolvedAsset
 *
 * Adding a provider is a registration, not a code change anywhere upstream.
 *
 * Contract rules every implementation must honour:
 *   1. `resolve` NEVER throws. Return null on failure; the resolver falls through.
 *   2. `resolve` is idempotent for a given requirement fingerprint — repeated
 *      calls must not create duplicate paid assets (use the registry cache).
 *   3. `canResolve` is cheap and synchronous. No I/O, no network.
 *   4. `estimatedCostUsd` must be an honest upper bound; the resolver uses it to
 *      order providers cheapest-first and to enforce budget ceilings.
 */

import type { AssetKind } from '../director/schema/common.schema';
import type {
  AssetProviderKind,
  AssetRequirement,
} from '../director/schema/requirement.schema';

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/**
 * What a provider hands back. Deliberately narrow: the renderer needs a path,
 * a duration and loop points. Everything else (prompt, licence, model) is
 * provenance and is written to the registry, not to the timeline.
 */
export interface ResolvedAsset {
  /** Opaque handle. The only provider-derived value the timeline may hold. */
  assetId: string;
  /** GCS object path (no bucket prefix) or absolute local path in dev. */
  storagePath: string;
  durationMs: number;

  loopable: boolean;
  loopStartMs?: number;
  loopEndMs?: number;

  // ── Provenance (persisted to the registry) ──
  provider: string;
  providerKind: AssetProviderKind;
  providerModel?: string;
  prompt?: string;
  licence: string;
  attribution?: string;
  sourceUrl?: string;
  checksum?: string;
  bytes?: number;

  /**
   * How well this asset matches the requirement, 0..1.
   *   1.00  exact catalogue/generated match
   *   0.70+ same category, different intensity or tempo
   *   0.40+ fallback category — usable but not what was asked for
   *  <0.40  last-resort substitution
   * Surfaced in the Timeline Inspector so weak matches are visible before a
   * human ever listens to a render.
   */
  confidence: number;

  /** True when served from the registry rather than freshly obtained. */
  cached: boolean;
  /** Actual cost incurred by this call, USD. 0 for cache hits and catalogue. */
  costUsd: number;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface ResolveContext {
  /** Correlates provider work with a podcast in logs and the registry. */
  podcastId?: string;
  userId?: string;
  /**
   * When false a provider MUST NOT incur cost or create new assets — it may
   * only return something it already has. Used by dry-runs and the inspector.
   */
  allowGeneration: boolean;
  /** Remaining budget for this whole resolution pass, USD. */
  budgetRemainingUsd: number;
  /** Abort signal so a slow provider cannot hang a render. */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface IAudioAssetProvider {
  /** Stable identifier, e.g. 'vertex-lyria'. Recorded in provenance. */
  readonly name: string;
  readonly providerKind: AssetProviderKind;
  /** Which requirement kinds this provider can serve. */
  readonly supports: readonly AssetKind[];
  /**
   * True when resolution creates a new asset (costs money, takes seconds).
   * The resolver tries every non-generative provider first.
   */
  readonly isGenerative: boolean;
  /** Upper-bound cost of one successful resolve, USD. 0 for free sources. */
  readonly estimatedCostUsd: number;

  /** Cheap, synchronous, no I/O. False means "skip me for this requirement". */
  canResolve(requirement: AssetRequirement): boolean;

  /** Returns null when it cannot satisfy the requirement. Must never throw. */
  resolve(
    requirement: AssetRequirement,
    context: ResolveContext
  ): Promise<ResolvedAsset | null>;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Order providers cheapest-and-safest first: non-generative before generative,
 * then by cost, then by name for determinism.
 *
 * Determinism matters — an identical timeline must resolve identically across
 * runs, otherwise A/B comparisons are meaningless.
 */
export function providerPriority(
  a: IAudioAssetProvider,
  b: IAudioAssetProvider
): number {
  if (a.isGenerative !== b.isGenerative) return a.isGenerative ? 1 : -1;
  if (a.estimatedCostUsd !== b.estimatedCostUsd) {
    return a.estimatedCostUsd - b.estimatedCostUsd;
  }
  return a.name.localeCompare(b.name);
}

/** Clamp a provider-reported confidence into range, defaulting conservatively. */
export function normaliseConfidence(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, n));
}

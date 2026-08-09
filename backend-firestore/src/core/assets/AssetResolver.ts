/**
 * AssetResolver — turns the Director's semantic requirements into concrete audio.
 *
 *     AI Producer → AI Director → MasterTimeline → [AssetResolver] → Audio Renderer
 *
 * This is the ONLY component that knows providers exist. Resolution order is
 * deliberately cheapest-first:
 *
 *   1. registry cache   (free, instant — an identical fingerprint already exists)
 *   2. non-generative   (built-in catalogue, CC0, licensed library)
 *   3. generative       (Lyria and friends — costs money, takes seconds)
 *
 * Every step is optional. A requirement that nothing can satisfy comes back
 * `unresolved`, and the renderer simply omits that layer. Silence is an
 * acceptable outcome; a broken reference or a thrown exception is not.
 *
 * Budget is enforced at the pass level, not per call, because the meaningful
 * question is "what did this episode cost", not "what did this bed cost".
 */

import { logger } from '../../utils/logger';
import {
  providerPriority,
  normaliseConfidence,
  type IAudioAssetProvider,
  type ResolveContext,
  type ResolvedAsset,
} from './IAudioAssetProvider';
import { AssetRegistry, assetRegistry } from './AssetRegistry';
import {
  requirementFingerprint,
  type AssetProvenance,
  type AssetRequirement,
} from '../director/schema/requirement.schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolutionAttempt {
  provider: string;
  outcome: 'hit' | 'miss' | 'error' | 'skipped_budget' | 'skipped_generation';
  ms: number;
  error?: string;
}

export interface ResolutionOutcome {
  requirement: AssetRequirement;
  fingerprint: string;
  asset: ResolvedAsset | null;
  /** Full trail, so the inspector can explain WHY a layer is missing. */
  attempts: ResolutionAttempt[];
}

export interface ResolveManyResult {
  /** Fingerprint → outcome. Callers map back through their own requirements. */
  outcomes: Map<string, ResolutionOutcome>;
  resolved: number;
  unresolved: number;
  cacheHits: number;
  generated: number;
  totalCostUsd: number;
  totalMs: number;
}

export interface ResolverOptions {
  /** Hard ceiling for one resolution pass. Generative providers stop at 0. */
  budgetUsd?: number;
  /** When false, no provider may create a new asset. Dry-runs pass false. */
  allowGeneration?: boolean;
  podcastId?: string;
  userId?: string;
  /** Per-requirement wall-clock cap. Prevents one slow provider stalling a render. */
  timeoutMs?: number;
}

const DEFAULT_BUDGET_USD = 2.0;
const DEFAULT_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export class AssetResolver {
  private readonly providers: IAudioAssetProvider[] = [];

  constructor(private readonly registry: AssetRegistry = assetRegistry) {}

  /**
   * Register a provider. Idempotent on name so double-registration during
   * hot-reload cannot produce duplicate paid calls.
   */
  register(provider: IAudioAssetProvider): this {
    const existing = this.providers.findIndex((p) => p.name === provider.name);
    if (existing >= 0) {
      this.providers[existing] = provider;
    } else {
      this.providers.push(provider);
    }
    this.providers.sort(providerPriority);
    return this;
  }

  /** Registered provider names in resolution order. Surfaced by the inspector. */
  providerNames(): string[] {
    return this.providers.map((p) => p.name);
  }

  // ── Single requirement ───────────────────────────────────────────────────

  async resolve(
    requirement: AssetRequirement,
    options: ResolverOptions = {}
  ): Promise<ResolutionOutcome> {
    const budget = options.budgetUsd ?? DEFAULT_BUDGET_USD;
    const result = await this.resolveOne(requirement, {
      allowGeneration: options.allowGeneration ?? true,
      budgetRemainingUsd: budget,
      podcastId: options.podcastId,
      userId: options.userId,
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return result;
  }

  // ── Batch ────────────────────────────────────────────────────────────────

  /**
   * Resolve many requirements, deduplicated by fingerprint.
   *
   * Deduplication is the whole point: a 20-minute episode may contain 15 music
   * events that reduce to 3 distinct fingerprints. Resolving per event would
   * triple-bill for identical audio.
   *
   * Sequential rather than parallel because the primary generative provider is
   * quota-limited to ~10 requests/minute; firing them concurrently just earns
   * 429s.
   */
  async resolveMany(
    requirements: AssetRequirement[],
    options: ResolverOptions = {}
  ): Promise<ResolveManyResult> {
    const startedAt = Date.now();
    const outcomes = new Map<string, ResolutionOutcome>();
    let budgetRemaining = options.budgetUsd ?? DEFAULT_BUDGET_USD;
    let cacheHits = 0;
    let generated = 0;
    let totalCostUsd = 0;

    // Collapse duplicates before spending anything.
    const unique = new Map<string, AssetRequirement>();
    for (const req of requirements) {
      const fp = requirementFingerprint(req);
      if (!unique.has(fp)) unique.set(fp, req);
    }

    for (const [fingerprint, requirement] of unique) {
      const outcome = await this.resolveOne(
        requirement,
        {
          allowGeneration: options.allowGeneration ?? true,
          budgetRemainingUsd: budgetRemaining,
          podcastId: options.podcastId,
          userId: options.userId,
        },
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS
      );

      outcomes.set(fingerprint, outcome);

      if (outcome.asset) {
        totalCostUsd += outcome.asset.costUsd;
        budgetRemaining = Math.max(0, budgetRemaining - outcome.asset.costUsd);
        if (outcome.asset.cached) cacheHits++;
        else generated++;
      }
    }

    const resolved = [...outcomes.values()].filter((o) => o.asset !== null).length;

    const result: ResolveManyResult = {
      outcomes,
      resolved,
      unresolved: outcomes.size - resolved,
      cacheHits,
      generated,
      totalCostUsd: round4(totalCostUsd),
      totalMs: Date.now() - startedAt,
    };

    logger.info('[AssetResolver] Pass complete', {
      requested: requirements.length,
      unique: unique.size,
      resolved: result.resolved,
      unresolved: result.unresolved,
      cacheHits,
      generated,
      costUsd: result.totalCostUsd,
      ms: result.totalMs,
    });

    return result;
  }

  /**
   * Convenience lookup: given a batch result and a requirement, get the asset.
   * Keeps fingerprint arithmetic out of caller code.
   */
  static pick(
    result: ResolveManyResult,
    requirement: AssetRequirement
  ): ResolvedAsset | null {
    return result.outcomes.get(requirementFingerprint(requirement))?.asset ?? null;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async resolveOne(
    requirement: AssetRequirement,
    base: Omit<ResolveContext, 'signal'>,
    timeoutMs: number
  ): Promise<ResolutionOutcome> {
    const fingerprint = requirementFingerprint(requirement);
    const attempts: ResolutionAttempt[] = [];

    // ── 1. Registry cache ──────────────────────────────────────────────────
    const cacheStart = Date.now();
    const cached = await this.registry.findByFingerprint(fingerprint);
    if (cached) {
      attempts.push({
        provider: 'registry-cache',
        outcome: 'hit',
        ms: Date.now() - cacheStart,
      });
      // Fire-and-forget: reuse counting must never delay a render.
      void this.registry.incrementUse(cached.assetId);
      return {
        requirement,
        fingerprint,
        asset: fromProvenance(cached),
        attempts,
      };
    }
    attempts.push({
      provider: 'registry-cache',
      outcome: 'miss',
      ms: Date.now() - cacheStart,
    });

    // ── 2. Providers, cheapest-first ───────────────────────────────────────
    let budgetRemaining = base.budgetRemainingUsd;

    for (const provider of this.providers) {
      if (!provider.supports.includes(requirement.kind)) continue;
      if (!provider.canResolve(requirement)) continue;

      if (provider.isGenerative && !base.allowGeneration) {
        attempts.push({ provider: provider.name, outcome: 'skipped_generation', ms: 0 });
        continue;
      }
      if (provider.isGenerative && provider.estimatedCostUsd > budgetRemaining) {
        attempts.push({ provider: provider.name, outcome: 'skipped_budget', ms: 0 });
        continue;
      }

      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const asset = await provider.resolve(requirement, {
          ...base,
          budgetRemainingUsd: budgetRemaining,
          signal: controller.signal,
        });

        if (!asset) {
          attempts.push({
            provider: provider.name,
            outcome: 'miss',
            ms: Date.now() - started,
          });
          continue;
        }

        const normalised: ResolvedAsset = {
          ...asset,
          confidence: normaliseConfidence(asset.confidence),
        };

        attempts.push({
          provider: provider.name,
          outcome: 'hit',
          ms: Date.now() - started,
        });

        // Persist provenance so the next identical requirement is a cache hit.
        if (!normalised.cached) {
          await this.registry.register(toProvenance(normalised, requirement, fingerprint));
        }

        budgetRemaining = Math.max(0, budgetRemaining - normalised.costUsd);
        return { requirement, fingerprint, asset: normalised, attempts };
      } catch (error) {
        // A provider contract violation (it threw) must not break the pass.
        attempts.push({
          provider: provider.name,
          outcome: 'error',
          ms: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
        });
        logger.warn('[AssetResolver] Provider threw', {
          provider: provider.name,
          kind: requirement.kind,
          category: requirement.category,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        clearTimeout(timer);
      }
    }

    // Nothing could satisfy it — the renderer omits this layer.
    return { requirement, fingerprint, asset: null, attempts };
  }
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/** Registry row → resolved asset. Cache hits always cost nothing. */
export function fromProvenance(p: AssetProvenance): ResolvedAsset {
  return {
    assetId: p.assetId,
    storagePath: p.storagePath,
    durationMs: p.durationMs,
    loopable: p.loopable,
    loopStartMs: p.loopStartMs,
    loopEndMs: p.loopEndMs,
    provider: p.provider,
    providerKind: p.providerKind,
    providerModel: p.providerModel,
    prompt: p.prompt,
    licence: p.licence,
    attribution: p.attribution,
    sourceUrl: p.sourceUrl,
    checksum: p.checksum,
    bytes: p.bytes,
    // A cached asset satisfied this exact fingerprint by definition, but it was
    // originally accepted at some confidence we no longer know. Report 0.95
    // rather than 1.0 so a fresh exact match still ranks above a cache hit.
    confidence: 0.95,
    cached: true,
    costUsd: 0,
  };
}

/** Resolved asset + the requirement it satisfied → registry row. */
export function toProvenance(
  asset: ResolvedAsset,
  requirement: AssetRequirement,
  fingerprint: string
): AssetProvenance {
  return {
    assetId: asset.assetId,
    kind: requirement.kind,
    providerKind: asset.providerKind,
    provider: asset.provider,
    providerModel: asset.providerModel,
    prompt: asset.prompt,
    fingerprint,
    category: requirement.category,
    emotion: requirement.emotion,
    genre: requirement.genre,
    intensity: requirement.intensity,
    durationMs: asset.durationMs,
    loopable: asset.loopable,
    loopStartMs: asset.loopStartMs,
    loopEndMs: asset.loopEndMs,
    storagePath: asset.storagePath,
    checksum: asset.checksum,
    bytes: asset.bytes,
    licence: asset.licence,
    attribution: asset.attribution,
    sourceUrl: asset.sourceUrl,
    createdAt: Date.now(),
    useCount: 1,
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** Shared instance. Providers are registered by `registerDefaultProviders()`. */
export const assetResolver = new AssetResolver();

/**
 * CatalogueProvider — serves the existing `config/audioAssetCatalogue` through
 * the provider interface.
 *
 * This is what makes the abstraction non-disruptive: whatever is already in the
 * catalogue keeps being used, for free, with no generation, and it always wins
 * over a paid provider because it is non-generative and costs nothing.
 *
 * Scoring is graded rather than boolean so the resolver can tell an exact match
 * from a desperate substitution, and the inspector can surface that as a
 * confidence number before anyone listens to a render.
 */

import type {
  IAudioAssetProvider,
  ResolveContext,
  ResolvedAsset,
} from '../IAudioAssetProvider';
import type { AssetKind } from '../../director/schema/common.schema';
import type { AssetRequirement } from '../../director/schema/requirement.schema';
import type { AssetManifest } from '../../../services/media/assets/AssetManifest';
import type { AssetEntry } from '../../../services/media/assets/manifest.schema';

/** Below this we would rather emit nothing than the wrong atmosphere. */
const MIN_ACCEPTABLE_CONFIDENCE = 0.35;

export class CatalogueProvider implements IAudioAssetProvider {
  readonly name = 'builtin-catalogue';
  readonly providerKind = 'builtin' as const;
  readonly supports: readonly AssetKind[] = ['music', 'ambience', 'sfx', 'stinger'];
  readonly isGenerative = false;
  readonly estimatedCostUsd = 0;

  constructor(private readonly manifest: AssetManifest) {}

  canResolve(requirement: AssetRequirement): boolean {
    // Cheap synchronous check — is there anything of this kind at all?
    return this.manifest.list(requirement.kind).length > 0;
  }

  async resolve(
    requirement: AssetRequirement,
    _context: ResolveContext
  ): Promise<ResolvedAsset | null> {
    const candidates = this.candidatesFor(requirement);
    if (candidates.length === 0) return null;

    let best: { entry: AssetEntry; score: number } | null = null;
    for (const entry of candidates) {
      const score = scoreEntry(entry, requirement);
      if (!best || score > best.score) best = { entry, score };
    }

    if (!best || best.score < MIN_ACCEPTABLE_CONFIDENCE) return null;

    const entry = best.entry;
    return {
      assetId: entry.id,
      storagePath: this.manifest.storagePath(entry),
      durationMs: entry.durationMs,
      loopable: entry.loopable,
      loopStartMs: entry.loopStartMs,
      loopEndMs: entry.loopEndMs,
      provider: this.name,
      providerKind: this.providerKind,
      licence: entry.licence,
      attribution: entry.attribution,
      sourceUrl: entry.sourceUrl,
      confidence: best.score,
      // Catalogue entries pre-exist, but they are not registry cache hits — the
      // resolver still records provenance so the fingerprint resolves next time.
      cached: false,
      costUsd: 0,
    };
  }

  /** Narrow to the plausible set before scoring, to keep scoring cheap. */
  private candidatesFor(requirement: AssetRequirement): AssetEntry[] {
    switch (requirement.kind) {
      case 'music':
      case 'stinger': {
        const exact = this.manifest.findMusic({
          category: requirement.category,
          intensity: requirement.intensity,
          loopableOnly: false,
        });
        // Fall back to the whole music pool so a sparse catalogue can still
        // contribute something scored honestly low.
        return exact.length > 0 ? exact : this.manifest.list('music');
      }
      case 'ambience': {
        const exact = this.manifest.findAmbience({
          environment: requirement.category,
          layerRole: requirement.layerRole,
        });
        return exact.length > 0 ? exact : this.manifest.list('ambience');
      }
      case 'sfx': {
        const exact = this.manifest.findSFX({ effectCategory: requirement.category });
        return exact.length > 0 ? exact : [];
      }
      default:
        return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Scoring (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Grade how well a catalogue entry satisfies a requirement, 0..1.
 *
 * Category match dominates because a wrong category is a wrong *meaning* —
 * suspense music under a joyful scene is worse than slightly-off intensity.
 */
export function scoreEntry(entry: AssetEntry, requirement: AssetRequirement): number {
  let score = 0;

  // ── Category: 0.55 of the total ──
  const wantedCategory = requirement.category.toLowerCase();
  const entryCategory = (
    requirement.kind === 'ambience'
      ? entry.environment
      : requirement.kind === 'sfx'
        ? entry.effectCategory
        : entry.category
  )?.toLowerCase();

  if (entryCategory && entryCategory === wantedCategory) {
    score += 0.55;
  } else if (entryCategory && entry.tags.some((t) => t.toLowerCase() === wantedCategory)) {
    // Tagged as related — usable, clearly weaker.
    score += 0.3;
  } else {
    score += 0.05;
  }

  // ── Intensity: 0.2 ──
  if (requirement.intensity != null && entry.intensity != null) {
    score += 0.2 * (1 - Math.abs(entry.intensity - requirement.intensity));
  } else {
    score += 0.1; // unknown — neutral credit
  }

  // ── Loopability: 0.15. A hard requirement when the layer must tile. ──
  if (requirement.loopable) {
    score += entry.loopable ? 0.15 : 0;
  } else {
    score += 0.15;
  }

  // ── Layer role (ambience): 0.05 ──
  if (requirement.layerRole) {
    score += entry.layerRole === requirement.layerRole ? 0.05 : 0;
  } else {
    score += 0.05;
  }

  // ── Tempo (music): 0.05 ──
  if (requirement.tempo) {
    score += entry.tempo === requirement.tempo ? 0.05 : 0;
  } else {
    score += 0.05;
  }

  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

/**
 * Non-generative library providers: licensed catalogues and CC0 collections.
 *
 * These are the providers that make the abstraction worth having. They are
 * IMPLEMENTED but INERT: each resolves against an index supplied at construction
 * time, and with no index they return null and the resolver falls through. So
 * they cost nothing today and become live the moment an index is provided —
 * no changes to the Director, the timeline, or the renderer.
 *
 * Both share `IndexedLibraryProvider` because the only real difference between a
 * licensed library and a CC0 collection is licence metadata and cost. Duplicating
 * the matching logic would guarantee the two drift apart.
 *
 * Why CC0 outranks generation for SFX: a real recording of a door is a door. A
 * text-to-music model asked for a door produces a musical impression of one.
 * Registering CC0 as non-generative and free means the resolver always prefers
 * it, which is the correct outcome without any special-casing.
 */

import type {
  IAudioAssetProvider,
  ResolveContext,
  ResolvedAsset,
} from '../IAudioAssetProvider';
import type { AssetKind } from '../../director/schema/common.schema';
import type { AssetRequirement } from '../../director/schema/requirement.schema';

// ---------------------------------------------------------------------------
// Index entry
// ---------------------------------------------------------------------------

/**
 * One track in an external library. Intentionally minimal — this is the shape a
 * vendor CSV or a Freesound query result reduces to, and keeping it small means
 * onboarding a new library is a mapping function, not a schema migration.
 */
export interface LibraryTrack {
  assetId: string;
  kind: AssetKind;
  storagePath: string;
  durationMs: number;
  loopable: boolean;
  loopStartMs?: number;
  loopEndMs?: number;

  /** MusicCategory / LocationId / SFXCategory depending on kind. */
  category: string;
  emotion?: string;
  genre?: string;
  /** 0..1 */
  intensity?: number;
  tempo?: string;
  layerRole?: string;
  tags?: string[];

  licence: string;
  attribution?: string;
  sourceUrl?: string;
}

export interface IndexedLibraryOptions {
  name: string;
  providerKind: 'licensed' | 'cc0';
  supports: readonly AssetKind[];
  tracks?: LibraryTrack[];
  /**
   * Per-resolution cost. Non-zero for a per-download licensed library; 0 for a
   * flat-fee subscription or CC0. Only affects provider ordering.
   */
  costUsd?: number;
  /** Reject matches weaker than this rather than serving the wrong mood. */
  minConfidence?: number;
}

// ---------------------------------------------------------------------------
// Shared implementation
// ---------------------------------------------------------------------------

export class IndexedLibraryProvider implements IAudioAssetProvider {
  readonly name: string;
  readonly providerKind: 'licensed' | 'cc0';
  readonly supports: readonly AssetKind[];
  /** Library lookups never create anything, so they are always tried first. */
  readonly isGenerative = false;
  readonly estimatedCostUsd: number;

  private readonly byKind = new Map<AssetKind, LibraryTrack[]>();
  private readonly minConfidence: number;

  constructor(options: IndexedLibraryOptions) {
    this.name = options.name;
    this.providerKind = options.providerKind;
    this.supports = options.supports;
    this.estimatedCostUsd = options.costUsd ?? 0;
    this.minConfidence = options.minConfidence ?? 0.4;

    for (const track of options.tracks ?? []) {
      const list = this.byKind.get(track.kind) ?? [];
      list.push(track);
      this.byKind.set(track.kind, list);
    }
  }

  /** Number of indexed tracks — surfaced by the inspector's provider status. */
  get size(): number {
    let total = 0;
    for (const list of this.byKind.values()) total += list.length;
    return total;
  }

  canResolve(requirement: AssetRequirement): boolean {
    if (!this.supports.includes(requirement.kind)) return false;
    return (this.byKind.get(requirement.kind)?.length ?? 0) > 0;
  }

  async resolve(
    requirement: AssetRequirement,
    _context: ResolveContext
  ): Promise<ResolvedAsset | null> {
    const candidates = this.byKind.get(requirement.kind) ?? [];
    if (candidates.length === 0) return null;

    let best: { track: LibraryTrack; score: number } | null = null;
    for (const track of candidates) {
      const score = scoreTrack(track, requirement);
      if (!best || score > best.score) best = { track, score };
    }
    if (!best || best.score < this.minConfidence) return null;

    const t = best.track;
    return {
      assetId: t.assetId,
      storagePath: t.storagePath,
      durationMs: t.durationMs,
      loopable: t.loopable,
      loopStartMs: t.loopStartMs,
      loopEndMs: t.loopEndMs,
      provider: this.name,
      providerKind: this.providerKind,
      licence: t.licence,
      attribution: t.attribution,
      sourceUrl: t.sourceUrl,
      confidence: best.score,
      cached: false,
      costUsd: this.estimatedCostUsd,
    };
  }
}

// ---------------------------------------------------------------------------
// Scoring (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Grade a library track against a requirement, 0..1.
 *
 * Weighting mirrors CatalogueProvider.scoreEntry so a licensed match and a
 * catalogue match are directly comparable — otherwise the resolver would be
 * choosing between numbers that mean different things.
 */
export function scoreTrack(track: LibraryTrack, requirement: AssetRequirement): number {
  let score = 0;

  // Category — 0.5
  const wanted = requirement.category.toLowerCase();
  if (track.category.toLowerCase() === wanted) score += 0.5;
  else if ((track.tags ?? []).some((t) => t.toLowerCase() === wanted)) score += 0.28;
  else score += 0.04;

  // Emotion — 0.15. A library that labels emotion is more trustworthy than one
  // that only labels genre, so an exact emotion hit is worth real weight.
  if (requirement.emotion && track.emotion) {
    score += track.emotion === requirement.emotion ? 0.15 : 0.02;
  } else {
    score += 0.08;
  }

  // Intensity — 0.15
  if (requirement.intensity != null && track.intensity != null) {
    score += 0.15 * (1 - Math.abs(track.intensity - requirement.intensity));
  } else {
    score += 0.07;
  }

  // Loopability — 0.12, hard when required
  if (requirement.loopable) score += track.loopable ? 0.12 : 0;
  else score += 0.12;

  // Layer role — 0.04
  if (requirement.layerRole) {
    score += track.layerRole === requirement.layerRole ? 0.04 : 0;
  } else score += 0.04;

  // Tempo — 0.04
  if (requirement.tempo) score += track.tempo === requirement.tempo ? 0.04 : 0;
  else score += 0.04;

  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

// ---------------------------------------------------------------------------
// Concrete providers
// ---------------------------------------------------------------------------

/**
 * Commercial subscription library (Artlist / Epidemic Sound / Musicbed class).
 * Zero marginal cost under a flat-fee subscription, which is why it outranks
 * generation on price as well as on quality.
 */
export class LicensedMusicProvider extends IndexedLibraryProvider {
  constructor(tracks: LibraryTrack[] = []) {
    super({
      name: 'licensed-music',
      providerKind: 'licensed',
      supports: ['music', 'stinger'],
      tracks,
      costUsd: 0,
      // Held higher than the catalogue's floor: paying for a library and then
      // accepting a poor match is the worst of both worlds.
      minConfidence: 0.5,
    });
  }
}

/** Public-domain / CC0 music (Free Music Archive, Pixabay, Incompetech). */
export class CC0MusicProvider extends IndexedLibraryProvider {
  constructor(tracks: LibraryTrack[] = []) {
    super({
      name: 'cc0-music',
      providerKind: 'cc0',
      supports: ['music', 'stinger'],
      tracks,
      costUsd: 0,
      minConfidence: 0.45,
    });
  }
}

/**
 * CC0 sound effects (Freesound CC0 subset, BBC Sound Effects).
 * The strongest option for SFX by a wide margin — real recordings.
 */
export class CC0SoundProvider extends IndexedLibraryProvider {
  constructor(tracks: LibraryTrack[] = []) {
    super({
      name: 'cc0-sound',
      providerKind: 'cc0',
      supports: ['ambience', 'sfx'],
      tracks,
      costUsd: 0,
      minConfidence: 0.4,
    });
  }
}

/** Commercial SFX library (Soundly / Boom Library class). */
export class LicensedSFXProvider extends IndexedLibraryProvider {
  constructor(tracks: LibraryTrack[] = []) {
    super({
      name: 'licensed-sfx',
      providerKind: 'licensed',
      supports: ['sfx', 'ambience'],
      tracks,
      costUsd: 0,
      minConfidence: 0.5,
    });
  }
}

/**
 * Ambience-only library. Ambience is often sourced separately from both music
 * and SFX (field-recording specialists), so it gets its own provider rather than
 * being folded into one of the others.
 */
export class AmbienceProvider extends IndexedLibraryProvider {
  constructor(tracks: LibraryTrack[] = []) {
    super({
      name: 'ambience-library',
      providerKind: 'cc0',
      supports: ['ambience'],
      tracks,
      costUsd: 0,
      minConfidence: 0.4,
    });
  }
}

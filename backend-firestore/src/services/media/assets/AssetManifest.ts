/**
 * AssetManifest — in-memory index over the asset catalogue.
 *
 * Phase A scope: PURE. No GCS, no filesystem, no network. It answers "does this
 * asset exist and what are its properties" from a catalogue object handed to it.
 * `AssetLibrary` (Phase E) will wrap this with GCS fetching and disk caching.
 *
 * Keeping it pure means every planner in Phase C can be unit-tested against a
 * fixture catalogue with no I/O and no mocks.
 */

import {
  AssetCatalogueSchema,
  EMPTY_CATALOGUE,
  type AssetCatalogue,
  type AssetEntry,
} from './manifest.schema';
import type { AssetKind, AssetRef } from '../../../core/director/schema/common.schema';

export interface ManifestLoadResult {
  manifest: AssetManifest;
  /** Shape errors found while parsing. Empty on success. */
  errors: string[];
}

export interface ManifestStats {
  total: number;
  byKind: Record<AssetKind, number>;
  loopable: number;
  /** Ids appearing more than once — a catalogue authoring bug. */
  duplicateIds: string[];
  /** Licences present, for the compliance report. */
  licences: string[];
}

export class AssetManifest {
  private readonly byKindAndId = new Map<string, AssetEntry>();
  private readonly byKind = new Map<AssetKind, AssetEntry[]>();
  private readonly duplicates: string[] = [];

  constructor(private readonly catalogue: AssetCatalogue = EMPTY_CATALOGUE) {
    for (const entry of catalogue.assets) {
      const key = AssetManifest.key(entry.kind, entry.id);
      if (this.byKindAndId.has(key)) {
        this.duplicates.push(entry.id);
        continue; // first wins, deterministic
      }
      this.byKindAndId.set(key, entry);
      const list = this.byKind.get(entry.kind) ?? [];
      list.push(entry);
      this.byKind.set(entry.kind, list);
    }
  }

  // ── Construction ────────────────────────────────────────────────────────

  /**
   * Build from an untrusted object (parsed JSON). Never throws — an invalid
   * catalogue yields an empty manifest plus errors, so the render degrades
   * rather than crashing.
   */
  static from(input: unknown): ManifestLoadResult {
    const parsed = AssetCatalogueSchema.safeParse(input);
    if (!parsed.success) {
      return {
        manifest: new AssetManifest(EMPTY_CATALOGUE),
        errors: parsed.error.issues.map(
          (i) => `${i.path.join('.') || '(root)'}: ${i.message}`
        ),
      };
    }
    return { manifest: new AssetManifest(parsed.data), errors: [] };
  }

  // ── Lookup ──────────────────────────────────────────────────────────────

  /** Synchronous membership check. No I/O. */
  has(kind: AssetKind, id: string): boolean {
    return this.byKindAndId.has(AssetManifest.key(kind, id));
  }

  get(kind: AssetKind, id: string): AssetEntry | null {
    return this.byKindAndId.get(AssetManifest.key(kind, id)) ?? null;
  }

  /** All entries of a kind, in catalogue order. */
  list(kind: AssetKind): AssetEntry[] {
    return [...(this.byKind.get(kind) ?? [])];
  }

  /** Full GCS object path for an entry. */
  storagePath(entry: AssetEntry): string {
    const root = this.catalogue.root.replace(/\/+$/, '');
    const rel = entry.path.replace(/^\/+/, '');
    return `${root}/${rel}`;
  }

  // ── Validation ──────────────────────────────────────────────────────────

  /**
   * Returns only the refs NOT present in the manifest. An empty array means
   * every reference in a timeline is resolvable.
   */
  validateRefs(refs: AssetRef[]): AssetRef[] {
    return refs.filter((r) => !this.has(r.kind, r.id));
  }

  // ── Selection helpers used by Phase C/E planners ─────────────────────────

  /**
   * Music candidates for a category, optionally narrowed by tempo, ordered by
   * closeness to the requested intensity. Empty array when nothing matches —
   * callers must handle that (music is optional).
   */
  findMusic(opts: {
    category: string;
    intensity?: number;
    tempo?: string;
    loopableOnly?: boolean;
  }): AssetEntry[] {
    const wanted = opts.intensity ?? 0.5;
    return this.list('music')
      .filter((a) => a.category === opts.category)
      .filter((a) => (opts.tempo ? a.tempo === opts.tempo : true))
      .filter((a) => (opts.loopableOnly ? a.loopable : true))
      .sort(
        (a, b) =>
          Math.abs((a.intensity ?? 0.5) - wanted) -
          Math.abs((b.intensity ?? 0.5) - wanted)
      );
  }

  /** Ambience candidates for an environment, optionally for one layer role. */
  findAmbience(opts: { environment: string; layerRole?: string }): AssetEntry[] {
    return this.list('ambience')
      .filter((a) => a.environment === opts.environment)
      .filter((a) => (opts.layerRole ? a.layerRole === opts.layerRole : true));
  }

  /** SFX candidates for an effect category. */
  findSFX(opts: { effectCategory: string }): AssetEntry[] {
    return this.list('sfx').filter((a) => a.effectCategory === opts.effectCategory);
  }

  // ── Diagnostics ─────────────────────────────────────────────────────────

  stats(): ManifestStats {
    const byKind = { music: 0, ambience: 0, sfx: 0, stinger: 0 } as Record<
      AssetKind,
      number
    >;
    let loopable = 0;
    const licences = new Set<string>();

    for (const entry of this.byKindAndId.values()) {
      byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
      if (entry.loopable) loopable++;
      licences.add(entry.licence);
    }

    return {
      total: this.byKindAndId.size,
      byKind,
      loopable,
      duplicateIds: [...this.duplicates],
      licences: [...licences].sort(),
    };
  }

  /** True when no assets are loaded — callers should skip audio layering. */
  isEmpty(): boolean {
    return this.byKindAndId.size === 0;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private static key(kind: AssetKind, id: string): string {
    return `${kind}:${id}`;
  }
}

/** Shared empty manifest so callers never need a null check. */
export const emptyAssetManifest = new AssetManifest(EMPTY_CATALOGUE);

/**
 * AssetRegistry — the single source of truth for "where did this audio come from".
 *
 * Two jobs:
 *   1. PROVENANCE. Provider, model, prompt, licence, checksum and storage path
 *      live here — deliberately NOT on the MasterTimeline. A timeline holds only
 *      an opaque `assetId`, which is what stops it becoming provider-specific.
 *      Swap Lyria for a licensed library and stored timelines stay valid.
 *   2. CACHE. Keyed by requirement fingerprint, so an identical semantic request
 *      reuses an existing asset instead of paying to generate it again. Without
 *      this, every render of every episode would re-bill for near-identical beds.
 *
 * Reads validate on the way out; a corrupt document is treated as a cache miss
 * rather than returned as a malformed asset.
 */

import { db } from '../../config/firebase';
import { logger } from '../../utils/logger';
import {
  AssetProvenanceSchema,
  type AssetProvenance,
} from '../director/schema/requirement.schema';
import type { AssetKind } from '../director/schema/common.schema';

export interface RegistryStats {
  total: number;
  byKind: Record<string, number>;
  byProvider: Record<string, number>;
  byLicence: Record<string, number>;
  totalDurationMs: number;
  totalUseCount: number;
}

export class AssetRegistry {
  private readonly collection = db.collection('audio_asset_registry');

  /**
   * In-process memo so resolving 40 music events in one render doesn't issue 40
   * identical Firestore reads. Scoped per instance and never invalidated —
   * assets are immutable once registered, so a stale entry is impossible.
   */
  private readonly memo = new Map<string, AssetProvenance | null>();

  // ── Cache lookup ─────────────────────────────────────────────────────────

  /**
   * Find an existing asset satisfying a requirement fingerprint.
   *
   * Returns the most-reused match when several exist: a frequently-used asset
   * is the one already warm in the CDN/disk cache, so preferring it reduces
   * both latency and egress.
   */
  async findByFingerprint(fingerprint: string): Promise<AssetProvenance | null> {
    if (this.memo.has(fingerprint)) return this.memo.get(fingerprint) ?? null;

    let found: AssetProvenance | null = null;
    try {
      const snap = await this.collection
        .where('fingerprint', '==', fingerprint)
        .orderBy('useCount', 'desc')
        .limit(1)
        .get();

      if (!snap.empty) {
        found = this.parse(snap.docs[0].data(), snap.docs[0].id);
      }
    } catch (error) {
      // A missing composite index or transient outage must degrade to a cache
      // miss, never break a render.
      logger.warn('[AssetRegistry] Fingerprint lookup failed', {
        fingerprint,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    this.memo.set(fingerprint, found);
    return found;
  }

  /** Direct lookup by opaque assetId — used by the renderer and the inspector. */
  async get(assetId: string): Promise<AssetProvenance | null> {
    try {
      const doc = await this.collection.doc(assetId).get();
      if (!doc.exists) return null;
      return this.parse(doc.data(), doc.id);
    } catch (error) {
      logger.warn('[AssetRegistry] Get failed', {
        assetId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /** Batch lookup, for the inspector rendering a whole timeline's provenance. */
  async getMany(assetIds: string[]): Promise<Map<string, AssetProvenance>> {
    const out = new Map<string, AssetProvenance>();
    const unique = [...new Set(assetIds.filter(Boolean))];
    if (unique.length === 0) return out;

    // Firestore getAll caps at 300 refs per call in practice; chunk to be safe.
    const CHUNK = 100;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const slice = unique.slice(i, i + CHUNK);
      try {
        const refs = slice.map((id) => this.collection.doc(id));
        const docs = await db.getAll(...refs);
        for (const doc of docs) {
          if (!doc.exists) continue;
          const parsed = this.parse(doc.data(), doc.id);
          if (parsed) out.set(doc.id, parsed);
        }
      } catch (error) {
        logger.warn('[AssetRegistry] Batch get failed', {
          count: slice.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return out;
  }

  // ── Writes ───────────────────────────────────────────────────────────────

  /**
   * Record a newly-obtained asset. Idempotent on assetId, so a retried
   * generation cannot create a duplicate registry row.
   */
  async register(provenance: AssetProvenance): Promise<void> {
    const parsed = AssetProvenanceSchema.safeParse(provenance);
    if (!parsed.success) {
      // Refuse to persist provenance we cannot trust — an asset without a
      // recorded licence is the legal risk this registry exists to prevent.
      logger.error('[AssetRegistry] Refusing to register invalid provenance', {
        assetId: provenance?.assetId,
        issues: parsed.error.issues.slice(0, 3).map((i) => i.message),
      });
      return;
    }

    try {
      const sanitized = JSON.parse(JSON.stringify(parsed.data));
      await this.collection.doc(parsed.data.assetId).set(sanitized, { merge: true });
      this.memo.set(parsed.data.fingerprint, parsed.data);
      logger.info('[AssetRegistry] Registered asset', {
        assetId: parsed.data.assetId,
        provider: parsed.data.provider,
        kind: parsed.data.kind,
        licence: parsed.data.licence,
      });
    } catch (error) {
      logger.error('[AssetRegistry] Register failed', {
        assetId: parsed.data.assetId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Bump reuse count. Fire-and-forget by design: a failed counter update must
   * never fail a render, and the count is only used for cache preference and
   * pruning heuristics.
   */
  async incrementUse(assetId: string): Promise<void> {
    try {
      const { FieldValue } = await import('firebase-admin/firestore');
      await this.collection.doc(assetId).update({
        useCount: FieldValue.increment(1),
        lastUsedAt: Date.now(),
      });
    } catch {
      // Intentionally silent — see above.
    }
  }

  // ── Diagnostics ──────────────────────────────────────────────────────────

  /** Everything of one kind. Used by the library generator to report coverage. */
  async listByKind(kind: AssetKind, limit = 500): Promise<AssetProvenance[]> {
    try {
      const snap = await this.collection
        .where('kind', '==', kind)
        .limit(limit)
        .get();
      return snap.docs
        .map((d) => this.parse(d.data(), d.id))
        .filter((p): p is AssetProvenance => p !== null);
    } catch (error) {
      logger.warn('[AssetRegistry] listByKind failed', {
        kind,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  async stats(): Promise<RegistryStats> {
    const empty: RegistryStats = {
      total: 0,
      byKind: {},
      byProvider: {},
      byLicence: {},
      totalDurationMs: 0,
      totalUseCount: 0,
    };

    try {
      const snap = await this.collection.limit(2000).get();
      const out = { ...empty, byKind: {}, byProvider: {}, byLicence: {} } as RegistryStats;
      for (const doc of snap.docs) {
        const p = this.parse(doc.data(), doc.id);
        if (!p) continue;
        out.total++;
        out.byKind[p.kind] = (out.byKind[p.kind] ?? 0) + 1;
        out.byProvider[p.provider] = (out.byProvider[p.provider] ?? 0) + 1;
        out.byLicence[p.licence] = (out.byLicence[p.licence] ?? 0) + 1;
        out.totalDurationMs += p.durationMs;
        out.totalUseCount += p.useCount;
      }
      return out;
    } catch (error) {
      logger.warn('[AssetRegistry] stats failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return empty;
    }
  }

  /** Drop the in-process memo. Tests and long-lived workers use this. */
  clearMemo(): void {
    this.memo.clear();
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private parse(data: unknown, id: string): AssetProvenance | null {
    const parsed = AssetProvenanceSchema.safeParse(data);
    if (!parsed.success) {
      logger.warn('[AssetRegistry] Stored provenance failed validation', {
        assetId: id,
        issues: parsed.error.issues.slice(0, 2).map((i) => i.message),
      });
      return null;
    }
    return parsed.data;
  }
}

export const assetRegistry = new AssetRegistry();

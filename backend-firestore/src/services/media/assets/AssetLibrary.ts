/**
 * AssetLibrary — resolves catalogue entries to playable local files.
 *
 * Wraps the pure `AssetManifest` with GCS download and an on-disk cache. Assets
 * are STATIC and shared across all users, so the cache key is just the asset id
 * and a warm worker never re-downloads.
 *
 * Failure policy, and the reason this class exists at all: `resolve()` returns
 * `null` instead of throwing. A missing bed means the renderer omits that layer;
 * a podcast without music is acceptable, a failed podcast is not.
 *
 * Concurrency: parallel `resolve()` calls for the same id share ONE download via
 * an in-flight promise map. Without that, a 6-scene episode requesting the same
 * bed would trigger six simultaneous downloads of the same file.
 */

import fs from 'fs';
import path from 'path';
import { getStorage } from 'firebase-admin/storage';
import { logger } from '../../../utils/logger';
import { AssetManifest, emptyAssetManifest } from './AssetManifest';
import { AssetCatalogueSchema, type AssetEntry } from './manifest.schema';
import type { IAssetLibrary, ResolvedAsset } from '../../../core/director/interfaces';
import type { AssetKind, AssetRef } from '../../../core/director/schema/common.schema';

/** Firestore document holding the catalogue. */
const CATALOGUE_COLLECTION = 'config';
const CATALOGUE_DOC = 'audioAssetCatalogue';

/** Catalogue is re-read at most this often — it changes rarely. */
const CATALOGUE_TTL_MS = 5 * 60 * 1000;

export interface AssetLibraryOptions {
  /** Local cache root. Defaults to `<cwd>/temp/audio-assets`. */
  cacheDir?: string;
  /** Pre-loaded manifest (tests / dry runs). Skips the Firestore read. */
  manifest?: AssetManifest;
}

export class AssetLibrary implements IAssetLibrary {
  private manifest: AssetManifest;
  private manifestLoadedAt = 0;
  private readonly cacheDir: string;
  private readonly explicitManifest: boolean;

  /** id → in-flight download, so concurrent callers share one fetch. */
  private readonly inFlight = new Map<string, Promise<ResolvedAsset | null>>();
  /** id → already-resolved asset on local disk. */
  private readonly resolved = new Map<string, ResolvedAsset>();

  constructor(options: AssetLibraryOptions = {}) {
    this.cacheDir = options.cacheDir ?? path.join(process.cwd(), 'temp', 'audio-assets');
    this.manifest = options.manifest ?? emptyAssetManifest;
    this.explicitManifest = !!options.manifest;
    if (this.explicitManifest) this.manifestLoadedAt = Date.now();
  }

  // ── Manifest ────────────────────────────────────────────────────────────

  /**
   * Load (or refresh) the catalogue. Cheap and idempotent — safe to call before
   * every planning run.
   */
  async loadManifest(force = false): Promise<AssetManifest> {
    if (this.explicitManifest) return this.manifest;

    const fresh = Date.now() - this.manifestLoadedAt < CATALOGUE_TTL_MS;
    if (!force && fresh && !this.manifest.isEmpty()) return this.manifest;

    try {
      const { db } = await import('../../../config/firebase');
      const doc = await db.collection(CATALOGUE_COLLECTION).doc(CATALOGUE_DOC).get();

      if (!doc.exists) {
        // NOT a failure. The curated catalogue is optional — generated assets live
        // in `audio_asset_registry` and resolve() falls back to it. The previous
        // wording ("audio layers will be skipped") was wrong and sent debugging
        // after a catalogue that was never required.
        logger.info(
          '[AssetLibrary] No curated catalogue; resolving generated assets from the registry instead',
          { path: `${CATALOGUE_COLLECTION}/${CATALOGUE_DOC}` }
        );
        this.manifest = emptyAssetManifest;
      } else {
        const { manifest, errors } = AssetManifest.from(doc.data());
        if (errors.length > 0) {
          logger.warn('[AssetLibrary] Catalogue validation errors', {
            count: errors.length,
            sample: errors.slice(0, 3),
          });
        }
        this.manifest = manifest;
        const stats = manifest.stats();
        logger.info('[AssetLibrary] Catalogue loaded', {
          total: stats.total,
          byKind: stats.byKind,
          duplicates: stats.duplicateIds.length,
          licences: stats.licences,
        });
      }
    } catch (err: any) {
      logger.warn('[AssetLibrary] Catalogue load failed; continuing without assets', {
        error: err?.message,
      });
      this.manifest = emptyAssetManifest;
    }

    this.manifestLoadedAt = Date.now();
    return this.manifest;
  }

  /** Current manifest without triggering a load. */
  getManifest(): AssetManifest {
    return this.manifest;
  }

  // ── IAssetLibrary ───────────────────────────────────────────────────────

  has(kind: AssetKind, id: string): boolean {
    return this.manifest.has(kind, id);
  }

  validateRefs(refs: AssetRef[]): AssetRef[] {
    return this.manifest.validateRefs(refs);
  }

  /**
   * Fetch an asset to local disk and return its metadata. Returns null when the
   * asset is unknown or the download fails — never throws.
   */
  async resolve(kind: AssetKind, id: string): Promise<ResolvedAsset | null> {
    const key = `${kind}:${id}`;

    const cached = this.resolved.get(key);
    if (cached && fs.existsSync(cached.localPath)) return cached;

    // Share an in-flight download rather than starting a duplicate.
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const entry = this.manifest.get(kind, id);

    // No catalogue entry? Fall back to the asset registry.
    //
    // Generated assets (Lyria and friends) are recorded in `audio_asset_registry`
    // by the AssetResolver, NOT in the curated catalogue document. Without this
    // fallback every generated asset resolves to null and the renderer silently
    // drops the layer — which is exactly what made a fully-populated library
    // produce voice-only episodes. The registry row carries an absolute
    // storagePath, so no catalogue root arithmetic applies.
    const task = (entry ? this.download(kind, entry) : this.downloadFromRegistry(kind, id))
      .then((asset) => {
        if (asset) this.resolved.set(key, asset);
        return asset;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, task);
    return task;
  }

  /**
   * Resolve an asset that exists in the registry but not the catalogue.
   *
   * Kept separate from `download()` because the path semantics differ: catalogue
   * entries store a path RELATIVE to the catalogue root, whereas a registry row
   * stores the absolute object path.
   */
  private async downloadFromRegistry(
    kind: AssetKind,
    id: string
  ): Promise<ResolvedAsset | null> {
    try {
      const { assetRegistry } = await import('../../../core/assets/AssetRegistry');
      const provenance = await assetRegistry.get(id);

      if (!provenance) {
        logger.warn('[AssetLibrary] Unknown asset (not in catalogue or registry)', {
          kind,
          id,
        });
        return null;
      }

      const ext = path.extname(provenance.storagePath) || '.mp3';
      const safeId = id.replace(/[^a-zA-Z0-9._-]/g, '_');
      const localPath = path.join(this.cacheDir, kind, `${safeId}${ext}`);

      // Assets are immutable, so an existing non-empty file is always valid.
      if (!(fs.existsSync(localPath) && fs.statSync(localPath).size > 0)) {
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        const tempPath = `${localPath}.${process.pid}.part`;
        await getStorage()
          .bucket()
          .file(provenance.storagePath)
          .download({ destination: tempPath });
        fs.renameSync(tempPath, localPath);
        logger.info('[AssetLibrary] Cached asset from registry', {
          kind,
          id,
          storagePath: provenance.storagePath,
        });
      }

      return {
        id,
        kind,
        localPath,
        durationMs: provenance.durationMs,
        loopable: provenance.loopable,
        loopStartMs: provenance.loopStartMs,
        loopEndMs: provenance.loopEndMs,
        licence: provenance.licence,
      };
    } catch (err: any) {
      logger.warn('[AssetLibrary] Registry resolve failed; layer will be skipped', {
        kind,
        id,
        error: err?.message,
      });
      return null;
    }
  }

  /**
   * Resolve many refs at once, dropping the ones that fail. Callers get only
   * usable assets, so no downstream null checks are needed.
   */
  async resolveAll(refs: AssetRef[]): Promise<Map<string, ResolvedAsset>> {
    const out = new Map<string, ResolvedAsset>();
    const settled = await Promise.all(
      refs.map(async (ref) => ({ ref, asset: await this.resolve(ref.kind, ref.id) }))
    );
    for (const { ref, asset } of settled) {
      if (asset) out.set(`${ref.kind}:${ref.id}`, asset);
    }
    return out;
  }

  // ── Download ────────────────────────────────────────────────────────────

  private async download(
    kind: AssetKind,
    entry: AssetEntry
  ): Promise<ResolvedAsset | null> {
    const storagePath = this.manifest.storagePath(entry);
    const localPath = this.localPathFor(kind, entry);

    // Already on disk from a previous run — reuse it. Assets are immutable.
    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
      return this.toResolved(kind, entry, localPath);
    }

    try {
      fs.mkdirSync(path.dirname(localPath), { recursive: true });

      // Download to a temp name then rename, so a crashed download can never
      // leave a truncated file that a later run would treat as valid cache.
      const tempPath = `${localPath}.${process.pid}.part`;
      await getStorage().bucket().file(storagePath).download({ destination: tempPath });
      fs.renameSync(tempPath, localPath);

      logger.info('[AssetLibrary] Cached asset', { kind, id: entry.id, storagePath });
      return this.toResolved(kind, entry, localPath);
    } catch (err: any) {
      logger.warn('[AssetLibrary] Download failed; layer will be skipped', {
        kind,
        id: entry.id,
        storagePath,
        error: err?.message,
      });
      return null;
    }
  }

  private toResolved(
    kind: AssetKind,
    entry: AssetEntry,
    localPath: string
  ): ResolvedAsset {
    return {
      id: entry.id,
      kind,
      localPath,
      durationMs: entry.durationMs,
      loopable: entry.loopable,
      loopStartMs: entry.loopStartMs,
      loopEndMs: entry.loopEndMs,
      licence: entry.licence,
    };
  }

  /** Cache path. Extension preserved so ffmpeg can infer the codec. */
  private localPathFor(kind: AssetKind, entry: AssetEntry): string {
    const ext = path.extname(entry.path) || '.mp3';
    // Sanitise: an id from a catalogue must never escape the cache directory.
    const safeId = entry.id.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.cacheDir, kind, `${safeId}${ext}`);
  }

  // ── Maintenance ─────────────────────────────────────────────────────────

  /** Bytes currently held in the cache. */
  cacheStats(): { files: number; bytes: number; dir: string } {
    let files = 0;
    let bytes = 0;
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full);
        else {
          files += 1;
          bytes += stat.size;
        }
      }
    };
    walk(this.cacheDir);
    return { files, bytes, dir: this.cacheDir };
  }

  /** Drop the on-disk cache. Assets re-download on next use. */
  clearCache(): void {
    try {
      if (fs.existsSync(this.cacheDir)) {
        fs.rmSync(this.cacheDir, { recursive: true, force: true });
      }
      this.resolved.clear();
    } catch (err: any) {
      logger.warn('[AssetLibrary] Cache clear failed', { error: err?.message });
    }
  }

  /**
   * Validate a catalogue object without installing it. Used by the admin
   * endpoint before an operator saves a new catalogue.
   */
  static validateCatalogue(input: unknown): {
    valid: boolean;
    errors: string[];
    stats?: ReturnType<AssetManifest['stats']>;
  } {
    const parsed = AssetCatalogueSchema.safeParse(input);
    if (!parsed.success) {
      return {
        valid: false,
        errors: parsed.error.issues.map(
          (i) => `${i.path.join('.') || '(root)'}: ${i.message}`
        ),
      };
    }
    const manifest = new AssetManifest(parsed.data);
    const stats = manifest.stats();
    const errors: string[] = [];
    if (stats.duplicateIds.length > 0) {
      errors.push(`duplicate asset ids: ${stats.duplicateIds.join(', ')}`);
    }
    return { valid: errors.length === 0, errors, stats };
  }
}

export const assetLibrary = new AssetLibrary();

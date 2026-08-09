/**
 * SFXEngine — turns the timeline's SFX track into concrete ffmpeg inputs.
 *
 * Parallel to MusicEngine but handles discrete, one-shot sound effects with
 * precise timing synchronization.
 *
 * Key differences from music and ambience:
 *
 *   1. NO LOOPING. SFX are single-shot cues. A door slam plays once, not
 *      repeatedly. If the asset is longer than needed, it's truncated; if
 *      shorter, it plays to completion (never stretched).
 *
 *   2. PRECISE TIMING. Effects sync to specific script moments (words, line
 *      boundaries) with millisecond offsets. A cue landing 50ms BEFORE its
 *      trigger word reads as intentional; 50ms AFTER reads as a bug.
 *
 *   3. MINIMAL FADES. Unlike music beds (1-2s fades), SFX use short attacks
 *      (0-50ms to avoid clicks) and fast releases (100-200ms). The goal is
 *      percussive clarity, not smooth blending.
 *
 *   4. SYNC MODES. The Director places effects relative to script structure
 *      (on_word, after_line, before_line, absolute), but the timeline stores
 *      only absolute millisecond positions. This engine just reads those.
 */

import { logger } from '../../../utils/logger';
import type { IAssetLibrary, ResolvedAsset } from '../../../core/director/interfaces';
import type { MasterTimeline } from '../../../core/director/schema/timeline.schema';
import type {
  SFXEvent,
  SFXCategory,
  SFXSyncMode,
} from '../../../core/director/schema/audio.schema';

/** A single resolved SFX cue with render geometry. */
export interface SFXCue {
  eventId: string;
  assetId: string;
  localPath: string;
  effectCategory: SFXCategory;
  /** Absolute position on the master timeline. */
  startMs: number;
  /** How long this cue occupies (may be shorter than asset if truncated). */
  durationMs: number;
  /** Source asset length. */
  assetDurationMs: number;
  volumeDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  /** For debugging + inspector. */
  triggerWord?: string;
  triggerLineIndex?: number;
  syncMode: SFXSyncMode;
}

export interface SFXPlanResult {
  cues: SFXCue[];
  /** Effects dropped because their asset could not be resolved. */
  skipped: Array<{ eventId: string; assetId: string; reason: string }>;
  totalEffects: number;
}

export class SFXEngine {
  constructor(private readonly library: IAssetLibrary) {}

  /**
   * Resolve every SFX event on the timeline.
   *
   * Never throws. An unresolvable effect is skipped, and the mix continues
   * without it — a podcast without a door slam is fine, a failed podcast is not.
   */
  async prepare(timeline: MasterTimeline): Promise<SFXPlanResult> {
    const events = [...timeline.tracks.sfx.events].sort((a, b) => a.startMs - b.startMs);
    if (events.length === 0) {
      return { cues: [], skipped: [], totalEffects: 0 };
    }

    // Resolve all distinct SFX assets in parallel.
    const distinct = [...new Set(events.map((e) => e.assetId).filter(isPresent))];
    const resolvedById = new Map<string, ResolvedAsset>();
    await Promise.all(
      distinct.map(async (id) => {
        const asset = await this.library.resolve('sfx', id);
        if (asset) resolvedById.set(id, asset);
      })
    );

    const cues: SFXCue[] = [];
    const skipped: SFXPlanResult['skipped'] = [];

    for (const event of events) {
      if (!event.assetId) {
        skipped.push({
          eventId: event.id,
          assetId: '(unresolved)',
          reason: 'awaiting asset resolver',
        });
        continue;
      }

      const asset = resolvedById.get(event.assetId);
      if (!asset) {
        skipped.push({
          eventId: event.id,
          assetId: event.assetId,
          reason: 'asset unresolved',
        });
        continue;
      }

      cues.push(buildSFXCue(event, asset));
    }

    if (skipped.length > 0) {
      logger.warn('[SFXEngine] Some SFX cues were skipped', {
        podcastId: timeline.podcastId,
        skipped: skipped.length,
        of: events.length,
      });
    }

    return {
      cues,
      skipped,
      totalEffects: cues.length,
    };
  }

  /**
   * Which assets this timeline needs, for pre-warming the cache.
   */
  requiredAssetIds(timeline: MasterTimeline): string[] {
    return [
      ...new Set(timeline.tracks.sfx.events.map((e) => e.assetId).filter(isPresent)),
    ];
  }

  /** Warm the cache. Failures are tolerated — `prepare()` re-checks. */
  async prewarm(timeline: MasterTimeline): Promise<void> {
    await Promise.all(
      this.requiredAssetIds(timeline).map((id) =>
        this.library.resolve('sfx', id).catch(() => null)
      )
    );
  }
}

// ---------------------------------------------------------------------------
// Geometry (exported — pure and directly unit-tested)
// ---------------------------------------------------------------------------

/**
 * Build the render geometry for one SFX cue.
 *
 * SFX policy:
 *   - Play once, never loop (they're discrete events, not beds).
 *   - If asset is shorter than slot, play to completion (don't stretch).
 *   - If asset is longer than slot, truncate (mixer applies fadeOut).
 *   - Short fades: quick attack (avoid clicks), fast release (percussive).
 */
function isPresent(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function buildSFXCue(event: SFXEvent, asset: ResolvedAsset): SFXCue {
  const needed = Math.max(0, event.durationMs);
  const available = asset.durationMs;

  // SFX never loop — duration is the SHORTER of asset length or requested slot.
  const actualDuration = Math.min(needed, available);

  // Fades constrained by actual playback duration.
  const maxFade = Math.floor(actualDuration / 2);
  const fadeInMs = Math.max(0, Math.min(event.fadeInMs, maxFade));
  const fadeOutMs = Math.max(0, Math.min(event.fadeOutMs, maxFade));

  return {
    eventId: event.id,
    assetId: event.assetId ?? asset.id,
    localPath: asset.localPath,
    effectCategory: event.effectCategory,
    startMs: event.startMs,
    durationMs: actualDuration,
    assetDurationMs: asset.durationMs,
    volumeDb: event.volumeDb,
    fadeInMs,
    fadeOutMs,
    triggerWord: event.triggerWord,
    triggerLineIndex: event.triggerLineIndex,
    syncMode: event.syncMode,
  };
}

export function createSFXEngine(library: IAssetLibrary): SFXEngine {
  return new SFXEngine(library);
}

/**
 * MusicEngine — turns the timeline's music track into concrete ffmpeg inputs.
 *
 * Responsibility boundary: the MusicPlanner already DECIDED what plays and when.
 * This engine only resolves those decisions to files and computes the loop /
 * fade / crossfade geometry the mixer needs. It makes no creative choices.
 *
 * Two problems it solves that the planner cannot:
 *
 *   1. LOOPING. A 90s bed under a 6-minute scene needs a loop count, and the
 *      loop must be seamless. Assets shorter than their slot get an explicit
 *      loop plan rather than silence after the first pass.
 *
 *   2. DEGRADATION. An unresolvable asset drops that ONE cue and leaves the rest
 *      of the score intact, instead of failing the episode.
 */

import { logger } from '../../../utils/logger';
import type { AssetLibrary } from './AssetLibrary';
import type { ResolvedAsset } from '../../../core/director/interfaces';
import type { MasterTimeline } from '../../../core/director/schema/timeline.schema';
import type { MusicEvent } from '../../../core/director/schema/audio.schema';

/** A music cue resolved to a file plus its render geometry. */
export interface MusicCue {
  eventId: string;
  role: MusicEvent['role'];
  assetId: string;
  localPath: string;
  /** Absolute position on the master timeline. */
  startMs: number;
  /** How long this cue must sound for. */
  durationMs: number;
  /** Source asset length. */
  assetDurationMs: number;
  /**
   * Times to loop the source to cover `durationMs`. 1 = play once (possibly
   * truncated). Only ever > 1 for loopable assets.
   */
  loopCount: number;
  /** True when the source is shorter than the slot and cannot loop cleanly. */
  truncated: boolean;
  volumeDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  /** Overlap into the following cue. 0 only for the final cue. */
  crossfadeToNextMs: number;
  category: string;
  intensity: number;
}

export interface MusicPlanResult {
  cues: MusicCue[];
  /** Events dropped because their asset could not be resolved. */
  skipped: Array<{ eventId: string; assetId: string; reason: string }>;
  /** Total music duration, for logging. */
  totalMusicMs: number;
}

export class MusicEngine {
  constructor(private readonly library: AssetLibrary) {}

  /**
   * Resolve every music event on the timeline.
   *
   * Never throws. A fully-unresolvable track returns `{ cues: [] }`, and the
   * mixer then renders voice-only — which is exactly today's behaviour.
   */
  async prepare(timeline: MasterTimeline): Promise<MusicPlanResult> {
    const events = [...timeline.tracks.music.events].sort((a, b) => a.startMs - b.startMs);
    if (events.length === 0) {
      return { cues: [], skipped: [], totalMusicMs: 0 };
    }

    // Resolve all distinct assets in parallel — the library de-duplicates
    // concurrent requests for the same id internally.
    //
    // NOTE: this consumes the `assetId` HINT only. Events without a hint are
    // awaiting the AssetResolver, which the renderer phase will call before
    // reaching this point. They are reported as skipped rather than silently
    // dropped, so the gap is visible in the render report.
    const distinct = [...new Set(events.map((e) => e.assetId).filter(isPresent))];
    const resolvedById = new Map<string, ResolvedAsset>();
    await Promise.all(
      distinct.map(async (id) => {
        const asset = await this.library.resolve('music', id);
        if (asset) resolvedById.set(id, asset);
      })
    );

    const cues: MusicCue[] = [];
    const skipped: MusicPlanResult['skipped'] = [];

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
      cues.push(buildCue(event, asset));
    }

    if (skipped.length > 0) {
      logger.warn('[MusicEngine] Some music cues were skipped', {
        podcastId: timeline.podcastId,
        skipped: skipped.length,
        of: events.length,
      });
    }

    return {
      cues,
      skipped,
      totalMusicMs: cues.reduce((sum, c) => sum + c.durationMs, 0),
    };
  }

  /**
   * Which assets this timeline needs, for pre-warming the cache concurrently
   * with TTS (the latency optimisation in AI_DIRECTOR_ARCHITECTURE §19.2).
   */
  requiredAssetIds(timeline: MasterTimeline): string[] {
    return [
      ...new Set(timeline.tracks.music.events.map((e) => e.assetId).filter(isPresent)),
    ];
  }

  /** Warm the cache. Failures are tolerated — `prepare()` re-checks. */
  async prewarm(timeline: MasterTimeline): Promise<void> {
    await Promise.all(
      this.requiredAssetIds(timeline).map((id) =>
        this.library.resolve('music', id).catch(() => null)
      )
    );
  }
}

// ---------------------------------------------------------------------------
// Geometry (exported — pure and directly unit-tested)
// ---------------------------------------------------------------------------

/**
 * Build the render geometry for one cue.
 *
 * Loop policy:
 *   - asset covers the slot            → play once, no loop
 *   - shorter AND loopable             → loop enough times to cover it
 *   - shorter AND not loopable         → play once, mark truncated so the
 *                                        mixer can fade out instead of cutting
 */
/** Narrowing predicate — keeps the optional-assetId filters type-safe. */
function isPresent(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function buildCue(event: MusicEvent, asset: ResolvedAsset): MusicCue {
  const usable = usableLengthMs(asset);
  const needed = Math.max(0, event.durationMs);

  let loopCount = 1;
  let truncated = false;

  if (usable > 0 && needed > usable) {
    if (asset.loopable && event.loopStrategy !== 'none') {
      loopCount = Math.ceil(needed / usable);
    } else {
      truncated = true;
    }
  }

  // A fade can never exceed the audio it applies to, or ffmpeg produces silence.
  const maxFade = Math.floor(Math.min(needed, usable * loopCount) / 2);
  const fadeInMs = Math.max(0, Math.min(event.fadeInMs, maxFade));
  const fadeOutMs = Math.max(0, Math.min(event.fadeOutMs, maxFade));

  return {
    eventId: event.id,
    role: event.role,
    // buildCue is only reached with a resolved asset, so prefer the event hint
    // and fall back to the asset's own id.
    assetId: event.assetId ?? asset.id,
    localPath: asset.localPath,
    startMs: event.startMs,
    durationMs: needed,
    assetDurationMs: asset.durationMs,
    loopCount,
    truncated,
    volumeDb: event.volumeDb,
    fadeInMs,
    fadeOutMs,
    crossfadeToNextMs: event.crossfadeToNextMs,
    category: event.category,
    intensity: event.intensity,
  };
}

/**
 * Loopable length of an asset. When explicit loop points exist, only the region
 * between them tiles seamlessly — using the whole file would reintroduce the
 * intro/outro on every repetition, which is the classic audible-loop artefact.
 */
export function usableLengthMs(asset: ResolvedAsset): number {
  if (
    asset.loopable &&
    typeof asset.loopStartMs === 'number' &&
    typeof asset.loopEndMs === 'number' &&
    asset.loopEndMs > asset.loopStartMs
  ) {
    return asset.loopEndMs - asset.loopStartMs;
  }
  return asset.durationMs;
}

/** dB → linear amplitude, for ffmpeg's `volume` filter. */
export function dbToLinear(db: number): number {
  return Math.round(Math.pow(10, db / 20) * 10_000) / 10_000;
}

export function createMusicEngine(library: AssetLibrary): MusicEngine {
  return new MusicEngine(library);
}

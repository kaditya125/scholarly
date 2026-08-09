/**
 * AmbienceEngine — turns the timeline's ambience track into concrete ffmpeg inputs.
 *
 * Parallel to MusicEngine but handles multi-layer stacks. One ambience EVENT
 * contains 1-8 simultaneous LAYERS (base + texture + detail + accent), each
 * resolved independently and mixed together.
 *
 * Key differences from music:
 *
 *   1. LAYERING. An "ancient Rome marketplace" event might stack:
 *      - base: crowd murmur (continuous)
 *      - texture: metal clanging (intermittent)
 *      - detail: animal sounds (sparse)
 *      Each layer loops independently with jitter to prevent lockstep repetition.
 *
 *   2. RANDOM OFFSET JITTER. Without it, a 30s crowd loop repeats audibly.
 *      With 2-5s jitter per layer, the composite never sounds identical twice.
 *
 *   3. CONTINUOUS LOOPING. Unlike music beds (which crossfade between cues),
 *      ambience layers sustain through entire scenes. Loop counts are typically
 *      high (10-50 repetitions for a 5-minute scene with 10s source clips).
 */

import { logger } from '../../../utils/logger';
import type { IAssetLibrary, ResolvedAsset } from '../../../core/director/interfaces';
import type { MasterTimeline } from '../../../core/director/schema/timeline.schema';
import type {
  AmbienceEvent,
  AmbienceLayer,
  AmbienceLayerRole,
  AmbienceLoopBehavior,
} from '../../../core/director/schema/audio.schema';

/** A single resolved ambience layer with render geometry. */
export interface AmbienceLayerCue {
  layerId: string;
  layerRole: AmbienceLayerRole;
  assetId: string;
  localPath: string;
  /** How long this layer must sound for. */
  durationMs: number;
  /** Source asset length. */
  assetDurationMs: number;
  /** Times to loop the source. Always >= 1. */
  loopCount: number;
  volumeDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  loopBehavior: AmbienceLoopBehavior;
  /**
   * Random offset window. Each loop iteration starts at a random point within
   * [0, jitterMs] to prevent audible repetition when multiple layers stack.
   */
  jitterMs: number;
}

/** An ambience event resolved to a stack of layers. */
export interface AmbienceCue {
  eventId: string;
  environmentId: string;
  layers: AmbienceLayerCue[];
  startMs: number;
  durationMs: number;
}

export interface AmbiencePlanResult {
  cues: AmbienceCue[];
  /** Layers dropped because their asset could not be resolved. */
  skipped: Array<{
    eventId: string;
    layerId: string;
    assetId: string;
    reason: string;
  }>;
  /** Total layer count, for logging. */
  totalLayers: number;
}

export class AmbienceEngine {
  constructor(private readonly library: IAssetLibrary) {}

  /**
   * Resolve every ambience event on the timeline.
   *
   * Never throws. An event with all layers unresolved is dropped entirely; an
   * event with SOME layers resolved renders the available ones only.
   */
  async prepare(timeline: MasterTimeline): Promise<AmbiencePlanResult> {
    const events = [...timeline.tracks.ambience.events].sort(
      (a, b) => a.startMs - b.startMs
    );
    if (events.length === 0) {
      return { cues: [], skipped: [], totalLayers: 0 };
    }

    // Collect all distinct layer asset IDs across all events.
    const distinctLayerAssets = new Set<string>();
    for (const event of events) {
      for (const layer of event.layers) {
        if (layer.assetId) distinctLayerAssets.add(layer.assetId);
      }
    }

    // Resolve all assets in parallel.
    const resolvedById = new Map<string, ResolvedAsset>();
    await Promise.all(
      Array.from(distinctLayerAssets).map(async (id) => {
        const asset = await this.library.resolve('ambience', id);
        if (asset) resolvedById.set(id, asset);
      })
    );

    const cues: AmbienceCue[] = [];
    const skipped: AmbiencePlanResult['skipped'] = [];
    let totalLayers = 0;

    for (const event of events) {
      const resolvedLayers: AmbienceLayerCue[] = [];

      for (let layerIdx = 0; layerIdx < event.layers.length; layerIdx++) {
        const layer = event.layers[layerIdx];
        const layerId = `${event.id}-layer${layerIdx}`;

        if (!layer.assetId) {
          skipped.push({
            eventId: event.id,
            layerId,
            assetId: '(unresolved)',
            reason: 'awaiting asset resolver',
          });
          continue;
        }

        const asset = resolvedById.get(layer.assetId);
        if (!asset) {
          skipped.push({
            eventId: event.id,
            layerId,
            assetId: layer.assetId,
            reason: 'asset unresolved',
          });
          continue;
        }

        resolvedLayers.push(buildLayerCue(event, layer, layerId, asset));
        totalLayers++;
      }

      // Only emit the cue if at least one layer resolved. An event with zero
      // layers is silently dropped — the mix continues without that environment.
      if (resolvedLayers.length > 0) {
        cues.push({
          eventId: event.id,
          environmentId: event.environmentId,
          layers: resolvedLayers,
          startMs: event.startMs,
          durationMs: event.durationMs,
        });
      }
    }

    if (skipped.length > 0) {
      logger.warn('[AmbienceEngine] Some ambience layers were skipped', {
        podcastId: timeline.podcastId,
        skipped: skipped.length,
        resolved: totalLayers,
      });
    }

    return { cues, skipped, totalLayers };
  }

  /**
   * Which assets this timeline needs, for pre-warming the cache.
   */
  requiredAssetIds(timeline: MasterTimeline): string[] {
    const ids = new Set<string>();
    for (const event of timeline.tracks.ambience.events) {
      for (const layer of event.layers) {
        if (layer.assetId) ids.add(layer.assetId);
      }
    }
    return Array.from(ids);
  }

  /** Warm the cache. Failures are tolerated — `prepare()` re-checks. */
  async prewarm(timeline: MasterTimeline): Promise<void> {
    await Promise.all(
      this.requiredAssetIds(timeline).map((id) =>
        this.library.resolve('ambience', id).catch(() => null)
      )
    );
  }
}

// ---------------------------------------------------------------------------
// Geometry (exported — pure and directly unit-tested)
// ---------------------------------------------------------------------------

/**
 * Build the render geometry for one ambience layer.
 *
 * Loop policy:
 *   - Ambience layers ALWAYS loop (they're atmospheric beds, not one-shots).
 *   - Loop count is ceil(needed / asset), minimum 1.
 *   - Jitter defaults to 20% of asset duration (capped at 5s) to prevent
 *     audible repetition when multiple layers stack.
 */
export function buildLayerCue(
  event: AmbienceEvent,
  layer: AmbienceLayer,
  layerId: string,
  asset: ResolvedAsset
): AmbienceLayerCue {
  const needed = Math.max(0, event.durationMs);
  const usable = asset.durationMs;

  // Ambience always loops — even if the asset is longer than the slot, we
  // play it once (loopCount=1) rather than truncating mid-clip.
  const loopCount = usable > 0 ? Math.ceil(needed / usable) : 1;

  // Jitter: randomises loop start point to prevent lockstep repetition.
  // Default to 20% of asset duration, capped at 5s.
  let jitterMs = layer.jitterMs ?? Math.min(5000, Math.floor(usable * 0.2));
  if (jitterMs < 0 || !isFinite(jitterMs)) jitterMs = 0;

  // Fades can never exceed the audio they apply to.
  const maxFade = Math.floor(Math.min(needed, usable * loopCount) / 2);
  const fadeInMs = Math.max(0, Math.min(layer.fadeInMs, maxFade));
  const fadeOutMs = Math.max(0, Math.min(layer.fadeOutMs, maxFade));

  return {
    layerId,
    layerRole: layer.layerRole,
    assetId: layer.assetId ?? asset.id,
    localPath: asset.localPath,
    durationMs: needed,
    assetDurationMs: asset.durationMs,
    loopCount,
    volumeDb: layer.volumeDb,
    fadeInMs,
    fadeOutMs,
    loopBehavior: layer.loopBehavior,
    jitterMs,
  };
}

export function createAmbienceEngine(library: IAssetLibrary): AmbienceEngine {
  return new AmbienceEngine(library);
}

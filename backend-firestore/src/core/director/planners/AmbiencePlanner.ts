/**
 * AmbiencePlanner — builds layered environment stacks per scene.
 *
 * Layered rather than single-track: a believable place needs a base bed plus
 * texture and intermittent detail. One track always sounds like one track.
 *
 * Two anti-repetition mechanisms:
 *   - `random_offset` + per-layer `jitterMs` so layers restart at different
 *     points and the composite never repeats audibly
 *   - unresolvable layers are dropped rather than substituted, so a thin
 *     catalogue produces a sparse-but-clean bed instead of a wrong one
 *
 * Accessibility: when the Producer asks to reduce background, ambience is
 * suppressed entirely. Atmosphere is the first thing to sacrifice for clarity.
 */

import type { IPlanner } from '../interfaces';
import type {
  AmbienceEvent,
  AmbienceLayer,
  AmbienceLayerRole,
} from '../schema/audio.schema';
import type { Emotion } from '../schema/common.schema';
import {
  AssetRequirementSchema,
  type AssetRequirement,
} from '../schema/requirement.schema';
import type { Scene } from '../schema/scene.schema';
import type { AssetManifest } from '../../../services/media/assets/AssetManifest';
import { ambienceStackFor } from '../knowledge/ambienceMap';

export interface AmbiencePlannerInput {
  scenes: Scene[];
  manifest: AssetManifest;
  /** voiceBusGainDb + duckingDb — ambience must stay below this. */
  duckFloorDb: number;
  reduceBackground?: boolean;
  cinematicIntensity: 'subtle' | 'balanced' | 'dramatic';
}

export class AmbiencePlanner
  implements IPlanner<AmbiencePlannerInput, AmbienceEvent[]>
{
  readonly name = 'AmbiencePlanner';

  async plan(input: AmbiencePlannerInput): Promise<AmbienceEvent[]> {
    return this.fallback(input);
  }

  fallback(input: AmbiencePlannerInput): AmbienceEvent[] {
    // Accessibility ATTENUATES atmosphere; it no longer deletes it.
    //
    // This used to `return []` whenever reduceBackground was set, and because
    // ProducerDecisionEngine sets that flag for any beginner-level episode, the
    // common case for a study podcast was zero ambience — indistinguishable
    // from the feature being broken. Clarity is still protected: buildLayers()
    // drops to a single base layer and trims well below the duck floor, so
    // narration stays dominant while the scene keeps a sense of place.

    // NOT gated on catalogue contents — the Director states the environment it
    // needs and the AssetResolver obtains it. See MusicPlanner for the rationale.
    const events: AmbienceEvent[] = [];
    let cursorMs = 0;

    for (const scene of input.scenes) {
      const startMs = cursorMs;
      const durationMs = scene.estimatedDurationMs;
      cursorMs += durationMs;

      const stack = ambienceStackFor(scene.setting.location);
      if (stack.layers.length === 0) continue;

      const layers = this.buildLayers(stack.layers, input, scene);
      if (layers.length === 0) continue;

      events.push({
        id: `ambience_${scene.index}`,
        kind: 'ambience',
        // Start slightly before the scene so the fade-in is already underway
        // when the first line lands — an abrupt ambience entry is noticeable.
        startMs: Math.max(0, startMs - 500),
        durationMs: durationMs + 1000,
        sceneId: scene.id,
        priority: 10,
        environmentId: scene.setting.location,
        layers,
      });
    }

    return events;
  }

  private buildLayers(
    specs: ReturnType<typeof ambienceStackFor>['layers'],
    input: AmbiencePlannerInput,
    scene: Scene
  ): AmbienceLayer[] {
    // Ambience is the quietest bed in the mix, but it was TOO quiet to perceive:
    // measured at -27 to -32 dB static, then ducked again by the mixer's
    // sidechain, it never rose above the noise floor of a listener's earbuds.
    //
    // Like the music bed (see musicMap.bedVolumeDb), the static level no longer
    // hides under the duck floor — the sidechain compressor handles speech. This
    // keeps ambience below music while making it actually present.
    const ceiling = Math.min(-12, input.duckFloorDb + 4);
    // An accessibility request costs a further 6dB on top of any intensity trim.
    const intensityTrim =
      (input.cinematicIntensity === 'subtle' ? -3 : 0) + (input.reduceBackground ? -6 : 0);

    // 'subtle' mode keeps only the base + one texture layer: fewer moving parts
    // means less chance of muddying narration. An accessibility request is
    // stricter still — base layer only, so there is exactly one quiet bed.
    const limited = input.reduceBackground
      ? specs.filter((s) => s.layerRole === 'base').slice(0, 1)
      : input.cinematicIntensity === 'subtle'
        ? specs.filter((s) => s.layerRole === 'base' || s.layerRole === 'texture').slice(0, 2)
        : specs;

    const layers: AmbienceLayer[] = [];

    for (const spec of limited) {
      // Louder scenes let ambience come up very slightly.
      const energyTrim = (scene.energyLevel - 0.5) * 2;

      layers.push({
        requirement: ambienceRequirement({
          location: scene.setting.location,
          layerRole: spec.layerRole,
          emotion: scene.dominantEmotion,
          durationMs: scene.estimatedDurationMs,
        }),
        // Hint only: present when the knowledge map's suggested asset happens to
        // exist in the catalogue. Absent otherwise — the resolver still fills it.
        ...(input.manifest.has('ambience', spec.assetId)
          ? { assetId: spec.assetId }
          : {}),
        layerRole: spec.layerRole,
        volumeDb: round1(
          Math.max(-45, Math.min(ceiling, spec.volumeDb + intensityTrim + energyTrim))
        ),
        fadeInMs: 2500,
        fadeOutMs: 2500,
        loopBehavior: 'random_offset',
        jitterMs: spec.jitterMs ?? 8000,
      });
    }

    return layers;
  }
}

// ---------------------------------------------------------------------------
// Requirement construction (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Build the semantic requirement for one ambience layer.
 *
 * `category` carries the LocationId, so the resolver's matching is a plain
 * category comparison identical to music — no ambience-specific branch needed
 * in the resolver.
 *
 * Always loopable: an environment bed must sustain for a whole scene, and no
 * source (generated or licensed) supplies multi-minute one-shots.
 */
export function ambienceRequirement(params: {
  location: string;
  layerRole: AmbienceLayerRole;
  emotion: Emotion;
  durationMs: number;
}): AssetRequirement {
  return AssetRequirementSchema.parse({
    kind: 'ambience',
    category: params.location,
    emotion: params.emotion,
    layerRole: params.layerRole,
    durationMs: Math.max(1000, Math.round(params.durationMs)),
    loopable: true,
    tags: [params.layerRole, 'environment'],
    description: `${params.layerRole} ambience layer for a ${params.location} setting`,
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export const ambiencePlanner = new AmbiencePlanner();

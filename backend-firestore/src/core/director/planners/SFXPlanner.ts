/**
 * SFXPlanner — places sound effects against spoken words.
 *
 * Restraint is the design goal. An educational podcast peppered with effects is
 * worse than one with none, so three separate limits apply:
 *   - one candidate per line (highest-priority trigger wins)
 *   - a global density cap (MAX_SFX_PER_MINUTE)
 *   - a minimum gap between cues (MIN_SFX_GAP_MS)
 *
 * Synchronisation is TIER 1 (proportional estimate, ~±300ms). `syncMode` and
 * `offsetMs` are stable across accuracy tiers, so TTS timepoints (tier 2) or
 * forced alignment (tier 3) can replace the resolver later with no schema
 * change. Cues bias EARLY on purpose: landing just before a word reads as
 * deliberate, landing after reads as a bug.
 *
 * Accessibility: `avoidStartleEffects` drops loud impact categories entirely.
 */

import type { IPlanner } from '../interfaces';
import type { SFXEvent } from '../schema/audio.schema';
import {
  AssetRequirementSchema,
  type AssetRequirement,
} from '../schema/requirement.schema';
import type { Scene } from '../schema/scene.schema';
import type { AssetManifest } from '../../../services/media/assets/AssetManifest';
import {
  MAX_SFX_PER_MINUTE,
  MIN_SFX_GAP_MS,
  matchTriggers,
  type SFXMatch,
} from '../knowledge/sfxTriggers';
import { countWords } from './ScenePlanner';
import type { ScriptLineLike } from './NarrativeAnalyzer';

/** Categories loud or sudden enough to startle. Dropped when asked. */
const STARTLE_CATEGORIES = new Set([
  'explosion',
  'glass',
  'weapon',
  'weather', // thunder
]);

export interface SFXPlannerInput {
  scenes: Scene[];
  lines: ScriptLineLike[];
  manifest: AssetManifest;
  /** voiceBusGainDb + duckingDb — SFX may exceed this briefly, but not by much. */
  duckFloorDb: number;
  avoidStartleEffects?: boolean;
  reduceBackground?: boolean;
  cinematicIntensity: 'subtle' | 'balanced' | 'dramatic';
  /** Pass-1 estimated line durations, keyed by line index. */
  lineDurationsMs: Record<number, number>;
  /** Pass-1 estimated line start offsets, keyed by line index. */
  lineStartsMs: Record<number, number>;
  totalEstimatedMs: number;
}

export class SFXPlanner implements IPlanner<SFXPlannerInput, SFXEvent[]> {
  readonly name = 'SFXPlanner';

  async plan(input: SFXPlannerInput): Promise<SFXEvent[]> {
    return this.fallback(input);
  }

  fallback(input: SFXPlannerInput): SFXEvent[] {
    // 'subtle' mode is for study material — no effects at all. This stays an
    // absolute switch because it is the operator's explicit dial
    // (CINEMATIC_INTENSITY), not an inferred property of the learner.
    if (input.cinematicIntensity === 'subtle') return [];

    // reduceBackground used to `return []` here too. It no longer does: the
    // Producer sets that flag for every beginner-level episode, so effects were
    // silently disabled for most study podcasts. It now halves the density
    // budget and attenuates each cue instead (see sfxVolumeDb), which preserves
    // the accessibility intent — narration stays dominant — without removing
    // the layer outright.
    // NOT gated on catalogue contents — see MusicPlanner for the rationale.

    // ── 1. Collect candidates, one per line ────────────────────────────────
    interface Candidate {
      match: SFXMatch;
      lineIndex: number;
      sceneId: string;
      absoluteMs: number;
    }
    const candidates: Candidate[] = [];

    for (const scene of input.scenes) {
      for (let line = scene.lineRange.startLine; line <= scene.lineRange.endLine; line++) {
        const text = input.lines[line]?.text;
        if (!text) continue;

        const match = matchTriggers(text);
        if (!match) continue;

        // Accessibility filter only. Availability is the resolver's problem.
        if (input.avoidStartleEffects && STARTLE_CATEGORIES.has(match.trigger.category)) {
          continue;
        }

        const lineStart = input.lineStartsMs[line] ?? 0;
        const lineDuration = input.lineDurationsMs[line] ?? 0;
        const wordOffset = estimateWordOffset(
          match.wordIndex,
          countWords(text),
          lineDuration
        );

        candidates.push({
          match,
          lineIndex: line,
          sceneId: scene.id,
          absoluteMs: Math.max(0, lineStart + wordOffset + match.trigger.offsetMs),
        });
      }
    }

    if (candidates.length === 0) return [];

    // ── 2. Enforce density + spacing ───────────────────────────────────────
    const minutes = Math.max(1, input.totalEstimatedMs / 60_000);
    const perMinute = input.reduceBackground
      ? MAX_SFX_PER_MINUTE / 2
      : MAX_SFX_PER_MINUTE;
    const budget = Math.max(1, Math.floor(minutes * perMinute));

    // Highest priority first so the budget is spent on the most impactful cues.
    const byPriority = [...candidates].sort(
      (a, b) => b.match.trigger.priority - a.match.trigger.priority
    );

    const accepted: Candidate[] = [];
    for (const candidate of byPriority) {
      if (accepted.length >= budget) break;
      // Reject anything too close to an already-accepted cue.
      const tooClose = accepted.some(
        (a) => Math.abs(a.absoluteMs - candidate.absoluteMs) < MIN_SFX_GAP_MS
      );
      if (tooClose) continue;
      accepted.push(candidate);
    }

    // ── 3. Emit in chronological order ─────────────────────────────────────
    return accepted
      .sort((a, b) => a.absoluteMs - b.absoluteMs)
      .map((c, i) => {
        const asset = input.manifest.get('sfx', c.match.trigger.assetId);
        const durationMs = asset?.durationMs ?? 1500;
        return {
          id: `sfx_${i}`,
          kind: 'sfx' as const,
          startMs: c.absoluteMs,
          durationMs,
          sceneId: c.sceneId,
          priority: c.match.trigger.priority,
          requirement: sfxRequirement({
            category: c.match.trigger.category,
            triggerWord: c.match.matchedPattern,
            durationMs,
          }),
          // Hint only — present when the trigger's suggested asset exists.
          ...(asset ? { assetId: c.match.trigger.assetId } : {}),
          effectCategory: c.match.trigger.category,
          triggerWord: c.match.matchedPattern,
          triggerLineIndex: c.lineIndex,
          // Tier 1: proportional within the line.
          syncMode: 'on_word' as const,
          offsetMs: c.match.trigger.offsetMs,
          volumeDb: sfxVolumeDb(c.match.trigger.volumeDb, input),
          fadeInMs: 0,
          fadeOutMs: 120,
        };
      });
  }
}

// ---------------------------------------------------------------------------
// Requirement construction (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Build the semantic requirement for one SFX cue.
 *
 * Never loopable — an effect is a discrete event. The `triggerWord` is carried
 * through so a generative provider can prompt with the actual context ("thunder"
 * in "the thunder rolled") rather than the bare category.
 */
export function sfxRequirement(params: {
  category: string;
  triggerWord?: string;
  durationMs: number;
}): AssetRequirement {
  return AssetRequirementSchema.parse({
    kind: 'sfx',
    category: params.category,
    durationMs: Math.max(100, Math.round(params.durationMs)),
    loopable: false,
    triggerWord: params.triggerWord,
    tags: ['one_shot'],
    description: `discrete ${params.category} sound effect`,
  });
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Tier-1 word timing: interpolate the word's position through the line.
 * Accuracy ~±300ms, which is why triggers carry a negative `offsetMs`.
 */
export function estimateWordOffset(
  wordIndex: number,
  totalWords: number,
  lineDurationMs: number
): number {
  if (totalWords <= 0 || lineDurationMs <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, wordIndex / totalWords));
  return Math.round(ratio * lineDurationMs);
}

/**
 * Effects may sit slightly above the duck floor — a cue is a deliberate accent,
 * unlike a bed — but never loud enough to mask the word it accompanies.
 */
/**
 * How far the whole SFX layer sits above the levels written in `sfxTriggers`.
 *
 * Those base values were authored against the old bed policy, when beds were
 * pinned below the duck floor. Beds are now audible, so effects had to come up
 * with them or be masked.
 */
const SFX_PROMINENCE_DB = 10;

/**
 * Loudest an effect may be. Above roughly this it starts to startle rather than
 * punctuate, and competes with the narrator even after ducking.
 */
const SFX_CEILING_DB = -3;

export function sfxVolumeDb(
  base: number,
  input: Pick<
    SFXPlannerInput,
    'duckFloorDb' | 'cinematicIntensity' | 'reduceBackground'
  >
): number {
  const intensityTrim = input.cinematicIntensity === 'dramatic' ? 1.5 : 0;
  // Accessibility: pull cues down rather than removing them.
  const accessibilityTrim = input.reduceBackground ? -6 : 0;

  // An effect is a brief EVENT, not a bed, so it must sit ABOVE the music.
  //
  // Measured on a real episode: beds rendered at -6.2 dB while effects landed at
  // -16.5 dB — a one-second cue buried 10 dB under continuous music and the
  // narration. Nobody could hear them, which read as "SFX still not working".
  //
  // The shift is applied to the whole layer rather than by editing every entry in
  // sfxTriggers, so the table keeps its internal balance: a rustling page stays
  // quieter than an explosion, both just move up together.
  const prominence = SFX_PROMINENCE_DB;

  const ceiling = input.reduceBackground ? input.duckFloorDb : SFX_CEILING_DB;
  return (
    Math.round(
      Math.max(-40, Math.min(ceiling, base + prominence + intensityTrim + accessibilityTrim)) * 10
    ) / 10
  );
}

export const sfxPlanner = new SFXPlanner();

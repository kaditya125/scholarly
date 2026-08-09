/**
 * PausePlanner — turns silence into first-class timeline events.
 *
 * Today the pipeline concatenates TTS clips, so pauses are whatever the TTS
 * engine happened to produce. Making them explicit events lets the mixer decide
 * whether music continues through a silence, and lets an education-specific
 * `comprehension` beat exist at all — a decision a TTS engine cannot make
 * because it has no idea which sentence was a dense definition.
 *
 * Fully deterministic: rules over emotion, punctuation and scene structure.
 */

import type { IPlanner } from '../interfaces';
import {
  type PauseEvent,
  type PauseType,
} from '../schema/audio.schema';
import type { Scene } from '../schema/scene.schema';
import { emotionProfile } from '../knowledge/emotionProfiles';
import type { ScriptLineLike } from './NarrativeAnalyzer';

export interface PausePlannerInput {
  scenes: Scene[];
  lines: ScriptLineLike[];
  /** Extra pause after dense content, from the Producer's accessibility strategy. */
  extendedPauseMs?: number;
  /** Concept labels worth a comprehension beat, from the Producer. */
  emphasisTerms?: string[];
  cinematicIntensity: 'subtle' | 'balanced' | 'dramatic';
}

/** Silence longer than this stops feeling deliberate and starts feeling broken. */
const MAX_PAUSE_MS = 2500;

export class PausePlanner implements IPlanner<PausePlannerInput, PauseEvent[]> {
  readonly name = 'PausePlanner';

  async plan(input: PausePlannerInput): Promise<PauseEvent[]> {
    return this.fallback(input);
  }

  /**
   * Emits pause events with PASS-1 relative offsets. `TimelineBuilder.resolve()`
   * re-anchors them once real line durations are known, so `startMs` here is a
   * placeholder derived from scene estimates.
   */
  fallback(input: PausePlannerInput): PauseEvent[] {
    const events: PauseEvent[] = [];
    const emphasis = (input.emphasisTerms ?? [])
      .map((t) => t.toLowerCase())
      .filter(Boolean);

    for (const scene of input.scenes) {
      const profile = emotionProfile(scene.dominantEmotion);

      for (let line = scene.lineRange.startLine; line <= scene.lineRange.endLine; line++) {
        const text = input.lines[line]?.text || '';
        if (!text) continue;

        const decision = decidePause({
          text,
          sceneEmotion: scene.dominantEmotion,
          emotionPauseMs: profile.pauseAfterMs,
          isSceneEnd: line === scene.lineRange.endLine,
          emphasisTerms: emphasis,
          extendedPauseMs: input.extendedPauseMs ?? 0,
          cinematicIntensity: input.cinematicIntensity,
        });

        if (!decision) continue;

        events.push({
          id: `pause_${line}`,
          kind: 'pause',
          // Placeholder: resolved in pass 2 to sit immediately after the line.
          startMs: 0,
          durationMs: decision.durationMs,
          sceneId: scene.id,
          priority: 30,
          pauseType: decision.type,
          holdBackground: decision.holdBackground,
        });
      }
    }

    return events;
  }
}

// ---------------------------------------------------------------------------
// Decision rule (exported for testing)
// ---------------------------------------------------------------------------

export interface PauseDecision {
  type: PauseType;
  durationMs: number;
  holdBackground: boolean;
}

/**
 * Decide whether a line earns a pause, and what kind.
 *
 * Ordering matters — the first matching rule wins, most significant first:
 *   1. scene end        → structural gap
 *   2. emphasis term    → comprehension beat (education-specific)
 *   3. dramatic emotion → suspense hold
 *   4. question         → thinking beat
 *   5. long sentence    → breath
 */
export function decidePause(args: {
  text: string;
  sceneEmotion: string;
  emotionPauseMs: number;
  isSceneEnd: boolean;
  emphasisTerms: string[];
  extendedPauseMs: number;
  cinematicIntensity: 'subtle' | 'balanced' | 'dramatic';
}): PauseDecision | null {
  const scale = args.cinematicIntensity === 'subtle' ? 0.7 : args.cinematicIntensity === 'dramatic' ? 1.25 : 1;
  const lower = args.text.toLowerCase();

  // 1. Scene boundary — music continues through it; only the voice stops.
  if (args.isSceneEnd) {
    return {
      type: 'scene_gap',
      durationMs: cap(700 * scale + args.extendedPauseMs),
      holdBackground: true,
    };
  }

  // 2. Comprehension beat after a line introducing an emphasised concept.
  if (args.emphasisTerms.some((term) => term.length > 3 && lower.includes(term))) {
    return {
      type: 'comprehension',
      durationMs: cap(600 * scale + args.extendedPauseMs),
      holdBackground: true,
    };
  }

  // 3. Dramatic holds. Only for genuinely tense emotions, and never in 'subtle'
  //    mode where a long silence in a study podcast just feels like a glitch.
  const dramatic = ['suspense', 'mystery', 'fear'].includes(args.sceneEmotion);
  if (dramatic && args.cinematicIntensity !== 'subtle') {
    return {
      type: 'suspense',
      durationMs: cap(args.emotionPauseMs * scale),
      holdBackground: true,
    };
  }

  // 4. A question gives the listener a moment to attempt an answer.
  if (/[?？]\s*$/.test(args.text.trim())) {
    return {
      type: 'beat',
      durationMs: cap(500 * scale + args.extendedPauseMs),
      holdBackground: true,
    };
  }

  // 5. Long lines earn a breath. Threshold is generous so short exchanges keep
  //    their natural rhythm.
  const words = args.text.split(/\s+/).filter(Boolean).length;
  if (words >= 45) {
    return {
      type: 'breath',
      durationMs: cap(350 * scale),
      holdBackground: true,
    };
  }

  return null;
}

function cap(ms: number): number {
  return Math.max(0, Math.min(MAX_PAUSE_MS, Math.round(ms)));
}

export const pausePlanner = new PausePlanner();

/**
 * VisualPlanner — emits visual events for a FUTURE renderer.
 *
 * Nothing consumes this in v1. It exists now because the expensive decision in
 * video generation is deciding *what to show*, and the context needed to decide
 * it (scene setting, mood, cast, topic) is already loaded here. Reconstructing
 * it later would mean another full LLM pass over the script.
 *
 * The prompts and cinematography already live on `Scene.visual` (built by the
 * ScenePlanner). This planner turns them into a TRACK: an establishing shot per
 * scene, plus character shots anchored to speaker changes so a future avatar or
 * lip-sync renderer has per-speaker windows to work with.
 */

import type { IPlanner } from '../interfaces';
import type { VisualEvent } from '../schema/visual.schema';
import type { Scene } from '../schema/scene.schema';
import type { CharacterCast } from '../schema/character.schema';
import type { ScriptLineLike } from './NarrativeAnalyzer';
import { normalizeName } from './NarrativeAnalyzer';

export interface VisualPlannerInput {
  scenes: Scene[];
  cast: CharacterCast;
  lines: ScriptLineLike[];
  /** Pass-1 line start offsets, keyed by line index. */
  lineStartsMs: Record<number, number>;
  lineDurationsMs: Record<number, number>;
  /** Set false to skip visual planning entirely. */
  enabled?: boolean;
}

/**
 * Minimum length for a character shot. Below this a cut is visual noise rather
 * than emphasis, so short back-and-forth exchanges stay on the establishing shot.
 */
const MIN_CHARACTER_SHOT_MS = 4000;

export class VisualPlanner implements IPlanner<VisualPlannerInput, VisualEvent[]> {
  readonly name = 'VisualPlanner';

  async plan(input: VisualPlannerInput): Promise<VisualEvent[]> {
    return this.fallback(input);
  }

  fallback(input: VisualPlannerInput): VisualEvent[] {
    if (input.enabled === false) return [];
    if (input.scenes.length === 0) return [];

    const events: VisualEvent[] = [];

    // Speaker name → character id, so shots can target a cast member.
    const idByName = new Map<string, string>();
    for (const c of input.cast.characters) {
      idByName.set(normalizeName(c.displayName), c.id);
    }

    let cursorMs = 0;

    for (const scene of input.scenes) {
      const sceneStart = cursorMs;
      cursorMs += scene.estimatedDurationMs;

      // ── Establishing shot: one per scene, covering its full span ─────────
      events.push({
        id: `visual_est_${scene.index}`,
        kind: 'visual',
        startMs: sceneStart,
        durationMs: scene.estimatedDurationMs,
        sceneId: scene.id,
        priority: 60,
        visualType: scene.index === 0 ? 'establishing_shot' : 'establishing_shot',
        sceneVisual: scene.visual,
      });

      // ── Character shots on speaker changes ──────────────────────────────
      let runSpeaker: string | null = null;
      let runStartMs = sceneStart;
      let runEndMs = sceneStart;
      let shotIndex = 0;

      const flush = () => {
        if (!runSpeaker) return;
        const durationMs = runEndMs - runStartMs;
        if (durationMs < MIN_CHARACTER_SHOT_MS) return;

        const characterId = idByName.get(normalizeName(runSpeaker));
        if (!characterId) return;

        events.push({
          id: `visual_char_${scene.index}_${shotIndex++}`,
          kind: 'visual',
          startMs: runStartMs,
          durationMs,
          sceneId: scene.id,
          // Below the establishing shot: a future renderer treats this as an
          // optional cutaway rather than the primary frame.
          priority: 40,
          visualType: 'character_shot',
          sceneVisual: scene.visual,
          characterId,
        });
      };

      for (let line = scene.lineRange.startLine; line <= scene.lineRange.endLine; line++) {
        const speaker = input.lines[line]?.speaker;
        if (!speaker) continue;

        const start = input.lineStartsMs[line] ?? runEndMs;
        const duration = input.lineDurationsMs[line] ?? 0;

        if (normalizeName(speaker) !== normalizeName(runSpeaker ?? '')) {
          flush();
          runSpeaker = speaker;
          runStartMs = start;
        }
        runEndMs = start + duration;
      }
      flush();
    }

    return events;
  }
}

export const visualPlanner = new VisualPlanner();

/**
 * Offline synthetic direction — run the Director with NO external dependencies.
 *
 * Deliberately imports only the Director and its schema. It does NOT touch
 * repositories, Firebase Storage, the notification queue or Redis, so a bulk
 * quality sweep runs on a laptop with no credentials and no cost.
 *
 * This is what makes the 20-timeline validation actually executable rather than
 * something that has to wait for a live environment.
 *
 * Determinism: the narrative analyzer's network call is replaced by its own
 * deterministic fallback, so repeated runs produce byte-identical timelines and
 * the sweep works as a regression harness.
 */

import { AIDirector } from '../AIDirector';
import { NarrativeAnalyzer } from '../planners/NarrativeAnalyzer';
import { emptyAssetManifest, type AssetManifest } from '../../../services/media/assets/AssetManifest';
import type { MasterTimeline } from '../schema/timeline.schema';
import type { CinematicIntensity } from '../schema/common.schema';

export interface SyntheticDirectInput {
  podcastId: string;
  userId: string;
  title: string;
  lines: Array<{ speaker: string; text: string }>;
  /** Lines per chapter. 2 gives the ScenePlanner real boundaries to work with. */
  linesPerChapter?: number;
  cinematicIntensity?: CinematicIntensity;
  manifest?: AssetManifest;
  targetLoudnessLufs?: number;
}

/**
 * A NarrativeAnalyzer that never reaches the network.
 *
 * Overrides `plan` to call the class's own `fallback`, so improvements to the
 * real fallback automatically apply here — no duplicated heuristics to drift.
 */
export function offlineNarrativeAnalyzer(): NarrativeAnalyzer {
  const analyzer = new NarrativeAnalyzer();
  analyzer.plan = async (input) => analyzer.fallback(input);
  return analyzer;
}

/** Roles inferred from a speaker label, matching the dry-run heuristic. */
function inferRole(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('host')) return 'host';
  if (n.includes('narrator')) return 'narrator';
  if (n.includes('dr.') || n.includes('professor') || n.includes('prof')) return 'expert';
  if (n.includes('student')) return 'student';
  if (n.includes('guest')) return 'guest';
  return 'speaker';
}

/**
 * Direct a synthetic script. Returns null on failure rather than throwing, so
 * one bad topic cannot abort a sweep.
 */
export async function syntheticDirect(
  input: SyntheticDirectInput
): Promise<MasterTimeline | null> {
  try {
    const perChapter = Math.max(1, input.linesPerChapter ?? 2);

    const lines = input.lines.map((l, i) => ({
      speaker: l.speaker || 'Narrator',
      text: l.text || '',
      chapterIndex: Math.floor(i / perChapter),
      _i: i,
    }));

    if (lines.length === 0) return null;

    const chapterCount = Math.max(1, Math.ceil(lines.length / perChapter));
    const speakers = [...new Set(lines.map((l) => l.speaker))];

    const director = new AIDirector({
      manifest: input.manifest ?? emptyAssetManifest,
      analyzer: offlineNarrativeAnalyzer(),
    });

    return await director.direct({
      podcastId: input.podcastId,
      userId: input.userId,
      plan: {
        title: input.title,
        description: input.title,
        language: 'English',
        type: 'educational',
        // ~4 words/sec at ~15 words per synthetic line.
        estimatedMinutes: Math.max(1, Math.round((lines.length * 4) / 60)),
        speakers: speakers.map((name) => ({ name, role: inferRole(name) })),
        segments: Array.from({ length: chapterCount }, (_, i) => ({
          index: i,
          title: `Segment ${i + 1}`,
        })),
      },
      script: { lines },
      brief: {
        topic: input.title,
        titleSeed: input.title,
        baseText: '',
        notebookId: '',
        focusTopics: [],
      },
      preferences: {
        cinematicIntensity: input.cinematicIntensity ?? 'balanced',
        targetLoudnessLufs: input.targetLoudnessLufs ?? -16,
      },
    });
  } catch {
    // Swallowed on purpose — the caller reports the topic as failed and moves on.
    return null;
  }
}

/**
 * NarrativeAnalyzer — the Director's ONE LLM call.
 *
 * Scene boundaries, speaker identities and the emotional arc are all facets of a
 * single reading of the script, so asking for them separately would cost three
 * calls and risk three mutually-inconsistent answers. The Scene, Character and
 * Emotion planners consume this one structured result.
 *
 * Everything else in the Director is deterministic (see AI_DIRECTOR_ARCHITECTURE
 * §2.2), which keeps the whole layer at one call per episode.
 *
 * Never throws: `fallback()` yields a single-scene analysis derived from the
 * plan, which is enough for a coherent, if plain, timeline.
 */

import { z } from 'zod';
import { logger } from '../../../utils/logger';
import { callStructuredLLM } from '../../../services/ai/structuredLlm';
import type { IPlanner } from '../interfaces';
import { EmotionSchema, type Emotion } from '../schema/common.schema';
import { LocationIdSchema, type LocationId } from '../schema/scene.schema';
import { TimeOfDaySchema, type TimeOfDay } from '../schema/scene.schema';
import type { EmotionArcType } from '../schema/audio.schema';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ScriptLineLike {
  speaker: string;
  text: string;
  chapterIndex: number;
}

export interface NarrativeAnalyzerInput {
  userId: string;
  podcastId: string;
  title: string;
  topic: string;
  language: string;
  /** Existing PodcastPlan.segments — scene boundaries should respect these. */
  chapters: Array<{ index: number; title: string }>;
  /** Speaker names + roles declared in the plan. */
  declaredSpeakers: Array<{ name: string; role: string }>;
  lines: ScriptLineLike[];
  /** From the ProducerPlan when available. */
  genreHint?: string;
  narrativeStyleHint?: string;
}

// ---------------------------------------------------------------------------
// LLM contract
// ---------------------------------------------------------------------------

const LlmSceneSchema = z.object({
  title: z.string().min(1),
  startLine: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
  location: LocationIdSchema,
  locationDescription: z.string().default(''),
  timeOfDay: TimeOfDaySchema.default('neutral'),
  dominantEmotion: EmotionSchema,
  energyLevel: z.number().min(0).max(1).default(0.5),
  tensionLevel: z.number().min(0).max(1).default(0.3),
});

const LlmCharacterSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  gender: z.enum(['male', 'female', 'neutral']).default('neutral'),
  ageBand: z
    .enum(['child', 'teen', 'young_adult', 'adult', 'elderly'])
    .default('adult'),
  personalityNote: z.string().default(''),
});

const LlmResponseSchema = z.object({
  scenes: z.array(LlmSceneSchema).min(1).max(20),
  characters: z.array(LlmCharacterSchema).min(1).max(8),
  emotionArc: z
    .enum(['rising', 'falling', 'arc', 'wave', 'steady', 'twist'])
    .default('arc'),
});

type LlmResponse = z.infer<typeof LlmResponseSchema>;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface SceneSkeleton {
  title: string;
  startLine: number;
  endLine: number;
  location: LocationId;
  locationDescription: string;
  timeOfDay: TimeOfDay;
  dominantEmotion: Emotion;
  energyLevel: number;
  tensionLevel: number;
  /** Chapter this scene belongs to, resolved from its line range. */
  chapterIndex: number;
}

export interface CharacterHint {
  name: string;
  role: string;
  gender: 'male' | 'female' | 'neutral';
  ageBand: 'child' | 'teen' | 'young_adult' | 'adult' | 'elderly';
  personalityNote: string;
}

export interface NarrativeAnalysis {
  scenes: SceneSkeleton[];
  characters: CharacterHint[];
  emotionArc: EmotionArcType;
  /** True when the LLM call failed and this is deterministic output. */
  degraded: boolean;
}

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

export class NarrativeAnalyzer
  implements IPlanner<NarrativeAnalyzerInput, NarrativeAnalysis>
{
  readonly name = 'NarrativeAnalyzer';

  async plan(input: NarrativeAnalyzerInput): Promise<NarrativeAnalysis> {
    if (input.lines.length === 0) return this.fallback(input);

    const system =
      'You are a documentary audio director. You read a podcast script and ' +
      'identify its scene structure, cast and emotional arc. Output STRICTLY valid JSON only.';

    // Number the lines so the model can reference them precisely, and cap the
    // payload so a 60-minute script cannot blow the context window.
    const numbered = input.lines
      .map((l, i) => `${i}. [${l.speaker}] ${truncate(l.text, 220)}`)
      .join('\n');

    const prompt = `Analyse this podcast script for audio direction.

EPISODE: ${input.title}
TOPIC: ${input.topic}
LANGUAGE: ${input.language}
${input.genreHint ? `GENRE: ${input.genreHint}` : ''}
${input.narrativeStyleHint ? `NARRATIVE STYLE: ${input.narrativeStyleHint}` : ''}

DECLARED SPEAKERS: ${input.declaredSpeakers.map((s) => `${s.name} (${s.role})`).join(', ')}

EXISTING CHAPTERS (scene boundaries SHOULD align with these):
${input.chapters.map((c) => `  ${c.index}: ${c.title}`).join('\n')}

SCRIPT (${input.lines.length} lines, 0-indexed):
${truncate(numbered, 12_000)}

Output ONLY this JSON:
{
  "scenes": [
    {
      "title": "short scene title",
      "startLine": 0,
      "endLine": 5,
      "location": "one of the allowed location ids",
      "locationDescription": "short visual description of the place",
      "timeOfDay": "dawn|morning|midday|afternoon|evening|night|neutral",
      "dominantEmotion": "one of the allowed emotions",
      "energyLevel": 0.5,
      "tensionLevel": 0.3
    }
  ],
  "characters": [
    {
      "name": "speaker name exactly as it appears in the script",
      "role": "Teacher|Student|Narrator|Host|Subject Expert|…",
      "gender": "male|female|neutral",
      "ageBand": "child|teen|young_adult|adult|elderly",
      "personalityNote": "one short phrase"
    }
  ],
  "emotionArc": "rising|falling|arc|wave|steady|twist"
}

Rules:
- Scenes must COVER every line from 0 to ${input.lines.length - 1} with NO gaps and NO overlaps.
- Prefer scene boundaries that align with the chapter list above.
- ALLOWED location ids: ${LocationIdSchema.options.join(', ')}
- ALLOWED emotions: ${EmotionSchema.options.join(', ')}
- For a purely educational episode with no narrative setting, use location "classroom", "library" or "neutral".
- "characters" must include every distinct speaker in the script, named EXACTLY as written.
- Infer gender only when the role or content makes it clear; otherwise use "neutral".
- Output ONLY the JSON object.`;

    try {
      const res = await callStructuredLLM<LlmResponse>({
        prompt,
        system,
        context: {
          userId: input.userId,
          operation: 'director_narrative_analysis',
        },
        validate: (d) => {
          const r = LlmResponseSchema.safeParse(d);
          return { ok: r.success, error: r.success ? undefined : r.error.message };
        },
        label: 'director_narrative_analysis',
      });

      if (!res.ok || !res.data) {
        logger.warn('[Director] Narrative analysis failed; using fallback', {
          podcastId: input.podcastId,
          error: res.error,
        });
        return this.fallback(input);
      }

      return {
        scenes: normalizeSceneCoverage(res.data.scenes, input),
        characters: reconcileCharacters(res.data.characters, input),
        emotionArc: res.data.emotionArc,
        degraded: false,
      };
    } catch (err: any) {
      logger.warn('[Director] Narrative analysis threw; using fallback', {
        podcastId: input.podcastId,
        error: err?.message,
      });
      return this.fallback(input);
    }
  }

  /**
   * Deterministic fallback: one scene per chapter, neutral setting, speakers
   * taken from the plan. Produces a valid — if plain — timeline.
   */
  fallback(input: NarrativeAnalyzerInput): NarrativeAnalysis {
    const lineCount = input.lines.length;

    // Group lines by their existing chapterIndex, which the pipeline already
    // guarantees is present and ordered.
    const byChapter = new Map<number, number[]>();
    input.lines.forEach((line, idx) => {
      const list = byChapter.get(line.chapterIndex) ?? [];
      list.push(idx);
      byChapter.set(line.chapterIndex, list);
    });

    const chapterTitle = new Map(input.chapters.map((c) => [c.index, c.title]));

    const scenes: SceneSkeleton[] = [...byChapter.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([chapterIndex, indices]) => ({
        title: chapterTitle.get(chapterIndex) || `Segment ${chapterIndex + 1}`,
        startLine: Math.min(...indices),
        endLine: Math.max(...indices),
        location: 'classroom' as LocationId,
        locationDescription: '',
        timeOfDay: 'neutral' as TimeOfDay,
        dominantEmotion: 'neutral' as Emotion,
        energyLevel: 0.5,
        tensionLevel: 0.2,
        chapterIndex,
      }));

    // Guarantee at least one scene covering everything.
    if (scenes.length === 0 && lineCount > 0) {
      scenes.push({
        title: input.title || 'Episode',
        startLine: 0,
        endLine: lineCount - 1,
        location: 'classroom',
        locationDescription: '',
        timeOfDay: 'neutral',
        dominantEmotion: 'neutral',
        energyLevel: 0.5,
        tensionLevel: 0.2,
        chapterIndex: 0,
      });
    }

    return {
      scenes,
      characters: input.declaredSpeakers.map((s) => ({
        name: s.name,
        role: s.role,
        gender: 'neutral' as const,
        ageBand: 'adult' as const,
        personalityNote: '',
      })),
      emotionArc: 'steady',
      degraded: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Normalisation (exported for direct testing)
// ---------------------------------------------------------------------------

/**
 * Repair scene coverage.
 *
 * The prompt asks for gapless, non-overlapping coverage; models routinely get
 * this slightly wrong. Rather than rejecting the whole analysis, sort by start
 * line, clamp to bounds, close gaps and trim overlaps. Every line ends up in
 * exactly one scene, which the SCENE_LINE_COVERAGE invariant requires.
 */
export function normalizeSceneCoverage(
  raw: Array<z.infer<typeof LlmSceneSchema>>,
  input: NarrativeAnalyzerInput
): SceneSkeleton[] {
  const lastLine = Math.max(0, input.lines.length - 1);
  const chapterOf = (line: number) =>
    input.lines[Math.min(line, lastLine)]?.chapterIndex ?? 0;

  const sorted = [...raw]
    .map((s) => ({
      ...s,
      startLine: clamp(s.startLine, 0, lastLine),
      endLine: clamp(s.endLine, 0, lastLine),
    }))
    // Drop inverted ranges rather than trying to guess intent.
    .filter((s) => s.endLine >= s.startLine)
    .sort((a, b) => a.startLine - b.startLine);

  if (sorted.length === 0) {
    return new NarrativeAnalyzer().fallback(input).scenes;
  }

  const out: SceneSkeleton[] = [];
  let cursor = 0;

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (cursor > lastLine) break;

    // Close gaps by starting exactly at the cursor. Taking max(cursor, requested)
    // would LEAVE a gap whenever the model skipped a line, orphaning it from
    // every scene — which the SCENE_LINE_COVERAGE invariant flags.
    const startLine = cursor;
    // Trim overlap: never run past where the next scene begins.
    const nextStart = i + 1 < sorted.length ? sorted[i + 1].startLine : lastLine + 1;
    const endLine = Math.max(startLine, Math.min(s.endLine, nextStart - 1, lastLine));

    out.push({
      title: s.title,
      startLine,
      endLine,
      location: s.location,
      locationDescription: s.locationDescription,
      timeOfDay: s.timeOfDay,
      dominantEmotion: s.dominantEmotion,
      energyLevel: s.energyLevel,
      tensionLevel: s.tensionLevel,
      chapterIndex: chapterOf(startLine),
    });

    cursor = endLine + 1;
  }

  // Extend the final scene if the model stopped short.
  if (out.length > 0 && out[out.length - 1].endLine < lastLine) {
    out[out.length - 1].endLine = lastLine;
  }

  return out;
}

/**
 * Ensure every speaker that actually appears in the script has a character
 * entry. A missing entry would orphan its voice events, which the CAST_REFS
 * invariant rejects.
 */
export function reconcileCharacters(
  raw: CharacterHint[],
  input: NarrativeAnalyzerInput
): CharacterHint[] {
  const byName = new Map<string, CharacterHint>();
  for (const c of raw) byName.set(normalizeName(c.name), c);

  const roleOfDeclared = new Map(
    input.declaredSpeakers.map((s) => [normalizeName(s.name), s.role])
  );

  // Add any script speaker the model omitted.
  for (const line of input.lines) {
    const key = normalizeName(line.speaker);
    if (!key || byName.has(key)) continue;
    byName.set(key, {
      name: line.speaker,
      role: roleOfDeclared.get(key) || line.speaker,
      gender: 'neutral',
      ageBand: 'adult',
      personalityNote: '',
    });
  }

  return [...byName.values()];
}

export function normalizeName(name: string): string {
  return (name || '').trim().toLowerCase();
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

export const narrativeAnalyzer = new NarrativeAnalyzer();

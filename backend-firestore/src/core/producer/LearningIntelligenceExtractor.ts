/**
 * LearningIntelligenceExtractor — the Producer's ONE LLM call.
 *
 * Produces the pedagogical model of the subject matter: which concepts exist,
 * how they depend on each other, and what learners typically get wrong.
 *
 * Design notes:
 *   - Reuses the existing `callStructuredLLM` (rate limiting, JSON repair,
 *     temperature-0 retry) rather than talking to Gemini directly.
 *   - Bloom level comes from the EXISTING heuristic `bloomClassifier`, not the
 *     LLM — it is free, deterministic and already tuned.
 *   - Teaching sequence is computed by topological sort, not asked for. The LLM
 *     supplies prerequisites; ordering is arithmetic we can guarantee.
 *   - `plan()` never throws. On any failure it returns `fallback()`.
 */

import { z } from 'zod';
import { logger } from '../../utils/logger';
import { callStructuredLLM } from '../../services/ai/structuredLlm';
import { bloomClassifier } from '../intelligence/BloomClassifier';
import type { IPlanner } from '../director/interfaces';
import {
  LearningIntelligenceSchema,
  resolveTeachingSequence,
  type BloomLevel,
  type ConceptNode,
  type DifficultyBand,
  type LearnerProfile,
  type LearningIntelligence,
} from './schema/producerPlan.schema';

export interface LearningIntelligenceInput {
  userId: string;
  /** Primary topic from the GroundingBrief. */
  topic: string;
  /** Source text to ground concept extraction in. */
  sourceText: string;
  notebookId?: string;
  learner: LearnerProfile;
  /** Target minutes — caps how many concepts are worth covering. */
  targetMinutes: number;
}

// ---------------------------------------------------------------------------
// LLM response contract
// ---------------------------------------------------------------------------

const LlmConceptSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  prerequisites: z.array(z.string()).default([]),
  examWeight: z.number().min(0).max(1).optional(),
});

const LlmResponseSchema = z.object({
  concepts: z.array(LlmConceptSchema).min(1).max(20),
  commonMisconceptions: z.array(z.string()).max(8).default([]),
});

type LlmResponse = z.infer<typeof LlmResponseSchema>;

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

export class LearningIntelligenceExtractor
  implements IPlanner<LearningIntelligenceInput, LearningIntelligence>
{
  readonly name = 'LearningIntelligenceExtractor';

  async plan(input: LearningIntelligenceInput): Promise<LearningIntelligence> {
    const targetBloom = this.classifyBloom(input.topic);
    const conceptBudget = conceptBudgetFor(input.targetMinutes);

    const system =
      'You are an expert curriculum designer. You decompose a topic into its ' +
      'constituent concepts and their prerequisite relationships. Output STRICTLY valid JSON only.';

    const prompt = `Decompose this topic into teachable concepts.

TOPIC: ${input.topic}
TARGET LENGTH: ${input.targetMinutes} minutes (cover at most ${conceptBudget} concepts)
LEARNER LEVEL: ${input.learner.difficultyBand}
${input.learner.activeExam ? `EXAM CONTEXT: ${input.learner.activeExam}` : ''}
${input.learner.weakTopics.length ? `LEARNER'S WEAK AREAS: ${input.learner.weakTopics.join(', ')}` : ''}

SOURCE MATERIAL:
${(input.sourceText || '').slice(0, 3000) || '(no source text — use widely-accepted syllabus knowledge)'}

Output ONLY this JSON shape:
{
  "concepts": [
    {
      "id": "short_snake_case_id",
      "label": "Human readable concept name",
      "difficulty": "beginner|intermediate|advanced|expert",
      "prerequisites": ["ids of concepts that must be understood first"],
      "examWeight": 0.0
    }
  ],
  "commonMisconceptions": ["things learners typically get wrong about this topic"]
}

Rules:
- At most ${conceptBudget} concepts, ordered roughly from foundational to advanced.
- "prerequisites" must reference ids from THIS list only. Use [] when there are none.
- Do NOT create circular prerequisites.
- "examWeight" is 0..1 relative importance for the exam context; omit if unknown.
- Output ONLY the JSON object.`;

    try {
      const res = await callStructuredLLM<LlmResponse>({
        prompt,
        system,
        context: {
          userId: input.userId,
          notebookId: input.notebookId,
          operation: 'producer_learning_intelligence',
        },
        validate: (d) => {
          const r = LlmResponseSchema.safeParse(d);
          return { ok: r.success, error: r.success ? undefined : r.error.message };
        },
        label: 'producer_learning_intelligence',
      });

      if (!res.ok || !res.data) {
        logger.warn('[Producer] LearningIntelligence LLM call failed; using fallback', {
          error: res.error,
        });
        return this.fallback(input);
      }

      return this.assemble(input, res.data, targetBloom);
    } catch (err: any) {
      logger.warn('[Producer] LearningIntelligence threw; using fallback', {
        error: err?.message,
      });
      return this.fallback(input);
    }
  }

  /**
   * Deterministic degraded output: a single concept representing the topic.
   * Enough for the Director to plan one coherent scene sequence.
   */
  fallback(input: LearningIntelligenceInput): LearningIntelligence {
    const concept: ConceptNode = {
      id: 'main_topic',
      label: input.topic || 'Topic',
      bloomLevel: this.classifyBloom(input.topic),
      difficulty: input.learner.difficultyBand,
      prerequisites: [],
      revisionPriority: input.learner.weakTopics.length ? 0.8 : 0.5,
    };

    return LearningIntelligenceSchema.parse({
      primaryTopic: input.topic || 'Topic',
      concepts: [concept],
      teachingSequence: [concept.id],
      targetBloomLevel: concept.bloomLevel,
      estimatedCognitiveLoad: 0.5,
      commonMisconceptions: [],
    });
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /** Reuses the existing heuristic classifier — no LLM, no latency. */
  private classifyBloom(topic: string): BloomLevel {
    try {
      const result = bloomClassifier.classify({ query: topic, history: [] });
      return result.level as BloomLevel;
    } catch {
      return 'understand';
    }
  }

  private assemble(
    input: LearningIntelligenceInput,
    llm: LlmResponse,
    targetBloom: BloomLevel
  ): LearningIntelligence {
    const validIds = new Set(llm.concepts.map((c) => c.id));
    const weakLower = new Set(input.learner.weakTopics.map((t) => t.toLowerCase()));

    const concepts: ConceptNode[] = llm.concepts.map((c) => ({
      id: c.id,
      label: c.label,
      bloomLevel: targetBloom,
      difficulty: c.difficulty as DifficultyBand,
      // Drop dangling prerequisite refs so the topological sort is well-formed.
      prerequisites: c.prerequisites.filter((p) => validIds.has(p) && p !== c.id),
      examWeight: c.examWeight,
      revisionPriority: revisionPriorityFor(c.label, weakLower),
    }));

    return LearningIntelligenceSchema.parse({
      primaryTopic: input.topic || 'Topic',
      concepts,
      // Computed, not requested — guarantees prerequisites precede dependents.
      teachingSequence: resolveTeachingSequence(concepts),
      targetBloomLevel: targetBloom,
      estimatedCognitiveLoad: estimateCognitiveLoad(concepts, input.targetMinutes),
      commonMisconceptions: llm.commonMisconceptions,
    });
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Concepts a listener can absorb in a given duration. Roughly one concept per
 * 2.5 minutes of audio, clamped so a 5-minute episode isn't a firehose and a
 * 60-minute one doesn't sprawl.
 */
export function conceptBudgetFor(minutes: number): number {
  return Math.max(2, Math.min(14, Math.round(minutes / 2.5)));
}

/**
 * A concept the learner is known to be weak on gets a higher revision priority,
 * which the strategy layer turns into extra emphasis time.
 */
export function revisionPriorityFor(
  label: string,
  weakTopicsLower: Set<string>
): number {
  const l = label.toLowerCase();
  for (const weak of weakTopicsLower) {
    if (!weak) continue;
    if (l.includes(weak) || weak.includes(l)) return 0.9;
  }
  return 0.4;
}

/**
 * Cognitive load rises with concept count and difficulty, and falls with more
 * time to cover them.
 */
export function estimateCognitiveLoad(
  concepts: ConceptNode[],
  minutes: number
): number {
  if (concepts.length === 0) return 0.3;

  const weight: Record<DifficultyBand, number> = {
    beginner: 0.4,
    intermediate: 0.6,
    advanced: 0.85,
    expert: 1,
  };
  const avgDifficulty =
    concepts.reduce((sum, c) => sum + (weight[c.difficulty] ?? 0.6), 0) /
    concepts.length;

  // Density: concepts per minute, normalised against a comfortable 1 per 2.5min.
  const density = concepts.length / Math.max(1, minutes);
  const densityFactor = Math.min(1, density / 0.4);

  return round2(Math.max(0, Math.min(1, avgDifficulty * 0.6 + densityFactor * 0.4)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const learningIntelligenceExtractor = new LearningIntelligenceExtractor();

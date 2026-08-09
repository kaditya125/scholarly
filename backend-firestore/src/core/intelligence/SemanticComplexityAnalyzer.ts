import { QueryCategory, IntelligenceInput, SemanticComplexity, BloomLevel, WorkflowName } from './types';

/**
 * Semantic Complexity Analyzer (Task 2) — extends the single 1..5 scalar into the educational
 * dimensions that actually drive retrieval depth, model tier, and explanation style: reasoning
 * depth, concept dependency, prerequisite count, graph traversal depth, abstraction level,
 * explanation difficulty, mathematical reasoning, and synthesis requirement.
 *
 * Heuristic + deterministic (no I/O, no LLM) so it is free on the hot path. It can OPTIONALLY be
 * refined with a real prerequisite count when the caller already has graph metadata (never fetched
 * here). Output is additive on the ExecutionPlan; nothing consumes it until the PromptBuilder.
 */
const BASE_DEPTH: Record<QueryCategory, number> = {
  greeting: 0, casual_conversation: 0, general_chat: 0.05, translation: 0.1,
  definition: 0.2, summary: 0.25, notebook_search: 0.25, unknown: 0.3, document_question: 0.35,
  concept_explanation: 0.5, comparison: 0.6, revision: 0.4, quiz_generation: 0.4,
  follow_up: 0.4, career_guidance: 0.4, planning: 0.4, image_explanation: 0.45, multi_topic: 0.7,
  problem_solving: 0.75, numerical: 0.7, homework_help: 0.65, assignment_help: 0.65,
  coding: 0.7, debugging: 0.7, research: 0.9,
};

const BLOOM_DEPTH: Record<BloomLevel, number> = {
  remember: 0.1, understand: 0.35, apply: 0.55, analyze: 0.7, evaluate: 0.85, create: 1,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const clampLevel = (n: number): 1 | 2 | 3 | 4 | 5 => Math.max(1, Math.min(5, Math.round(n))) as 1 | 2 | 3 | 4 | 5;

export interface SemanticComplexityHints {
  /** Real prerequisite count if the caller already resolved graph metadata (optional). */
  prerequisiteCount?: number;
  /** Graph traversal depth already observed (optional). */
  graphTraversalDepth?: number;
}

export class SemanticComplexityAnalyzer {
  analyze(
    input: IntelligenceInput,
    category: QueryCategory,
    bloom: BloomLevel,
    recommendedWorkflow: WorkflowName,
    hints: SemanticComplexityHints = {},
  ): SemanticComplexity {
    const q = (input.query || '').toLowerCase();
    const words = q.split(/\s+/).filter(Boolean).length;
    const factors: string[] = [`cat:${category}`, `bloom:${bloom}`];

    // Reasoning depth: category base + bloom, nudged by explicit reasoning markers.
    let reasoningDepth = (BASE_DEPTH[category] ?? 0.4) * 0.6 + BLOOM_DEPTH[bloom] * 0.4;
    if (/\b(derive|prove|step by step|from first principles|rigorous|logically)\b/.test(q)) { reasoningDepth += 0.15; factors.push('reasoning-markers'); }

    // Synthesis requirement: comparisons, multi-part, "relate/implications".
    let synthesisRequirement = 0;
    if (/\b(compare|contrast|relationship between|trade-?offs|implications|synthesi[sz]e|connect|integrate)\b/.test(q)) { synthesisRequirement += 0.5; factors.push('synthesis'); }
    if ((q.match(/\?/g) || []).length >= 2 || category === 'multi_topic') { synthesisRequirement += 0.4; factors.push('multi-part'); }

    // Mathematical reasoning.
    let mathematicalReasoning = 0;
    if (/[0-9].*[+\-*/=^%]|\bcalculate\b|\bsolve\b|\bequation\b|\bderive\b|\bintegral\b|\bprobability\b/.test(q) || category === 'numerical' || category === 'problem_solving') {
      mathematicalReasoning = category === 'numerical' ? 0.9 : 0.6; factors.push('math');
    }

    // Abstraction level: theory/why/conceptual vs concrete facts.
    let abstractionLevel = BLOOM_DEPTH[bloom] * 0.7;
    if (/\b(theory|abstract|conceptual|principle|framework|why|philosophy)\b/.test(q)) abstractionLevel += 0.2;

    // Concept dependency + prerequisites (heuristic unless hints provided).
    const prerequisiteCount = hints.prerequisiteCount ?? this.estimatePrereqs(category, bloom, words);
    const conceptDependency = clamp01(prerequisiteCount / 6 + (synthesisRequirement > 0 ? 0.2 : 0));
    const graphTraversalDepth = hints.graphTraversalDepth ?? Math.min(4, 1 + Math.round(conceptDependency * 3));

    // Explanation difficulty: blends reasoning + abstraction + dependency.
    const explanationDifficulty = clamp01(reasoningDepth * 0.4 + abstractionLevel * 0.3 + conceptDependency * 0.3);

    if (words > 40) factors.push('long-query');

    reasoningDepth = clamp01(reasoningDepth);
    synthesisRequirement = clamp01(synthesisRequirement);
    abstractionLevel = clamp01(abstractionLevel);

    // Blend to a 1..5 score (kept compatible with existing complexity.level consumers).
    const blended =
      reasoningDepth * 0.3 +
      explanationDifficulty * 0.2 +
      synthesisRequirement * 0.2 +
      mathematicalReasoning * 0.15 +
      conceptDependency * 0.15;
    const score = clampLevel(1 + blended * 4);

    const estimatedContextSize = 800 + score * 1400 + Math.round(conceptDependency * 2000);
    const expectedTokens = Math.round(estimatedContextSize / 4) + 300 + score * 200;
    const expectedLatencyMs = 500 + score * 2200 + Math.round(synthesisRequirement * 2000);

    return {
      score,
      reasoningDepth,
      conceptDependency,
      prerequisiteCount,
      graphTraversalDepth,
      abstractionLevel,
      explanationDifficulty,
      mathematicalReasoning,
      synthesisRequirement,
      estimatedContextSize,
      expectedTokens,
      expectedLatencyMs,
      recommendedWorkflow,
      factors,
    };
  }

  private estimatePrereqs(category: QueryCategory, bloom: BloomLevel, words: number): number {
    let n = BLOOM_DEPTH[bloom] * 4;
    if (category === 'problem_solving' || category === 'numerical') n += 2;
    if (category === 'research' || category === 'multi_topic') n += 3;
    if (category === 'definition' || category === 'greeting') n = Math.min(n, 1);
    if (words > 40) n += 1;
    return Math.max(0, Math.round(n));
  }
}

export const semanticComplexityAnalyzer = new SemanticComplexityAnalyzer();

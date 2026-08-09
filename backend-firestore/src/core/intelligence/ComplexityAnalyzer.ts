import { QueryCategory, ComplexityScore, IntelligenceInput } from './types';

/** Base complexity per category (before query-shape adjustments). */
const BASE: Record<QueryCategory, 1 | 2 | 3 | 4 | 5> = {
  greeting: 1,
  casual_conversation: 1,
  general_chat: 1,
  translation: 1,
  definition: 2,
  notebook_search: 2,
  summary: 2,
  unknown: 2,
  concept_explanation: 3,
  comparison: 3,
  revision: 3,
  quiz_generation: 3,
  document_question: 3,
  follow_up: 3,
  career_guidance: 3,
  planning: 3,
  image_explanation: 3,
  problem_solving: 4,
  numerical: 4,
  homework_help: 4,
  assignment_help: 4,
  coding: 4,
  debugging: 4,
  multi_topic: 4,
  research: 5,
};

const clamp = (n: number): 1 | 2 | 3 | 4 | 5 => Math.max(1, Math.min(5, n)) as 1 | 2 | 3 | 4 | 5;

/**
 * QueryComplexityAnalyzer — scores a query 1..5 (Task 2). Starts from a category base level and
 * adjusts for query shape (length, explicit reasoning markers, multi-part questions). Deterministic.
 */
export class ComplexityAnalyzer {
  score(input: IntelligenceInput, category: QueryCategory): ComplexityScore {
    const q = (input.query || '').toLowerCase();
    const words = q.split(/\s+/).filter(Boolean).length;
    const factors: string[] = [`base:${category}`];
    let level = BASE[category] ?? 2;

    if (words > 40) { level += 1; factors.push('long-query'); }
    if (/\b(derive|prove|step by step|show that|from first principles|rigorous)\b/.test(q)) { level += 1; factors.push('reasoning-markers'); }
    if ((q.match(/\?/g) || []).length >= 2) { level += 1; factors.push('multi-question'); }
    if (/\b(compare|contrast|relationship between|trade-?offs|implications|synthesi[sz]e)\b/.test(q)) { level += 1; factors.push('synthesis-markers'); }
    if (words <= 3 && level > 2) { level -= 1; factors.push('very-short'); }

    return { level: clamp(level), factors };
  }
}

export const complexityAnalyzer = new ComplexityAnalyzer();

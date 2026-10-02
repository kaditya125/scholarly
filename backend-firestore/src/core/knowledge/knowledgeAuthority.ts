/**
 * Knowledge authority — the ONE place retrieval authority weights are defined.
 * =============================================================================
 *
 * Four tiers, strongest first:
 *
 *   OFFICIAL_PRIMARY  1.4   NCERT, official syllabus, government/exam-body documents
 *   VERIFIED_PYQ      1.2   past-paper questions verified against an official source
 *   REFERENCE_BOOK    0.9   Lucent, S. Chand, H.C. Verma, Irodov, … (secondary, trusted)
 *   AI_GENERATED      0.6   practice / template / model-written questions and text
 *
 * `weightedScore = relevance × tierWeight`. Because every retrieval path normalises relevance to
 * the reranker's 0–1 relevance score before weighting, weighted scores are comparable ACROSS tiers,
 * and rankAcrossTiers() orders a mixed pool by them. On a relevance tie the higher tier wins; a
 * much more relevant lower-tier passage can still outrank a barely-relevant official one, which is
 * the point of weighting rather than strict tier precedence.
 *
 * Two sources are not tiers of public knowledge and keep their own documented weights:
 *   USER_UPLOAD 1.0  — the student's own notebook. Ranked only against other notebook content.
 *   WEB_SEARCH  0.8  — live web results (an official .gov/.nic.in page is OFFICIAL_PRIMARY instead).
 */

export const KNOWLEDGE_AUTHORITY_WEIGHTS = {
  OFFICIAL_PRIMARY: 1.4,
  VERIFIED_PYQ: 1.2,
  REFERENCE_BOOK: 0.9,
  AI_GENERATED: 0.6,
} as const;

export type KnowledgeTier = keyof typeof KNOWLEDGE_AUTHORITY_WEIGHTS;

/** Presentation order of tiers in an LLM context block. */
export const KNOWLEDGE_TIER_ORDER: KnowledgeTier[] = ['OFFICIAL_PRIMARY', 'VERIFIED_PYQ', 'REFERENCE_BOOK', 'AI_GENERATED'];

export const NON_TIER_WEIGHTS = {
  USER_UPLOAD: 1.0,
  WEB_SEARCH: 0.8,
} as const;

/**
 * Fine-grained authority labels used in vector metadata (`meta.authority`, provenance classes)
 * mapped onto tiers. Every label the retrieval code assigns appears here; an unknown label falls
 * back to USER_UPLOAD's neutral 1.0 in authorityWeight().
 */
export const AUTHORITY_LEVEL_TIER: Record<string, KnowledgeTier> = {
  NCERT: 'OFFICIAL_PRIMARY',
  OFFICIAL_SYLLABUS: 'OFFICIAL_PRIMARY',
  GOVERNMENT: 'OFFICIAL_PRIMARY',
  AUTHENTIC_PYQ: 'VERIFIED_PYQ',
  SECONDARY_PYQ: 'VERIFIED_PYQ',
  REFERENCE_BOOK: 'REFERENCE_BOOK',
  STANDARD_TEXTBOOK: 'REFERENCE_BOOK',
  PRACTICE_QUESTION: 'AI_GENERATED',
  GENERATED: 'AI_GENERATED',
};

export function tierWeight(tier: KnowledgeTier): number {
  return KNOWLEDGE_AUTHORITY_WEIGHTS[tier];
}

/** Weight for a fine-grained authority label (see AUTHORITY_LEVEL_TIER). */
export function authorityWeight(level: string | undefined): number {
  if (!level) return NON_TIER_WEIGHTS.USER_UPLOAD;
  const tier = AUTHORITY_LEVEL_TIER[level];
  if (tier) return tierWeight(tier);
  if (level in NON_TIER_WEIGHTS) return NON_TIER_WEIGHTS[level as keyof typeof NON_TIER_WEIGHTS];
  if (level === 'TEACHER_NOTES') return NON_TIER_WEIGHTS.USER_UPLOAD;
  return NON_TIER_WEIGHTS.USER_UPLOAD;
}

export interface TieredItem<T> {
  tier: KnowledgeTier;
  /** 0–1 relevance (reranker relevance where available, else cosine). */
  relevance: number;
  item: T;
}

export interface RankedItem<T> extends TieredItem<T> {
  weightedScore: number;
}

/**
 * Global ranking of a mixed pool: weightedScore desc; ties broken by tier order, then relevance.
 * Pure — the orchestrator uses it to decide WHICH passages make the context budget.
 */
export function rankAcrossTiers<T>(items: TieredItem<T>[]): RankedItem<T>[] {
  return items
    .map((x) => ({ ...x, relevance: clamp01(x.relevance), weightedScore: clamp01(x.relevance) * tierWeight(x.tier) }))
    .sort((a, b) =>
      b.weightedScore - a.weightedScore
      || KNOWLEDGE_TIER_ORDER.indexOf(a.tier) - KNOWLEDGE_TIER_ORDER.indexOf(b.tier)
      || b.relevance - a.relevance);
}

/**
 * Select the passages that make the context: the top `budget` by weightedScore, then re-grouped
 * in tier order (official first) so the model reads the most authoritative material first.
 */
export function selectContext<T>(items: TieredItem<T>[], budget: number): RankedItem<T>[] {
  const chosen = rankAcrossTiers(items).slice(0, Math.max(0, budget));
  return chosen.sort((a, b) =>
    KNOWLEDGE_TIER_ORDER.indexOf(a.tier) - KNOWLEDGE_TIER_ORDER.indexOf(b.tier) || b.weightedScore - a.weightedScore);
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

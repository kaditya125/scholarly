import { ModelChoice, ModelTier } from './types';

/**
 * Dynamic Model Optimization (Task 10) — chooses the optimal provider tier from a richer signal set
 * than category/complexity alone: provider latency + health + availability, token/cost budgets,
 * context length, complexity, and historical answer quality. PURE + advisory; the behavior-
 * preserving default (reasoning → ReasoningProvider, today's answer model) is returned whenever the
 * optimizer is disabled or signals are absent, so nothing changes with the flag off.
 */
export interface ModelOptimizerInput {
  complexity: number;              // 1..5 (semantic complexity score preferred)
  contextTokens?: number;          // estimated prompt/context size
  providerHealthy?: boolean;       // reasoning-provider health
  providerLatencyMs?: number;      // recent reasoning-provider latency
  reasoningAvailable?: boolean;    // reasoning provider reachable at all
  tokenBudget?: number;            // remaining token budget for this request/user
  costBudgetUsd?: number;          // remaining cost budget
  historicalQuality?: number;      // 0..1 recent answer quality for this route
}

export interface OptimizedModel extends ModelChoice {
  factors: string[];
}

const tierToChoice = (tier: ModelTier, reason: string, factors: string[]): OptimizedModel => {
  switch (tier) {
    case 'reasoning': return { tier, providerToken: 'ReasoningProvider', label: 'reasoning (Grok/Gemini)', reason, factors };
    case 'balanced':  return { tier, providerToken: 'ReasoningProvider', label: 'balanced', reason, factors };
    case 'fast':
    default:          return { tier, providerToken: 'AIProvider', label: 'fast (Gemini flash)', reason, factors };
  }
};

/** Behavior-preserving default: today's production answer model. */
export const DEFAULT_MODEL: OptimizedModel = { tier: 'reasoning', providerToken: 'ReasoningProvider', label: 'reasoning (default)', reason: 'default', factors: ['default'] };

export class ModelOptimizer {
  /**
   * Score the signals into a tier (pure). Starts from complexity, then degrades toward the fast
   * base provider under health/latency/budget pressure, and can upgrade to reasoning when quality
   * has been poor on a demanding query. Bounded + explainable.
   */
  optimize(input: ModelOptimizerInput): OptimizedModel {
    const factors: string[] = [];

    // Hard constraints first — force the safe/base provider.
    if (input.reasoningAvailable === false || input.providerHealthy === false) {
      factors.push('reasoning-unavailable→fast');
      return tierToChoice('fast', 'reasoning provider degraded/unavailable', factors);
    }
    if (typeof input.tokenBudget === 'number' && input.tokenBudget > 0 && typeof input.contextTokens === 'number' && input.contextTokens > input.tokenBudget) {
      factors.push('context-exceeds-budget→fast');
      return tierToChoice('fast', 'context exceeds remaining token budget', factors);
    }
    if (typeof input.costBudgetUsd === 'number' && input.costBudgetUsd <= 0) {
      factors.push('no-cost-budget→fast');
      return tierToChoice('fast', 'cost budget exhausted', factors);
    }

    // Base tier from complexity (same thresholds as ModelRouter).
    let tier: ModelTier = input.complexity >= 4 ? 'reasoning' : input.complexity <= 2 ? 'fast' : 'balanced';
    factors.push(`complexity:${input.complexity}→${tier}`);

    // High recent latency on a non-demanding query → prefer the faster tier.
    if (typeof input.providerLatencyMs === 'number' && input.providerLatencyMs > 8000 && input.complexity <= 3) {
      tier = tier === 'reasoning' ? 'balanced' : 'fast';
      factors.push('high-latency→downgrade');
    }

    // Poor historical quality on a demanding query → upgrade to reasoning.
    if (typeof input.historicalQuality === 'number' && input.historicalQuality < 0.5 && input.complexity >= 3) {
      tier = 'reasoning';
      factors.push('low-historical-quality→reasoning');
    }

    return tierToChoice(tier, 'optimized from signals', factors);
  }
}

export const modelOptimizer = new ModelOptimizer();

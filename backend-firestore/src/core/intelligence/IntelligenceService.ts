import { intentAnalyzer, IntentAnalyzer } from './IntentAnalyzer';
import { complexityAnalyzer, ComplexityAnalyzer } from './ComplexityAnalyzer';
import { workflowRouter, WorkflowRouter } from './WorkflowRouter';
import { retrievalRouter, RetrievalRouter } from './RetrievalRouter';
import { modelRouter, ModelRouter } from './ModelRouter';
import { bloomClassifier, BloomClassifier } from './BloomClassifier';
import { semanticComplexityAnalyzer, SemanticComplexityAnalyzer, SemanticComplexityHints } from './SemanticComplexityAnalyzer';
import { hybridIntentClassifier, HybridIntentClassifier } from './HybridIntentClassifier';
import { ExecutionPlan, IntelligenceInput, QueryCategory, CachePolicy } from './types';
import { featureFlags } from '../../config/featureFlags';

/** Rough latency/cost estimates per complexity level (informational / for analytics). */
const EST_LATENCY_MS = { 1: 400, 2: 1500, 3: 4000, 4: 7000, 5: 12000 } as const;
const EST_COST_USD = { 1: 0.0002, 2: 0.0005, 3: 0.001, 4: 0.002, 5: 0.004 } as const;

/** Categories whose answers are stable/factual enough to be semantically cached. */
const CACHEABLE: Set<QueryCategory> = new Set(['definition', 'concept_explanation', 'comparison', 'summary']);

/**
 * IntelligenceService (Task 13 facade) — the single entry point that turns a request into an
 * immutable ExecutionPlan by composing the analyzers + routers. Pure and synchronous on the
 * heuristic path (no I/O, no LLM), so it adds negligible latency. Dependency-injectable.
 */
export class IntelligenceService {
  constructor(
    private readonly intent: IntentAnalyzer = intentAnalyzer,
    private readonly complexity: ComplexityAnalyzer = complexityAnalyzer,
    private readonly workflows: WorkflowRouter = workflowRouter,
    private readonly retrieval: RetrievalRouter = retrievalRouter,
    private readonly models: ModelRouter = modelRouter,
    private readonly bloom: BloomClassifier = bloomClassifier,
    private readonly semantic: SemanticComplexityAnalyzer = semanticComplexityAnalyzer,
    private readonly hybrid: HybridIntentClassifier = hybridIntentClassifier,
  ) {}

  plan(input: IntelligenceInput): ExecutionPlan {
    const { category, confidence } = this.intent.analyze(input);
    return this.buildPlan(input, category, confidence, 'heuristic');
  }

  /**
   * Async variant that uses the HybridIntentClassifier (Task 1). Identical to `plan()` when the
   * `hybridIntent` flag is off or the query is confident — it only awaits an LLM classifier for the
   * ambiguous tail. Kept separate so the synchronous, zero-latency `plan()` hot path is preserved.
   */
  async planAsync(input: IntelligenceInput): Promise<ExecutionPlan> {
    const h = await this.hybrid.classify(input);
    return this.buildPlan(input, h.category, h.confidence, h.source);
  }

  /** Shared plan assembly. Phase 3 additive fields (bloom/semanticComplexity) are gated + optional. */
  private buildPlan(
    input: IntelligenceInput,
    category: QueryCategory,
    confidence: number,
    intentSource: 'heuristic' | 'llm' | 'merged',
    hints: SemanticComplexityHints = {},
  ): ExecutionPlan {
    const complexity = this.complexity.score(input, category);
    const workflow = this.workflows.route(category);
    const retrievalStrategy = this.retrieval.route(category, { hasNotebook: !!input.notebookId });

    // Model + estimates stay on the original 1..5 level so the plan is byte-identical to Phase 2.
    // The richer semanticComplexity is attached observe-only; the ModelOptimizer (Increment 6)
    // consumes it behind its own flag.
    const model = this.models.route({ category, complexity: complexity.level, providerHealthy: true });

    let bloom;
    let semanticComplexity;
    if (featureFlags.bloomClassification) {
      bloom = this.bloom.classify(input);
      semanticComplexity = this.semantic.analyze(input, category, bloom.level, workflow.name, hints);
    }

    return {
      category,
      confidence,
      complexity,
      workflow,
      retrievalStrategy,
      model,
      personalization: {}, // populated once PreferenceService personalization lands
      cachePolicy: this.cachePolicyFor(category),
      estimatedLatencyMs: EST_LATENCY_MS[complexity.level],
      estimatedCostUsd: EST_COST_USD[complexity.level],
      source: 'intelligence',
      bloom,
      semanticComplexity,
      intentSource,
    };
  }

  /**
   * The behavior-preserving default plan: exactly today's pipeline (concept workflow, full
   * GraphRAG, reasoning model). Used when the Intelligence Layer is disabled, so execution is
   * byte-for-byte unchanged.
   */
  defaultPlan(input: IntelligenceInput): ExecutionPlan {
    const workflow = this.workflows.default();
    return {
      category: 'concept_explanation',
      confidence: 0,
      complexity: { level: 3, factors: ['default'] },
      workflow,
      retrievalStrategy: 'graphrag',
      model: this.models.default(),
      personalization: {},
      cachePolicy: { cacheable: false, similarityThreshold: 1, ttlSeconds: 0 },
      estimatedLatencyMs: EST_LATENCY_MS[3],
      estimatedCostUsd: EST_COST_USD[3],
      source: 'default',
    };
  }

  private cachePolicyFor(category: QueryCategory): CachePolicy {
    return CACHEABLE.has(category)
      ? { cacheable: true, similarityThreshold: 0.95, ttlSeconds: 86400 }
      : { cacheable: false, similarityThreshold: 1, ttlSeconds: 0 };
  }
}

export const intelligenceService = new IntelligenceService();

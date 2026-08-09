/**
 * Intelligence Layer — shared types (Phase 2).
 *
 * These describe the decisions made BEFORE retrieval/generation begins. They are additive and
 * do not alter any existing type. The central artifact is the `ExecutionPlan`, an immutable
 * decision object the workflow consults. With the Intelligence Layer disabled, the plan defaults
 * to today's pipeline (concept workflow, GraphRAG retrieval, reasoning model) so behavior is
 * byte-for-byte unchanged.
 */

/** The 25 query categories the IntentAnalyzer can assign. */
export type QueryCategory =
  | 'greeting'
  | 'casual_conversation'
  | 'definition'
  | 'concept_explanation'
  | 'comparison'
  | 'problem_solving'
  | 'numerical'
  | 'revision'
  | 'quiz_generation'
  | 'homework_help'
  | 'assignment_help'
  | 'coding'
  | 'debugging'
  | 'research'
  | 'summary'
  | 'translation'
  | 'planning'
  | 'career_guidance'
  | 'image_explanation'
  | 'notebook_search'
  | 'document_question'
  | 'follow_up'
  | 'multi_topic'
  | 'general_chat'
  | 'unknown';

/** Retrieval strategies the RetrievalRouter can select. Extensible for future plugins. */
export type RetrievalStrategy =
  | 'none'                     // greeting / casual — no retrieval
  | 'vector'                   // definitions — vector only
  | 'graphrag'                 // concept — graph + vector (today's default)
  | 'graphrag_reasoning'       // problem solving — graph + vector + heavier reasoning
  | 'graph_web'                // research — graph + live web
  | 'notebook'                 // notebook search — notebook-scoped retrieval
  | 'graph_memory'             // homework — graph + student memory
  | 'weak_topics_notebook';    // revision — weak topics + notebook

/** Named workflows the WorkflowRouter can select. */
export type WorkflowName =
  | 'greeting'
  | 'conversation'
  | 'definition'
  | 'concept'
  | 'revision'
  | 'quiz'
  | 'problem_solving'
  | 'research'
  | 'coding'
  | 'notebook'
  | 'planner'
  | 'homework';

/** Logical model tiers, mapped to concrete DI provider tokens by the ModelRouter. */
export type ModelTier = 'fast' | 'balanced' | 'reasoning';

export type VerificationStrategy = 'none' | 'lightweight' | 'full';

/** A workflow's execution profile (what retrieval/model/prompt/behavior it implies). */
export interface WorkflowDefinition {
  name: WorkflowName;
  retrievalStrategy: RetrievalStrategy;
  modelTier: ModelTier;
  /** Prompt template identifier (maps to existing prompt builders; informational for now). */
  promptTemplate: string;
  streaming: boolean;
  useMemory: boolean;
  verification: VerificationStrategy;
}

export interface ComplexityScore {
  /** 1 (trivial) … 5 (heavy synthesis / long reasoning). */
  level: 1 | 2 | 3 | 4 | 5;
  factors: string[];
}

export interface ModelChoice {
  tier: ModelTier;
  /** DI token label the workflow should resolve (kept behavior-preserving by default). */
  providerToken: 'AIProvider' | 'ReasoningProvider';
  label: string;
  reason: string;
}

/** How the answer should be personalized (derived from student preferences, later increments). */
export interface PersonalizationPlan {
  language?: string;
  depth?: 'brief' | 'standard' | 'deep';
  preferExamples?: boolean;
  preferDiagrams?: boolean;
  preferTables?: boolean;
}

export interface CachePolicy {
  cacheable: boolean;
  similarityThreshold: number;
  ttlSeconds: number;
}

/** Rich category classification result from the IntentAnalyzer. */
export interface IntentResult {
  category: QueryCategory;
  confidence: number;
  complexity: ComplexityScore;
  requiredRetrieval: RetrievalStrategy;
  estimatedLatencyMs: number;
  estimatedCostUsd: number;
  recommendedModel: ModelTier;
  recommendedWorkflow: WorkflowName;
  /** Human-readable signals that drove the classification (observability). */
  signals: string[];
}

/**
 * The immutable decision object the WorkflowEngine consults. `source` distinguishes an
 * Intelligence-Layer plan from the behavior-preserving default.
 */
export interface ExecutionPlan {
  category: QueryCategory;
  confidence: number;
  complexity: ComplexityScore;
  workflow: WorkflowDefinition;
  retrievalStrategy: RetrievalStrategy;
  model: ModelChoice;
  personalization: PersonalizationPlan;
  cachePolicy: CachePolicy;
  estimatedLatencyMs: number;
  estimatedCostUsd: number;
  source: 'intelligence' | 'default';
  /** Phase 3 (additive, optional) — Bloom's-taxonomy level of the question. */
  bloom?: BloomResult;
  /** Phase 3 (additive, optional) — multi-dimensional semantic complexity. */
  semanticComplexity?: SemanticComplexity;
  /** Phase 3 (additive, optional) — how the final intent was decided. */
  intentSource?: 'heuristic' | 'llm' | 'merged';
}

// ─── Phase 3: Adaptive Tutor additions (all additive) ────────────────────────

/** Bloom's Taxonomy cognitive levels (Task 3), ordered low → high. */
export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';

export interface BloomResult {
  level: BloomLevel;
  confidence: number;
  signals: string[];
}

/**
 * Multi-dimensional semantic complexity (Task 2) — replaces the single 1..5 scalar with the
 * educational dimensions that actually drive retrieval depth, model tier and explanation style.
 * All sub-dimensions are normalized 0..1; `score` is the blended 1..5 level (kept compatible with
 * the existing ComplexityScore.level consumers).
 */
export interface SemanticComplexity {
  score: 1 | 2 | 3 | 4 | 5;
  reasoningDepth: number;
  conceptDependency: number;
  prerequisiteCount: number;
  graphTraversalDepth: number;
  abstractionLevel: number;
  explanationDifficulty: number;
  mathematicalReasoning: number;
  synthesisRequirement: number;
  estimatedContextSize: number;
  expectedTokens: number;
  expectedLatencyMs: number;
  recommendedWorkflow: WorkflowName;
  factors: string[];
}

/** Minimal request shape the Intelligence Layer needs (subset of WorkflowRequest). */
export interface IntelligenceInput {
  query: string;
  history: Array<{ role: string; content: string }>;
  notebookId?: string;
  mode?: string;
}

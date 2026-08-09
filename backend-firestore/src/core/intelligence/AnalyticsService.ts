/**
 * AI Analytics (Task 10) — captures the intelligence-layer dimensions of every turn (query
 * category, workflow/model/retrieval usage, graph vs vector usage, latency/cost/tokens, grounding,
 * citation, cache-hit) for the admin dashboards + the LearningEngine.
 *
 * Additive to the existing IAnalyticsProvider (which records RetrievalMetrics via
 * WorkflowTelemetryService) — this does NOT duplicate that; it records the NEW routing/quality
 * dimensions the Intelligence Layer introduces. `build()` is pure; `record()` is guarded + async.
 */
export interface AnalyticsInput {
  category?: string;
  workflow?: string;
  model?: string;
  retrievalStrategy?: string;
  graphUsed?: boolean;
  vectorUsed?: boolean;
  cacheHit?: boolean;
  latencyMs?: number;
  costUsd?: number;
  tokens?: number;
  grounding?: number;      // 0..1
  citationCount?: number;
  confidence?: number;     // 0..1
  // ── Phase 3: Adaptive-tutor observability dimensions (all optional/additive) ──
  bloomLevel?: string;             // remember..create
  intentSource?: string;           // heuristic | llm | merged
  promptTemplate?: string;         // role template used by the dynamic prompt
  promptSignals?: string[];        // which adaptive directives fired
  retrievalConfidence?: number;    // 0..1 (from evaluation)
  followup?: boolean;              // was this a follow-up turn
  diagramUsed?: boolean;           // did the answer include a diagram/visual
  explanationDepth?: string;       // brief | standard | deep
  avgMastery?: number;             // 0..1 student mastery snapshot at turn time
  learningGain?: number;           // -1..1 mastery delta attributable to this turn
}

export interface AnalyticsRecord {
  category: string;
  workflow: string;
  model: string;
  retrievalStrategy: string;
  graphUsed: boolean;
  vectorUsed: boolean;
  cacheHit: boolean;
  latencyMs: number;
  costUsd: number;
  tokens: number;
  grounding: number;
  citationCount: number;
  confidence: number;
  // ── Phase 3 observability (additive; defaults keep records backward-compatible) ──
  bloomLevel: string;
  intentSource: string;
  promptTemplate: string;
  promptSignals: string[];
  retrievalConfidence: number;
  followup: boolean;
  diagramUsed: boolean;
  explanationDepth: string;
  avgMastery: number;
  learningGain: number;
  ts: number;
}

export interface AnalyticsStore {
  append(record: AnalyticsRecord): Promise<void>;
}

class FirestoreAnalyticsStore implements AnalyticsStore {
  async append(record: AnalyticsRecord): Promise<void> {
    try {
      const { db } = require('../../config/firebase');
      await db.collection('intelligence_analytics').add(record);
    } catch { /* non-fatal */ }
  }
}

export class AnalyticsService {
  constructor(private readonly store: AnalyticsStore = new FirestoreAnalyticsStore()) {}

  /** Build a normalized analytics record (pure). */
  build(input: AnalyticsInput): AnalyticsRecord {
    return {
      category: input.category || 'unknown',
      workflow: input.workflow || 'concept',
      model: input.model || 'reasoning',
      retrievalStrategy: input.retrievalStrategy || 'graphrag',
      graphUsed: !!input.graphUsed,
      vectorUsed: !!input.vectorUsed,
      cacheHit: !!input.cacheHit,
      latencyMs: Math.round(input.latencyMs ?? 0),
      costUsd: input.costUsd ?? 0,
      tokens: input.tokens ?? 0,
      grounding: input.grounding ?? 0,
      citationCount: input.citationCount ?? 0,
      confidence: input.confidence ?? 0,
      bloomLevel: input.bloomLevel || 'unknown',
      intentSource: input.intentSource || 'heuristic',
      promptTemplate: input.promptTemplate || 'teacher',
      promptSignals: input.promptSignals || [],
      retrievalConfidence: input.retrievalConfidence ?? 0,
      followup: !!input.followup,
      diagramUsed: !!input.diagramUsed,
      explanationDepth: input.explanationDepth || 'standard',
      avgMastery: input.avgMastery ?? 0,
      learningGain: input.learningGain ?? 0,
      ts: Date.now(),
    };
  }

  async record(input: AnalyticsInput): Promise<void> {
    await this.store.append(this.build(input));
  }
}

export const analyticsService = new AnalyticsService();

import { FeedbackSummary } from './FeedbackService';
import { EvaluationResult } from './EvaluationService';
import { AnalyticsRecord } from './AnalyticsService';
import { StudentPreferences } from './PreferenceService';

/**
 * LearningEngine (Task 12) — the reflective layer that closes the loop. It consumes the evidence
 * the other services accumulate (feedback summary, continuous-evaluation results, analytics,
 * learned preferences) and emits RECOMMENDATIONS for how routing / retrieval / prompt / cache /
 * model decisions could improve.
 *
 * CRITICAL SAFETY PROPERTY: this engine is advisory only. `analyze()` is pure and performs NO
 * autonomous mutation — it never changes flags, routing tables, prompts, or preferences. A human
 * (or a future, explicitly-flagged applier) decides whether to act on a recommendation. This keeps
 * the "self-improving" loop observable and reversible, preserving all existing behavior.
 */

export type RecommendationKind = 'routing' | 'retrieval' | 'prompt' | 'cache' | 'model' | 'personalization' | 'mastery';

export interface Recommendation {
  kind: RecommendationKind;
  action: string;
  rationale: string;
  confidence: number;                 // 0..1
  evidence: Record<string, number | string | boolean>;
  scope?: { category?: string; workflow?: string; model?: string };
}

/** Aggregate mastery signal (Phase 3, Task 6/8) — e.g. from MasteryEngine.snapshot(). */
export interface MasterySnapshot {
  concepts: number;
  avgMastery: number;
  weak: number;
  improving: number;
  declining?: number;
  weakConcepts?: string[];
}

/** Per-template prompt performance (Phase 3, Task 8) — e.g. rolled up from analytics/evaluations. */
export interface PromptPerformance {
  template: string;
  uses: number;
  satisfaction: number;      // 0..1
  regenerationRate: number;  // 0..1
}

export interface LearningInputs {
  feedback?: FeedbackSummary;
  evaluations?: EvaluationResult[];
  analytics?: AnalyticsRecord[];
  preferences?: StudentPreferences;
  mastery?: MasterySnapshot;
  promptPerformance?: PromptPerformance[];
}

export interface LearningReport {
  generatedAt: number;
  health: {
    avgOverall: number;
    satisfaction: number;
    avgHallucinationRisk: number;
    avgRetrievalConfidence: number;
    avgChunkUtilization: number;
    cacheHitRate: number;
    workflowSelectionOkRate: number;
    avgMastery: number;
    weakConceptRatio: number;
    sampleSize: number;
  };
  recommendations: Recommendation[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const rate = (n: number, d: number) => (d > 0 ? n / d : 0);

export class LearningEngine {
  /** Analyze accumulated evidence and emit advisory recommendations (pure, no mutation). */
  analyze(inputs: LearningInputs): LearningReport {
    const evals = inputs.evaluations || [];
    const analytics = inputs.analytics || [];
    const fb = inputs.feedback;
    const prefs = inputs.preferences || {};
    const mastery = inputs.mastery;
    const promptPerf = inputs.promptPerformance || [];

    const health = {
      avgOverall: mean(evals.map((e) => e.overall)),
      satisfaction: fb ? fb.satisfaction : 0.5,
      avgHallucinationRisk: mean(evals.map((e) => e.hallucinationRisk)),
      avgRetrievalConfidence: mean(evals.map((e) => e.retrieval.retrievalConfidence)),
      avgChunkUtilization: mean(evals.map((e) => e.retrieval.chunkUtilization)),
      cacheHitRate: analytics.length ? rate(analytics.filter((a) => a.cacheHit).length, analytics.length) : 0,
      workflowSelectionOkRate: evals.length ? rate(evals.filter((e) => e.workflowSelectionOk).length, evals.length) : 1,
      avgMastery: mastery ? mastery.avgMastery : 0,
      weakConceptRatio: mastery && mastery.concepts > 0 ? rate(mastery.weak, mastery.concepts) : 0,
      sampleSize: Math.max(evals.length, analytics.length, fb ? fb.total : 0),
    };

    const recs: Recommendation[] = [];

    // 1. Grounding / hallucination risk.
    if (evals.length >= 3 && health.avgHallucinationRisk > 0.3) {
      recs.push({
        kind: 'retrieval',
        action: 'Increase retrieval depth or enable graph fusion for low-grounding categories',
        rationale: 'Average hallucination risk is elevated, indicating answers are weakly grounded in retrieved context.',
        confidence: Math.min(1, health.avgHallucinationRisk),
        evidence: { avgHallucinationRisk: round(health.avgHallucinationRisk), sampleSize: evals.length },
      });
      recs.push({
        kind: 'prompt',
        action: 'Strengthen grounding constraints in the answer prompt (cite-or-abstain)',
        rationale: 'Elevated hallucination risk suggests the prompt should more strictly require citation-backed claims.',
        confidence: Math.min(1, health.avgHallucinationRisk * 0.9),
        evidence: { avgHallucinationRisk: round(health.avgHallucinationRisk) },
      });
    }

    // 2. Retrieval confidence.
    if (evals.length >= 3 && health.avgRetrievalConfidence < 0.4) {
      recs.push({
        kind: 'retrieval',
        action: 'Widen top-k or switch retrieval strategy; retrieval confidence is low',
        rationale: 'Mean top-k similarity is low, so the retriever is surfacing weakly-related context.',
        confidence: Math.min(1, 0.4 - health.avgRetrievalConfidence + 0.5),
        evidence: { avgRetrievalConfidence: round(health.avgRetrievalConfidence) },
      });
    }

    // 3. Chunk utilization (retrieving too much unused context).
    if (evals.length >= 3 && health.avgChunkUtilization < 0.2) {
      recs.push({
        kind: 'retrieval',
        action: 'Reduce top-k or improve reranking; most retrieved chunks go uncited',
        rationale: 'Low chunk utilization means retrieval is over-fetching context that the answer never uses (cost + noise).',
        confidence: 0.6,
        evidence: { avgChunkUtilization: round(health.avgChunkUtilization) },
      });
    }

    // 4. Workflow selection quality.
    if (evals.length >= 5 && health.workflowSelectionOkRate < 0.8) {
      recs.push({
        kind: 'routing',
        action: 'Review workflow routing table; several turns selected a workflow that produced no usable grounding',
        rationale: 'A notable fraction of retrieval-expected turns produced no citations at acceptable confidence.',
        confidence: Math.min(1, 0.8 - health.workflowSelectionOkRate + 0.4),
        evidence: { workflowSelectionOkRate: round(health.workflowSelectionOkRate), sampleSize: evals.length },
      });
    }

    // 5. Explicit dissatisfaction / churn.
    if (fb && fb.thumbsUp + fb.thumbsDown >= 5 && fb.satisfaction < 0.5) {
      recs.push({
        kind: 'model',
        action: 'Consider a higher reasoning tier for affected categories; satisfaction is below neutral',
        rationale: 'Explicit thumbs feedback trends negative, which often correlates with under-powered reasoning or weak grounding.',
        confidence: Math.min(1, 0.5 - fb.satisfaction + 0.5),
        evidence: { satisfaction: round(fb.satisfaction), thumbsUp: fb.thumbsUp, thumbsDown: fb.thumbsDown },
      });
    }
    if (fb && fb.total >= 10 && rate(fb.regenerated, fb.total) > 0.25) {
      recs.push({
        kind: 'prompt',
        action: 'Revisit prompt/workflow for frequently-regenerated categories',
        rationale: 'A high regeneration rate signals answers often miss the mark on the first attempt.',
        confidence: 0.6,
        evidence: { regenerationRate: round(rate(fb.regenerated, fb.total)), total: fb.total },
      });
    }

    // 6. Cache tuning.
    if (analytics.length >= 10) {
      if (health.cacheHitRate < 0.05) {
        recs.push({
          kind: 'cache',
          action: 'Lower semantic-cache similarity threshold for cacheable categories',
          rationale: 'Cache hit rate is very low; a slightly looser threshold may recover more near-duplicate queries safely.',
          confidence: 0.4,
          evidence: { cacheHitRate: round(health.cacheHitRate) },
        });
      } else if (health.cacheHitRate > 0.3 && health.satisfaction >= 0.6) {
        recs.push({
          kind: 'cache',
          action: 'Raise cache TTL; cache is serving frequently with healthy satisfaction',
          rationale: 'A high hit rate alongside positive feedback suggests cached answers are staying relevant.',
          confidence: 0.5,
          evidence: { cacheHitRate: round(health.cacheHitRate), satisfaction: round(health.satisfaction) },
        });
      }
    }

    // 7. Personalization (from learned preferences — advisory, not auto-applied).
    if (prefs.preferShortAnswers || prefs.depth === 'brief') {
      recs.push({
        kind: 'personalization',
        action: 'Apply concise personalization for this student (shorter answers)',
        rationale: 'Student has repeatedly signalled a preference for brief answers.',
        confidence: 0.7,
        evidence: { depth: prefs.depth || 'brief' },
      });
    }
    if (prefs.preferDiagrams || prefs.visualLearner) {
      recs.push({
        kind: 'personalization',
        action: 'Prefer diagrams/visual explanations for this student',
        rationale: 'Student signals indicate a visual learning preference.',
        confidence: 0.65,
        evidence: { visualLearner: true },
      });
    }

    // ── Closed feedback loop (Phase 3, Task 8) — additional signal → recommendation rules ──

    // 8. Repeated follow-ups → the first answer wasn't deep enough.
    if (fb && fb.total >= 10 && rate(fb.followups, fb.total) > 0.3) {
      recs.push({
        kind: 'prompt',
        action: 'Increase default explanation depth (add scaffolding + a worked example)',
        rationale: 'A high follow-up rate indicates students often need more than the first answer provides.',
        confidence: 0.6,
        evidence: { followupRate: round(rate(fb.followups, fb.total)), total: fb.total },
      });
    }

    // 9. Explicit thumbs-down majority → prompt revision (distinct from the satisfaction rule).
    if (fb && fb.thumbsDown >= 3 && fb.thumbsDown > fb.thumbsUp) {
      recs.push({
        kind: 'prompt',
        action: 'Revise the answer prompt for the affected categories; negative votes dominate',
        rationale: 'Thumbs-down outweighs thumbs-up, a direct signal the current answers miss expectations.',
        confidence: Math.min(0.9, 0.4 + 0.1 * fb.thumbsDown),
        evidence: { thumbsDown: fb.thumbsDown, thumbsUp: fb.thumbsUp },
      });
    }

    // 10. Frequent citation opening → students value sources → surface them more.
    if (fb && fb.total >= 10 && rate(fb.citationsOpened, fb.total) > 0.3) {
      recs.push({
        kind: 'prompt',
        action: 'Surface citations more prominently and cite more claims inline',
        rationale: 'Students frequently open citations, so making sources more visible should improve trust + usefulness.',
        confidence: 0.5,
        evidence: { citationOpenRate: round(rate(fb.citationsOpened, fb.total)) },
      });
    }

    // 11. Frequently-copied answers → positive quality signal → reinforce the current style.
    if (fb && fb.total >= 10 && rate(fb.copied, fb.total) > 0.35) {
      recs.push({
        kind: 'prompt',
        action: 'Reinforce the current answer style for high-copy categories (strong positive signal)',
        rationale: 'A high copy rate is a strong signal answers are directly useful; preserve what works.',
        confidence: 0.45,
        evidence: { copyRate: round(rate(fb.copied, fb.total)) },
      });
    }

    // 12. Mastery-driven recommendations.
    if (mastery && mastery.concepts >= 5) {
      if (health.weakConceptRatio > 0.4) {
        recs.push({
          kind: 'mastery',
          action: 'Prioritize weak-concept reinforcement (targeted revision + prerequisite scaffolding)',
          rationale: 'A large share of tracked concepts are below the mastery threshold.',
          confidence: Math.min(0.9, health.weakConceptRatio),
          evidence: { weakConceptRatio: round(health.weakConceptRatio), concepts: mastery.concepts },
        });
      }
      if (typeof mastery.declining === 'number' && mastery.declining > mastery.improving) {
        recs.push({
          kind: 'mastery',
          action: 'Recommend a revision workflow; mastery is trending down for more concepts than up',
          rationale: 'More concepts are declining than improving, indicating forgetting or unresolved gaps.',
          confidence: 0.6,
          evidence: { declining: mastery.declining, improving: mastery.improving },
        });
      }
    }

    // 13. Prompt-template performance.
    for (const p of promptPerf) {
      if (p.uses >= 10 && p.satisfaction < 0.5) {
        recs.push({
          kind: 'prompt',
          action: `Revise the "${p.template}" template; it underperforms on satisfaction`,
          rationale: 'This template is used often but its satisfaction is below neutral.',
          confidence: Math.min(0.85, 0.5 - p.satisfaction + 0.4),
          evidence: { template: p.template, satisfaction: round(p.satisfaction), uses: p.uses },
          scope: {},
        });
      } else if (p.uses >= 10 && p.regenerationRate > 0.3) {
        recs.push({
          kind: 'prompt',
          action: `Revise the "${p.template}" template; answers are frequently regenerated`,
          rationale: 'A high regeneration rate for this template suggests first answers often miss.',
          confidence: 0.55,
          evidence: { template: p.template, regenerationRate: round(p.regenerationRate) },
        });
      }
    }

    recs.sort((a, b) => b.confidence - a.confidence);
    return { generatedAt: Date.now(), health, recommendations: recs };
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const learningEngine = new LearningEngine();

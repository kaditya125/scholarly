/**
 * AIProducer — orchestrates the pedagogical planning layer.
 *
 * Pipeline:
 *   GroundingBrief + request
 *        ↓
 *   LearnerProfileBuilder      (composes existing student services)
 *        ↓
 *   LearningIntelligenceExtractor  (ONE LLM call — the only one in the Producer)
 *        ↓
 *   ProducerDecisionEngine     (5 deterministic strategies)
 *        ↓
 *   ProducerPlan  → persisted for inspection
 *
 * Guarantees:
 *   - RENDERS NOTHING. No TTS, no ffmpeg, no media, no storage writes beyond
 *     the plan document itself.
 *   - NEVER THROWS. Every stage degrades to a deterministic fallback, so a
 *     Producer failure can never fail a podcast.
 *   - NOT WIRED IN. Phase B does not touch podcastEngine.service.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { Telemetry } from '../../lib/telemetry';
import {
  LearnerProfileBuilder,
  learnerProfileBuilder,
} from './LearnerProfileBuilder';
import {
  LearningIntelligenceExtractor,
  learningIntelligenceExtractor,
} from './LearningIntelligenceExtractor';
import {
  ProducerDecisionEngine,
  producerDecisionEngine,
  type DecisionInput,
} from './ProducerDecisionEngine';
import {
  ProducerPlanSchema,
  PRODUCER_PLAN_SCHEMA_VERSION,
  type LearnerProfile,
  type ProducerPlan,
} from './schema/producerPlan.schema';
import type { IAIProducer } from './types';

/**
 * Structural subsets of the existing pipeline types. Declared locally so this
 * module has NO import from `core/workflow/podcast` — the Producer must not
 * create a circular dependency on the pipeline it will later plug into.
 */
interface BriefLike {
  topic?: string;
  titleSeed?: string;
  baseText?: string;
  notebookId?: string;
  focusTopics?: string[];
}

interface RequestLike {
  type?: string;
  durationMinutes?: number;
  speakerStyle?: string;
  /** The production format, when the style engine is enabled. */
  podcastStyle?: string;
  language?: string;
}

export interface ProduceInput {
  podcastId: string;
  userId: string;
  brief: unknown;
  request: unknown;
}

export class AIProducer implements IAIProducer {
  constructor(
    private readonly profiles: LearnerProfileBuilder = learnerProfileBuilder,
    private readonly intelligence: LearningIntelligenceExtractor = learningIntelligenceExtractor,
    private readonly decisions: ProducerDecisionEngine = producerDecisionEngine
  ) {}

  async produce(input: ProduceInput): Promise<ProducerPlan> {
    const started = Date.now();
    const brief = (input.brief ?? {}) as BriefLike;
    const request = (input.request ?? {}) as RequestLike;

    const topic = (brief.topic || brief.titleSeed || 'the requested topic').trim();
    const language = request.language || 'English';
    const targetMinutes = clampMinutes(request.durationMinutes);

    const rationale: string[] = [];
    const warnings: string[] = [];

    // ── 1. Learner profile ────────────────────────────────────────────────
    let learner: LearnerProfile;
    try {
      learner = await this.profiles.build({
        userId: input.userId,
        language,
        focusTopics: brief.focusTopics,
      });
      rationale.push(`Learner profile: ${learner.personalizationSummary}`);
    } catch (err: any) {
      warnings.push('Learner profile unavailable; using a general-audience default.');
      logger.warn('[AIProducer] Learner profile failed', { error: err?.message });
      learner = LearnerProfileBuilder.fallback(input.userId, language);
    }

    // ── 2. Learning intelligence (the single LLM call) ────────────────────
    const intelligence = await this.intelligence.plan({
      userId: input.userId,
      topic,
      sourceText: brief.baseText || '',
      notebookId: brief.notebookId || undefined,
      learner,
      targetMinutes,
    });

    if (intelligence.concepts.length <= 1) {
      warnings.push(
        'Concept decomposition degraded to a single concept; strategies will be coarse.'
      );
    }
    rationale.push(
      `Decomposed into ${intelligence.concepts.length} concept(s); ` +
        `target Bloom level '${intelligence.targetBloomLevel}'; ` +
        `cognitive load ${intelligence.estimatedCognitiveLoad}.`
    );

    // ── 3. Strategies (deterministic) ─────────────────────────────────────
    const decisionInput: DecisionInput = {
      learner,
      intelligence,
      targetMinutes,
      // Prefer the production format: it knows its own cast size (a debate needs
      // three voices, storytelling exactly one), which the legacy value could not
      // express.
      speakerStyle: request.podcastStyle || request.speakerStyle,
      podcastType: request.type,
    };

    const educational = this.decisions.decideEducational(decisionInput);
    const media = this.decisions.decideMedia(decisionInput);
    const assessment = this.decisions.decideAssessment(decisionInput);
    const accessibility = this.decisions.decideAccessibility(decisionInput);
    const interaction = this.decisions.decideInteraction(decisionInput);

    rationale.push(
      ...educational.rationale,
      ...media.rationale,
      ...assessment.rationale,
      ...accessibility.rationale,
      ...interaction.rationale
    );

    // ── 4. Assemble ───────────────────────────────────────────────────────
    const plan = ProducerPlanSchema.parse({
      id: `pp_${uuidv4()}`,
      podcastId: input.podcastId,
      userId: input.userId,
      schemaVersion: PRODUCER_PLAN_SCHEMA_VERSION,
      createdAt: Date.now(),

      learnerProfile: learner,
      learningIntelligence: intelligence,

      educational: educational.strategy,
      media: media.strategy,
      assessment: assessment.strategy,
      accessibility: accessibility.strategy,
      interaction: interaction.strategy,

      rationale,
      warnings,
    });

    const elapsed = Date.now() - started;
    logger.info('[AIProducer] Plan produced', {
      podcastId: input.podcastId,
      concepts: intelligence.concepts.length,
      approach: plan.educational.approach,
      pacing: plan.media.pacing,
      durationMs: elapsed,
      warnings: warnings.length,
    });
    try {
      Telemetry.logLatency('producer.plan', elapsed, { podcastId: input.podcastId });
    } catch {
      /* telemetry is advisory */
    }

    return plan;
  }
}

/** Duration must match the pipeline's DURATION_CHOICES contract. */
function clampMinutes(minutes?: number): number {
  const allowed = [5, 10, 20, 30, 60];
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return 10;
  return allowed.includes(minutes) ? minutes : 10;
}

export const aiProducer = new AIProducer();

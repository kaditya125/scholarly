/**
 * Public entry point for the AI Producer layer.
 *
 * Phase A: definitions only. The decision engine lands in Phase B.
 *
 * See the architectural note at the top of `schema/producerPlan.schema.ts` —
 * the Producer layer is not present in the four approved architecture documents
 * and these types should be reviewed before Phase B builds against them.
 */

export * from './schema/producerPlan.schema';
export { AIProducer, aiProducer } from './AIProducer';
export {
  LearnerProfileBuilder,
  learnerProfileBuilder,
  mapDifficultyBand,
  mapModalities,
  estimateAttentionSpan,
  normalizePercentage,
} from './LearnerProfileBuilder';
export {
  LearningIntelligenceExtractor,
  learningIntelligenceExtractor,
  conceptBudgetFor,
  revisionPriorityFor,
  estimateCognitiveLoad,
} from './LearningIntelligenceExtractor';
export {
  ProducerDecisionEngine,
  producerDecisionEngine,
  pickApproach,
  pickNarrativeStyle,
  pickSpeakerCount,
  pickPacing,
  questionTypesFor,
  buildObjectives,
  type DecisionInput,
  type Decision,
} from './ProducerDecisionEngine';

import type { ProducerPlan } from './schema/producerPlan.schema';

/**
 * The Producer's contract. Mirrors `IAIDirector`: it decides and persists a
 * plan, and renders nothing.
 */
export interface IAIProducer {
  produce(input: ProducerInput): Promise<ProducerPlan>;
}

export interface ProducerInput {
  podcastId: string;
  userId: string;
  /** The existing GroundingBrief. Typed loosely to avoid a pipeline import. */
  brief: unknown;
  /** The existing PodcastGenerateRequest. */
  request: unknown;
}

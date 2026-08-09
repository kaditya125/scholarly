import { QueryCategory, RetrievalStrategy } from './types';

/**
 * Adaptive Retrieval Router (Task 4) — chooses a retrieval strategy per category instead of
 * always running the full graph+vector+rerank pipeline. Pure decision table; extensible with
 * future retrieval plugins by adding strategies + rows.
 *
 * NOTE: this only produces a RECOMMENDATION. The RetrievalOrchestrator consumes it behind a
 * flag in a later increment; today's default remains full GraphRAG.
 */
const MATRIX: Record<QueryCategory, RetrievalStrategy> = {
  greeting: 'none',
  casual_conversation: 'none',
  general_chat: 'none',
  translation: 'none',
  definition: 'vector',
  summary: 'vector',
  concept_explanation: 'graphrag',
  comparison: 'graphrag',
  quiz_generation: 'graphrag',
  career_guidance: 'graphrag',
  planning: 'graphrag',
  image_explanation: 'graphrag',
  unknown: 'graphrag',
  follow_up: 'graphrag',
  multi_topic: 'graphrag',
  problem_solving: 'graphrag_reasoning',
  numerical: 'graphrag_reasoning',
  research: 'graph_web',
  notebook_search: 'notebook',
  document_question: 'notebook',
  homework_help: 'graph_memory',
  assignment_help: 'graph_memory',
  revision: 'weak_topics_notebook',
  coding: 'graphrag',
  debugging: 'graphrag',
};

export class RetrievalRouter {
  route(category: QueryCategory, opts: { hasNotebook?: boolean } = {}): RetrievalStrategy {
    let strategy = MATRIX[category] ?? 'graphrag';
    // Notebook-scoped strategies fall back to vector/graph when no notebook is attached.
    if ((strategy === 'notebook') && !opts.hasNotebook) strategy = 'vector';
    if ((strategy === 'weak_topics_notebook' || strategy === 'graph_memory') && !opts.hasNotebook) strategy = 'graphrag';
    return strategy;
  }
}

export const retrievalRouter = new RetrievalRouter();

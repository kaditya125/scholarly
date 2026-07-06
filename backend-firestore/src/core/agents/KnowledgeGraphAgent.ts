import { IAgent, AgentContext } from './IAgent';
import { graphRetrievalService } from '../../services/rag/graphRetrieval.service';

/**
 * KnowledgeGraphAgent — Hybrid GraphRAG (Phase 1)
 *
 * Retrieves notebook-scoped Knowledge Graph context for the current query and
 * places it into shared state so the retrieval stage can fuse it with vector
 * results before the TeacherAgent drafts an answer.
 *
 * Design notes:
 * - Runs in ALL modes (previously it only produced context in REVISION mode).
 * - Uses the real, ingestion-written kg_nodes / kg_edges via
 *   graphRetrievalService (previously it queried an obsolete top-level
 *   `knowledge_graph` collection that is never written).
 * - Notebook-scoped and zero-Gemini: pure Firestore reads + string ops.
 * - Non-fatal: any failure leaves an empty graphContext so the pipeline falls
 *   back cleanly to vector-only retrieval.
 */
export class KnowledgeGraphAgent implements IAgent {
  name = 'KnowledgeGraphAgent';
  description = 'Builds notebook-scoped graph context by matching query concepts and expanding related concepts, prerequisites, and dependencies.';

  async execute(context: AgentContext): Promise<void> {
    const notebookId = context.request.notebookId;
    const query = context.request.query;

    // No notebook context (e.g. general chat) => nothing to retrieve from the graph.
    if (!notebookId || !query) {
      context.sharedState['graphContext'] = '';
      context.sharedState['graphExpansionTerms'] = [];
      context.sharedState['graphMeta'] = { nodeCount: 0, edgeCount: 0, matched: 0, traversalMs: 0 };
      return;
    }

    try {
      const result = await graphRetrievalService.getGraphContext(notebookId, query);
      context.sharedState['graphContext'] = result.contextString || '';
      context.sharedState['graphExpansionTerms'] = result.expansionTerms || [];
      context.sharedState['graphMeta'] = {
        nodeCount: result.nodeCount,
        edgeCount: result.edgeCount,
        matched: result.matched.length,
        traversalMs: result.traversalMs,
      };
    } catch (err) {
      console.warn('[KnowledgeGraphAgent] graph retrieval failed (non-fatal):', err);
      context.sharedState['graphContext'] = '';
      context.sharedState['graphExpansionTerms'] = [];
      context.sharedState['graphMeta'] = { nodeCount: 0, edgeCount: 0, matched: 0, traversalMs: 0 };
    }
  }
}

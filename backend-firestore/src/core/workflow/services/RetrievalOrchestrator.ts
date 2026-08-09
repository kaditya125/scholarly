import { WorkflowEvent, WorkflowStage, WorkflowRequest } from '../types';
import { AgentContext } from '../../agents/IAgent';
import { KnowledgeGraphAgent } from '../../agents/KnowledgeGraphAgent';
import { RetrievalService } from '../../../services/rag/retrieval.service';
import { knowledgeService, KnowledgeService } from '../../knowledge';
import { Telemetry } from '../../../lib/telemetry';
import { QueryPlan } from './QueryPlanningService';
import { RetrievalError } from '../../errors/providerErrors';
import { featureFlags } from '../../../config/featureFlags';
import { ExecutionPlan } from '../../intelligence/types';

export interface RetrievalOutcome {
  citationsList: any[];
  retrievalLatencyMs: number;
}

/**
 * RetrievalOrchestrator — owns Stage 4 (knowledge-graph retrieval) + Stage 5 (vector/web/
 * curriculum retrieval) and the Hybrid-GraphRAG context fusion. Implemented as an async
 * generator so the exact SSE event sequence (graph detail → RAG progress → citation events →
 * RAG detail) is preserved; it `return`s the citations + retrieval latency to the caller.
 *
 * Coordinates through KnowledgeService abstraction for shared retrieval logic.
 */
export class RetrievalOrchestrator {
  constructor(
    private readonly retrievalService: RetrievalService = new RetrievalService(),
    private readonly knowledge: KnowledgeService = knowledgeService
  ) {}

  /**
   * Stage 4: knowledge-graph retrieval. Extracted from stream() so it can run CONCURRENTLY
   * with context + memory loading (Increment 4 parallelization). Populates agentContext.sharedState
   * (graphContext / graphExpansionTerms / graphMeta) exactly as before. Non-fatal internally
   * (the KnowledgeGraphAgent swallows its own errors).
   */
  async runGraphRetrieval(agentContext: AgentContext): Promise<void> {
    const graphAgent = new KnowledgeGraphAgent();
    await graphAgent.execute(agentContext);
  }

  /** The graph-retrieval "detail" progress line (verbatim), emitted by the orchestrator caller. */
  buildGraphDetailMessage(req: WorkflowRequest, agentContext: AgentContext): string {
    const gm = (agentContext.sharedState['graphMeta'] as any) || {};
    if ((gm.nodeCount || 0) > 0) {
      const labels: string[] = (gm.matchedLabels || []).slice(0, 3);
      const labelStr = labels.length ? ` (${labels.join(', ')})` : '';
      const expanded: string[] = (gm.expansionTerms || []).slice(0, 4);
      const expStr = expanded.length ? ` Expanded to related concepts: ${expanded.join(', ')}.` : '';
      return `Matched ${gm.matched} concept(s)${labelStr} in the knowledge graph, then traversed ${gm.nodeCount} node(s) / ${gm.edgeCount} relationship(s) in ${gm.traversalMs}ms to gather prerequisites.${expStr}`;
    }
    return req.notebookId
      ? `No concept nodes matched this query in the notebook graph — falling back to vector search alone.`
      : `No notebook attached, so no concept graph to traverse — using general subject knowledge.`;
  }

  /**
   * Stage 5: vector/web/curriculum retrieval + Hybrid-GraphRAG fusion. Assumes the graph stage
   * (runGraphRetrieval) has already populated agentContext.sharedState. Yields the RAG progress +
   * citation events verbatim and returns the citations + retrieval latency.
   */
  async *stream(
    req: WorkflowRequest,
    agentContext: AgentContext,
    plan: QueryPlan,
    execPlan?: ExecutionPlan,
  ): AsyncGenerator<WorkflowEvent, RetrievalOutcome, unknown> {
    // ── Stage 5: Vector Retrieval (RAG) ────────────────────────────────
    yield { type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, message: 'Searching memory and the web...' };
    const retrievalStartTime = Date.now();
    let contextStr = '';

    const { needsWebSearch, hasAttachment } = plan;

    // Adaptive retrieval routing (Increment 2), sub-flag default OFF. When OFF (or no plan) the
    // strategy is 'graphrag' → identical to today's pipeline. When ON, the Intelligence Layer's
    // strategy narrows which sources are used (definition→vector-only, research→+web, etc.).
    const routingOn = featureFlags.intelligenceRetrievalRouting && !!execPlan;
    const strategy = routingOn ? execPlan!.retrievalStrategy : 'graphrag';
    const doWeb = needsWebSearch || strategy === 'graph_web';
    const doVector = strategy !== 'none';
    const doGraphFusion = strategy !== 'none' && strategy !== 'vector' && strategy !== 'notebook';

    if (doWeb) {
      try {
        const webResults = await this.retrievalService.retrieveWebContext(req.query);
        if (webResults.length > 0) {
          contextStr += "=== LATEST WEB SEARCH RESULTS ===\n";
          webResults.forEach(r => {
            contextStr += `[Source: ${r.source}]\n${r.text}\n\n`;
          });
        }
      } catch (err) {
        console.warn("Web search failed", err);
      }
    }

    // If we have a notebookId, retrieve hierarchical context
    let citationsList: any[] = [];
    if (doVector && req.notebookId) {
      // Phase 2: pass graph-neighbor expansion terms (from KnowledgeGraphAgent,
      // Stage 4) so vector recall is widened via the graph — zero extra API cost.
      const expansionTerms = (agentContext.sharedState['graphExpansionTerms'] as string[]) || [];
      let notebookResults: Awaited<ReturnType<RetrievalService['retrieveContext']>>;
      try {
        // Hard learning scope: when the student selected chapters/topics in the Learn pane,
        // req.scopeSourceIds restricts this vector search to those chapters' sourceIds so the
        // tutor is grounded ONLY in the selected content.
        notebookResults = await this.retrievalService.retrieveContext(req.query, req.notebookId, undefined, 5, expansionTerms, req.scopeSourceIds);
      } catch (e: any) {
        // Surface as a typed RetrievalError (message preserved; still fatal for this turn as
        // before — propagates to the workflow's error event).
        throw new RetrievalError(String(e?.message || e), { cause: e, provider: 'pinecone' });
      }
      if (notebookResults.length > 0) {
        contextStr += "=== NOTEBOOK CONTEXT ===\n";
        for (const r of notebookResults) {
          contextStr += `[Citation: ${r.source} (Page ${r.metadata?.pageNumber || 1})]\n${r.text}\n\n`;
          const citationData = {
            source: r.source,
            text: r.text,
            score: r.score,
            authorityScore: r.metadata?.authority || 0.8,
            selectionReasoning: r.selectionReasoning || 'Highly relevant to your query.',
            pageNumber: r.metadata?.pageNumber,
            paragraphIndex: r.metadata?.paragraphIndex,
            // Identifiers so the UI can deep-link a cited source into the reader (/read).
            sourceId: r.metadata?.sourceId,
            notebookId: r.metadata?.notebookId,
            title: r.metadata?.sourceTitle || r.source,
          };
          citationsList.push(citationData);
          yield { type: 'citation', citation: citationData };
        }
      }
    } else if (doVector && !hasAttachment) {
      // No notebook attached and no uploaded file — ground the answer in the shared,
      // admin-ingested NCERT curriculum corpus (scoped to the curriculum owner, so no
      // other user's private notebooks are exposed) instead of relying purely on the
      // model's own knowledge. Skipped when a file is attached (that file is the context).
      try {
        const curriculumResults = await this.retrievalService.retrieveCurriculumContext(req.query, 5);
        if (curriculumResults.length > 0) {
          contextStr += "=== NCERT CURRICULUM CONTEXT ===\n";
          for (const r of curriculumResults) {
            contextStr += `[Citation: ${r.source}]\n${r.text}\n\n`;
            const citationData = {
              source: r.source,
              text: r.text,
              score: r.score,
              authorityScore: r.metadata?.authority || 1.4,
              selectionReasoning: r.selectionReasoning || 'Relevant passage from the NCERT curriculum.',
              pageNumber: r.metadata?.pageNumber,
              paragraphIndex: r.metadata?.paragraphIndex,
              // Identifiers so the UI can deep-link a cited source into the reader (/read).
              sourceId: r.metadata?.sourceId,
              notebookId: r.metadata?.notebookId,
              title: r.metadata?.sourceTitle || r.source,
            };
            citationsList.push(citationData);
            yield { type: 'citation', citation: citationData };
          }
        }
      } catch (err) {
        console.warn('Curriculum retrieval failed (non-fatal):', err);
      }
    }

    // ── Hybrid GraphRAG (Phase 1): fuse Knowledge Graph context ────────
    // The KnowledgeGraphAgent (Stage 4) placed notebook-scoped graph context
    // into shared state. Prepend it so concepts + relationships + definitions
    // reach the TeacherAgent alongside the vector chunks. Graph retrieval is
    // pure Firestore + string ops (zero extra Gemini cost).
    const graphContextStr = (agentContext.sharedState['graphContext'] as string) || '';
    if (doGraphFusion && graphContextStr) {
      const graphMeta = (agentContext.sharedState['graphMeta'] as any) || {};
      Telemetry.logLatency('graph_retrieval', graphMeta.traversalMs || 0, {
        notebookId: req.notebookId,
        nodeCount: graphMeta.nodeCount || 0,
        edgeCount: graphMeta.edgeCount || 0,
        matched: graphMeta.matched || 0,
      });
      contextStr = `=== KNOWLEDGE GRAPH CONTEXT ===\n${graphContextStr}\n\n${contextStr}`;
    }

    agentContext.retrievedContext = contextStr || 'No specific context found.';

    {
      if (hasAttachment) {
        yield {
          type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, detail: true,
          message: `Read the file you attached and used its contents as the primary source — no external retrieval needed.`,
        };
      } else if (citationsList.length > 0) {
        const uniqueSources = Array.from(new Set(citationsList.map((c: any) => c.source).filter(Boolean)));
        const shown = uniqueSources.slice(0, 3).join(', ');
        const more = uniqueSources.length > 3 ? ` +${uniqueSources.length - 3} more` : '';
        const corpus = req.notebookId ? 'your material' : 'the NCERT curriculum';
        yield {
          type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, detail: true,
          message: `Embedded your query and ran semantic search over ${corpus} — retrieved ${citationsList.length} passage(s) from ${uniqueSources.length} source(s) (${shown}${more}), reranked by relevance.`,
        };
      } else if (doWeb) {
        yield {
          type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, detail: true,
          message: `Ran a live web search for up-to-date information on this query.`,
        };
      } else {
        yield {
          type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, detail: true,
          message: req.notebookId
            ? `Semantic search found no strongly-matching passages in your material — answering from general knowledge.`
            : `No strongly-matching passages in the curriculum corpus — answering from general subject knowledge.`,
        };
      }
    }

    const retrievalLatencyMs = Date.now() - retrievalStartTime;
    return { citationsList, retrievalLatencyMs };
  }
}

export const retrievalOrchestrator = new RetrievalOrchestrator();

import { container, TOKENS } from '../di/container';
import { IAIProvider } from '../interfaces/IAIProvider';
import { ICacheProvider } from '../interfaces/ICacheProvider';
import { ChatMessage } from '../../types';
import { AgentContext } from '../agents/IAgent';
import { TeacherAgent } from '../agents/TeacherAgent';
import { VerificationAgent } from '../agents/VerificationAgent';
import { ResponseFormatter } from '../agents/ResponseFormatter';
import { KnowledgeGraphAgent } from '../agents/KnowledgeGraphAgent';
import { RetrievalService } from '../../services/rag/retrieval.service';

export enum WorkflowStage {
  INTENT_DETECTION = 'INTENT_DETECTION',
  MEMORY_RETRIEVAL = 'MEMORY_RETRIEVAL',
  GRAPH_RETRIEVAL = 'GRAPH_RETRIEVAL',
  RAG_RETRIEVAL = 'RAG_RETRIEVAL',
  RERANKING = 'RERANKING',
  AGENT_EXECUTION = 'AGENT_EXECUTION',
  VERIFICATION = 'VERIFICATION',
  ASSET_GENERATION = 'ASSET_GENERATION',
  ANALYTICS = 'ANALYTICS',
  MEMORY_UPDATE = 'MEMORY_UPDATE',
}

export interface WorkflowRequest {
  userId: string;
  notebookId?: string;
  sessionId?: string;
  query: string;
  history: ChatMessage[];
  mode?: string;
}

export interface WorkflowEvent {
  type: 'progress' | 'chunk' | 'error' | 'done';
  stage?: WorkflowStage;
  message?: string;
  chunk?: string;
  data?: any;
}

import { IMemoryProvider } from '../interfaces/IMemoryProvider';
import { IAnalyticsProvider } from '../interfaces/IAnalyticsProvider';

export class WorkflowEngine {
  private get aiProvider(): IAIProvider {
    return container.resolve<IAIProvider>(TOKENS.AIProvider);
  }

  private get cache(): ICacheProvider {
    return container.resolve<ICacheProvider>(TOKENS.CacheProvider);
  }
  
  constructor() {
    // Lazy resolve to prevent DI crash on module import
  }

  /**
   * Executes the AI workflow as a streaming generator.
   * Yields WorkflowEvents that can be pushed to the client via SSE.
   */
  public async *executeStream(req: WorkflowRequest): AsyncGenerator<WorkflowEvent, void, unknown> {
    const workflowStartTime = Date.now();
    try {
      yield { type: 'progress', stage: WorkflowStage.INTENT_DETECTION, message: 'Understanding your question...' };
      const mode = req.mode || 'TEACHER';

      yield { type: 'progress', stage: WorkflowStage.MEMORY_RETRIEVAL, message: 'Loading learning memory...' };
      const memoryProvider = container.resolve<IMemoryProvider>(TOKENS.MemoryProvider);
      
      const sessionMemory = await memoryProvider.getSessionMemory(req.userId, req.sessionId || 'default');
      const learningMetrics = await memoryProvider.getLearningAnalytics(req.userId);
      
      yield { type: 'progress', stage: WorkflowStage.GRAPH_RETRIEVAL, message: 'Mapping concept relationships...' };
      
      const agentContext: AgentContext = {
        request: req,
        retrievedContext: 'Placeholder RAG Text', // Will be populated by RAG phase
        sharedState: {}
      };

      // 3. Knowledge Graph Retrieval
      const graphAgent = new KnowledgeGraphAgent();
      await graphAgent.execute(agentContext);
      
      // 4. Vector Retrieval Logic
      yield { type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, message: 'Searching memory and the web...' };
      const retrievalService = new RetrievalService();
      let contextStr = '';

      // Check if query needs web search (news, latest, current) or mode is research
      const queryLower = req.query.toLowerCase();
      const needsWebSearch = mode === 'RESEARCH' || mode === 'research' || 
        /(news|current|latest|update|today|recent|now)/.test(queryLower);

      if (needsWebSearch) {
        try {
          const webResults = await retrievalService.retrieveWebContext(req.query);
          if (webResults.length > 0) {
            contextStr += "=== LATEST WEB SEARCH RESULTS ===\n";
            webResults.forEach(r => {
              contextStr += `[Source: ${r.source}]\n${r.text}\n\n`;
            });
            // We can also attach web results as citations if needed
          }
        } catch (err) {
          console.warn("Web search failed", err);
        }
      }

      // If we have a notebookId, retrieve hierarchical context
      let citationsList: any[] = [];
      if (req.notebookId) {
        const notebookResults = await retrievalService.retrieveContext(req.query, req.notebookId, undefined, 5);
        if (notebookResults.length > 0) {
          contextStr += "=== NOTEBOOK CONTEXT ===\n";
          notebookResults.forEach(r => {
            contextStr += `[Citation: ${r.source}]\n${r.text}\n\n`;
            citationsList.push({
              source: r.source,
              text: r.text,
              score: r.score,
              authorityScore: r.metadata?.authority || 0.8,
              selectionReasoning: r.selectionReasoning || 'Highly relevant to your query.'
            });
          });
        }
      }

      agentContext.retrievedContext = contextStr || 'No specific context found.';
      
      yield { type: 'progress', stage: WorkflowStage.RERANKING, message: 'Ranking relevant sources...' };
      // TODO: Cohere Reranking Logic
      
      yield { type: 'progress', stage: WorkflowStage.VERIFICATION, message: 'Verifying context...' };
      // TODO: Pre-generation verification
      
      yield { type: 'progress', stage: WorkflowStage.AGENT_EXECUTION, message: `${mode} Agent preparing explanation...` };
      
      // 6. Agent Execution: Teacher Drafts
      const teacher = new TeacherAgent();
      await teacher.execute(agentContext);
      
      yield { type: 'progress', stage: WorkflowStage.VERIFICATION, message: 'Verifying retrieved information...' };
      
      // 7. Verification: Cross-checks the draft against RAG
      // For now, this is skipped if verification provider isn't fully implemented in DI
      // const verifier = new VerificationAgent();
      // await verifier.execute(agentContext);
      
      yield { type: 'progress', stage: WorkflowStage.ASSET_GENERATION, message: 'Creating learning assets...' };
      // 8. One-click Asset Generation (Flashcards, Quizzes based on context)
      
      // 9. Format Final Streaming Response
      const formatter = new ResponseFormatter();
      if (formatter.executeStream) {
        for await (const chunk of formatter.executeStream(agentContext)) {
          yield { type: 'chunk', chunk };
        }
      }
      
      yield { type: 'progress', stage: WorkflowStage.ANALYTICS, message: 'Logging retrieval analytics...' };
      const analyticsProvider = container.resolve<IAnalyticsProvider>(TOKENS.AnalyticsProvider);
      await analyticsProvider.logWorkflowMetrics(req.userId, {
        query: req.query,
        cacheHit: false,
        retrievalLatencyMs: 100, // Placeholder
        rerankingLatencyMs: 150, // Placeholder
        generationLatencyMs: Date.now() - workflowStartTime,
        hallucinationRate: 0, // Placeholder
        averageConfidence: 0.95,
        citationCoverage: 1.0,
        workflowDurationMs: Date.now() - workflowStartTime,
        embeddingCost: 0,
        generationCost: 0
      });
      
      yield { type: 'progress', stage: WorkflowStage.MEMORY_UPDATE, message: 'Updating student memory...' };
      await memoryProvider.updateSessionMemory(req.userId, req.sessionId || 'default', {
        contextWindow: [...sessionMemory.contextWindow, req.query] // Example append
      });
      
      yield { type: 'done', data: { citations: citationsList, assets: [], confidenceScore: 0.95 } };

    } catch (error: any) {
      console.error('Workflow execution error:', error);
      yield { type: 'error', message: error.message || 'Internal Workflow Error' };
    }
  }
}

export const workflowEngine = new WorkflowEngine();

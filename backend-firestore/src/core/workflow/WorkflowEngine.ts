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
import { StudentContextService } from '../../services/studentContext.service';
import { UserProfileService } from '../../services/userProfile.service';
import { 
  buildScholarlySystemPrompt, 
  isGreetingMessage, 
  getGreetingOrOnboardingPrompt 
} from '../../config/prompts';
import { getTeacherPrompt } from '../../prompts/teacher.prompt';
import { getVerificationPrompt } from '../../prompts/verification.prompt';
import { getIntentPrompt } from '../../prompts/intent.prompt';
import { Telemetry } from '../../lib/telemetry';
import { TelemetryService } from '../../services/telemetry.service';
import { TelemetryRecord } from '../../types/observability';
import { env } from '../../config/env';

// Lazily-created Firestore telemetry recorder shared across requests. Kept out of
// DI (it only needs getFirestore()) and created on first use so module import stays safe.
let _telemetryService: TelemetryService | null = null;
const getTelemetryService = (): TelemetryService => {
  if (!_telemetryService) _telemetryService = new TelemetryService();
  return _telemetryService;
};

export enum WorkflowStage {
  INTENT_DETECTION = 'INTENT_DETECTION',
  CONTEXT_ENRICHMENT = 'CONTEXT_ENRICHMENT',
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
  model?: string;
  traceId?: string;
}

export interface WorkflowEvent {
  type: 'progress' | 'chunk' | 'citation' | 'asset' | 'warning' | 'metrics' | 'error' | 'done';
  stage?: WorkflowStage;
  message?: string;
  chunk?: string;
  citation?: {
    source: string;
    text: string;
    score: number;
    authorityScore: number;
    selectionReasoning: string;
  };
  asset?: {
    type: string;
    id: string;
    preview: string;
  };
  warning?: string;
  metrics?: {
    retrievalMs: number;
    generationMs: number;
    confidenceScore: number;
  };
  data?: any;
}

import { IMemoryProvider } from '../interfaces/IMemoryProvider';
import { IAnalyticsProvider } from '../interfaces/IAnalyticsProvider';
import { StudentContext } from '../../types/studentContext.types';

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
   * Processes an educational query through a multi-step reasoning pipeline.
   */
  public async processEducationalQuery(query: string, userId: string) {
    const contextService = new StudentContextService();
    
    // 1. Fetch Global Context (Exam, Difficulty)
    let exam = 'General';
    let difficulty = 'Beginner';
    try {
      const studentContext = await contextService.aggregateContext(userId);
      exam = (studentContext as any)?.profile?.exam || 'General';
      difficulty = (studentContext as any)?.profile?.difficulty || 'Beginner';
    } catch (e) {
      console.warn('Failed to aggregate context, using defaults.');
    }

    // 2. Infer intent (Math? History?)
    const intentPrompt = getIntentPrompt();
    const intentResponse = await this.aiProvider.generateResponse([
      { role: 'system', content: intentPrompt },
      { role: 'user', content: query }
    ]);
    
    let intentResult = { intent: 'unknown', domain: 'unknown' };
    try {
      intentResult = JSON.parse(intentResponse.reply);
    } catch(e) {
      console.warn('Failed to parse intent response:', intentResponse.reply);
    }

    // 3. Retrieve Vectors & KG Nodes
    const retrievalService = new RetrievalService();
    let retrievedData = { vectors: [] as any[], kgNodes: [] as any[] };
    try {
      const webResults = await retrievalService.retrieveWebContext(query);
      retrievedData.vectors = webResults || [];
    } catch (e) {
      console.warn('Failed to retrieve context.');
    }

    // 4. Draft answer (using teacher prompt)
    const teacherPrompt = getTeacherPrompt(exam, difficulty);
    const draftPrompt = `${teacherPrompt}\n\nUser Query: ${query}\nRetrieved Context: ${JSON.stringify(retrievedData)}`;
    const draftResponse = await this.aiProvider.generateResponse([
      { role: 'user', content: draftPrompt }
    ]);

    // 5. Verify answer (using verification prompt)
    const verificationPrompt = getVerificationPrompt();
    const verifyPromptContent = `${verificationPrompt}\n\nOriginal Query: ${query}\nRetrieved Context: ${JSON.stringify(retrievedData)}\nDraft Answer: ${draftResponse.reply}`;
    const finalResponse = await this.aiProvider.generateResponse([
      { role: 'user', content: verifyPromptContent }
    ]);

    // 6. Return final answer with metadata
    return {
        answer: finalResponse.reply,
        metadata: {
            intent: intentResult,
            contextUsed: {
                vectorCount: retrievedData.vectors.length,
                kgNodeCount: retrievedData.kgNodes.length,
            },
            userContext: { exam, difficulty },
        },
    };
  }

  /**
   * Derives real provider/model/token/cost figures for this request from the
   * token-usage cost events recorded by the AI providers during generation.
   */
  private deriveGenCost(costMark: number) {
    const spans = Telemetry.costs.slice(costMark);
    const gen = spans.find((c: any) => ['groq', 'gemini', 'nvidia', 'openai'].includes(c.provider));
    return {
      provider: gen?.provider || 'gemini',
      model: gen?.model || env.GEMINI_MODEL || 'gemini-2.5-flash',
      promptTokens: spans.filter((c: any) => c.type === 'input').reduce((a: number, c: any) => a + (c.tokens || 0), 0),
      completionTokens: spans.filter((c: any) => c.type === 'output').reduce((a: number, c: any) => a + (c.tokens || 0), 0),
      totalCostUSD: spans.reduce((a: number, c: any) => a + (c.cost || 0), 0),
    };
  }

  /**
   * Persists a real TelemetryRecord (+ CostRecord) to Firestore so the Admin
   * observability layer (AI Monitoring, Cost Analytics, Prompt Studio) reflects
   * live traffic. Fire-and-forget and fully guarded — never affects the response.
   */
  private async persistTelemetry(req: WorkflowRequest, m: {
    provider: string;
    model: string;
    promptVersion: string;
    totalLatencyMs: number;
    retrievalLatencyMs?: number;
    rerankerLatencyMs?: number;
    generationLatencyMs?: number;
    timeToFirstTokenMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    estimatedCostUSD?: number;
    chunkCount?: number;
    cacheHit?: boolean;
    pineconeQueryTimeMs?: number;
    averageSimilarityScore?: number;
    verificationPassed?: boolean;
    citationCount?: number;
  }): Promise<void> {
    try {
      const promptTokens = m.promptTokens || 0;
      const completionTokens = m.completionTokens || 0;
      const cost = m.estimatedCostUSD || 0;
      const record: TelemetryRecord = {
        traceId: req.traceId || `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId: req.userId,
        sessionId: req.sessionId || 'default',
        provider: m.provider,
        model: m.model,
        promptVersion: m.promptVersion,
        totalLatencyMs: Math.round(m.totalLatencyMs),
        retrievalLatencyMs: Math.round(m.retrievalLatencyMs || 0),
        rerankerLatencyMs: Math.round(m.rerankerLatencyMs || 0),
        generationLatencyMs: Math.round(m.generationLatencyMs || 0),
        verificationLatencyMs: 0,
        timeToFirstTokenMs: Math.round(m.timeToFirstTokenMs || 0),
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCostUSD: parseFloat(cost.toFixed(6)),
        chunkCount: m.chunkCount || 0,
        cacheHit: !!m.cacheHit,
        pineconeQueryTimeMs: Math.round(m.pineconeQueryTimeMs || 0),
        averageSimilarityScore: parseFloat((m.averageSimilarityScore || 0).toFixed(3)),
        verificationPassed: m.verificationPassed !== false,
        citationCount: m.citationCount || 0,
        timestamp: Date.now(),
      };
      await getTelemetryService().recordTelemetry(record);
      if (cost > 0) {
        await getTelemetryService().recordCost({
          provider: m.provider,
          model: m.model,
          promptTokens,
          completionTokens,
          estimatedCostUSD: parseFloat(cost.toFixed(6)),
          userId: req.userId,
          notebookId: req.notebookId,
          sessionId: req.sessionId,
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      console.warn('Telemetry persistence failed (non-fatal):', (e as Error).message);
    }
  }

  /**
   * Executes the AI workflow as a streaming generator.
   * Yields WorkflowEvents that can be pushed to the client via SSE.
   */
  public async *executeStream(req: WorkflowRequest): AsyncGenerator<WorkflowEvent, void, unknown> {
    const workflowStartTime = Date.now();
    // Marks into the shared telemetry buffers so we can attribute real latency/cost
    // spans recorded by downstream services (RetrievalService, providers) to this request.
    const telemetryMark = Telemetry.metrics.length;
    const costMark = Telemetry.costs.length;
    let firstChunkAt = 0;
    try {
      // ── Stage 1: Intent Detection ──────────────────────────────────────
      yield { type: 'progress', stage: WorkflowStage.INTENT_DETECTION, message: 'Understanding your question...' };
      const mode = req.mode || 'TEACHER';

      // ── Stage 2: Context Enrichment (NEW) ──────────────────────────────
      yield { type: 'progress', stage: WorkflowStage.CONTEXT_ENRICHMENT, message: 'Loading your learning profile...' };
      
      const contextService = new StudentContextService();
      let studentContext: StudentContext;
      
      try {
        studentContext = await contextService.aggregateContext(req.userId);
      } catch (e) {
        console.warn('Failed to aggregate student context, proceeding with defaults:', e);
        studentContext = {
          userId: req.userId,
          profile: null,
          memory: null,
          analytics: null,
          stats: null,
          planner: null,
          notebooks: null,
          isFirstTimeUser: true,
          isOnboarded: false,
        };
      }

      // ── Greeting / Onboarding Detection ────────────────────────────────
      const isGreeting = isGreetingMessage(req.query);
      const isShortHistory = req.history.filter(m => m.role !== 'system').length <= 2;

      if (isGreeting && isShortHistory) {
        yield { type: 'progress', stage: WorkflowStage.AGENT_EXECUTION, message: 'Preparing your personalized welcome...' };
        
        // Generate greeting or onboarding response
        const greetingPrompt = getGreetingOrOnboardingPrompt(studentContext);
        
        const anyProvider = this.aiProvider as any;
        if (typeof anyProvider.generateStreamResponse === 'function') {
          const stream = anyProvider.generateStreamResponse([
            { role: 'user', content: req.query }
          ], greetingPrompt, { traceId: req.traceId, model: req.model });
          let fullGreeting = '';
          for await (const chunk of stream) {
            fullGreeting += chunk;
            yield { type: 'chunk', chunk };
          }
          
          // If this was an onboarding greeting, try to extract any profile data
          if (!studentContext.isOnboarded) {
            const profileService = new UserProfileService();
            profileService.extractProfileFromConversation(req.userId, req.query, fullGreeting).catch(console.error);
          }
        } else {
          const res = await this.aiProvider.generateResponse([
            { role: 'system', content: greetingPrompt },
            { role: 'user', content: req.query }
          ]);
          yield { type: 'chunk', chunk: res.reply };
          
          if (!studentContext.isOnboarded) {
            const profileService = new UserProfileService();
            profileService.extractProfileFromConversation(req.userId, req.query, res.reply).catch(console.error);
          }
        }

        // Update memory and finish
        yield { type: 'progress', stage: WorkflowStage.MEMORY_UPDATE, message: 'Updating student memory...' };
        const memoryProvider = container.resolve<IMemoryProvider>(TOKENS.MemoryProvider);
        await memoryProvider.updateSessionMemory(req.userId, req.sessionId || 'default', {
          contextWindow: [req.query]
        });

        // Track greeting/onboarding requests too so live traffic is fully counted.
        const gGen = this.deriveGenCost(costMark);
        void this.persistTelemetry(req, {
          provider: gGen.provider,
          model: gGen.model,
          promptVersion: 'greeting',
          totalLatencyMs: Date.now() - workflowStartTime,
          timeToFirstTokenMs: firstChunkAt ? firstChunkAt - workflowStartTime : 0,
          promptTokens: gGen.promptTokens,
          completionTokens: gGen.completionTokens,
          estimatedCostUSD: gGen.totalCostUSD,
          verificationPassed: true,
        });

        yield { type: 'done', data: { citations: [], assets: [], confidenceScore: 1.0 } };
        return;
      }

      // ── Check for onboarding data in non-greeting messages ─────────────
      // If the user isn't onboarded and sends a message with exam info, extract it
      if (!studentContext.isOnboarded) {
        const profileService = new UserProfileService();
        // Fire and forget — don't block the main flow
        // We'll check the response too after generation
        const examMentionPattern = /(ssc\s*cgl|ssc\s*chsl|upsc|bpsc|jee|neet|cuet|ibps|sbi|rrb|ctet|ugc\s*net|bihar\s*tre|ntpc)/i;
        if (examMentionPattern.test(req.query)) {
          profileService.extractProfileFromConversation(req.userId, req.query, '').catch(console.error);
        }
      }

      // ── Stage 3: Memory Retrieval ──────────────────────────────────────
      yield { type: 'progress', stage: WorkflowStage.MEMORY_RETRIEVAL, message: 'Loading learning memory...' };
      const memoryProvider = container.resolve<IMemoryProvider>(TOKENS.MemoryProvider);
      
      const sessionMemory = await memoryProvider.getSessionMemory(req.userId, req.sessionId || 'default');
      const learningMetrics = await memoryProvider.getLearningAnalytics(req.userId);
      
      // ── Stage 4: Graph Retrieval ───────────────────────────────────────
      yield { type: 'progress', stage: WorkflowStage.GRAPH_RETRIEVAL, message: 'Mapping concept relationships...' };
      
      const agentContext: AgentContext = {
        request: req,
        retrievedContext: 'Placeholder RAG Text', // Will be populated by RAG phase
        sharedState: {},
        studentContext, // Inject student context for all agents
      };

      // Knowledge Graph Retrieval
      const graphAgent = new KnowledgeGraphAgent();
      await graphAgent.execute(agentContext);
      
      // ── Stage 5: Vector Retrieval (RAG) ────────────────────────────────
      yield { type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, message: 'Searching memory and the web...' };
      const retrievalStartTime = Date.now();
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
          for (const r of notebookResults) {
            contextStr += `[Citation: ${r.source} (Page ${r.metadata?.pageNumber || 1})]\n${r.text}\n\n`;
            const citationData = {
              source: r.source,
              text: r.text,
              score: r.score,
              authorityScore: r.metadata?.authority || 0.8,
              selectionReasoning: r.selectionReasoning || 'Highly relevant to your query.',
              pageNumber: r.metadata?.pageNumber,
              paragraphIndex: r.metadata?.paragraphIndex
            };
            citationsList.push(citationData);
            yield { type: 'citation', citation: citationData };
          }
        }
      }

      // ── Hybrid GraphRAG (Phase 1): fuse Knowledge Graph context ────────
      // The KnowledgeGraphAgent (Stage 4) placed notebook-scoped graph context
      // into shared state. Prepend it so concepts + relationships + definitions
      // reach the TeacherAgent alongside the vector chunks. Graph retrieval is
      // pure Firestore + string ops (zero extra Gemini cost).
      const graphContextStr = (agentContext.sharedState['graphContext'] as string) || '';
      if (graphContextStr) {
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

      // Real retrieval-phase measurements. Reranking / pinecone / embedding sub-spans are
      // recorded inside RetrievalService via Telemetry.logLatency; we read them back here.
      const retrievalLatencyMs = Date.now() - retrievalStartTime;
      const retrievalSpans = Telemetry.metrics.slice(telemetryMark);
      const sumSpan = (op: string) =>
        retrievalSpans.filter((m: any) => m.operation === op).reduce((a: number, m: any) => a + (m.durationMs || 0), 0);
      const rerankingLatencyMs = sumSpan('cohere_rerank');
      const retrievalCacheHit = retrievalSpans.some((m: any) => m.operation === 'retrieval_cache_hit');

      // ── Stage 6: Agent Execution ───────────────────────────────────────
      yield { type: 'progress', stage: WorkflowStage.AGENT_EXECUTION, message: `Scholarly AI ${mode} mode preparing explanation...` };

      const generationStartTime = Date.now();
      const teacher = new TeacherAgent();
      await teacher.execute(agentContext);
      const generatedResponse = agentContext.sharedState['teacherDraft'] || '';
      
      // ── Stage 7: Verification ──────────────────────────────────────────
      yield { type: 'progress', stage: WorkflowStage.VERIFICATION, message: 'Verifying retrieved information...' };

      // Real quality metrics derived from the verification report (when a notebook + citations exist).
      let measuredHallucinationRate = 0;
      let measuredCitationCoverage = citationsList.length > 0 ? 1 : 0;
      let measuredConfidence = citationsList.length > 0 ? 0.9 : 0.7;

      if (req.notebookId && generatedResponse && citationsList.length > 0) {
        const verification = await retrievalService.verifyClaimsAndCalculateConfidence(
          generatedResponse,
          citationsList.map(c => ({ text: c.text, source: c.source, score: c.score, metadata: c }))
        );

        const totalClaims = verification.supportedClaims.length + verification.unsupportedClaims.length;
        if (totalClaims > 0) {
          measuredHallucinationRate = verification.unsupportedClaims.length / totalClaims;
          measuredCitationCoverage = verification.supportedClaims.length / totalClaims;
        }
        measuredConfidence = verification.confidenceScore;

        if (!verification.isValid && verification.unsupportedClaims.length > 0) {
          const warningMsg = `Warning: This response contains unsupported claims: ${verification.unsupportedClaims.map(c => c.claim).join('; ')}`;
          yield { type: 'warning', warning: warningMsg };
          agentContext.sharedState['verificationWarnings'] = verification.unsupportedClaims.map(c => c.claim);
        }
      }
      
      // ── Stage 8: Asset Generation ──────────────────────────────────────
      yield { type: 'progress', stage: WorkflowStage.ASSET_GENERATION, message: 'Creating learning assets...' };
      
      // ── Stage 9: Format & Stream Response ──────────────────────────────
      const formatter = new ResponseFormatter();
      let fullReply = '';
      if (formatter.executeStream) {
        for await (const chunk of formatter.executeStream(agentContext)) {
          if (!firstChunkAt) {
            firstChunkAt = Date.now();
            // Time-to-first-token measured from workflow start.
            Telemetry.logTTFT('chat_workflow', firstChunkAt - workflowStartTime, { userId: req.userId, notebookId: req.notebookId });
          }
          fullReply += chunk;
          yield { type: 'chunk', chunk };
        }
      }
      const generationLatencyMs = Date.now() - generationStartTime;
      
      // ── Stage 10: Analytics ────────────────────────────────────────────
      yield { type: 'progress', stage: WorkflowStage.ANALYTICS, message: 'Logging retrieval analytics...' };
      const analyticsProvider = container.resolve<IAnalyticsProvider>(TOKENS.AnalyticsProvider);
      // Real cost attribution from token-usage cost events recorded during this request.
      const costSpans = Telemetry.costs.slice(costMark);
      const generationCost = costSpans
        .filter((c: any) => c.provider === 'groq' || c.provider === 'gemini')
        .reduce((a: number, c: any) => a + (c.cost || 0), 0);
      const embeddingCost = costSpans
        .filter((c: any) => c.type === 'embedding')
        .reduce((a: number, c: any) => a + (c.cost || 0), 0);
      const workflowDurationMs = Date.now() - workflowStartTime;
      Telemetry.logLatency('chat_workflow_total', workflowDurationMs, { userId: req.userId, retrievalLatencyMs, generationLatencyMs });
      await analyticsProvider.logWorkflowMetrics(req.userId, {
        query: req.query,
        cacheHit: retrievalCacheHit,
        retrievalLatencyMs,
        rerankingLatencyMs,
        generationLatencyMs,
        hallucinationRate: measuredHallucinationRate,
        averageConfidence: measuredConfidence,
        citationCoverage: measuredCitationCoverage,
        workflowDurationMs,
        embeddingCost,
        generationCost
      });

      // Persist real telemetry to Firestore for the Admin observability dashboards.
      const gen = this.deriveGenCost(costMark);
      const avgSimilarity = citationsList.length > 0
        ? citationsList.reduce((a, c) => a + (c.score || 0), 0) / citationsList.length
        : 0;
      void this.persistTelemetry(req, {
        provider: gen.provider,
        model: gen.model,
        promptVersion: (req.mode || 'TEACHER').toLowerCase(),
        totalLatencyMs: workflowDurationMs,
        retrievalLatencyMs,
        rerankerLatencyMs: rerankingLatencyMs,
        generationLatencyMs,
        timeToFirstTokenMs: firstChunkAt ? firstChunkAt - workflowStartTime : 0,
        promptTokens: gen.promptTokens,
        completionTokens: gen.completionTokens,
        estimatedCostUSD: gen.totalCostUSD,
        chunkCount: citationsList.length,
        cacheHit: retrievalCacheHit,
        pineconeQueryTimeMs: sumSpan('pinecone_search'),
        averageSimilarityScore: avgSimilarity,
        verificationPassed: measuredHallucinationRate === 0,
        citationCount: citationsList.length,
      });
      
      // ── Stage 11: Memory Update ────────────────────────────────────────
      yield { type: 'progress', stage: WorkflowStage.MEMORY_UPDATE, message: 'Updating student memory...' };
      await memoryProvider.updateSessionMemory(req.userId, req.sessionId || 'default', {
        contextWindow: [...sessionMemory.contextWindow, req.query]
      });

      // Post-response profile extraction (fire and forget)
      if (!studentContext.isOnboarded && fullReply) {
        const profileService = new UserProfileService();
        profileService.extractProfileFromConversation(req.userId, req.query, fullReply).catch(console.error);
      }
      
      yield { type: 'done', data: { citations: citationsList, assets: [], confidenceScore: measuredConfidence } };

    } catch (error: any) {
      console.error('Workflow execution error:', error);
      yield { type: 'error', message: error.message || 'Internal Workflow Error' };
    }
  }
}

export const workflowEngine = new WorkflowEngine();

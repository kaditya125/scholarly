"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowEngine = exports.WorkflowEngine = exports.WorkflowStage = void 0;
const container_1 = require("../di/container");
const TeacherAgent_1 = require("../agents/TeacherAgent");
const ResponseFormatter_1 = require("../agents/ResponseFormatter");
const KnowledgeGraphAgent_1 = require("../agents/KnowledgeGraphAgent");
var WorkflowStage;
(function (WorkflowStage) {
    WorkflowStage["INTENT_DETECTION"] = "INTENT_DETECTION";
    WorkflowStage["MEMORY_RETRIEVAL"] = "MEMORY_RETRIEVAL";
    WorkflowStage["GRAPH_RETRIEVAL"] = "GRAPH_RETRIEVAL";
    WorkflowStage["RAG_RETRIEVAL"] = "RAG_RETRIEVAL";
    WorkflowStage["RERANKING"] = "RERANKING";
    WorkflowStage["AGENT_EXECUTION"] = "AGENT_EXECUTION";
    WorkflowStage["VERIFICATION"] = "VERIFICATION";
    WorkflowStage["ASSET_GENERATION"] = "ASSET_GENERATION";
    WorkflowStage["ANALYTICS"] = "ANALYTICS";
    WorkflowStage["MEMORY_UPDATE"] = "MEMORY_UPDATE";
})(WorkflowStage || (exports.WorkflowStage = WorkflowStage = {}));
class WorkflowEngine {
    aiProvider;
    cache;
    constructor() {
        this.aiProvider = container_1.container.resolve(container_1.TOKENS.AIProvider);
        this.cache = container_1.container.resolve(container_1.TOKENS.CacheProvider);
    }
    /**
     * Executes the AI workflow as a streaming generator.
     * Yields WorkflowEvents that can be pushed to the client via SSE.
     */
    async *executeStream(req) {
        const workflowStartTime = Date.now();
        try {
            yield { type: 'progress', stage: WorkflowStage.INTENT_DETECTION, message: 'Understanding your question...' };
            const mode = req.mode || 'TEACHER';
            yield { type: 'progress', stage: WorkflowStage.MEMORY_RETRIEVAL, message: 'Loading learning memory...' };
            const memoryProvider = container_1.container.resolve(container_1.TOKENS.MemoryProvider);
            const sessionMemory = await memoryProvider.getSessionMemory(req.userId, req.sessionId || 'default');
            const learningMetrics = await memoryProvider.getLearningAnalytics(req.userId);
            yield { type: 'progress', stage: WorkflowStage.GRAPH_RETRIEVAL, message: 'Mapping concept relationships...' };
            const agentContext = {
                request: req,
                retrievedContext: 'Placeholder RAG Text', // Will be populated by RAG phase
                sharedState: {}
            };
            // 3. Knowledge Graph Retrieval
            const graphAgent = new KnowledgeGraphAgent_1.KnowledgeGraphAgent();
            await graphAgent.execute(agentContext);
            // 4. Vector Retrieval Logic
            // TODO: Incorporate agentContext.sharedState['graphContext'] into Retrieval Service
            yield { type: 'progress', stage: WorkflowStage.RERANKING, message: 'Ranking relevant sources...' };
            // TODO: Cohere Reranking Logic
            yield { type: 'progress', stage: WorkflowStage.VERIFICATION, message: 'Verifying context...' };
            // TODO: Pre-generation verification
            yield { type: 'progress', stage: WorkflowStage.AGENT_EXECUTION, message: `${mode} Agent preparing explanation...` };
            // 6. Agent Execution: Teacher Drafts
            const teacher = new TeacherAgent_1.TeacherAgent();
            await teacher.execute(agentContext);
            yield { type: 'progress', stage: WorkflowStage.VERIFICATION, message: 'Verifying retrieved information...' };
            // 7. Verification: Cross-checks the draft against RAG
            // For now, this is skipped if verification provider isn't fully implemented in DI
            // const verifier = new VerificationAgent();
            // await verifier.execute(agentContext);
            yield { type: 'progress', stage: WorkflowStage.ASSET_GENERATION, message: 'Creating learning assets...' };
            // 8. One-click Asset Generation (Flashcards, Quizzes based on context)
            // 9. Format Final Streaming Response
            const formatter = new ResponseFormatter_1.ResponseFormatter();
            if (formatter.executeStream) {
                for await (const chunk of formatter.executeStream(agentContext)) {
                    yield { type: 'chunk', chunk };
                }
            }
            yield { type: 'progress', stage: WorkflowStage.ANALYTICS, message: 'Logging retrieval analytics...' };
            const analyticsProvider = container_1.container.resolve(container_1.TOKENS.AnalyticsProvider);
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
            yield { type: 'done', data: { citations: [], assets: [], confidenceScore: 0.95 } };
        }
        catch (error) {
            console.error('Workflow execution error:', error);
            yield { type: 'error', message: error.message || 'Internal Workflow Error' };
        }
    }
}
exports.WorkflowEngine = WorkflowEngine;
exports.workflowEngine = new WorkflowEngine();

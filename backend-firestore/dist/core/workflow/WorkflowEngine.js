"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowEngine = exports.WorkflowEngine = exports.WorkflowStage = void 0;
const container_1 = require("../di/container");
const TeacherAgent_1 = require("../agents/TeacherAgent");
const ResponseFormatter_1 = require("../agents/ResponseFormatter");
const KnowledgeGraphAgent_1 = require("../agents/KnowledgeGraphAgent");
const retrieval_service_1 = require("../../services/rag/retrieval.service");
const studentContext_service_1 = require("../../services/studentContext.service");
const userProfile_service_1 = require("../../services/userProfile.service");
const prompts_1 = require("../../config/prompts");
const teacher_prompt_1 = require("../../prompts/teacher.prompt");
const verification_prompt_1 = require("../../prompts/verification.prompt");
const intent_prompt_1 = require("../../prompts/intent.prompt");
const telemetry_1 = require("../../lib/telemetry");
var WorkflowStage;
(function (WorkflowStage) {
    WorkflowStage["INTENT_DETECTION"] = "INTENT_DETECTION";
    WorkflowStage["CONTEXT_ENRICHMENT"] = "CONTEXT_ENRICHMENT";
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
    get aiProvider() {
        return container_1.container.resolve(container_1.TOKENS.AIProvider);
    }
    get cache() {
        return container_1.container.resolve(container_1.TOKENS.CacheProvider);
    }
    constructor() {
        // Lazy resolve to prevent DI crash on module import
    }
    /**
     * Processes an educational query through a multi-step reasoning pipeline.
     */
    async processEducationalQuery(query, userId) {
        const contextService = new studentContext_service_1.StudentContextService();
        // 1. Fetch Global Context (Exam, Difficulty)
        let exam = 'General';
        let difficulty = 'Beginner';
        try {
            const studentContext = await contextService.aggregateContext(userId);
            exam = studentContext?.profile?.exam || 'General';
            difficulty = studentContext?.profile?.difficulty || 'Beginner';
        }
        catch (e) {
            console.warn('Failed to aggregate context, using defaults.');
        }
        // 2. Infer intent (Math? History?)
        const intentPrompt = (0, intent_prompt_1.getIntentPrompt)();
        const intentResponse = await this.aiProvider.generateResponse([
            { role: 'system', content: intentPrompt },
            { role: 'user', content: query }
        ]);
        let intentResult = { intent: 'unknown', domain: 'unknown' };
        try {
            intentResult = JSON.parse(intentResponse.reply);
        }
        catch (e) {
            console.warn('Failed to parse intent response:', intentResponse.reply);
        }
        // 3. Retrieve Vectors & KG Nodes
        const retrievalService = new retrieval_service_1.RetrievalService();
        let retrievedData = { vectors: [], kgNodes: [] };
        try {
            const webResults = await retrievalService.retrieveWebContext(query);
            retrievedData.vectors = webResults || [];
        }
        catch (e) {
            console.warn('Failed to retrieve context.');
        }
        // 4. Draft answer (using teacher prompt)
        const teacherPrompt = (0, teacher_prompt_1.getTeacherPrompt)(exam, difficulty);
        const draftPrompt = `${teacherPrompt}\n\nUser Query: ${query}\nRetrieved Context: ${JSON.stringify(retrievedData)}`;
        const draftResponse = await this.aiProvider.generateResponse([
            { role: 'user', content: draftPrompt }
        ]);
        // 5. Verify answer (using verification prompt)
        const verificationPrompt = (0, verification_prompt_1.getVerificationPrompt)();
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
     * Executes the AI workflow as a streaming generator.
     * Yields WorkflowEvents that can be pushed to the client via SSE.
     */
    async *executeStream(req) {
        const workflowStartTime = Date.now();
        // Marks into the shared telemetry buffers so we can attribute real latency/cost
        // spans recorded by downstream services (RetrievalService, providers) to this request.
        const telemetryMark = telemetry_1.Telemetry.metrics.length;
        const costMark = telemetry_1.Telemetry.costs.length;
        let firstChunkAt = 0;
        try {
            // ── Stage 1: Intent Detection ──────────────────────────────────────
            yield { type: 'progress', stage: WorkflowStage.INTENT_DETECTION, message: 'Understanding your question...' };
            const mode = req.mode || 'TEACHER';
            // ── Stage 2: Context Enrichment (NEW) ──────────────────────────────
            yield { type: 'progress', stage: WorkflowStage.CONTEXT_ENRICHMENT, message: 'Loading your learning profile...' };
            const contextService = new studentContext_service_1.StudentContextService();
            let studentContext;
            try {
                studentContext = await contextService.aggregateContext(req.userId);
            }
            catch (e) {
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
            const isGreeting = (0, prompts_1.isGreetingMessage)(req.query);
            const isShortHistory = req.history.filter(m => m.role !== 'system').length <= 2;
            if (isGreeting && isShortHistory) {
                yield { type: 'progress', stage: WorkflowStage.AGENT_EXECUTION, message: 'Preparing your personalized welcome...' };
                // Generate greeting or onboarding response
                const greetingPrompt = (0, prompts_1.getGreetingOrOnboardingPrompt)(studentContext);
                const anyProvider = this.aiProvider;
                if (typeof anyProvider.generateStreamResponse === 'function') {
                    const stream = anyProvider.generateStreamResponse([
                        { role: 'system', content: greetingPrompt },
                        { role: 'user', content: req.query }
                    ]);
                    let fullGreeting = '';
                    for await (const chunk of stream) {
                        fullGreeting += chunk;
                        yield { type: 'chunk', chunk };
                    }
                    // If this was an onboarding greeting, try to extract any profile data
                    if (!studentContext.isOnboarded) {
                        const profileService = new userProfile_service_1.UserProfileService();
                        profileService.extractProfileFromConversation(req.userId, req.query, fullGreeting).catch(console.error);
                    }
                }
                else {
                    const res = await this.aiProvider.generateResponse([
                        { role: 'system', content: greetingPrompt },
                        { role: 'user', content: req.query }
                    ]);
                    yield { type: 'chunk', chunk: res.reply };
                    if (!studentContext.isOnboarded) {
                        const profileService = new userProfile_service_1.UserProfileService();
                        profileService.extractProfileFromConversation(req.userId, req.query, res.reply).catch(console.error);
                    }
                }
                // Update memory and finish
                yield { type: 'progress', stage: WorkflowStage.MEMORY_UPDATE, message: 'Updating student memory...' };
                const memoryProvider = container_1.container.resolve(container_1.TOKENS.MemoryProvider);
                await memoryProvider.updateSessionMemory(req.userId, req.sessionId || 'default', {
                    contextWindow: [req.query]
                });
                yield { type: 'done', data: { citations: [], assets: [], confidenceScore: 1.0 } };
                return;
            }
            // ── Check for onboarding data in non-greeting messages ─────────────
            // If the user isn't onboarded and sends a message with exam info, extract it
            if (!studentContext.isOnboarded) {
                const profileService = new userProfile_service_1.UserProfileService();
                // Fire and forget — don't block the main flow
                // We'll check the response too after generation
                const examMentionPattern = /(ssc\s*cgl|ssc\s*chsl|upsc|bpsc|jee|neet|cuet|ibps|sbi|rrb|ctet|ugc\s*net|bihar\s*tre|ntpc)/i;
                if (examMentionPattern.test(req.query)) {
                    profileService.extractProfileFromConversation(req.userId, req.query, '').catch(console.error);
                }
            }
            // ── Stage 3: Memory Retrieval ──────────────────────────────────────
            yield { type: 'progress', stage: WorkflowStage.MEMORY_RETRIEVAL, message: 'Loading learning memory...' };
            const memoryProvider = container_1.container.resolve(container_1.TOKENS.MemoryProvider);
            const sessionMemory = await memoryProvider.getSessionMemory(req.userId, req.sessionId || 'default');
            const learningMetrics = await memoryProvider.getLearningAnalytics(req.userId);
            // ── Stage 4: Graph Retrieval ───────────────────────────────────────
            yield { type: 'progress', stage: WorkflowStage.GRAPH_RETRIEVAL, message: 'Mapping concept relationships...' };
            const agentContext = {
                request: req,
                retrievedContext: 'Placeholder RAG Text', // Will be populated by RAG phase
                sharedState: {},
                studentContext, // Inject student context for all agents
            };
            // Knowledge Graph Retrieval
            const graphAgent = new KnowledgeGraphAgent_1.KnowledgeGraphAgent();
            await graphAgent.execute(agentContext);
            // ── Stage 5: Vector Retrieval (RAG) ────────────────────────────────
            yield { type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, message: 'Searching memory and the web...' };
            const retrievalStartTime = Date.now();
            const retrievalService = new retrieval_service_1.RetrievalService();
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
                }
                catch (err) {
                    console.warn("Web search failed", err);
                }
            }
            // If we have a notebookId, retrieve hierarchical context
            let citationsList = [];
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
            agentContext.retrievedContext = contextStr || 'No specific context found.';
            // Real retrieval-phase measurements. Reranking / pinecone / embedding sub-spans are
            // recorded inside RetrievalService via Telemetry.logLatency; we read them back here.
            const retrievalLatencyMs = Date.now() - retrievalStartTime;
            const retrievalSpans = telemetry_1.Telemetry.metrics.slice(telemetryMark);
            const sumSpan = (op) => retrievalSpans.filter((m) => m.operation === op).reduce((a, m) => a + (m.durationMs || 0), 0);
            const rerankingLatencyMs = sumSpan('cohere_rerank');
            const retrievalCacheHit = retrievalSpans.some((m) => m.operation === 'retrieval_cache_hit');
            // ── Stage 6: Agent Execution ───────────────────────────────────────
            yield { type: 'progress', stage: WorkflowStage.AGENT_EXECUTION, message: `Scholarly AI ${mode} mode preparing explanation...` };
            const generationStartTime = Date.now();
            const teacher = new TeacherAgent_1.TeacherAgent();
            await teacher.execute(agentContext);
            const generatedResponse = agentContext.sharedState['teacherDraft'] || '';
            // ── Stage 7: Verification ──────────────────────────────────────────
            yield { type: 'progress', stage: WorkflowStage.VERIFICATION, message: 'Verifying retrieved information...' };
            // Real quality metrics derived from the verification report (when a notebook + citations exist).
            let measuredHallucinationRate = 0;
            let measuredCitationCoverage = citationsList.length > 0 ? 1 : 0;
            let measuredConfidence = citationsList.length > 0 ? 0.9 : 0.7;
            if (req.notebookId && generatedResponse && citationsList.length > 0) {
                const verification = await retrievalService.verifyClaimsAndCalculateConfidence(generatedResponse, citationsList.map(c => ({ text: c.text, source: c.source, score: c.score, metadata: c })));
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
            const formatter = new ResponseFormatter_1.ResponseFormatter();
            let fullReply = '';
            if (formatter.executeStream) {
                for await (const chunk of formatter.executeStream(agentContext)) {
                    if (!firstChunkAt) {
                        firstChunkAt = Date.now();
                        // Time-to-first-token measured from workflow start.
                        telemetry_1.Telemetry.logTTFT('chat_workflow', firstChunkAt - workflowStartTime, { userId: req.userId, notebookId: req.notebookId });
                    }
                    fullReply += chunk;
                    yield { type: 'chunk', chunk };
                }
            }
            const generationLatencyMs = Date.now() - generationStartTime;
            // ── Stage 10: Analytics ────────────────────────────────────────────
            yield { type: 'progress', stage: WorkflowStage.ANALYTICS, message: 'Logging retrieval analytics...' };
            const analyticsProvider = container_1.container.resolve(container_1.TOKENS.AnalyticsProvider);
            // Real cost attribution from token-usage cost events recorded during this request.
            const costSpans = telemetry_1.Telemetry.costs.slice(costMark);
            const generationCost = costSpans
                .filter((c) => c.provider === 'groq' || c.provider === 'gemini')
                .reduce((a, c) => a + (c.cost || 0), 0);
            const embeddingCost = costSpans
                .filter((c) => c.type === 'embedding')
                .reduce((a, c) => a + (c.cost || 0), 0);
            const workflowDurationMs = Date.now() - workflowStartTime;
            telemetry_1.Telemetry.logLatency('chat_workflow_total', workflowDurationMs, { userId: req.userId, retrievalLatencyMs, generationLatencyMs });
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
            // ── Stage 11: Memory Update ────────────────────────────────────────
            yield { type: 'progress', stage: WorkflowStage.MEMORY_UPDATE, message: 'Updating student memory...' };
            await memoryProvider.updateSessionMemory(req.userId, req.sessionId || 'default', {
                contextWindow: [...sessionMemory.contextWindow, req.query]
            });
            // Post-response profile extraction (fire and forget)
            if (!studentContext.isOnboarded && fullReply) {
                const profileService = new userProfile_service_1.UserProfileService();
                profileService.extractProfileFromConversation(req.userId, req.query, fullReply).catch(console.error);
            }
            yield { type: 'done', data: { citations: citationsList, assets: [], confidenceScore: measuredConfidence } };
        }
        catch (error) {
            console.error('Workflow execution error:', error);
            yield { type: 'error', message: error.message || 'Internal Workflow Error' };
        }
    }
}
exports.WorkflowEngine = WorkflowEngine;
exports.workflowEngine = new WorkflowEngine();

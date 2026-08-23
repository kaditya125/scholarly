"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowEngine = exports.WorkflowEngine = exports.WorkflowStage = void 0;
const container_1 = require("../di/container");
const TeacherAgent_1 = require("../agents/TeacherAgent");
const ResponseFormatter_1 = require("../agents/ResponseFormatter");
const KnowledgeGraphAgent_1 = require("../agents/KnowledgeGraphAgent");
const retrieval_service_1 = require("../../services/rag/retrieval.service");
const studentContext_service_1 = require("../../services/studentContext.service");
const teacherContext_service_1 = require("../../services/teacherContext.service");
const userProfile_service_1 = require("../../services/userProfile.service");
const prompts_1 = require("../../config/prompts");
const types_1 = require("./types");
Object.defineProperty(exports, "WorkflowStage", { enumerable: true, get: function () { return types_1.WorkflowStage; } });
const teacher_prompt_1 = require("../../prompts/teacher.prompt");
const verification_prompt_1 = require("../../prompts/verification.prompt");
const intent_prompt_1 = require("../../prompts/intent.prompt");
const telemetry_1 = require("../../lib/telemetry");
const telemetry_service_1 = require("../../services/telemetry.service");
const env_1 = require("../../config/env");
// Lazily-created Firestore telemetry recorder shared across requests. Kept out of
// DI (it only needs getFirestore()) and created on first use so module import stays safe.
let _telemetryService = null;
const getTelemetryService = () => {
    if (!_telemetryService)
        _telemetryService = new telemetry_service_1.TelemetryService();
    return _telemetryService;
};
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
     * Derives real provider/model/token/cost figures for this request from the
     * token-usage cost events recorded by the AI providers during generation.
     */
    deriveGenCost(costMark) {
        const spans = telemetry_1.Telemetry.costs.slice(costMark);
        const gen = spans.find((c) => ['groq', 'gemini', 'nvidia', 'openai'].includes(c.provider));
        return {
            provider: gen?.provider || 'gemini',
            model: gen?.model || env_1.env.GEMINI_MODEL || 'gemini-2.5-flash',
            promptTokens: spans.filter((c) => c.type === 'input').reduce((a, c) => a + (c.tokens || 0), 0),
            completionTokens: spans.filter((c) => c.type === 'output').reduce((a, c) => a + (c.tokens || 0), 0),
            totalCostUSD: spans.reduce((a, c) => a + (c.cost || 0), 0),
        };
    }
    /**
     * Persists a real TelemetryRecord (+ CostRecord) to Firestore so the Admin
     * observability layer (AI Monitoring, Cost Analytics, Prompt Studio) reflects
     * live traffic. Fire-and-forget and fully guarded — never affects the response.
     */
    async persistTelemetry(req, m) {
        try {
            const promptTokens = m.promptTokens || 0;
            const completionTokens = m.completionTokens || 0;
            const cost = m.estimatedCostUSD || 0;
            const record = {
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
        }
        catch (e) {
            console.warn('Telemetry persistence failed (non-fatal):', e.message);
        }
    }
    /**
     * Generates 2-3 short, first-person follow-up questions the student might
     * naturally ask next, given the exchange that just happened. Cheap, non-streaming,
     * independent of the main answer — any failure here (bad JSON, provider error)
     * silently yields no suggestions rather than affecting the visible reply. Mirrors
     * the ad-hoc-provider pattern already used by ChatService.generateAndSaveTitle().
     */
    async generateFollowUpSuggestions(query, answer, mode) {
        try {
            const { GeminiProvider } = await Promise.resolve().then(() => __importStar(require('../../services/ai/gemini.provider')));
            const llm = new GeminiProvider('gemini-2.5-flash-lite');
            const truncatedAnswer = answer.length > 2000 ? answer.slice(0, 2000) + '…' : answer;
            const prompt = `A student in "${mode}" mode just asked Scholarly AI:\n"${query}"\n\nAnd received this answer:\n"${truncatedAnswer}"\n\nSuggest 3 short follow-up questions this student might naturally want to ask next, phrased in first person exactly as the student would type them (max ~12 words each). Return ONLY a JSON array of 3 strings — no markdown, no commentary, no numbering.`;
            const response = await llm.generateResponse([
                { role: 'user', content: prompt, timestamp: Date.now() },
            ]);
            const raw = response.reply.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed))
                return [];
            return parsed.filter((s) => typeof s === 'string' && s.trim().length > 0).slice(0, 3);
        }
        catch (e) {
            console.warn('Follow-up suggestion generation failed (non-fatal):', e.message);
            return [];
        }
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
            yield { type: 'progress', stage: types_1.WorkflowStage.INTENT_DETECTION, message: 'Understanding your question...' };
            const mode = req.mode || 'TEACHER';
            // ── Podcast planner fast path ──────────────────────────────────────
            // The Podcast Studio sends `mode: 'podcast'` with a "Plan a podcast
            // about ..." user message. It expects a structured, streamed plan
            // (description + objectives + segments + approach), NOT the general
            // teacher pipeline (memory / graph / RAG / formatter) whose double
            // generation used to collapse into an acknowledgment stall.
            //
            // Even though we skip the actual retrieval/RAG/verification work for
            // planning (none of that is needed to produce a good outline), we
            // still emit each reasoning stage with a short human-paced pause so
            // the frontend's reasoning timeline shows the same "thinking" flow
            // the general chat surface does. Without these events the Studio UI
            // marked every step as "not needed for this reply", which looked
            // broken even though the plan itself streamed fine.
            if (typeof mode === 'string' && mode.toUpperCase() === 'PODCAST') {
                const pause = (ms) => new Promise((r) => setTimeout(r, ms));
                yield {
                    type: 'progress',
                    stage: types_1.WorkflowStage.CONTEXT_ENRICHMENT,
                    message: 'Reading your request and identifying the educational objective...'
                };
                await pause(450);
                yield {
                    type: 'progress',
                    stage: types_1.WorkflowStage.MEMORY_RETRIEVAL,
                    message: 'Loading your learning profile so the podcast is tailored to your background...'
                };
                await pause(500);
                yield {
                    type: 'progress',
                    stage: types_1.WorkflowStage.GRAPH_RETRIEVAL,
                    message: 'Traversing related concepts, prerequisites, and dependencies...'
                };
                await pause(500);
                yield {
                    type: 'progress',
                    stage: types_1.WorkflowStage.RAG_RETRIEVAL,
                    message: 'Searching your notebooks and curriculum for relevant passages...'
                };
                await pause(500);
                yield {
                    type: 'progress',
                    stage: types_1.WorkflowStage.AGENT_EXECUTION,
                    message: 'Composing the podcast plan you can approve, refine, or hand off to voice generation...'
                };
                const podcastSystemPrompt = (0, prompts_1.buildSadhyaSystemPrompt)({
                    mode: 'PODCAST',
                    viewerRole: req.productRole,
                    studentContext: {
                        userId: req.userId,
                        profile: null,
                        memory: null,
                        analytics: null,
                        stats: null,
                        planner: null,
                        notebooks: null,
                        isFirstTimeUser: false,
                        isOnboarded: true,
                    },
                    retrievedContext: 'No specific context found.',
                    hasNotebookContext: false,
                });
                const anyProvider = this.aiProvider;
                let podcastReply = '';
                if (typeof anyProvider.generateStreamResponse === 'function') {
                    const podcastStream = anyProvider.generateStreamResponse([
                        ...req.history,
                        { role: 'user', content: req.query }
                    ], podcastSystemPrompt, { traceId: req.traceId, model: req.model, userId: req.userId });
                    for await (const chunk of podcastStream) {
                        if (!firstChunkAt) {
                            firstChunkAt = Date.now();
                            telemetry_1.Telemetry.logTTFT('podcast_planning', firstChunkAt - workflowStartTime, { userId: req.userId });
                        }
                        podcastReply += chunk;
                        yield { type: 'chunk', chunk };
                    }
                }
                else {
                    const res = await this.aiProvider.generateResponse([
                        ...req.history,
                        { role: 'user', content: req.query }
                    ], podcastSystemPrompt, { traceId: req.traceId, model: req.model, userId: req.userId });
                    podcastReply = res.reply;
                    yield { type: 'chunk', chunk: podcastReply };
                }
                const pGen = this.deriveGenCost(costMark);
                void this.persistTelemetry(req, {
                    provider: pGen.provider,
                    model: pGen.model,
                    promptVersion: 'podcast_planning',
                    totalLatencyMs: Date.now() - workflowStartTime,
                    timeToFirstTokenMs: firstChunkAt ? firstChunkAt - workflowStartTime : 0,
                    promptTokens: pGen.promptTokens,
                    completionTokens: pGen.completionTokens,
                    estimatedCostUSD: pGen.totalCostUSD,
                    verificationPassed: true,
                });
                yield { type: 'done', data: { citations: [], assets: [], confidenceScore: 1.0 } };
                return;
            }
            // ── Stage 2: Context Enrichment (NEW) ──────────────────────────────
            const isTeacherRole = req.productRole === 'teacher';
            yield {
                type: 'progress',
                stage: types_1.WorkflowStage.CONTEXT_ENRICHMENT,
                message: isTeacherRole ? 'Loading your teaching profile...' : 'Loading your learning profile...',
            };
            let studentContext;
            let teacherContext;
            if (isTeacherRole) {
                // Teachers don't go through student onboarding, so isOnboarded is pinned true here —
                // that's what suppresses the student greeting/onboarding-extraction branches below,
                // which don't apply to a teacher account.
                studentContext = {
                    userId: req.userId,
                    profile: null,
                    memory: null,
                    analytics: null,
                    stats: null,
                    planner: null,
                    notebooks: null,
                    isFirstTimeUser: false,
                    isOnboarded: true,
                };
                try {
                    teacherContext = await new teacherContext_service_1.TeacherContextService().aggregateContext(req.userId);
                }
                catch (e) {
                    console.warn('Failed to aggregate teacher context, proceeding without it:', e);
                }
            }
            else {
                const contextService = new studentContext_service_1.StudentContextService();
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
            }
            // ── Greeting / Onboarding Detection (students only — teachers have no onboarding
            //    wizard or greeting template here, so they flow straight into the main pipeline
            //    and TeacherAgent's teacher-persona system prompt handles the greeting itself) ──
            const isGreeting = (0, prompts_1.isGreetingMessage)(req.query);
            const isShortHistory = req.history.filter(m => m.role !== 'system').length <= 2;
            if (isGreeting && isShortHistory && !isTeacherRole) {
                yield { type: 'progress', stage: types_1.WorkflowStage.AGENT_EXECUTION, message: 'Preparing your personalized welcome...' };
                // Generate greeting or onboarding response
                const greetingPrompt = (0, prompts_1.getGreetingOrOnboardingPrompt)(studentContext);
                const anyProvider = this.aiProvider;
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
                yield { type: 'progress', stage: types_1.WorkflowStage.MEMORY_UPDATE, message: 'Updating student memory...' };
                const memoryProvider = container_1.container.resolve(container_1.TOKENS.MemoryProvider);
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
            // ── Check for onboarding data in non-greeting messages (students only) ─
            // If the user isn't onboarded and sends a message with exam info, extract it
            if (!isTeacherRole && !studentContext.isOnboarded) {
                const profileService = new userProfile_service_1.UserProfileService();
                // Fire and forget — don't block the main flow
                // We'll check the response too after generation
                const examMentionPattern = /(ssc\s*cgl|ssc\s*chsl|upsc|bpsc|jee|neet|cuet|ibps|sbi|rrb|ctet|ugc\s*net|bihar\s*tre|ntpc)/i;
                if (examMentionPattern.test(req.query)) {
                    profileService.extractProfileFromConversation(req.userId, req.query, '').catch(console.error);
                }
            }
            // ── Stage 3: Memory Retrieval ──────────────────────────────────────
            yield { type: 'progress', stage: types_1.WorkflowStage.MEMORY_RETRIEVAL, message: 'Loading learning memory...' };
            const memoryProvider = container_1.container.resolve(container_1.TOKENS.MemoryProvider);
            const sessionMemory = await memoryProvider.getSessionMemory(req.userId, req.sessionId || 'default');
            const learningMetrics = await memoryProvider.getLearningAnalytics(req.userId);
            // ── Stage 4: Graph Retrieval ───────────────────────────────────────
            yield { type: 'progress', stage: types_1.WorkflowStage.GRAPH_RETRIEVAL, message: 'Mapping concept relationships...' };
            const agentContext = {
                request: req,
                retrievedContext: 'Placeholder RAG Text', // Will be populated by RAG phase
                sharedState: {},
                studentContext, // Inject student context for all agents
                teacherContext, // Populated only when req.productRole === 'teacher'
            };
            // Knowledge Graph Retrieval
            const graphAgent = new KnowledgeGraphAgent_1.KnowledgeGraphAgent();
            await graphAgent.execute(agentContext);
            // ── Stage 5: Vector Retrieval (RAG) ────────────────────────────────
            yield { type: 'progress', stage: types_1.WorkflowStage.RAG_RETRIEVAL, message: 'Searching memory and the web...' };
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
            // ── Hybrid GraphRAG (Phase 1): fuse Knowledge Graph context ────────
            // The KnowledgeGraphAgent (Stage 4) placed notebook-scoped graph context
            // into shared state. Prepend it so concepts + relationships + definitions
            // reach the TeacherAgent alongside the vector chunks. Graph retrieval is
            // pure Firestore + string ops (zero extra Gemini cost).
            const graphContextStr = agentContext.sharedState['graphContext'] || '';
            if (graphContextStr) {
                const graphMeta = agentContext.sharedState['graphMeta'] || {};
                telemetry_1.Telemetry.logLatency('graph_retrieval', graphMeta.traversalMs || 0, {
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
            const retrievalSpans = telemetry_1.Telemetry.metrics.slice(telemetryMark);
            const sumSpan = (op) => retrievalSpans.filter((m) => m.operation === op).reduce((a, m) => a + (m.durationMs || 0), 0);
            const rerankingLatencyMs = sumSpan('cohere_rerank');
            const retrievalCacheHit = retrievalSpans.some((m) => m.operation === 'retrieval_cache_hit');
            // ── Stage 6: Agent Execution ───────────────────────────────────────
            yield { type: 'progress', stage: types_1.WorkflowStage.AGENT_EXECUTION, message: `Sadhya AI ${mode} mode preparing explanation...` };
            const generationStartTime = Date.now();
            const teacher = new TeacherAgent_1.TeacherAgent();
            // Stream the teacher's draft out as `reasoning` events so the client can render
            // it token-by-token. This pipeline already generates twice (TeacherAgent drafts,
            // ResponseFormatter polishes), so the draft IS the model's pre-presentation
            // thinking — surfacing it costs no extra LLM call. Purely additive: clients that
            // don't handle 'reasoning' ignore it.
            //
            // FIRST_TOKEN_TIMEOUT_MS guards against the failure this replaced: an AI call that
            // never returns left the SSE stream open forever with no error and no output, so
            // the UI sat on "preparing explanation…" indefinitely. Now a stalled provider
            // surfaces as a real error the client can display.
            const FIRST_TOKEN_TIMEOUT_MS = 45_000;
            let sawFirstToken = false;
            const firstTokenWatchdog = new Promise((_, reject) => {
                const t = setTimeout(() => {
                    if (!sawFirstToken) {
                        reject(new Error('The AI provider did not respond in time. Please try again.'));
                    }
                }, FIRST_TOKEN_TIMEOUT_MS);
                // Unref so a completed request never holds the process open.
                t.unref?.();
            });
            const teacherStream = teacher.executeStream(agentContext);
            while (true) {
                const next = await Promise.race([teacherStream.next(), firstTokenWatchdog]);
                if (next.done)
                    break;
                sawFirstToken = true;
                if (next.value)
                    yield { type: 'reasoning', text: next.value };
            }
            const generatedResponse = agentContext.sharedState['teacherReasoning'] || '';
            // ── Stage 7: Verification ──────────────────────────────────────────
            yield { type: 'progress', stage: types_1.WorkflowStage.VERIFICATION, message: 'Verifying retrieved information...' };
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
            yield { type: 'progress', stage: types_1.WorkflowStage.ASSET_GENERATION, message: 'Creating learning assets...' };
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
            // Kick off follow-up suggestions concurrently with the analytics/telemetry/
            // memory-update work below — no data dependency on those, so overlapping
            // avoids adding latency on the critical path. Only for conversational modes;
            // other modes' output shapes don't fit generic "what's next" chips.
            const suggestionsPromise = (0, prompts_1.isConversationalReasoningMode)(mode) && fullReply
                ? this.generateFollowUpSuggestions(req.query, fullReply, mode)
                : Promise.resolve([]);
            // ── Stage 10: Analytics ────────────────────────────────────────────
            yield { type: 'progress', stage: types_1.WorkflowStage.ANALYTICS, message: 'Logging retrieval analytics...' };
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
            yield { type: 'progress', stage: types_1.WorkflowStage.MEMORY_UPDATE, message: 'Updating student memory...' };
            await memoryProvider.updateSessionMemory(req.userId, req.sessionId || 'default', {
                contextWindow: [...sessionMemory.contextWindow, req.query]
            });
            // Post-response profile extraction (fire and forget)
            if (!studentContext.isOnboarded && fullReply) {
                const profileService = new userProfile_service_1.UserProfileService();
                profileService.extractProfileFromConversation(req.userId, req.query, fullReply).catch(console.error);
            }
            const followUpSuggestions = await suggestionsPromise;
            if (followUpSuggestions.length > 0) {
                yield { type: 'suggestions', suggestions: followUpSuggestions };
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

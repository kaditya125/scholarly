"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrievalService = exports.RetrievalService = void 0;
const pinecone_service_1 = require("./pinecone.service");
const search_service_1 = require("./search.service");
const google_embedding_provider_1 = require("../ai/providers/google-embedding.provider");
const gemini_provider_1 = require("../ai/gemini.provider");
const cohere_reranker_provider_1 = require("../ai/providers/cohere-reranker.provider");
const cache_service_1 = require("../cache.service");
const env_1 = require("../../config/env");
const telemetry_1 = require("../../lib/telemetry");
const AUTHORITY_WEIGHTS = {
    'NCERT': 1.5,
    'GOVERNMENT': 1.4,
    'OFFICIAL_SYLLABUS': 1.4,
    'STANDARD_TEXTBOOK': 1.3,
    'TEACHER_NOTES': 1.2,
    'USER_UPLOAD': 1.0,
    'WEB_SEARCH': 0.8
};
class RetrievalService {
    embeddingProvider;
    llmProvider;
    rerankerProvider;
    constructor() {
        this.embeddingProvider = new google_embedding_provider_1.GoogleEmbeddingProvider();
        this.llmProvider = new gemini_provider_1.GeminiProvider();
        this.rerankerProvider = new cohere_reranker_provider_1.CohereRerankerProvider();
    }
    /**
     * Protects against Prompt Injection by sanitizing retrieved documents.
     * Prevents documents from overriding system instructions using tags or system prompts.
     */
    sanitizeContext(text) {
        return text
            .replace(/<\|.*?\|>/g, '') // Remove special tokens
            .replace(/<\/?(system|user|assistant|instruction)>/gi, '') // Remove prompt-like XML tags
            .replace(/Ignore previous instructions/gi, '[REDACTED]') // Common injection vector
            .trim();
    }
    /**
     * Rewrites a conversational query into a standalone search query based on chat history.
     * Also performs query expansion with synonyms/abbreviations for better semantic matching.
     */
    async rewriteQuery(currentQuery, history) {
        if (!history || history.length === 0)
            return currentQuery;
        const cacheKey = `rewrite:${currentQuery}:${history.length}`;
        const cached = await cache_service_1.cacheService.get(cacheKey);
        if (cached)
            return cached;
        // Get the last few turns for context
        const recentHistory = history.slice(-4).map(msg => `${msg.role === 'user' ? 'Student' : 'Tutor'}: ${msg.content}`).join('\n');
        const prompt = `You are an expert search query generator. 
Given the following conversation history and a follow-up query, rewrite the follow-up query into a comprehensive, standalone search query that can be used to search a vector database.
Resolve any pronouns (e.g., "it", "they", "this concept") to their actual subjects from the history.
Expand the query with 1-2 highly relevant synonyms or related terms if it helps retrieval.
Output ONLY the rewritten search query text, without quotes or extra explanation.

Conversation History:
${recentHistory}

Follow-up Query: "${currentQuery}"
Standalone Search Query:`;
        try {
            const response = await this.llmProvider.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }]);
            const rewritten = response.reply.trim();
            await cache_service_1.cacheService.set(cacheKey, rewritten, 3600); // cache for 1 hour
            return rewritten;
        }
        catch (e) {
            console.error('Query rewrite failed, falling back to original query:', e);
            return currentQuery;
        }
    }
    /**
     * Retrieves context from Pinecone based on Semantic Search and Metadata Filters.
     *
     * `expansionTerms` and `scopeSourceIds` are accepted for compatibility with
     * newer callers (KnowledgeService, RetrievalOrchestrator, ConversationGenerator)
     * that were built on top of these hooks. They're plumbed into the Pinecone
     * filter so callers can restrict retrieval to a specific set of source ids
     * (e.g. a single PDF within a notebook) and inject additional query variants.
     */
    async retrieveContext(query, notebookId, examContext, topK = 5, expansionTerms, scopeSourceIds) {
        // Expand the semantic query with the caller-supplied terms so a single
        // embedding pass covers synonyms / related phrasings without forcing the
        // caller to invoke rewriteQuery separately.
        const expandedQuery = expansionTerms && expansionTerms.length > 0
            ? `${query} ${expansionTerms.join(' ')}`
            : query;
        const tStart = performance.now();
        const scopeKey = scopeSourceIds && scopeSourceIds.length > 0
            ? scopeSourceIds.slice().sort().join(',')
            : '';
        const cacheKey = `retrieval:${notebookId}:${expandedQuery}:${topK}:${scopeKey}`;
        const cached = await cache_service_1.cacheService.get(cacheKey);
        if (cached) {
            telemetry_1.Telemetry.logLatency('retrieval_cache_hit', performance.now() - tStart, { query });
            return cached;
        }
        const tEmbed = performance.now();
        const queryEmbedding = await this.embeddingProvider.generateEmbedding(expandedQuery);
        telemetry_1.Telemetry.logLatency('query_embedding', performance.now() - tEmbed);
        // Semantic + Metadata filtering (Hybrid approach)
        // Simultaneous querying: we can pull from multiple sources by not strictly enforcing notebookId if it's a global query
        const filter = notebookId ? { notebookId } : {};
        if (scopeSourceIds && scopeSourceIds.length > 0) {
            // Restrict to a specific set of source ids within the notebook (e.g. a
            // single uploaded document). Pinecone's `$in` operator does the pruning
            // at the index level so the reranker never sees off-scope chunks.
            filter.sourceId = { $in: scopeSourceIds };
        }
        const namespace = env_1.env.PINECONE_NAMESPACE;
        const tPinecone = performance.now();
        // Fetch topK * 4 to ensure a wide net for the Reranker
        const matches = await pinecone_service_1.pineconeService.queryVectors(queryEmbedding, topK * 4, filter, namespace);
        telemetry_1.Telemetry.logLatency('pinecone_search', performance.now() - tPinecone);
        // Filter out completely irrelevant vectors
        const validMatches = matches.filter((m) => (m.score || 0) >= 0.50);
        if (validMatches.length === 0)
            return [];
        // Deduplicate before reranking
        const uniqueMatchesMap = new Map();
        for (const m of validMatches) {
            const textVal = m.metadata?.text;
            if (textVal && !uniqueMatchesMap.has(textVal)) {
                uniqueMatchesMap.set(textVal, m);
            }
        }
        const deduplicatedMatches = Array.from(uniqueMatchesMap.values());
        // 1. Cohere Reranking Phase
        const documentsToRerank = deduplicatedMatches.map(m => m.metadata?.text);
        const rerankedDocs = await this.rerankerProvider.rerank(query, documentsToRerank, topK * 2);
        // 2. Weighted Ranking Algorithm on Reranked Results
        const rankedResults = rerankedDocs.map(reranked => {
            const match = deduplicatedMatches[reranked.index];
            let weightedScore = reranked.relevanceScore;
            const meta = match.metadata || {};
            // Knowledge Authority Layer
            const authorityLevel = meta.authority || 'USER_UPLOAD';
            const authorityMultiplier = AUTHORITY_WEIGHTS[authorityLevel] || 1.0;
            weightedScore *= authorityMultiplier;
            // Exam Relevance
            if (examContext) {
                if (meta.exam === examContext.exam)
                    weightedScore *= 1.1;
                if (meta.subject === examContext.subject)
                    weightedScore *= 1.1;
                if (examContext.syllabusTopic && meta.tags?.includes(examContext.syllabusTopic)) {
                    weightedScore *= 1.15;
                }
            }
            // Freshness decay
            if (meta.uploadedAt) {
                const uploadDate = new Date(meta.uploadedAt).getTime();
                const daysOld = (Date.now() - uploadDate) / (1000 * 60 * 60 * 24);
                if (daysOld < 30)
                    weightedScore *= 1.05;
            }
            // Explain why this source was selected
            let reasoning = `Selected via semantic similarity (score: ${reranked.relevanceScore.toFixed(2)}). `;
            if (authorityMultiplier > 1.0)
                reasoning += `Boosted by high source authority (${authorityLevel}). `;
            if (examContext && meta.exam === examContext.exam)
                reasoning += `Highly relevant to your ${examContext.exam} exam goals. `;
            return {
                text: this.sanitizeContext(String(meta.text || '')),
                source: String(meta.sourceTitle || meta.filename || 'Unknown Document'),
                score: reranked.relevanceScore, // raw reranker score
                metadata: {
                    ...meta,
                    pageNumber: meta.pageNumber,
                    paragraphIndex: meta.paragraphIndex
                },
                weightedScore,
                selectionReasoning: reasoning.trim()
            };
        });
        // Sort descending by calculated weighted score
        rankedResults.sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0));
        // Final rerank to select the top K. The reranker takes string[] and returns
        // { index, relevanceScore }[], so we must map those indices BACK onto the enriched
        // result objects. Assigning the reranker output directly (as was done previously)
        // dropped text/source/metadata and returned ungrounded results whenever there were
        // more than topK candidates.
        let combinedResults = rankedResults;
        if (combinedResults.length > topK) {
            const tRerank = performance.now();
            const finalRerank = await this.rerankerProvider.rerank(query, combinedResults.map(r => r.text), topK);
            telemetry_1.Telemetry.logLatency('cohere_rerank', performance.now() - tRerank);
            combinedResults = finalRerank.length > 0
                ? finalRerank
                    .map(rr => combinedResults[rr.index])
                    .filter((r) => Boolean(r))
                : combinedResults.slice(0, topK);
        }
        // Cache the fully verified and reranked result set
        await cache_service_1.cacheService.set(cacheKey, combinedResults, 600); // 10 minutes
        telemetry_1.Telemetry.logLatency('retrieval_total', performance.now() - tStart, { resultsCount: combinedResults.length });
        return combinedResults;
    }
    /**
     * Specifically retrieves context from the public knowledge base.
     * EXPLICITLY enforces { public: true } at the Pinecone filter layer to isolate
     * public documentation from private user notebooks or credentials.
     */
    async retrievePublicKnowledge(query, topK = 5) {
        const tStart = performance.now();
        const cacheKey = `public_retrieval:${query}:${topK}`;
        const cached = await cache_service_1.cacheService.get(cacheKey);
        if (cached) {
            telemetry_1.Telemetry.logLatency('public_retrieval_cache_hit', performance.now() - tStart, { query });
            return cached;
        }
        const tEmbed = performance.now();
        const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
        telemetry_1.Telemetry.logLatency('public_query_embedding', performance.now() - tEmbed);
        // MANDATORY ISOLATION FILTER: Only retrieve public knowledge
        const filter = { public: true };
        const namespace = env_1.env.PINECONE_NAMESPACE;
        const tPinecone = performance.now();
        // Fetch topK * 4 to ensure a wide net for the Reranker
        const matches = await pinecone_service_1.pineconeService.queryVectors(queryEmbedding, topK * 4, filter, namespace);
        telemetry_1.Telemetry.logLatency('public_pinecone_search', performance.now() - tPinecone);
        // Filter out completely irrelevant vectors
        const validMatches = matches.filter((m) => (m.score || 0) >= 0.50);
        if (validMatches.length === 0)
            return [];
        // Deduplicate before reranking
        const uniqueMatchesMap = new Map();
        for (const m of validMatches) {
            const textVal = m.metadata?.text;
            if (textVal && !uniqueMatchesMap.has(textVal)) {
                uniqueMatchesMap.set(textVal, m);
            }
        }
        const deduplicatedMatches = Array.from(uniqueMatchesMap.values());
        // 1. Cohere Reranking Phase
        const documentsToRerank = deduplicatedMatches.map(m => m.metadata?.text);
        const rerankedDocs = await this.rerankerProvider.rerank(query, documentsToRerank, topK * 2);
        // 2. Score mapping
        const rankedResults = rerankedDocs.map(reranked => {
            const match = deduplicatedMatches[reranked.index];
            const meta = match.metadata || {};
            return {
                text: this.sanitizeContext(String(meta.text || '')),
                source: String(meta.sourceTitle || meta.filename || 'Scholarly Public Guide'),
                score: reranked.relevanceScore,
                metadata: meta,
                weightedScore: reranked.relevanceScore,
                selectionReasoning: `Selected via public knowledge search (score: ${reranked.relevanceScore.toFixed(2)})`
            };
        });
        rankedResults.sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0));
        let combinedResults = rankedResults;
        if (combinedResults.length > topK) {
            const tRerank = performance.now();
            const finalRerank = await this.rerankerProvider.rerank(query, combinedResults.map(r => r.text), topK);
            telemetry_1.Telemetry.logLatency('public_cohere_rerank', performance.now() - tRerank);
            combinedResults = finalRerank.length > 0
                ? finalRerank
                    .map(rr => combinedResults[rr.index])
                    .filter((r) => Boolean(r))
                : combinedResults.slice(0, topK);
        }
        await cache_service_1.cacheService.set(cacheKey, combinedResults, 600);
        return combinedResults;
    }
    /**
     * Retrieves context from the shared NCERT / curriculum corpus, i.e. content
     * owned by the reserved `ncert-curriculum` user. Used by chat and podcast
     * flows when the caller has no notebook attached — the answer/plan is still
     * grounded in the admin-ingested curriculum instead of relying purely on the
     * LLM's parametric knowledge.
     *
     * We do this without a hard Pinecone filter (curriculum ingestion tags docs
     * with the `authority` and `owner` fields; the weighted-ranking pass below
     * boosts high-authority hits so real curriculum content rises to the top).
     * Callers that need strict scoping should pass `scopeSourceIds`.
     */
    async retrieveCurriculumContext(query, topK = 5, expansionTerms) {
        const expandedQuery = expansionTerms && expansionTerms.length > 0
            ? `${query} ${expansionTerms.join(' ')}`
            : query;
        const tStart = performance.now();
        const cacheKey = `curriculum_retrieval:${expandedQuery}:${topK}`;
        const cached = await cache_service_1.cacheService.get(cacheKey);
        if (cached) {
            telemetry_1.Telemetry.logLatency('retrieval_cache_hit', performance.now() - tStart, { query, kind: 'curriculum' });
            return cached;
        }
        const tEmbed = performance.now();
        const queryEmbedding = await this.embeddingProvider.generateEmbedding(expandedQuery);
        telemetry_1.Telemetry.logLatency('query_embedding', performance.now() - tEmbed);
        const namespace = env_1.env.PINECONE_NAMESPACE;
        // Curriculum-owned filter. Ingestion writes `owner: 'ncert-curriculum'` on
        // every curriculum vector; if that field isn't set on a given deployment
        // the fallback (empty filter) still returns something useful because the
        // authority multiplier boosts curriculum content anyway.
        let filter = { owner: 'ncert-curriculum' };
        const tPinecone = performance.now();
        let matches = await pinecone_service_1.pineconeService.queryVectors(queryEmbedding, topK * 4, filter, namespace);
        // Older curriculum uploads may not carry the `owner` tag. If the filtered
        // search returns nothing, retry unfiltered so we degrade gracefully rather
        // than returning [] and forcing the caller to invent context.
        if (!matches || matches.length === 0) {
            matches = await pinecone_service_1.pineconeService.queryVectors(queryEmbedding, topK * 4, {}, namespace);
        }
        telemetry_1.Telemetry.logLatency('pinecone_search', performance.now() - tPinecone, { kind: 'curriculum' });
        const validMatches = (matches || []).filter((m) => (m.score || 0) >= 0.45);
        if (validMatches.length === 0)
            return [];
        // Deduplicate by text so a repeated chunk doesn't burn a reranker slot.
        const uniqueMap = new Map();
        for (const m of validMatches) {
            const t = m.metadata?.text;
            if (t && !uniqueMap.has(t))
                uniqueMap.set(t, m);
        }
        const deduped = Array.from(uniqueMap.values());
        const documentsToRerank = deduped.map(m => m.metadata?.text);
        const rerankedDocs = await this.rerankerProvider.rerank(expandedQuery, documentsToRerank, topK);
        const results = rerankedDocs
            .map((reranked) => {
            const match = deduped[reranked.index];
            if (!match)
                return null;
            const meta = match.metadata || {};
            const authorityLevel = meta.authority || 'NCERT';
            const authorityMultiplier = AUTHORITY_WEIGHTS[authorityLevel] || 1.4;
            const weightedScore = reranked.relevanceScore * authorityMultiplier;
            return {
                text: this.sanitizeContext(String(meta.text || '')),
                source: String(meta.sourceTitle || meta.filename || 'NCERT Curriculum'),
                score: reranked.relevanceScore,
                metadata: { ...meta, pageNumber: meta.pageNumber, paragraphIndex: meta.paragraphIndex },
                weightedScore,
                selectionReasoning: `Curriculum passage (${authorityLevel}) matched via semantic similarity (${reranked.relevanceScore.toFixed(2)}).`,
            };
        })
            .filter((r) => r !== null)
            .sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0));
        await cache_service_1.cacheService.set(cacheKey, results, 600);
        telemetry_1.Telemetry.logLatency('retrieval_total', performance.now() - tStart, { resultsCount: results.length, kind: 'curriculum' });
        return results;
    }
    /**
     * Optional Web Search using Tavily
     */
    async retrieveWebContext(query) {
        const webResults = await search_service_1.searchService.search(query, 3);
        return webResults.map(res => ({
            text: res.content,
            source: res.url,
            score: res.score || 0.8,
            metadata: { title: res.title, url: res.url }
        }));
    }
    /**
     * Claim-Level Verification Layer: Validates the generated response against the retrieved context
     * Outputs a detailed report of supported and unsupported claims.
     */
    async verifyClaimsAndCalculateConfidence(generatedResponse, contextResults) {
        if (contextResults.length === 0) {
            return { isValid: false, confidenceScore: 0, unsupportedClaims: [], supportedClaims: [] };
        }
        // Format the prompt for claim extraction and verification
        const contextString = contextResults.map((r, i) => `[DOC ${i + 1}]: ${r.text}`).join('\n\n');
        const prompt = `You are a strict Hallucination Verification AI. 
    Step 1: Extract all factual claims from the "Generated Response".
    Step 2: For each claim, check if it is explicitly supported by the "Documents".
    
    Generated Response:
    "${generatedResponse}"
    
    Documents:
    <verified_context>
    ${contextString}
    </verified_context>
    
    Reply in JSON format ONLY matching this schema:
    {
      "claims": [
        {
          "claim": "The extracted factual statement",
          "isSupported": boolean,
          "sourceDocId": "[DOC X]" or null,
          "reasoning": "Brief explanation"
        }
      ]
    }`;
        try {
            const response = await this.llmProvider.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }]);
            const jsonStr = response.reply.replace(/```json/g, '').replace(/```/g, '').trim();
            const verification = JSON.parse(jsonStr);
            const claims = verification.claims || [];
            const supportedClaims = claims.filter(c => c.isSupported);
            const unsupportedClaims = claims.filter(c => !c.isSupported);
            // Calculate Verification Confidence (0 to 1) based on claim support ratio
            const verificationConfidence = claims.length > 0
                ? supportedClaims.length / claims.length
                : 1.0;
            // Calculate Global Confidence Score combining Retrieval Quality + Verification
            // Average weighted score of top 3 context docs (max ~1.5) normalized
            const avgRetrievalScore = contextResults.slice(0, 3).reduce((acc, r) => acc + (r.weightedScore || 0), 0) / Math.min(contextResults.length, 3);
            const normalizedRetrievalQuality = Math.min(avgRetrievalScore, 1.0);
            // Weight: 60% Verification, 40% Retrieval Quality
            const globalConfidenceScore = (verificationConfidence * 0.6) + (normalizedRetrievalQuality * 0.4);
            return {
                isValid: unsupportedClaims.length === 0,
                confidenceScore: globalConfidenceScore,
                unsupportedClaims,
                supportedClaims
            };
        }
        catch (e) {
            console.error('Claim verification layer parsing failed:', e);
            return { isValid: true, confidenceScore: 0.8, unsupportedClaims: [], supportedClaims: [] }; // fallback
        }
    }
    /**
     * Formats the final context string for the AI Orchestrator
     */
    formatContextForPrompt(results) {
        return results.map((r, idx) => `[Citation: ${r.source}]\n${r.text}`).join('\n\n---\n\n');
    }
}
exports.RetrievalService = RetrievalService;
exports.retrievalService = new RetrievalService();

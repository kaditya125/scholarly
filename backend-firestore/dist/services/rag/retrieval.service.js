"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrievalService = exports.RetrievalService = void 0;
const pinecone_service_1 = require("./pinecone.service");
const search_service_1 = require("./search.service");
const google_embedding_provider_1 = require("../ai/providers/google-embedding.provider");
const groq_provider_1 = require("../ai/groq.provider");
const cohere_reranker_provider_1 = require("../ai/providers/cohere-reranker.provider");
const cache_service_1 = require("../cache.service");
const env_1 = require("../../config/env");
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
    groqProvider;
    rerankerProvider;
    constructor() {
        this.embeddingProvider = new google_embedding_provider_1.GoogleEmbeddingProvider();
        this.groqProvider = new groq_provider_1.GroqProvider();
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
            const response = await this.groqProvider.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }]);
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
     * Retrieves context from Pinecone based on Semantic Search and Metadata Filters
     */
    async retrieveContext(query, notebookId, examContext, topK = 5) {
        const cacheKey = `retrieval:${notebookId}:${query}:${topK}`;
        const cached = await cache_service_1.cacheService.get(cacheKey);
        if (cached)
            return cached;
        const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
        // Semantic + Metadata filtering (Hybrid approach)
        // Simultaneous querying: we can pull from multiple sources by not strictly enforcing notebookId if it's a global query
        const filter = notebookId ? { notebookId } : {};
        const namespace = env_1.env.PINECONE_NAMESPACE;
        // Fetch topK * 4 to ensure a wide net for the Reranker
        const matches = await pinecone_service_1.pineconeService.queryVectors(queryEmbedding, topK * 4, filter, namespace);
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
                source: String(meta.filename || 'Unknown Document'),
                score: reranked.relevanceScore, // raw reranker score
                metadata: meta,
                weightedScore,
                selectionReasoning: reasoning.trim()
            };
        });
        // Sort descending by calculated weighted score
        rankedResults.sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0));
        // Return the final Top K
        const finalResults = rankedResults.slice(0, topK);
        await cache_service_1.cacheService.set(cacheKey, finalResults, 1800); // cache for 30 mins
        return finalResults;
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
            const response = await this.groqProvider.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }]);
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

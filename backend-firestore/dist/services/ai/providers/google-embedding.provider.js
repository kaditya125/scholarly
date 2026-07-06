"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleEmbeddingProvider = void 0;
const genai_1 = require("@google/genai");
const env_1 = require("../../../config/env");
const retry_1 = require("../../../utils/retry");
// The Pinecone index 'edtech-ai-rag' has dimension 768. `text-embedding-004` (which
// produced 768-dim vectors) has been deprecated by Google and now returns 404 for
// embedContent. The current model `gemini-embedding-001` defaults to 3072 dims, so we
// request outputDimensionality: 768 to keep vectors compatible with the existing index.
const EMBEDDING_DIM = 768;
class GoogleEmbeddingProvider {
    ai;
    modelName;
    constructor(modelName = 'gemini-embedding-001') {
        this.modelName = modelName;
        if (!env_1.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not defined in environment.');
        }
        this.ai = new genai_1.GoogleGenAI({ apiKey: env_1.env.GEMINI_API_KEY });
    }
    async generateEmbedding(text, userId) {
        // Resilience: 20s timeout + retry with backoff on transient errors.
        const response = await (0, retry_1.withRetry)(() => (0, retry_1.withTimeout)(this.ai.models.embedContent({
            model: this.modelName,
            contents: text,
            config: { outputDimensionality: EMBEDDING_DIM },
        }), 20000, 'gemini.embedContent'), 
        // More retries + honoring the server's 429 retry delay lets us ride out
        // free-tier per-minute rate limits during bulk ingestion.
        { label: 'gemini.embedContent', retries: 6 });
        // Track cost (approximate 4 chars per token if API doesn't return usageMetadata for embeddings)
        const tokens = Math.ceil(text.length / 4);
        const { Telemetry } = require('../../../lib/telemetry');
        Telemetry.logCost('gemini-embedding', tokens, 'input', { userId, operationType: 'embedding' });
        return response.embeddings?.[0]?.values || [];
    }
    async generateEmbeddings(texts, userId) {
        // gemini-embedding-001 via embedContent returns a single embedding per call and does
        // not reliably return one-per-item for an array `contents`. Embed each text using the
        // proven single-item path, with small concurrency to respect rate limits.
        const results = [];
        // Process completely sequentially to avoid burst limits on the free tier
        for (let i = 0; i < texts.length; i++) {
            const embedded = await this.generateEmbedding(texts[i], userId);
            results.push(embedded);
            // Delay 1 second between EVERY single request. (60 req/min, safely under 100/min limit)
            await new Promise(r => setTimeout(r, 1000));
        }
        return results;
    }
}
exports.GoogleEmbeddingProvider = GoogleEmbeddingProvider;

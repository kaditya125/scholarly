"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapDI = bootstrapDI;
const container_1 = require("./container");
// Import concrete implementations
const groq_provider_1 = require("../../services/ai/groq.provider");
const google_embedding_provider_1 = require("../../services/ai/providers/google-embedding.provider");
const cohere_reranker_provider_1 = require("../../services/ai/providers/cohere-reranker.provider");
const cache_service_1 = require("../../services/cache.service");
const FirestoreGraphProvider_1 = require("../providers/graph/FirestoreGraphProvider");
const FirestoreMemoryProvider_1 = require("../providers/memory/FirestoreMemoryProvider");
const FirestoreAnalyticsProvider_1 = require("../providers/analytics/FirestoreAnalyticsProvider");
// ... other providers can be added as they are implemented
function bootstrapDI() {
    // Register AI Provider (Defaulting to Groq for now)
    container_1.container.register(container_1.TOKENS.AIProvider, new groq_provider_1.GroqProvider());
    // Register Embedding Provider
    container_1.container.register(container_1.TOKENS.EmbeddingProvider, new google_embedding_provider_1.GoogleEmbeddingProvider());
    // Register Reranker Provider
    container_1.container.register(container_1.TOKENS.RerankerProvider, new cohere_reranker_provider_1.CohereRerankerProvider());
    // Register Cache Provider
    container_1.container.register(container_1.TOKENS.CacheProvider, cache_service_1.cacheService);
    // Register Graph Provider
    container_1.container.register(container_1.TOKENS.GraphProvider, new FirestoreGraphProvider_1.FirestoreGraphProvider());
    // Register Memory Provider
    container_1.container.register(container_1.TOKENS.MemoryProvider, new FirestoreMemoryProvider_1.FirestoreMemoryProvider());
    // Register Analytics Provider (Adding a token for it too)
    container_1.container.register(Symbol.for('IAnalyticsProvider'), new FirestoreAnalyticsProvider_1.FirestoreAnalyticsProvider());
    // VectorStore and Verification will be registered as implemented
    console.log('✅ Dependency Injection Container Bootstrapped.');
}

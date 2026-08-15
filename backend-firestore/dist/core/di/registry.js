"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapDI = bootstrapDI;
const container_1 = require("./container");
const env_1 = require("../../config/env");
// Import concrete implementations
const gemini_provider_1 = require("../../services/ai/gemini.provider");
const google_embedding_provider_1 = require("../../services/ai/providers/google-embedding.provider");
const cohere_reranker_provider_1 = require("../../services/ai/providers/cohere-reranker.provider");
const cache_service_1 = require("../../services/cache.service");
const FirestoreGraphProvider_1 = require("../providers/graph/FirestoreGraphProvider");
const FirestoreMemoryProvider_1 = require("../providers/memory/FirestoreMemoryProvider");
const FirestoreAnalyticsProvider_1 = require("../providers/analytics/FirestoreAnalyticsProvider");
// Reasoning + notification providers. Mocks are picked at boot when the
// corresponding config is missing, so a partial .env still yields a working
// container instead of throwing.
const grok_vertex_provider_1 = require("../../services/ai/grok-vertex.provider");
const SmsProvider_1 = require("../notifications/providers/SmsProvider");
const WhatsAppProvider_1 = require("../notifications/providers/WhatsAppProvider");
const NotificationIntelligenceService_1 = require("../notifications/NotificationIntelligenceService");
function bootstrapDI() {
    // Register AI Provider (Defaulting to Gemini for now)
    container_1.container.register(container_1.TOKENS.AIProvider, new gemini_provider_1.GeminiProvider());
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
    // Register Analytics Provider
    container_1.container.register(container_1.TOKENS.AnalyticsProvider, new FirestoreAnalyticsProvider_1.FirestoreAnalyticsProvider());
    // ── Reasoning provider (Grok on Vertex, transparently falling back to Gemini)
    //
    // Grok is used ONLY for the high-value teacher-draft step; formatting and the
    // bulk of embeddings stay on Gemini. Because the provider throws if the
    // Vertex project is not real, this block only tries Grok when we have
    // credentials; otherwise the reasoning slot is filled by Gemini so
    // GenerationOrchestrator's fast path keeps working.
    const grokProjectSet = !!env_1.env.GROK_VERTEX_PROJECT && env_1.env.GROK_VERTEX_PROJECT !== 'disabled';
    if (grokProjectSet) {
        try {
            const model = env_1.env.GROK_MODEL || 'grok-4.1-fast-reasoning';
            container_1.container.register(container_1.TOKENS.ReasoningProvider, new grok_vertex_provider_1.GrokVertexProvider(model));
            console.log(`✅ Reasoning provider: Grok on Vertex [${model}] (falls back to Gemini on error).`);
        }
        catch (err) {
            container_1.container.register(container_1.TOKENS.ReasoningProvider, new gemini_provider_1.GeminiProvider());
            console.warn(`⚠️  Grok on Vertex failed to initialize (${err?.message || err}); reasoning provider is Gemini.`);
        }
    }
    else {
        container_1.container.register(container_1.TOKENS.ReasoningProvider, new gemini_provider_1.GeminiProvider());
        console.log('✅ Reasoning provider: Gemini (Grok on Vertex disabled — set GROK_VERTEX_PROJECT to enable).');
    }
    // ── SMS provider (Twilio when configured, Mock otherwise)
    const twilioConfigured = !!env_1.env.TWILIO_ACCOUNT_SID && !!env_1.env.TWILIO_AUTH_TOKEN && !!env_1.env.TWILIO_FROM_NUMBER;
    if (twilioConfigured) {
        container_1.container.register(container_1.TOKENS.SmsProvider, new SmsProvider_1.TwilioSmsProvider());
        console.log('✅ SMS Provider Bootstrapped: Twilio');
    }
    else {
        container_1.container.register(container_1.TOKENS.SmsProvider, new SmsProvider_1.MockSmsProvider());
        console.log('✅ SMS Provider Bootstrapped: Mock (Twilio env vars not set).');
    }
    // ── WhatsApp provider (Meta Cloud API when configured, Mock otherwise)
    const waConfigured = !!env_1.env.WHATSAPP_ACCESS_TOKEN && !!env_1.env.WHATSAPP_PHONE_NUMBER_ID;
    if (waConfigured) {
        container_1.container.register(container_1.TOKENS.WhatsAppProvider, new WhatsAppProvider_1.MetaWhatsAppProvider());
        console.log('✅ WhatsApp Provider Bootstrapped: Meta Cloud API');
    }
    else {
        container_1.container.register(container_1.TOKENS.WhatsAppProvider, new WhatsAppProvider_1.MockWhatsAppProvider());
        console.log('✅ WhatsApp Provider Bootstrapped: Mock (Meta env vars not set).');
    }
    // ── Notification Intelligence Service
    container_1.container.register(container_1.TOKENS.NotificationIntelligenceService, new NotificationIntelligenceService_1.NotificationIntelligenceService());
    console.log('✅ Notification Intelligence Service Bootstrapped.');
    console.log('✅ Dependency Injection Container Bootstrapped.');
}

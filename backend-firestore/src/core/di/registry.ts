import { container, TOKENS } from './container';
import { env } from '../../config/env';

// Import concrete implementations
import { GeminiProvider } from '../../services/ai/gemini.provider';
import { GoogleEmbeddingProvider } from '../../services/ai/providers/google-embedding.provider';
import { CohereRerankerProvider } from '../../services/ai/providers/cohere-reranker.provider';
import { cacheService } from '../../services/cache.service';
import { FirestoreGraphProvider } from '../providers/graph/FirestoreGraphProvider';
import { FirestoreMemoryProvider } from '../providers/memory/FirestoreMemoryProvider';
import { FirestoreAnalyticsProvider } from '../providers/analytics/FirestoreAnalyticsProvider';

// Reasoning + notification providers. Mocks are picked at boot when the
// corresponding config is missing, so a partial .env still yields a working
// container instead of throwing.
import { GrokVertexProvider } from '../../services/ai/grok-vertex.provider';
import {
  MockSmsProvider,
  TwilioSmsProvider,
} from '../notifications/providers/SmsProvider';
import {
  MockWhatsAppProvider,
  MetaWhatsAppProvider,
} from '../notifications/providers/WhatsAppProvider';
import { NotificationIntelligenceService } from '../notifications/NotificationIntelligenceService';

export function bootstrapDI() {
  // Register AI Provider (Defaulting to Gemini for now)
  container.register(TOKENS.AIProvider, new GeminiProvider());

  // Register Embedding Provider
  container.register(TOKENS.EmbeddingProvider, new GoogleEmbeddingProvider());

  // Register Reranker Provider
  container.register(TOKENS.RerankerProvider, new CohereRerankerProvider());

  // Register Cache Provider
  container.register(TOKENS.CacheProvider, cacheService);

  // Register Graph Provider
  container.register(TOKENS.GraphProvider, new FirestoreGraphProvider());

  // Register Memory Provider
  container.register(TOKENS.MemoryProvider, new FirestoreMemoryProvider());

  // Register Analytics Provider
  container.register(TOKENS.AnalyticsProvider, new FirestoreAnalyticsProvider());

  // ── Reasoning provider (Grok on Vertex, transparently falling back to Gemini)
  //
  // Grok is used ONLY for the high-value teacher-draft step; formatting and the
  // bulk of embeddings stay on Gemini. Because the provider throws if the
  // Vertex project is not real, this block only tries Grok when we have
  // credentials; otherwise the reasoning slot is filled by Gemini so
  // GenerationOrchestrator's fast path keeps working.
  const grokProjectSet =
    !!env.GROK_VERTEX_PROJECT && env.GROK_VERTEX_PROJECT !== 'disabled';
  if (grokProjectSet) {
    try {
      const model = env.GROK_MODEL || 'grok-4.1-fast-reasoning';
      container.register(TOKENS.ReasoningProvider, new GrokVertexProvider(model));
      console.log(
        `✅ Reasoning provider: Grok on Vertex [${model}] (falls back to Gemini on error).`
      );
    } catch (err: any) {
      container.register(TOKENS.ReasoningProvider, new GeminiProvider());
      console.warn(
        `⚠️  Grok on Vertex failed to initialize (${err?.message || err}); reasoning provider is Gemini.`
      );
    }
  } else {
    container.register(TOKENS.ReasoningProvider, new GeminiProvider());
    console.log(
      '✅ Reasoning provider: Gemini (Grok on Vertex disabled — set GROK_VERTEX_PROJECT to enable).'
    );
  }

  // ── SMS provider (Twilio when configured, Mock otherwise)
  const twilioConfigured =
    !!env.TWILIO_ACCOUNT_SID && !!env.TWILIO_AUTH_TOKEN && !!env.TWILIO_FROM_NUMBER;
  if (twilioConfigured) {
    container.register(TOKENS.SmsProvider, new TwilioSmsProvider());
    console.log('✅ SMS Provider Bootstrapped: Twilio');
  } else {
    container.register(TOKENS.SmsProvider, new MockSmsProvider());
    console.log('✅ SMS Provider Bootstrapped: Mock (Twilio env vars not set).');
  }

  // ── WhatsApp provider (Meta Cloud API when configured, Mock otherwise)
  const waConfigured = !!env.WHATSAPP_ACCESS_TOKEN && !!env.WHATSAPP_PHONE_NUMBER_ID;
  if (waConfigured) {
    container.register(TOKENS.WhatsAppProvider, new MetaWhatsAppProvider());
    console.log('✅ WhatsApp Provider Bootstrapped: Meta Cloud API');
  } else {
    container.register(TOKENS.WhatsAppProvider, new MockWhatsAppProvider());
    console.log('✅ WhatsApp Provider Bootstrapped: Mock (Meta env vars not set).');
  }

  // ── Notification Intelligence Service
  container.register(
    TOKENS.NotificationIntelligenceService,
    new NotificationIntelligenceService()
  );
  console.log('✅ Notification Intelligence Service Bootstrapped.');

  console.log('✅ Dependency Injection Container Bootstrapped.');
}
